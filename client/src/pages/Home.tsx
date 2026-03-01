import { useCallback, useEffect, useRef, useState } from 'react';
import BookCover from '../components/BookCover';
import CanvasBoard, { type CanvasBoardHandle } from '../components/CanvasBoard';
import ToolBar from '../components/ToolBar';
import StoryPanel from '../components/StoryPanel';
import JsonPanel from '../components/JsonPanel';
import AudioPlayer from '../components/AudioPlayer';
import { visionToWorld } from '../lib/visionToWorld';
import { worldToOutline } from '../lib/worldToOutline';
import { outlineToStory, continueStory } from '../lib/outlineToStory';
import { visionToAge } from '../lib/visionToAge';
import { streamSpeech } from '../lib/elevenlabs';
import { clearAudioCache } from '../lib/cache';
import type { WorldModel, Outline, Story } from '../lib/schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = 'idle' | 'loading' | 'retrying' | 'done' | 'error';
type AgeStep = 'locked' | 'drawing' | 'done';

interface PipelineStatus {
  vision: StepStatus;
  outline: StepStatus;
  story: StepStatus;
  audio: StepStatus;
}

interface SessionState {
  worldModel: WorldModel | null;
  outline: Outline | null;
  story: Story | null;
}

const IDLE_PIPELINE: PipelineStatus = { vision:'idle', outline:'idle', story:'idle', audio:'idle' };

const STEP_META = [
  { key: 'vision'  as const, icon: '🔍', label: 'Analyzing'  },
  { key: 'outline' as const, icon: '📝', label: 'Planning'   },
  { key: 'story'   as const, icon: '📖', label: 'Writing'    },
  { key: 'audio'   as const, icon: '🎙️', label: 'Narrating' },
] as const;

const AGE_GROUPS = [
  { value: 'young children (ages 3–5)', label: '3–5' },
  { value: 'children (ages 6–8)',       label: '6–8' },
  { value: 'older children (ages 9–12)',label: '9–12'},
];

const LS_KEY = 'drawnWorlds_session_v1';
const DEFAULT_AGE = 3;

