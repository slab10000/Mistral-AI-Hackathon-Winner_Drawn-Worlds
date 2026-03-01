import { useCallback, useEffect, useRef, useState } from 'react';
import BookCover from '../components/BookCover';
import CanvasBoard, { type CanvasBoardHandle } from '../components/CanvasBoard';
import ToolBar from '../components/ToolBar';
import StoryTimeline from '../components/StoryTimeline';
import DrawPrompt from '../components/DrawPrompt';
import SpeakPrompt from '../components/SpeakPrompt';
import { visionToWorld } from '../lib/visionToWorld';
import { visionToAge } from '../lib/visionToAge';
import { visionToDrawingDescription } from '../lib/visionToDrawing';
import { runStoryAgent } from '../lib/storyAgent';
import { generateAudioForEvents, generateImagesForEvents, startBackgroundMusic } from '../lib/storyPlayer';
import { buildIllustrationPrompt } from '../lib/imagen';
import { clearAudioCache } from '../lib/cache';
import type { WorldModel } from '../lib/schemas';
import type {
  StoryEvent,
  StoryPhase,
  AskUserToDrawEvent,
  AskUserToSpeakEvent,
  ParagraphEvent,
  MusicEvent,
} from '../lib/agentTypes';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGE_GROUPS = [
  { value: 'young children (ages 3–5)', label: '3–5' },
  { value: 'children (ages 6–8)',       label: '6–8' },
  { value: 'older children (ages 9–12)', label: '9–12' },
];

const LS_KEY     = 'drawnWorlds_session_v1';
const DEFAULT_AGE = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgeStep = 'locked' | 'drawing' | 'done';

// ---------------------------------------------------------------------------
// Module-level helpers (no React deps — stable refs not needed)
// ---------------------------------------------------------------------------

