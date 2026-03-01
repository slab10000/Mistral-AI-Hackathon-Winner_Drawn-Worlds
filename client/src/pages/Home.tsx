import { useCallback, useEffect, useRef, useState } from 'react';
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

const IDLE_PIPELINE: PipelineStatus = {
  vision: 'idle',
  outline: 'idle',
  story: 'idle',
  audio: 'idle',
};

const STEP_META: { key: keyof PipelineStatus; label: string; icon: string; desc: string }[] = [
  { key: 'vision', label: 'Analyzing', icon: '🔍', desc: 'Reading your drawing' },
  { key: 'outline', label: 'Planning', icon: '📝', desc: 'Crafting the plot' },
  { key: 'story', label: 'Writing', icon: '📖', desc: 'Weaving the tale' },
  { key: 'audio', label: 'Narrating', icon: '🎙️', desc: 'Recording voice' },
];

const AGE_GROUPS = [
  { value: 'young children (ages 3–5)', label: '3–5 yrs' },
  { value: 'children (ages 6–8)', label: '6–8 yrs' },
  { value: 'older children (ages 9–12)', label: '9–12 yrs' },
];

const LS_KEY = 'drawnWorlds_session_v1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEnv(key: string): string {
  const val = (import.meta.env as Record<string, string | undefined>)[key];
  if (!val) throw new Error(`Missing environment variable: ${key}. Check your .env file.`);
  return val;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Home() {
  // Drawing tools
  const canvasRef = useRef<CanvasBoardHandle>(null);
  const [brushColor, setBrushColor] = useState('#3B82F6');
  const [brushSize, setBrushSize] = useState(8);
  const [isEraser, setIsEraser] = useState(false);

  // Pipeline state
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>(IDLE_PIPELINE);
  const [errors, setErrors] = useState<Partial<Record<keyof PipelineStatus, string>>>({});
  const [isRunning, setIsRunning] = useState(false);

  // Session / story state
  const [session, setSession] = useState<SessionState>({
    worldModel: null,
    outline: null,
    story: null,
    audioBlob: null,
  });

  // Settings
  const [ageGroup, setAgeGroup] = useState(AGE_GROUPS[1].value);
  const [autoNarrate, setAutoNarrate] = useState(true);

  // -------------------------------------------------------------------------
  // Persist session to localStorage (minus audioBlob which is binary)
  // -------------------------------------------------------------------------

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SessionState>;
        setSession((prev) => ({
          ...prev,
          worldModel: parsed.worldModel ?? null,
          outline: parsed.outline ?? null,
          story: parsed.story ?? null,
        }));
      }
    } catch {
      // Ignore corrupt storage
    }
  }, []);

  useEffect(() => {
    if (!session.worldModel) return;
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          worldModel: session.worldModel,
          outline: session.outline,
          story: session.story,
        }),
      );
    } catch {
      // Ignore quota errors
    }
  }, [session.worldModel, session.outline, session.story]);

  // -------------------------------------------------------------------------
  // Pipeline helpers
  // -------------------------------------------------------------------------

  const setStep = useCallback(
    (step: keyof PipelineStatus, status: StepStatus, err?: string) => {
      setPipelineStatus((prev) => ({ ...prev, [step]: status }));
      if (err) {
        setErrors((prev) => ({ ...prev, [step]: err }));
      } else {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[step];
          return next;
        });
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Narration helper (shared between auto-narrate and manual click)
  // -------------------------------------------------------------------------

  const narrate = useCallback(
    async (storyText: string) => {
      const elKey = getEnv('VITE_ELEVENLABS_API_KEY');
      const voiceId = getEnv('VITE_ELEVENLABS_VOICE_ID');
      setStep('audio', 'loading');
      try {
        const blob = await generateSpeech(storyText, voiceId, elKey);
        setStep('audio', 'done');
        setSession((prev) => ({ ...prev, audioBlob: blob }));
      } catch (e) {
        setStep('audio', 'error', e instanceof Error ? e.message : 'Audio generation failed');
      }
    },
    [setStep],
  );

  // -------------------------------------------------------------------------
  // Full pipeline — Generate Story
  // -------------------------------------------------------------------------

  const runFullPipeline = useCallback(async () => {
    if (isRunning) return;

    const dataUrl = canvasRef.current?.getDataURL();
    if (!dataUrl || canvasRef.current?.isEmpty()) {
      alert('Please draw something on the canvas first! 🎨');
      return;
    }

    let mistralKey: string;
    try {
      mistralKey = getEnv('VITE_MISTRAL_API_KEY');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Missing API key');
      return;
    }

    setIsRunning(true);
    setPipelineStatus(IDLE_PIPELINE);
    setErrors({});
    setSession({ worldModel: null, outline: null, story: null, audioBlob: null });
    localStorage.removeItem(LS_KEY);

    try {
      // Step 3: Vision → World Model
      setStep('vision', 'loading');
      let worldModel: WorldModel;
      try {
        worldModel = await visionToWorld(dataUrl, mistralKey, () =>
          setStep('vision', 'retrying'),
        );
        setStep('vision', 'done');
        setSession((prev) => ({ ...prev, worldModel }));
      } catch (e) {
        setStep('vision', 'error', e instanceof Error ? e.message : 'Vision analysis failed');
        return;
      }

      // Step 4: World Model → Outline
      setStep('outline', 'loading');
      let outline: Outline;
      try {
        outline = await worldToOutline(worldModel, mistralKey, () =>
          setStep('outline', 'retrying'),
        );
        setStep('outline', 'done');
        setSession((prev) => ({ ...prev, outline }));
      } catch (e) {
        setStep('outline', 'error', e instanceof Error ? e.message : 'Outline planning failed');
        return;
      }

      // Step 5: Outline → Story
      setStep('story', 'loading');
      let story: Story;
      try {
        story = await outlineToStory(worldModel, outline, ageGroup, mistralKey, () =>
          setStep('story', 'retrying'),
        );
        setStep('story', 'done');
        setSession((prev) => ({ ...prev, story }));
      } catch (e) {
        setStep('story', 'error', e instanceof Error ? e.message : 'Story generation failed');
        return;
      }

      // Step 6: ElevenLabs narration (auto if enabled)
      if (autoNarrate) {
        await narrate(story.storyText);
      }
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, ageGroup, autoNarrate, narrate, setStep]);

  // -------------------------------------------------------------------------
  // Continue Story pipeline (Step 7)
  // -------------------------------------------------------------------------

  const runContinue = useCallback(async () => {
    if (isRunning || !session.worldModel || !session.outline || !session.story) return;

    let mistralKey: string;
    try {
      mistralKey = getEnv('VITE_MISTRAL_API_KEY');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Missing API key');
      return;
    }

    setIsRunning(true);
    setStep('story', 'loading');
    setErrors({});

    try {
      const continuation = await continueStory(
        session.worldModel,
        session.outline.motifs,
        session.story.storyText,
        mistralKey,
        () => setStep('story', 'retrying'),
      );
      setStep('story', 'done');
      // Merge: append text, update title & moral
      const merged: Story = {
        storyTitle: continuation.storyTitle,
        storyText: session.story.storyText + '\n\n' + continuation.storyText,
        moral: continuation.moral,
      };
      setSession((prev) => ({ ...prev, story: merged, audioBlob: null }));

      if (autoNarrate) {
        await narrate(merged.storyText);
      }
    } catch (e) {
      setStep('story', 'error', e instanceof Error ? e.message : 'Continuation failed');
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, session, autoNarrate, narrate, setStep]);

  // -------------------------------------------------------------------------
  // Manual narrate click
  // -------------------------------------------------------------------------

  const handleNarrateClick = useCallback(() => {
    if (session.audioBlob) return; // AudioPlayer will handle play/pause
    if (!session.story) return;
    narrate(session.story.storyText).catch(() => null);
  }, [session.audioBlob, session.story, narrate]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const isAnyRunning = isRunning;
  const hasStory = !!session.story;
  const canContinue = hasStory && !!session.worldModel && !!session.outline;
  const pipelineActive = Object.values(pipelineStatus).some(
    (s) => s !== 'idle',
  );

  const handleClear = () => {
    canvasRef.current?.clear();
    setSession({ worldModel: null, outline: null, story: null, audioBlob: null });
    setPipelineStatus(IDLE_PIPELINE);
    setErrors({});
    localStorage.removeItem(LS_KEY);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100">

      {/* ===== Header ===== */}
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-md border-b border-purple-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <span className="text-4xl animate-float select-none">✨</span>
            <div>
              <h1 className="text-2xl font-black bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 bg-clip-text text-transparent leading-none">
                Drawn Worlds
              </h1>
              <p className="text-xs text-gray-400 font-medium">
                Draw it · Dream it · Hear it
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Age group */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Age:</span>
              <div className="flex gap-1">
                {AGE_GROUPS.map((ag) => (
                  <button
                    key={ag.value}
                    onClick={() => setAgeGroup(ag.value)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                      ageGroup === ag.value
                        ? 'bg-purple-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-purple-50'
                    }`}
                  >
                    {ag.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-narrate toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoNarrate}
                onChange={(e) => setAutoNarrate(e.target.checked)}
                className="w-4 h-4 accent-purple-500 rounded"
              />
              <span className="text-xs font-semibold text-gray-600">Auto-narrate</span>
            </label>
          </div>
        </div>
      </header>

      {/* ===== Main Layout ===== */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-6 items-start">

          {/* ============================
              LEFT COLUMN — Canvas area
              ============================ */}
          <div className="flex flex-col gap-4">

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
            <CanvasBoard
              ref={canvasRef}
              brushColor={brushColor}
              brushSize={brushSize}
              isEraser={isEraser}
            />

            {/* Action buttons */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={runFullPipeline}
                disabled={isAnyRunning}
                className={`flex-1 min-w-[160px] py-3.5 px-6 rounded-2xl font-black text-base shadow-lg transition-all ${
                  isAnyRunning
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 active:scale-95 shadow-purple-200'
                }`}
              >
                {isAnyRunning && !canContinue ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">✨</span> Generating…
                  </span>
                ) : (
                  '🌟 Generate Story'
                )}
              </button>

              <button
                onClick={runContinue}
                disabled={!canContinue || isAnyRunning}
                className={`flex-1 min-w-[160px] py-3.5 px-6 rounded-2xl font-black text-base shadow-lg transition-all ${
                  canContinue && !isAnyRunning
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 active:scale-95 shadow-blue-200'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                }`}
              >
                {isAnyRunning && canContinue ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">📚</span> Continuing…
                  </span>
                ) : (
                  '📚 Continue Story'
                )}
              </button>
            </div>

            {/* ===== Pipeline Step Indicators ===== */}
            {pipelineActive && (
              <div className="grid grid-cols-4 gap-2">
                {STEP_META.map(({ key, label, icon, desc }) => {
                  const s = pipelineStatus[key];
                  const err = errors[key];
                  return (
                    <div
                      key={key}
                      className={`flex flex-col items-center gap-1 px-2 py-3 rounded-2xl text-center border transition-all text-xs ${
                        s === 'done'
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : s === 'loading'
                          ? 'bg-purple-50 border-purple-200 text-purple-700'
                          : s === 'retrying'
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : s === 'error'
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-gray-50 border-gray-100 text-gray-400'
                      }`}
                    >
                      <span
                        className={`text-xl ${s === 'loading' || s === 'retrying' ? 'animate-spin' : ''}`}
                      >
                        {s === 'done' ? '✅' : s === 'error' ? '❌' : icon}
                      </span>
                      <span className="font-bold">{label}</span>
                      {s === 'retrying' && (
                        <span className="text-amber-600 font-medium">Retrying…</span>
                      )}
                      {s === 'idle' && (
                        <span className="text-gray-400">{desc}</span>
                      )}
                      {s === 'error' && err && (
                        <span
                          className="text-red-500 break-all"
                          title={err}
                        >
                          {err.slice(0, 55)}…
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ============================
              RIGHT COLUMN — Story area
              ============================ */}
          <div className="flex flex-col gap-4">

            {/* Audio player */}
            <AudioPlayer
              audioBlob={session.audioBlob}
              isLoading={pipelineStatus.audio === 'loading'}
              onNarrateClick={handleNarrateClick}
              disabled={!hasStory}
            />

            {/* Story display */}
            <StoryPanel
              title={session.story?.storyTitle ?? null}
              text={session.story?.storyText ?? null}
              moral={session.story?.moral ?? null}
              isLoading={
                pipelineStatus.story === 'loading' ||
                pipelineStatus.story === 'retrying'
              }
            />

            {/* Collapsible JSON panels */}
            <JsonPanel
              title="World Model"
              data={session.worldModel}
              icon="🌍"
            />
            <JsonPanel
              title="Story Outline"
              data={session.outline}
              icon="📝"
            />
          </div>
        </div>
      </main>

      {/* ===== Footer ===== */}
      <footer className="text-center py-6 text-xs text-gray-400">
        ✨ Drawn Worlds — built at a hackathon with love, magic, and Mistral AI
      </footer>
    </div>
  );
}