// ---------------------------------------------------------------------------
// Helpers
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Home() {
  // ── Book UI state
  const [bookOpen,      setBookOpen     ] = useState(false);
  const [showDrawing,   setShowDrawing  ] = useState(true);
  const [illustration,  setIllustration ] = useState<string | null>(null);

  // ── Drawing tools
  const canvasRef   = useRef<CanvasBoardHandle>(null);
  const [brushColor, setBrushColor] = useState('#3B82F6');
  const [brushSize,  setBrushSize ] = useState(8);
  const [isEraser,   setIsEraser  ] = useState(false);

  // ── Pipeline
  const [pipeline,  setPipeline ] = useState<PipelineStatus>(IDLE_PIPELINE);
  const [errors,    setErrors   ] = useState<Partial<Record<keyof PipelineStatus, string>>>({});
  const [isRunning, setIsRunning] = useState(false);

  // ── Session
  const [session,  setSession ] = useState<SessionState>({ worldModel: null, outline: null, story: null });
  const [audioSrc, setAudioSrc] = useState<string | null>(null);

  // Revoke old object URL whenever audioSrc changes (prevents memory leaks)
  useEffect(() => {
    return () => { if (audioSrc) URL.revokeObjectURL(audioSrc); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSrc]);

  // ── Settings
  const [ageGroup,     setAgeGroup    ] = useState(AGE_GROUPS[1].value);
  const [autoNarrate,  setAutoNarrate ] = useState(true);
  const [ageStep,      setAgeStep     ] = useState<AgeStep>('locked');
  const [detectedAge,  setDetectedAge ] = useState<number | null>(null);
  const [ageBusy,      setAgeBusy     ] = useState(false);
  const [wizardVideoFailed, setWizardVideoFailed] = useState(false);

  // ── localStorage restore
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<SessionState>;
        setSession(prev => ({ ...prev, worldModel: p.worldModel??null, outline: p.outline??null, story: p.story??null }));
        if (p.story) setShowDrawing(false);
        if (p.story || p.worldModel || p.outline) setAgeStep('done');
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!session.worldModel) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ worldModel: session.worldModel, outline: session.outline, story: session.story }));
    } catch { /* ignore */ }
  }, [session.worldModel, session.outline, session.story]);

  // ── Pipeline helpers
  const setStep = useCallback((step: keyof PipelineStatus, status: StepStatus, err?: string) => {
    setPipeline(p => ({ ...p, [step]: status }));
    if (err) setErrors(p => ({ ...p, [step]: err }));
    else     setErrors(p => { const n = {...p}; delete n[step]; return n; });
  }, []);

  const narrate = useCallback(async (text: string) => {
    const elKey   = getEnv('VITE_ELEVENLABS_API_KEY');
    const voiceId = getEnv('VITE_ELEVENLABS_VOICE_ID');
    setStep('audio', 'loading');
    try {
      await streamSpeech(text, voiceId, elKey, (url) => {
        setAudioSrc(url);
        setStep('audio', 'done');
      });
    } catch (e) {
      setStep('audio', 'error', e instanceof Error ? e.message : 'Audio failed');
    }
  }, [setStep]);

  // ── Full pipeline
  const runGenerate = useCallback(async () => {
    if (isRunning) return;
    if (ageStep !== 'done') {
      alert('First, draw your age and tap "Done with age".');
      return;
    }
    const dataUrl = canvasRef.current?.getDataURL();
    if (!dataUrl || canvasRef.current?.isEmpty()) { alert('Draw something first! 🎨'); return; }

    let mistralKey: string;
    try { mistralKey = getEnv('VITE_MISTRAL_API_KEY'); }
    catch (e) { alert(e instanceof Error ? e.message : 'Missing API key'); return; }

    setIllustration(dataUrl);
    setIsRunning(true);
    setPipeline(IDLE_PIPELINE);
    setErrors({});
    setSession({ worldModel:null, outline:null, story:null });
    setAudioSrc(null);
    localStorage.removeItem(LS_KEY);

    try {
      setStep('vision', 'loading');
      let worldModel: WorldModel;
      try {
        worldModel = await visionToWorld(dataUrl, mistralKey, () => setStep('vision','retrying'));
        setStep('vision', 'done');
        setSession(p => ({ ...p, worldModel }));
      } catch (e) { setStep('vision','error', e instanceof Error ? e.message : 'Vision failed'); return; }

      setStep('outline', 'loading');
      let outline: Outline;
      try {
        outline = await worldToOutline(worldModel, mistralKey, () => setStep('outline','retrying'));
        setStep('outline', 'done');
        setSession(p => ({ ...p, outline }));
      } catch (e) { setStep('outline','error', e instanceof Error ? e.message : 'Outline failed'); return; }

      setStep('story', 'loading');
      let story: Story;
      try {
        story = await outlineToStory(worldModel, outline, ageGroup, mistralKey, () => setStep('story','retrying'));
        setStep('story', 'done');
        setSession(p => ({ ...p, story }));
        // ✨ Transition to reading mode
        setShowDrawing(false);
      } catch (e) { setStep('story','error', e instanceof Error ? e.message : 'Story failed'); return; }

      if (autoNarrate) await narrate(story.storyText);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, ageStep, ageGroup, autoNarrate, narrate, setStep]);

  // ── Continue Story
  const runContinue = useCallback(async () => {
    if (isRunning || !session.worldModel || !session.outline || !session.story) return;
    let mistralKey: string;
    try { mistralKey = getEnv('VITE_MISTRAL_API_KEY'); }
    catch (e) { alert(e instanceof Error ? e.message : 'Missing API key'); return; }

    setIsRunning(true);
    setStep('story', 'loading');
    setErrors({});

    try {
      const cont = await continueStory(
        session.worldModel, session.outline.motifs, session.story.storyText,
        mistralKey, () => setStep('story','retrying')
      );
      setStep('story', 'done');
      const merged: Story = {
        storyTitle: cont.storyTitle,
        storyText: session.story.storyText + '\n\n' + cont.storyText,
        moral: cont.moral,
      };
      setSession(p => ({ ...p, story: merged }));
      setAudioSrc(null);
      if (autoNarrate) await narrate(merged.storyText);

    } catch (e) {
      setStep('story','error', e instanceof Error ? e.message : 'Continuation failed');
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, session, autoNarrate, narrate, setStep]);

  const handleNarrateClick = useCallback(() => {
    if (audioSrc || !session.story) return;
    narrate(session.story.storyText).catch(() => null);
  }, [audioSrc, session.story, narrate]);

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
      const finalAge = recognized ?? DEFAULT_AGE;
      setDetectedAge(finalAge);
      setAgeGroup(ageToGroup(finalAge));
      setAgeStep('done');
      canvasRef.current?.clear();
    } catch {
      // Failsafe path: always continue with youngest age bucket
      setDetectedAge(DEFAULT_AGE);
      setAgeGroup(ageToGroup(DEFAULT_AGE));
      setAgeStep('done');
      canvasRef.current?.clear();
    } finally {
      setAgeBusy(false);
    }
  }, [ageBusy, ageStep]);

  const handleClear = () => {
    canvasRef.current?.clear();
    setIllustration(null);
    setSession({ worldModel:null, outline:null, story:null });
    setAudioSrc(null);
    setPipeline(IDLE_PIPELINE);
    setErrors({});
    setShowDrawing(true);
    localStorage.removeItem(LS_KEY);
  };

  const handleFreshStart = useCallback(() => {
    if (isRunning) return;
    const confirmed = window.confirm(
      'Start fresh? This will clear your drawing, story, and saved session.',
    );
    if (!confirmed) return;

    canvasRef.current?.clear();
    clearAudioCache();
    localStorage.removeItem(LS_KEY);

    setIllustration(null);
    setSession({ worldModel:null, outline:null, story:null });
    setAudioSrc(null);
    setPipeline(IDLE_PIPELINE);
    setErrors({});
    setShowDrawing(true);
    setBookOpen(false);
    setAgeGroup(AGE_GROUPS[1].value);
    setAutoNarrate(true);
    setAgeStep('locked');
    setDetectedAge(null);
    setAgeBusy(false);
    setWizardVideoFailed(false);
    setBrushColor('#3B82F6');
    setBrushSize(8);
    setIsEraser(false);
  }, [isRunning]);

  // ── Derived
  const anyActive    = Object.values(pipeline).some(s => s !== 'idle');
  const hasStory     = !!session.story;
  const canContinue  = hasStory && !!session.worldModel && !!session.outline;
  const ageGateActive = ageStep !== 'done';

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
      {/* ── Thin top bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span style={{ color: '#fde68a', fontSize: '16px', filter: 'drop-shadow(0 0 8px rgba(250,204,21,0.7))' }}>✨</span>
          <span style={{ fontFamily: '"Lora", serif', fontSize: '14px', color: 'rgba(253,230,138,0.65)', fontWeight: 700, letterSpacing: '0.5px' }}>
            Drawn Worlds
          </span>
        </div>

        <div className="flex items-center gap-4">
          {ageGateActive ? (
            <span
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.55)',
                fontFamily: '"Nunito",sans-serif',
                fontWeight: 700,
              }}
            >
              Step 1: Draw your age
            </span>
          ) : (
            <>
              {/* Age group */}
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: '"Nunito",sans-serif', fontWeight: 600 }}>Age:</span>
                <div className="flex gap-1">
                  {AGE_GROUPS.map(ag => (
                    <button
                      key={ag.value}
                      onClick={() => setAgeGroup(ag.value)}
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
                        cursor: 'pointer',
                      }}
                    >
                      {ag.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-narrate */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoNarrate}
                  onChange={e => setAutoNarrate(e.target.checked)}
                  className="w-3.5 h-3.5 accent-purple-500"
                />
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: '"Nunito",sans-serif', fontWeight: 600 }}>
                  Auto-narrate
                </span>
              </label>
            </>
          )}

          <button
            onClick={handleFreshStart}
            disabled={isRunning}
            style={{
              fontFamily: '"Nunito",sans-serif',
              fontSize: '11px',
              fontWeight: 800,
              padding: '5px 10px',
              borderRadius: '999px',
              border: '1px solid rgba(239,68,68,0.35)',
              background: isRunning ? 'rgba(255,255,255,0.08)' : 'rgba(127,29,29,0.35)',
              color: isRunning ? 'rgba(255,255,255,0.35)' : 'rgba(254,202,202,0.95)',
              cursor: isRunning ? 'not-allowed' : 'pointer',
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

          {/* ══════════════════════════════════════════════════
              LEFT PAGE
              ══════════════════════════════════════════════════ */}
          <div
            className="book-page book-page-left flex flex-col overflow-hidden"
            style={{ flex: '1 1 0', minWidth: 0, position: 'relative' }}
          >
            {/* Drawing mode */}
            <div
              className={`absolute inset-0 flex flex-col ${ageGateActive ? 'gap-0 p-0' : 'gap-2 p-4'} ${showDrawing ? 'page-content-enter' : 'page-content-exit pointer-events-none'}`}
              style={{ opacity: showDrawing ? 1 : 0 }}
            >
              {ageGateActive ? (
                <>
                  {ageStep === 'locked' ? (
                    <div
                      className="flex-1 relative flex items-center justify-center"
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
                        <span
                          style={{
                            fontFamily: '"Nunito",sans-serif',
                            fontSize: '20px',
                            fontWeight: 900,
                            color: '#6d28d9',
                            textShadow: '0 2px 10px rgba(109,40,217,0.2)',
                          }}
                        >
                          Pick your magic pen
                        </span>
                      </button>
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* Toolbar */}
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

                  {/* Canvas */}
                  <div className="flex-1 min-h-0">
                    <CanvasBoard
                      ref={canvasRef}
                      brushColor={brushColor}
                      brushSize={brushSize}
                      isEraser={isEraser}
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={runGenerate}
                      disabled={isRunning}
                      className="flex-1 py-3 rounded-xl font-black text-sm transition-all active:scale-95"
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
                      {isRunning && !canContinue ? '✨ Generating…' : '🌟 Generate Story'}
                    </button>
                    <button
                      onClick={runContinue}
                      disabled={!canContinue || isRunning}
                      className="flex-1 py-3 rounded-xl font-black text-sm transition-all active:scale-95"
                      style={{
                        fontFamily: '"Nunito",sans-serif',
                        background: canContinue && !isRunning
                          ? 'linear-gradient(135deg, #2563eb, #0891b2)'
                          : 'rgba(0,0,0,0.08)',
                        color: canContinue && !isRunning ? '#fff' : '#bbb',
                        boxShadow: canContinue && !isRunning ? '0 4px 15px rgba(37,99,235,0.35)' : 'none',
                        cursor: canContinue && !isRunning ? 'pointer' : 'not-allowed',
                        border: 'none',
                      }}
                    >
                      {isRunning && canContinue ? '📚 Continuing…' : '📚 Continue Story'}
                    </button>
                  </div>

                  {/* Pipeline status bar */}
                  {anyActive && (
                    <div className="grid grid-cols-4 gap-1.5 flex-shrink-0">
                      {STEP_META.map(({ key, icon, label }) => {
                        const s = pipeline[key];
                        return (
                          <div
                            key={key}
                            className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl text-center text-xs"
                            style={{
                              background:
                                s==='done'    ? 'rgba(34,197,94,0.12)'  :
                                s==='loading' ? 'rgba(139,92,246,0.14)' :
                                s==='retrying'? 'rgba(245,158,11,0.14)' :
                                s==='error'   ? 'rgba(239,68,68,0.12)'  :
                                'rgba(0,0,0,0.06)',
                              border: `1px solid ${
                                s==='done'    ? 'rgba(34,197,94,0.25)'  :
                                s==='loading' ? 'rgba(139,92,246,0.3)'  :
                                s==='retrying'? 'rgba(245,158,11,0.3)'  :
                                s==='error'   ? 'rgba(239,68,68,0.25)'  :
                                'rgba(0,0,0,0.08)'}`,
                            }}
                          >
                            <span
                              style={{ fontSize: '16px' }}
                              className={s==='loading'||s==='retrying' ? 'animate-spin' : ''}
                            >
                              {s==='done' ? '✅' : s==='error' ? '❌' : icon}
                            </span>
                            <span style={{ fontFamily:'"Nunito",sans-serif', fontWeight:700, color: s==='done'?'#166534':s==='error'?'#991b1b':'#4b5563', fontSize:'10px' }}>
                              {label}
                            </span>
                            {s==='retrying' && <span style={{ fontSize:'9px', color:'#92400e' }}>retry…</span>}
                            {s==='error' && errors[key] && (
                              <span style={{ fontSize:'9px', color:'#991b1b', wordBreak:'break-all' }} title={errors[key]}>
                                {errors[key]!.slice(0,40)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {!ageGateActive && <PageLabel side="left" text="your drawing" />}
            </div>

            {/* Illustration mode (after story) */}
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 ${!showDrawing ? 'page-content-enter' : 'page-content-exit pointer-events-none'}`}
              style={{ opacity: !showDrawing ? 1 : 0 }}
            >
              {illustration ? (
                <>
                  {/* Illustration frame */}
                  <div
                    className="relative overflow-hidden"
                    style={{
                      maxWidth: '380px',
                      width: '100%',
                      borderRadius: '4px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.18), 0 0 0 1px rgba(175,138,80,0.2)',
                    }}
                  >
                    <img
                      src={illustration}
                      alt="Your drawing"
                      className="w-full h-auto block"
                      style={{ imageRendering: 'auto' }}
                    />
                    {/* Aged overlay */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(253,230,138,0.04) 0%, transparent 50%, rgba(0,0,0,0.06) 100%)',
                        mixBlendMode: 'multiply',
                      }}
                    />
                  </div>

                  <p
                    style={{
                      fontFamily: '"Lora", serif',
                      fontSize: '13px',
                      fontStyle: 'italic',
                      color: 'rgba(120,90,50,0.55)',
                      textAlign: 'center',
                      lineHeight: 1.5,
                    }}
                  >
                    — {session.worldModel?.title ?? 'your magical drawing'} —
                  </p>
                </>
              ) : (
                <div className="text-center" style={{ color: 'rgba(175,138,80,0.4)' }}>
                  <p style={{ fontSize: '40px', marginBottom: '8px' }}>🎨</p>
                  <p style={{ fontFamily: '"Lora",serif', fontStyle:'italic', fontSize:'14px' }}>Your illustration will appear here</p>
                </div>
              )}
              <PageLabel side="left" text="the illustration" />
            </div>
          </div>

          {/* ══════════════════════════════════════════════════
              SPINE
              ══════════════════════════════════════════════════ */}
          <div className="book-spine hidden lg:block flex-shrink-0" style={{ width: '22px' }} />

          {/* ══════════════════════════════════════════════════
              RIGHT PAGE
              ══════════════════════════════════════════════════ */}
          <div
            className="book-page book-page-right flex flex-col overflow-y-auto"
            style={{ flex: '1 1 0', minWidth: 0 }}
          >
            <div className={`flex flex-col h-full ${ageGateActive ? '' : 'gap-4 p-5'}`}>
              {ageGateActive ? (
                <>
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
                        style={{
                          width: '420px',
                          maxWidth: '94%',
                          marginBottom: '20px',
                          borderRadius: '16px',
                          objectFit: 'cover',
                        }}
                      />
                    )}
                    <p
                      style={{
                        fontFamily: '"Lora",serif',
                        fontSize: '24px',
                        lineHeight: 1.25,
                        color: '#5b3712',
                        fontWeight: 700,
                        marginBottom: '10px',
                      }}
                    >
                      Draw your age for me
                    </p>
                    <p
                      style={{
                        fontFamily: '"Nunito",sans-serif',
                        fontSize: '14px',
                        color: 'rgba(90,55,18,0.68)',
                        maxWidth: '320px',
                      }}
                    >
                      Draw a number like 6, then tap Done with age.
                    </p>
                    {detectedAge !== null && (
                      <p
                        style={{
                          fontFamily: '"Nunito",sans-serif',
                          fontSize: '13px',
                          fontWeight: 800,
                          color: 'rgba(67,56,202,0.85)',
                          marginTop: '14px',
                        }}
                      >
                        Age set: {detectedAge}
                      </p>
                    )}
                  </div>
                  <PageLabel side="right" text="the wizard" />
                </>
              ) : (
                <>
                  {/* Audio player */}
                  <AudioPlayer
                    audioSrc={audioSrc}
                    isLoading={pipeline.audio === 'loading'}
                    onNarrateClick={handleNarrateClick}
                    disabled={!hasStory}
                  />

                  {/* Story */}
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <StoryPanel
                      title={session.story?.storyTitle ?? null}
                      text={session.story?.storyText ?? null}
                      moral={session.story?.moral ?? null}
                      isLoading={pipeline.story==='loading' || pipeline.story==='retrying'}
                    />
                  </div>

                  {/* JSON panels */}
                  <div className="flex-shrink-0 flex flex-col gap-2">
                    <JsonPanel title="World Model" data={session.worldModel} icon="🌍" />
                    <JsonPanel title="Story Outline" data={session.outline}   icon="📝" />
                  </div>

                  <PageLabel side="right" text="the story" />
                </>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Floating Draw button (reading mode) ──────────────────────────── */}
      {!ageGateActive && !showDrawing && (
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
          title="Open drawing canvas"
        >
          ✏️ Draw
        </button>
      )}

      {/* ── Floating Story button (drawing mode, story exists) ────────────── */}
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
// Page number / label decorations
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