function getEnv(key: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

function ageToGroup(age: number): string {
  if (age <= 5) return AGE_GROUPS[0].value;
  if (age <= 8) return AGE_GROUPS[1].value;
  return AGE_GROUPS[2].value;
}

function playWizardVoicePrompt(): void {
  const audio = new Audio('/wizard-draw-your-age.mp3');
  audio.play().catch(() => {
    if (!('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance('Can you draw your age for me?');
    utter.rate = 0.95;
    utter.pitch = 1.02;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });
}

/** Play a URL and resolve when it ends or errors. */
function playAudioUrl(url: string): Promise<void> {
  return new Promise(resolve => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Home() {

  // ── Book UI ──────────────────────────────────────────────────────────────
  const [bookOpen,     setBookOpen    ] = useState(false);
  const [showDrawing,  setShowDrawing ] = useState(true);
  const [illustration, setIllustration] = useState<string | null>(null);

  // ── Drawing tools ─────────────────────────────────────────────────────────
  const canvasRef   = useRef<CanvasBoardHandle>(null);
  const [brushColor, setBrushColor] = useState('#3B82F6');
  const [brushSize,  setBrushSize ] = useState(8);
  const [isEraser,   setIsEraser  ] = useState(false);

  // ── Age gate ──────────────────────────────────────────────────────────────
  const [ageStep,    setAgeStep   ] = useState<AgeStep>('locked');
  const [detectedAge, setDetectedAge] = useState<number | null>(null);
  const [ageGroup,   setAgeGroup  ] = useState(AGE_GROUPS[1].value);
  const [ageBusy,    setAgeBusy   ] = useState(false);
  const [wizardVideoFailed, setWizardVideoFailed] = useState(false);

  // ── Story / Agent ─────────────────────────────────────────────────────────
  const [worldModel,    setWorldModel   ] = useState<WorldModel | null>(null);
  const [storyEvents,   setStoryEvents  ] = useState<StoryEvent[]>([]);
  const [phase,         setPhase        ] = useState<StoryPhase>('idle');
  const [activeEventIdx, setActiveEventIdx] = useState<number | null>(null);
  const [storyError,    setStoryError   ] = useState<string | null>(null);

  // ── Book page / Imagen illustration ───────────────────────────────────────
  // Index into the paragraph-events-only sub-list (null = no page yet)
  const [currentPageIdx, setCurrentPageIdx] = useState<number | null>(null);
  // 'flip-out' → content hidden → 'flip-in' → 'idle'
  const [flipPhase, setFlipPhase] = useState<'idle' | 'flip-out' | 'flip-in'>('idle');

  // ── Current user interaction ───────────────────────────────────────────────
  const [currentDraw,  setCurrentDraw ] = useState<AskUserToDrawEvent | null>(null);
  const [currentSpeak, setCurrentSpeak] = useState<AskUserToSpeakEvent | null>(null);

  // ── Async-loop refs ───────────────────────────────────────────────────────
  const cancelledRef          = useRef(false);
  // Tracks currentPageIdx synchronously inside the async loop (avoids stale closure)
  const currentPageIdxRef     = useRef<number | null>(null);
  const isRunningRef          = useRef(false);
  const interactionResolveRef = useRef<((result: string) => void) | null>(null);
  const musicStopRef          = useRef<(() => void) | null>(null);
  const ageGroupRef           = useRef(ageGroup);

  // Keep ageGroupRef current
  useEffect(() => { ageGroupRef.current = ageGroup; }, [ageGroup]);

  // ---------------------------------------------------------------------------
  // Age-gate handlers
  // ---------------------------------------------------------------------------

  const handleUnlockAgeDrawing = useCallback(() => {
    if (ageStep !== 'locked') return;
    setAgeStep('drawing');
    playWizardVoicePrompt();
  }, [ageStep]);

  const handleAgeDone = useCallback(async () => {
    if (ageBusy || ageStep !== 'drawing') return;
    const dataUrl = canvasRef.current?.getDataURL();
    if (!dataUrl || canvasRef.current?.isEmpty()) {
      alert('Please draw your age as a number first ✍️');
      return;
    }

    setAgeBusy(true);
    try {
      const mistralKey = getEnv('VITE_MISTRAL_API_KEY');
      const recognized = await visionToAge(dataUrl, mistralKey).catch(() => null);
      const finalAge   = recognized ?? DEFAULT_AGE;
      setDetectedAge(finalAge);
      setAgeGroup(ageToGroup(finalAge));
      setAgeStep('done');
      canvasRef.current?.clear();
    } catch {
      setDetectedAge(DEFAULT_AGE);
      setAgeGroup(ageToGroup(DEFAULT_AGE));
      setAgeStep('done');
      canvasRef.current?.clear();
    } finally {
      setAgeBusy(false);
    }
  }, [ageBusy, ageStep]);

  // ---------------------------------------------------------------------------
  // User interaction handlers (resolve the waiting Promise in runGenerate)
  // ---------------------------------------------------------------------------

  const handleDrawSubmit = useCallback((dataUrl: string) => {
    interactionResolveRef.current?.(dataUrl);
    interactionResolveRef.current = null;
  }, []);

  const handleDrawSkip = useCallback(() => {
    interactionResolveRef.current?.('');
    interactionResolveRef.current = null;
  }, []);

  const handleSpeakWord = useCallback((word: string) => {
    interactionResolveRef.current?.(word);
    interactionResolveRef.current = null;
  }, []);

  const handleSpeakSkip = useCallback(() => {
    interactionResolveRef.current?.('');
    interactionResolveRef.current = null;
  }, []);

  // ---------------------------------------------------------------------------
  // Canvas helpers
  // ---------------------------------------------------------------------------

  const handleClear = useCallback(() => {
    canvasRef.current?.clear();
    setIllustration(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Fresh start
  // ---------------------------------------------------------------------------

  const handleFreshStart = useCallback(() => {
    const confirmed = window.confirm(
      'Start fresh? This will clear your drawing, story, and saved session.',
    );
    if (!confirmed) return;

    // Cancel any running agent loop
    cancelledRef.current = true;
    interactionResolveRef.current?.('');
    interactionResolveRef.current = null;
    musicStopRef.current?.();
    musicStopRef.current = null;

    canvasRef.current?.clear();
    clearAudioCache();
    localStorage.removeItem(LS_KEY);

    setIllustration(null);
    setWorldModel(null);
    setStoryEvents([]);
    setPhase('idle');
    setStoryError(null);
    setActiveEventIdx(null);
    setCurrentDraw(null);
    setCurrentSpeak(null);
    setCurrentPageIdx(null);
    setFlipPhase('idle');
    currentPageIdxRef.current = null;
    setShowDrawing(true);
    setBookOpen(false);
    setAgeGroup(AGE_GROUPS[1].value);
    setAgeStep('locked');
    setDetectedAge(null);
    setAgeBusy(false);
    setWizardVideoFailed(false);
    setBrushColor('#3B82F6');
    setBrushSize(8);
    setIsEraser(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Debug helpers
  // ---------------------------------------------------------------------------

  const handleDebugTurnPage = useCallback(async () => {
    if (ageStep !== 'done') return;
    if (flipPhase !== 'idle') return;
    const paragraphCount = storyEvents.filter(e => e.type === 'paragraph').length;
    if (paragraphCount === 0) return;

    const nextIdx = currentPageIdxRef.current === null
      ? 0
      : (currentPageIdxRef.current + 1) % paragraphCount;

    if (currentPageIdxRef.current !== null) {
      setFlipPhase('flip-out');
      await new Promise(r => setTimeout(r, 440));
      setCurrentPageIdx(nextIdx);
      currentPageIdxRef.current = nextIdx;
      setFlipPhase('flip-in');
      await new Promise(r => setTimeout(r, 440));
      setFlipPhase('idle');
      return;
    }

    setCurrentPageIdx(nextIdx);
    currentPageIdxRef.current = nextIdx;
  }, [ageStep, flipPhase, storyEvents]);

  // ---------------------------------------------------------------------------
  // Main agent loop
  // ---------------------------------------------------------------------------

  const runGenerate = useCallback(async () => {
    if (isRunningRef.current) return;
    if (ageStep !== 'done') {
      alert('First, draw your age and tap "Done with age".');
      return;
    }

    const dataUrl = canvasRef.current?.getDataURL();
    if (!dataUrl || canvasRef.current?.isEmpty()) {
      alert('Draw something first! 🎨');
      return;
    }

    let mistralKey: string, elKey: string, voiceId: string;
    let googleApiKey = '';
    try {
      mistralKey = getEnv('VITE_MISTRAL_API_KEY');
      elKey      = getEnv('VITE_ELEVENLABS_API_KEY');
      voiceId    = getEnv('VITE_ELEVENLABS_VOICE_ID');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Missing API key');
      return;
    }
    try { googleApiKey = getEnv('VITE_GOOGLE_API_KEY'); } catch { /* image gen optional */ }

    // ── Reset ──────────────────────────────────────────────────────────────
    cancelledRef.current = false;
    isRunningRef.current = true;
    interactionResolveRef.current?.('');
    interactionResolveRef.current = null;
    musicStopRef.current?.();
    musicStopRef.current = null;

    setIllustration(dataUrl);
    setStoryEvents([]);
    setPhase('world');
    setStoryError(null);
    setActiveEventIdx(null);
    setCurrentDraw(null);
    setCurrentSpeak(null);
    setCurrentPageIdx(null);
    setFlipPhase('idle');
    currentPageIdxRef.current = null;
    setShowDrawing(false);

    const allEvents: StoryEvent[] = [];

    try {

      // ── Step 1: Vision → WorldModel ──────────────────────────────────────
      const wm = await visionToWorld(dataUrl, mistralKey);
      if (cancelledRef.current) return;
      setWorldModel(wm);

      // ── Agent loop ───────────────────────────────────────────────────────
      while (!cancelledRef.current) {

        // 1. Ask agent for the next segment
        setPhase('agent');
        const segment = await runStoryAgent(wm, ageGroupRef.current, allEvents, mistralKey);
        if (cancelledRef.current) break;

        const newEvts = segment.events;
        allEvents.push(...newEvts);
        setStoryEvents([...allEvents]); // show paragraphs immediately (no audio yet)

        // 2. Build image prompts from world model + paragraph text
        const worldCtx = [
          wm.title,
          `${wm.setting.place}, ${wm.setting.time}`,
          `mood: ${wm.setting.vibe}`,
          wm.characters.length > 0
            ? `characters: ${wm.characters.map(c => `${c.name} (${c.description})`).join(', ')}`
            : '',
        ].filter(Boolean).join('. ');

        for (const ev of newEvts) {
          if (ev.type === 'paragraph') {
            const p = ev as ParagraphEvent;
            p.imagePrompt = buildIllustrationPrompt(p.text, worldCtx);
          }
        }

        // 3. Generate audio (TTS + SFX + music) AND images in parallel
        setPhase('audio_gen');
        await Promise.all([
          generateAudioForEvents(newEvts, voiceId, elKey),
          googleApiKey ? generateImagesForEvents(newEvts, googleApiKey) : Promise.resolve(),
        ]);
        if (cancelledRef.current) break;
        setStoryEvents([...allEvents]); // refresh (audioUrls + imageDataUrls now attached)

        // 3. Start background music if this segment has one (first time only)
        const musicEv = newEvts.find(e => e.type === 'music') as MusicEvent | undefined;
        if (musicEv?.audioUrl && !musicStopRef.current) {
          musicStopRef.current = startBackgroundMusic(musicEv.audioUrl, 0.15);
        }

        // 4. Play events sequentially; pause at user interactions
        setPhase('playing');
        const offset = allEvents.length - newEvts.length; // index of first new event in allEvents

        let interactionHit = false;
        let storyDone      = false;

        for (let i = 0; i < newEvts.length; i++) {
          if (cancelledRef.current) break;

          const ev    = newEvts[i];
          const gIdx  = offset + i;

          // ── Sound effect ─────────────────────────────────────────────────
          if (ev.type === 'sound_effect') {
            setActiveEventIdx(gIdx);
            if (ev.audioUrl) await playAudioUrl(ev.audioUrl);
            if (!cancelledRef.current) await new Promise(r => setTimeout(r, 120));
            setActiveEventIdx(null);
            continue;
          }

          // ── Paragraph — page turn + narrate ──────────────────────────────
          if (ev.type === 'paragraph') {
            // Find which paragraph index this is (within paragraphs only)
            const paraIdx = allEvents
              .slice(0, gIdx + 1)
              .filter(e => e.type === 'paragraph').length - 1;

            if (currentPageIdxRef.current !== null) {
              // ── Animate page turn ──────────────────────────────────────
              setFlipPhase('flip-out');
              await new Promise(r => setTimeout(r, 440));
              if (cancelledRef.current) break;

              // Swap content while pages are "hidden" (fully rotated)
              setCurrentPageIdx(paraIdx);
              currentPageIdxRef.current = paraIdx;

              setFlipPhase('flip-in');
              await new Promise(r => setTimeout(r, 440));
              if (cancelledRef.current) break;
              setFlipPhase('idle');
            } else {
              // First paragraph — appear directly, no flip
              setCurrentPageIdx(paraIdx);
              currentPageIdxRef.current = paraIdx;
            }

            // Narrate while the page is shown
            setActiveEventIdx(gIdx);
            if (ev.audioUrl) await playAudioUrl(ev.audioUrl);
            if (!cancelledRef.current) await new Promise(r => setTimeout(r, 200));
            setActiveEventIdx(null);
            continue;
          }

          // ── Ask to draw ──────────────────────────────────────────────────
          if (ev.type === 'ask_user_to_draw') {
            const dEv = ev as AskUserToDrawEvent;
            setCurrentDraw(dEv);
            setPhase('draw_prompt');

            const submitted = await new Promise<string>(res => {
              interactionResolveRef.current = res;
            });
            interactionResolveRef.current = null;
            if (cancelledRef.current) break;

            dEv.imageDataUrl = submitted;

            if (submitted) {
              setPhase('audio_gen'); // reuse "preparing" banner while vision runs
              const storyCtx = allEvents
                .filter(e => e.type === 'paragraph')
                .slice(-3)
                .map(e => (e as ParagraphEvent).text)
                .join('\n\n');
              try {
                dEv.visionDescription = await visionToDrawingDescription(
                  submitted, dEv.prompt, storyCtx, mistralKey,
                );
              } catch {
                dEv.visionDescription = '(a creative drawing)';
              }
            } else {
              dEv.visionDescription = '(skipped)';
            }

            setCurrentDraw(null);
            setStoryEvents([...allEvents]); // show visionDescription
            interactionHit = true;
            break; // break inner for-loop → agent is called again in while-loop
          }

          // ── Ask to speak ─────────────────────────────────────────────────
          if (ev.type === 'ask_user_to_speak') {
            const sEv = ev as AskUserToSpeakEvent;
            setCurrentSpeak(sEv);
            setPhase('speak_prompt');

            const word = await new Promise<string>(res => {
              interactionResolveRef.current = res;
            });
            interactionResolveRef.current = null;
            if (cancelledRef.current) break;

            sEv.word = word || '(silence)';
            setCurrentSpeak(null);
            setStoryEvents([...allEvents]);
            interactionHit = true;
            break; // break inner for-loop → agent is called again in while-loop
          }

          // ── Finish ───────────────────────────────────────────────────────
          if (ev.type === 'finish') {
            storyDone = true;
            break;
          }
        }

        if (cancelledRef.current) break;

        if (storyDone) {
          setPhase('done');
          setActiveEventIdx(null);
          musicStopRef.current?.(); // optionally keep music playing; here we fade out
          break; // exit while-loop
        }

        // interactionHit: the while-loop continues → agent is called with updated allEvents
        if (!interactionHit && !storyDone) {
          // Safety: agent returned no interaction or finish — treat as done
          setPhase('done');
          break;
        }
      }

    } catch (e) {
      if (!cancelledRef.current) {
        console.error('[runGenerate]', e);
        setStoryError(e instanceof Error ? e.message : 'Something went wrong');
        setPhase('error');
      }
    } finally {
      isRunningRef.current = false;
    }
  }, [ageStep]); // ageStep checked at start; everything else accessed via refs or stable imports

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const ageGateActive    = ageStep !== 'done';
  const isRunning        = phase !== 'idle' && phase !== 'done' && phase !== 'error';
  const hasStory         = storyEvents.length > 0;

  // Book-page view — extract only paragraphs for the page-by-page display
  const paragraphEvents  = storyEvents.filter((e): e is ParagraphEvent => e.type === 'paragraph');
  const currentPage      = currentPageIdx !== null ? (paragraphEvents[currentPageIdx] ?? null) : null;
  const showBookPage     = currentPage !== null;          // true once story has at least one paragraph

  const generateButtonLabel = (() => {
    switch (phase) {
      case 'world':        return '🔍 Analyzing…';
      case 'agent':        return '✨ Writing…';
      case 'audio_gen':    return '🎵 Preparing…';
      case 'playing':      return '🔊 Narrating…';
      case 'draw_prompt':  return '✏️ Drawing…';
      case 'speak_prompt': return '🎙️ Speaking…';
      case 'done':         return '🌟 Tell My Story!';
      case 'error':        return '🌟 Try Again';
      default:             return '🌟 Tell My Story!';
    }
  })();

  // =========================================================================
  // RENDER — CLOSED STATE
  // =========================================================================

  if (!bookOpen) {
    return <BookCover onOpen={() => setBookOpen(true)} />;
  }

  // =========================================================================
  // RENDER — OPEN BOOK SPREAD
  // =========================================================================

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(145deg, #160b04 0%, #2a1508 40%, #1c0d05 70%, #110804 100%)',
      }}
    >

      {/* ── Thin top bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-2 flex-shrink-0">

        <div className="flex items-center gap-2">
          <span style={{ color: '#fde68a', fontSize: '16px', filter: 'drop-shadow(0 0 8px rgba(250,204,21,0.7))' }}>✨</span>
          <span style={{ fontFamily: '"Lora", serif', fontSize: '14px', color: 'rgba(253,230,138,0.65)', fontWeight: 700, letterSpacing: '0.5px' }}>
            Drawn Worlds
          </span>
        </div>

        <div className="flex items-center gap-4">
          {ageGateActive ? (
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', fontFamily: '"Nunito",sans-serif', fontWeight: 700 }}>
              Step 1: Draw your age
            </span>
          ) : (
            /* Age group selector */
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: '"Nunito",sans-serif', fontWeight: 600 }}>Age:</span>
              <div className="flex gap-1">
                {AGE_GROUPS.map(ag => (
                  <button
                    key={ag.value}
                    onClick={() => setAgeGroup(ag.value)}
                    disabled={isRunning}
                    style={{
                      fontFamily: '"Nunito",sans-serif',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '99px',
                      transition: 'all 0.2s',
                      background: ageGroup === ag.value ? 'rgba(139,92,246,0.7)' : 'rgba(255,255,255,0.08)',
                      color: ageGroup === ag.value ? '#fff' : 'rgba(255,255,255,0.4)',
                      border: 'none',
                      cursor: isRunning ? 'default' : 'pointer',
                    }}
                  >
                    {ag.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => { void handleDebugTurnPage(); }}
            disabled={ageGateActive || paragraphEvents.length === 0 || flipPhase !== 'idle'}
            style={{
              fontFamily: '"Nunito",sans-serif',
              fontSize: '11px',
              fontWeight: 800,
              padding: '5px 10px',
              borderRadius: '999px',
              border: '1px solid rgba(59,130,246,0.35)',
              background:
                ageGateActive || paragraphEvents.length === 0 || flipPhase !== 'idle'
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(30,64,175,0.35)',
              color:
                ageGateActive || paragraphEvents.length === 0 || flipPhase !== 'idle'
                  ? 'rgba(255,255,255,0.35)'
                  : 'rgba(219,234,254,0.95)',
              cursor:
                ageGateActive || paragraphEvents.length === 0 || flipPhase !== 'idle'
                  ? 'not-allowed'
                  : 'pointer',
              transition: 'all 0.2s',
            }}
            title="Debug only: force a page turn"
          >
            Debug: Turn Page
          </button>

          <button
            onClick={handleFreshStart}
            style={{
              fontFamily: '"Nunito",sans-serif',
              fontSize: '11px',
              fontWeight: 800,
              padding: '5px 10px',
              borderRadius: '999px',
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(127,29,29,0.35)',
              color: 'rgba(254,202,202,0.95)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            title="Clear everything and go back to the cover"
          >
            Fresh Start
          </button>
        </div>
      </div>

      {/* ── Book spread ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-3 pb-4 pt-0 overflow-hidden">
        <div
          className="book-spread-enter w-full flex flex-col lg:flex-row overflow-hidden"
          style={{
            maxWidth: '1260px',
            height: 'min(calc(100vh - 68px), 780px)',
            borderRadius: '2px',
            boxShadow: '0 40px 100px rgba(0,0,0,0.9), 0 10px 30px rgba(0,0,0,0.7)',
          }}
        >

          {/* ════════════════════════════════════════════════════════
              LEFT PAGE  —  drawing / illustration / draw-prompt
              ════════════════════════════════════════════════════════ */}
          <div
            className={`book-page book-page-left page-turn-leaf flex flex-col overflow-hidden ${
              flipPhase === 'flip-out' ? 'page-turn-out' :
              flipPhase === 'flip-in'  ? 'page-turn-in'  : ''
            }`}
            style={{ flex: '1 1 0', minWidth: 0, position: 'relative' }}
          >
            <div
              aria-hidden
              className={`page-turn-shadow ${
                flipPhase === 'flip-out' ? 'page-turn-shadow-out' :
                flipPhase === 'flip-in'  ? 'page-turn-shadow-in'  : ''
              }`}
            />

            {/* ── Age gate: locked ──────────────────────────────────── */}
            {ageGateActive && ageStep === 'locked' && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: '#ffffff' }}
              >
                <button
                  onClick={handleUnlockAgeDrawing}
                  className="flex flex-col items-center justify-center gap-3"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                  title="Pick your magic pen"
                >
                  <img
                    src="/magic-pen.png"
                    alt="Magic pen"
                    className="magic-pen-pulse"
                    style={{ width: '300px', height: '300px', maxWidth: '78vw', maxHeight: '42vh', objectFit: 'contain' }}
                  />
                  <span style={{ fontFamily: '"Nunito",sans-serif', fontSize: '20px', fontWeight: 900, color: '#6d28d9', textShadow: '0 2px 10px rgba(109,40,217,0.2)' }}>
                    Pick your magic pen
                  </span>
                </button>
              </div>
            )}

            {/* ── Age gate: drawing ─────────────────────────────────── */}
            {ageGateActive && ageStep === 'drawing' && (
              <div className="absolute inset-0 flex flex-col">
                <div className="flex-1 min-h-0 relative">
                  <CanvasBoard
                    ref={canvasRef}
                    brushColor={brushColor}
                    brushSize={brushSize}
                    isEraser={isEraser}
                    disabled={ageBusy}
                  />
                </div>
                <div className="flex gap-2 flex-shrink-0 px-4 pb-4">
                  <button
                    onClick={handleAgeDone}
                    disabled={ageBusy}
                    className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95"
                    style={{
                      fontFamily: '"Nunito",sans-serif',
                      background: ageBusy
                        ? 'rgba(0,0,0,0.08)'
                        : 'linear-gradient(135deg, #7c3aed, #db2777)',
                      color: ageBusy ? '#aaa' : '#fff',
                      boxShadow: ageBusy ? 'none' : '0 4px 15px rgba(124,58,237,0.4)',
                      cursor: ageBusy ? 'not-allowed' : 'pointer',
                      border: 'none',
                    }}
                  >
                    {ageBusy ? '🔍 Reading age…' : 'Done with age'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Normal drawing mode (after age gate, before story) ─── */}
            {!ageGateActive && showDrawing && (
              <div className="absolute inset-0 flex flex-col gap-2 p-4">
                <ToolBar
                  brushColor={brushColor}
                  setBrushColor={setBrushColor}
                  brushSize={brushSize}
                  setBrushSize={setBrushSize}
                  isEraser={isEraser}
                  setIsEraser={setIsEraser}
                  onUndo={() => canvasRef.current?.undo()}
                  onClear={handleClear}
                />

                <div className="flex-1 min-h-0">
                  <CanvasBoard
                    ref={canvasRef}
                    brushColor={brushColor}
                    brushSize={brushSize}
                    isEraser={isEraser}
                  />
                </div>

                {/* Generate button */}
                <div className="flex-shrink-0">
                  <button
                    onClick={runGenerate}
                    disabled={isRunning}
                    className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95"
                    style={{
                      fontFamily: '"Nunito",sans-serif',
                      background: isRunning
                        ? 'rgba(0,0,0,0.1)'
                        : 'linear-gradient(135deg, #7c3aed, #db2777)',
                      color: isRunning ? '#aaa' : '#fff',
                      boxShadow: isRunning ? 'none' : '0 4px 15px rgba(124,58,237,0.4)',
                      cursor: isRunning ? 'not-allowed' : 'pointer',
                      border: 'none',
                    }}
                  >
                    {isRunning ? generateButtonLabel : '🌟 Tell My Story!'}
                  </button>
                </div>

                <PageLabel side="left" text="your drawing" />
              </div>
            )}

            {/* ── Illustration / Imagen mode (story is running / done) ─── */}
            {!ageGateActive && !showDrawing && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center"
                style={{ pointerEvents: currentDraw ? 'none' : 'auto' }}
              >
                {/* Imagen illustration — fills the entire left page */}
                {currentPage?.imageDataUrl ? (
                  <img
                    key={currentPage.imageDataUrl}   /* key forces re-mount on swap → smooth fade */
                    src={currentPage.imageDataUrl}
                    alt="Story illustration"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      animation: 'pageContentIn 0.5s ease-out both',
                    }}
                  />
                ) : phase === 'audio_gen' ? (
                  /* Shimmer while Imagen is generating */
                  <div className="imagen-loading-shimmer absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <span style={{ fontSize: '36px', opacity: 0.4 }}>🎨</span>
                    <p style={{ fontFamily: '"Nunito",sans-serif', fontSize: '12px', fontWeight: 700, color: 'rgba(120,80,30,0.5)' }}>
                      Illustrating…
                    </p>
                  </div>
                ) : illustration ? (
                  /* Fall back to user's own canvas drawing */
                  <div className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-8">
                    <div style={{ maxWidth: '380px', width: '100%', borderRadius: '4px', boxShadow: '0 4px 20px rgba(0,0,0,0.18), 0 0 0 1px rgba(175,138,80,0.2)', overflow: 'hidden', position: 'relative' }}>
                      <img src={illustration} alt="Your drawing" className="w-full h-auto block" />
                      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(253,230,138,0.04) 0%, transparent 50%, rgba(0,0,0,0.06) 100%)', mixBlendMode: 'multiply' }} />
                    </div>
                    <p style={{ fontFamily: '"Lora", serif', fontSize: '13px', fontStyle: 'italic', color: 'rgba(120,90,50,0.55)', textAlign: 'center' }}>
                      — {worldModel?.title ?? 'your magical drawing'} —
                    </p>
                  </div>
                ) : (
                  <div className="text-center" style={{ color: 'rgba(175,138,80,0.4)' }}>
                    <p style={{ fontSize: '40px', marginBottom: '8px' }}>🎨</p>
                    <p style={{ fontFamily: '"Lora",serif', fontStyle: 'italic', fontSize: '14px' }}>Your illustration will appear here</p>
                  </div>
                )}
                {/* Narrating indicator over the image */}
                {activeEventIdx !== null && currentPage?.imageDataUrl && (
                  <div className="absolute bottom-8 left-1/2" style={{ transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.45)', borderRadius: '999px', padding: '4px 12px' }}>
                    <span style={{ fontFamily: '"Nunito",sans-serif', fontSize: '12px', fontWeight: 700, color: '#fff' }}>🔊 Narrating…</span>
                  </div>
                )}
                <PageLabel side="left" text="the illustration" />
              </div>
            )}

            {/* ── DrawPrompt overlay (absolute, on top of illustration) ── */}
            {currentDraw && (
              <DrawPrompt
                prompt={currentDraw.prompt}
                onSubmit={handleDrawSubmit}
                onSkip={handleDrawSkip}
                busy={false}
              />
            )}

          </div>

          {/* ════════════════════════════════════════════════════════
              SPINE
              ════════════════════════════════════════════════════════ */}
          <div className="book-spine hidden lg:block flex-shrink-0" style={{ width: '22px' }} />

          {/* ════════════════════════════════════════════════════════
              RIGHT PAGE  —  wizard / story timeline / speak-prompt
              ════════════════════════════════════════════════════════ */}
          <div
            className="book-page book-page-right flex flex-col overflow-hidden"
            style={{ flex: '1 1 0', minWidth: 0, position: 'relative' }}
          >

            {/* ── Age gate: wizard UI ───────────────────────────────── */}
            {ageGateActive ? (
              <div className="flex flex-col h-full">
                <div
                  className="flex-1 flex flex-col items-center justify-center text-center"
                  style={{ background: '#ffffff' }}
                >
                  {wizardVideoFailed ? (
                    <img
                      src="/wizard.png"
                      alt="Wizard guide"
                      style={{ width: '420px', maxWidth: '94%', marginBottom: '20px' }}
                    />
                  ) : (
                    <video
                      src="/wizard_video.mp4"
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="auto"
                      onError={() => setWizardVideoFailed(true)}
                      style={{ width: '420px', maxWidth: '94%', marginBottom: '20px', borderRadius: '16px', objectFit: 'cover' }}
                    />
                  )}
                  <p style={{ fontFamily: '"Lora",serif', fontSize: '24px', lineHeight: 1.25, color: '#5b3712', fontWeight: 700, marginBottom: '10px' }}>
                    Draw your age for me
                  </p>
                  <p style={{ fontFamily: '"Nunito",sans-serif', fontSize: '14px', color: 'rgba(90,55,18,0.68)', maxWidth: '320px' }}>
                    Draw a number like 6, then tap Done with age.
                  </p>
                  {detectedAge !== null && (
                    <p style={{ fontFamily: '"Nunito",sans-serif', fontSize: '13px', fontWeight: 800, color: 'rgba(67,56,202,0.85)', marginTop: '14px' }}>
                      Age set: {detectedAge}
                    </p>
                  )}
                </div>
                <PageLabel side="right" text="the wizard" />
              </div>

            ) : showBookPage ? (
              /* ── Book page — big single paragraph ────────────────── */
              <div className="flex flex-col h-full relative">
                <div className="flex-1 flex flex-col items-center justify-center px-10 py-10">
                  <p
                    key={currentPageIdx}   /* key forces re-mount on page swap → fade-in */
                    className="page-content-enter"
                    style={{
                      fontFamily: '"Lora", serif',
                      fontSize: 'clamp(17px, 2vw, 25px)',
                      lineHeight: 2,
                      color: '#3b2004',
                      textAlign: 'center',
                      letterSpacing: '0.01em',
                      maxWidth: '520px',
                    }}
                  >
                    {currentPage!.text}
                  </p>
                </div>

                {/* Narrating badge */}
                {activeEventIdx !== null && (
                  <div
                    className="absolute top-5 left-1/2"
                    style={{ transform: 'translateX(-50%)', background: 'rgba(109,40,217,0.15)', border: '1px solid rgba(109,40,217,0.25)', borderRadius: '999px', padding: '3px 12px', backdropFilter: 'blur(4px)' }}
                  >
                    <span style={{ fontFamily: '"Nunito",sans-serif', fontSize: '11px', fontWeight: 800, color: '#6d28d9', letterSpacing: '0.5px' }}>
                      🔊 Narrating…
                    </span>
                  </div>
                )}

                {/* Page number */}
                <div
                  className="absolute bottom-10 right-5"
                  style={{ fontFamily: '"Lora",serif', fontSize: '11px', fontStyle: 'italic', color: 'rgba(175,138,80,0.45)' }}
                >
                  {(currentPageIdx ?? 0) + 1} / {paragraphEvents.length}
                </div>

                <PageLabel side="right" text="the story" />
              </div>

            ) : (
              /* ── Story timeline (pre-story / loading / error) ─────── */
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex-1 min-h-0 overflow-hidden">
                  <StoryTimeline
                    events={storyEvents}
                    activeEventIdx={activeEventIdx}
                    phase={phase}
                    errorMsg={storyError}
                  />
                </div>

                {/* Generate button — shown when no story yet and not running */}
                {!hasStory && !isRunning && (
                  <div className="flex-shrink-0 px-5 pb-4">
                    <button
                      onClick={runGenerate}
                      className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95"
                      style={{
                        fontFamily: '"Nunito",sans-serif',
                        background: 'linear-gradient(135deg, #7c3aed, #db2777)',
                        color: '#fff',
                        boxShadow: '0 4px 15px rgba(124,58,237,0.4)',
                        cursor: 'pointer',
                        border: 'none',
                      }}
                    >
                      🌟 Tell My Story!
                    </button>
                  </div>
                )}

                <PageLabel side="right" text="the story" />
              </div>
            )}

            {/* ── SpeakPrompt overlay ───────────────────────────────── */}
            {currentSpeak && (
              <SpeakPrompt
                prompt={currentSpeak.prompt}
                onWord={handleSpeakWord}
                onSkip={handleSpeakSkip}
                busy={false}
              />
            )}

          </div>

        </div>
      </div>

      {/* ── FAB: back to drawing (story running or done, user is in story view) */}
      {!ageGateActive && !showDrawing && !isRunning && (
        <button
          onClick={() => setShowDrawing(true)}
          className="fab-enter fixed bottom-7 left-7 z-50 flex items-center gap-2 font-black rounded-2xl shadow-2xl transition-all active:scale-95 hover:scale-105"
          style={{
            fontFamily: '"Nunito",sans-serif',
            fontSize: '13px',
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #7c3aed, #db2777)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 8px 30px rgba(124,58,237,0.55)',
          }}
          title="View your drawing"
        >
          🖼️ Drawing
        </button>
      )}

      {/* ── FAB: back to story (user switched to drawing view and story exists) */}
      {!ageGateActive && showDrawing && hasStory && (
        <button
          onClick={() => setShowDrawing(false)}
          className="fixed bottom-7 right-7 z-50 flex items-center gap-2 font-black rounded-2xl shadow-2xl transition-all active:scale-95 hover:scale-105"
          style={{
            fontFamily: '"Nunito",sans-serif',
            fontSize: '13px',
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #1d4ed8, #0891b2)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 8px 30px rgba(29,78,216,0.5)',
          }}
          title="Read the story"
        >
          📖 Story
        </button>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Page label decoration
// ---------------------------------------------------------------------------

function PageLabel({ side, text }: { side: 'left' | 'right'; text: string }) {
  return (
    <div
      className="absolute bottom-3 flex items-center gap-1.5 pointer-events-none select-none"
      style={{
        [side === 'left' ? 'left' : 'right']: '16px',
        fontFamily: '"Lora", serif',
        fontSize: '10px',
        fontStyle: 'italic',
        color: 'rgba(175,138,80,0.4)',
        letterSpacing: '0.5px',
      }}
    >
      {side === 'right' && <span style={{ fontSize: '8px' }}>✦</span>}
      <span>{text}</span>
      {side === 'left' && <span style={{ fontSize: '8px' }}>✦</span>}
    </div>
  );
}
