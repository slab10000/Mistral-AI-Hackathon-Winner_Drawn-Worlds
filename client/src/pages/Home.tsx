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
import { generateSpeech } from '../lib/elevenlabs';
import type { WorldModel, Outline, Story } from '../lib/schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = 'idle' | 'loading' | 'retrying' | 'done' | 'error';

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
  audioBlob: Blob | null;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEnv(key: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
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
  const [session, setSession] = useState<SessionState>({
    worldModel: null, outline: null, story: null, audioBlob: null,
  });

  // ── Settings
  const [ageGroup,     setAgeGroup    ] = useState(AGE_GROUPS[1].value);
  const [autoNarrate,  setAutoNarrate ] = useState(true);

  // ── localStorage restore
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<SessionState>;
        setSession(prev => ({ ...prev, worldModel: p.worldModel??null, outline: p.outline??null, story: p.story??null }));
        if (p.story) setShowDrawing(false);
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
    const elKey = getEnv('VITE_ELEVENLABS_API_KEY');
    const voiceId = getEnv('VITE_ELEVENLABS_VOICE_ID');
    setStep('audio', 'loading');
    try {
      const blob = await generateSpeech(text, voiceId, elKey);
      setStep('audio', 'done');
      setSession(p => ({ ...p, audioBlob: blob }));
    } catch (e) {
      setStep('audio', 'error', e instanceof Error ? e.message : 'Audio failed');
    }
  }, [setStep]);

  // ── Full pipeline
  const runGenerate = useCallback(async () => {
    if (isRunning) return;
    const dataUrl = canvasRef.current?.getDataURL();
    if (!dataUrl || canvasRef.current?.isEmpty()) { alert('Draw something first! 🎨'); return; }

    let mistralKey: string;
    try { mistralKey = getEnv('VITE_MISTRAL_API_KEY'); }
    catch (e) { alert(e instanceof Error ? e.message : 'Missing API key'); return; }

    setIllustration(dataUrl);
    setIsRunning(true);
    setPipeline(IDLE_PIPELINE);
    setErrors({});
    setSession({ worldModel:null, outline:null, story:null, audioBlob:null });
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
  }, [isRunning, ageGroup, autoNarrate, narrate, setStep]);

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
      setSession(p => ({ ...p, story: merged, audioBlob: null }));
      if (autoNarrate) await narrate(merged.storyText);
    } catch (e) {
      setStep('story','error', e instanceof Error ? e.message : 'Continuation failed');
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, session, autoNarrate, narrate, setStep]);

  const handleNarrateClick = useCallback(() => {
    if (session.audioBlob || !session.story) return;
    narrate(session.story.storyText).catch(() => null);
  }, [session.audioBlob, session.story, narrate]);

  const handleClear = () => {
    canvasRef.current?.clear();
    setIllustration(null);
    setSession({ worldModel:null, outline:null, story:null, audioBlob:null });
    setPipeline(IDLE_PIPELINE);
    setErrors({});
    setShowDrawing(true);
    localStorage.removeItem(LS_KEY);
  };

  // ── Derived
  const anyActive    = Object.values(pipeline).some(s => s !== 'idle');
  const hasStory     = !!session.story;
  const canContinue  = hasStory && !!session.worldModel && !!session.outline;

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
              className={`absolute inset-0 flex flex-col gap-2 p-4 ${showDrawing ? 'page-content-enter' : 'page-content-exit pointer-events-none'}`}
              style={{ opacity: showDrawing ? 1 : 0 }}
            >
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

              {/* Page label */}
              <PageLabel side="left" text="your drawing" />
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
            <div className="flex flex-col gap-4 p-5 h-full">

              {/* Audio player */}
              <AudioPlayer
                audioBlob={session.audioBlob}
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
            </div>
          </div>

        </div>
      </div>

      {/* ── Floating Draw button (reading mode) ──────────────────────────── */}
      {!showDrawing && (
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
      {showDrawing && hasStory && (
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
