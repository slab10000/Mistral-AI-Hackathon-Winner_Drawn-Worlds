import { useEffect, useRef } from 'react';
import type { StoryEvent, StoryPhase, ParagraphEvent } from '../lib/agentTypes';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  events: StoryEvent[];
  activeEventIdx: number | null;
  phase: StoryPhase;
  errorMsg?: string | null;
}

// ---------------------------------------------------------------------------
// Phase metadata
// ---------------------------------------------------------------------------

const PHASE_INFO: Record<StoryPhase, { label: string; color: string; spin?: boolean } | null> = {
  idle:         null,
  world:        { label: '🔍 Analyzing your drawing…', color: 'rgba(139,92,246,0.12)', spin: true },
  agent:        { label: '✨ Writing the story…',       color: 'rgba(139,92,246,0.12)', spin: true },
  audio_gen:    { label: '🎵 Preparing audio…',         color: 'rgba(59,130,246,0.12)',  spin: true },
  playing:      { label: '🔊 Narrating…',               color: 'rgba(34,197,94,0.1)'                },
  draw_prompt:  { label: '✏️ Drawing something…',       color: 'rgba(251,191,36,0.12)'              },
  speak_prompt: { label: '🎙️ Saying a word…',           color: 'rgba(251,191,36,0.12)'              },
  done:         { label: '🌟 The End',                  color: 'rgba(250,204,21,0.1)'               },
  error:        { label: '❌ Something went wrong',     color: 'rgba(239,68,68,0.1)'                },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StoryTimeline({ events, activeEventIdx, phase, errorMsg }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as events arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length, activeEventIdx]);

  const phaseInfo = PHASE_INFO[phase];
  const isProcessing = phase === 'world' || phase === 'agent' || phase === 'audio_gen';

  // ── Empty state ───────────────────────────────────────────────────────────
  if (events.length === 0 && !isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p style={{ fontSize: '52px', marginBottom: '14px' }}>📖</p>
        <p
          style={{
            fontFamily: '"Lora", serif',
            fontStyle: 'italic',
            fontSize: '15px',
            color: 'rgba(120,80,30,0.45)',
            lineHeight: 1.65,
            maxWidth: '280px',
          }}
        >
          Draw your world and tap{' '}
          <strong style={{ fontStyle: 'normal', color: 'rgba(120,80,30,0.65)' }}>
            "Tell My Story!"
          </strong>{' '}
          to begin your adventure.
        </p>
      </div>
    );
  }

  // ── Main timeline ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Phase banner */}
      {phaseInfo && (
        <div
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2"
          style={{
            background: phaseInfo.color,
            borderBottom: '1px solid rgba(175,138,80,0.15)',
          }}
        >
          {phaseInfo.spin && (
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                border: '2px solid rgba(139,92,246,0.5)',
                borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              fontFamily: '"Nunito", sans-serif',
              fontSize: '12px',
              fontWeight: 700,
              color: 'rgba(90,55,18,0.75)',
            }}
          >
            {phaseInfo.label}
          </span>
        </div>
      )}

      {/* Scrollable event list */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

        {events.map((ev, idx) => {
          // ── Paragraph ──────────────────────────────────────────────────
          if (ev.type === 'paragraph') {
            const isActive = activeEventIdx === idx;
            const pEv = ev as ParagraphEvent;
            return (
              <div
                key={idx}
                style={{
                  fontFamily: '"Lora", serif',
                  fontSize: '15px',
                  lineHeight: 1.8,
                  color: '#4b3010',
                  borderLeft: isActive
                    ? '3px solid #7c3aed'
                    : '3px solid transparent',
                  paddingLeft: '12px',
                  transition: 'border-color 0.35s ease',
                  position: 'relative',
                }}
              >
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      left: '-2px',
                      top: '3px',
                      fontSize: '10px',
                      color: '#7c3aed',
                    }}
                  >
                    🔊
                  </span>
                )}
                {pEv.text}
              </div>
            );
          }

          // ── Sound effect ───────────────────────────────────────────────
          if (ev.type === 'sound_effect') {
            const isActive = activeEventIdx === idx;
            return (
              <div
                key={idx}
                style={{
                  alignSelf: 'flex-start',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: isActive
                    ? 'rgba(139,92,246,0.12)'
                    : 'rgba(175,138,80,0.09)',
                  border: `1px solid ${isActive ? 'rgba(139,92,246,0.25)' : 'rgba(175,138,80,0.2)'}`,
                  borderRadius: '999px',
                  padding: '3px 11px 3px 8px',
                  fontFamily: '"Nunito", sans-serif',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: isActive ? 'rgba(109,40,217,0.85)' : 'rgba(90,55,18,0.6)',
                  transition: 'all 0.3s',
                }}
              >
                {isActive ? '🔊' : '🎵'} {ev.description}
              </div>
            );
          }

          // ── Music ──────────────────────────────────────────────────────
          if (ev.type === 'music') {
            return (
              <div
                key={idx}
                style={{
                  alignSelf: 'flex-start',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'rgba(59,130,246,0.07)',
                  border: '1px solid rgba(59,130,246,0.18)',
                  borderRadius: '999px',
                  padding: '3px 11px 3px 8px',
                  fontFamily: '"Nunito", sans-serif',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'rgba(30,90,210,0.75)',
                }}
              >
                🎼 {ev.description}
              </div>
            );
          }

          // ── User drew ──────────────────────────────────────────────────
          if (ev.type === 'ask_user_to_draw') {
            const filled = !!ev.visionDescription;
            return (
              <div
                key={idx}
                style={{
                  background: filled ? 'rgba(34,197,94,0.07)' : 'rgba(251,191,36,0.09)',
                  border: `1px solid ${filled ? 'rgba(34,197,94,0.2)' : 'rgba(175,138,80,0.22)'}`,
                  borderRadius: '12px',
                  padding: '10px 14px',
                }}
              >
                <p
                  style={{
                    fontFamily: '"Nunito", sans-serif',
                    fontSize: '10px',
                    fontWeight: 800,
                    color: 'rgba(90,55,18,0.55)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.7px',
                    marginBottom: '4px',
                  }}
                >
                  ✏️ You drew
                </p>
                <p
                  style={{
                    fontFamily: '"Lora", serif',
                    fontSize: '13px',
                    fontStyle: 'italic',
                    color: '#5b3712',
                    marginBottom: ev.visionDescription ? '6px' : 0,
                  }}
                >
                  {ev.prompt}
                </p>
                {ev.visionDescription && (
                  <p
                    style={{
                      fontFamily: '"Nunito", sans-serif',
                      fontSize: '12px',
                      color: 'rgba(90,55,18,0.72)',
                      lineHeight: 1.5,
                    }}
                  >
                    → {ev.visionDescription}
                  </p>
                )}
              </div>
            );
          }

          // ── User spoke ─────────────────────────────────────────────────
          if (ev.type === 'ask_user_to_speak') {
            const filled = !!ev.word;
            return (
              <div
                key={idx}
                style={{
                  background: filled ? 'rgba(34,197,94,0.07)' : 'rgba(251,191,36,0.09)',
                  border: `1px solid ${filled ? 'rgba(34,197,94,0.2)' : 'rgba(175,138,80,0.22)'}`,
                  borderRadius: '12px',
                  padding: '10px 14px',
                }}
              >
                <p
                  style={{
                    fontFamily: '"Nunito", sans-serif',
                    fontSize: '10px',
                    fontWeight: 800,
                    color: 'rgba(90,55,18,0.55)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.7px',
                    marginBottom: '4px',
                  }}
                >
                  🎙️ You said
                </p>
                <p
                  style={{
                    fontFamily: '"Lora", serif',
                    fontSize: '14px',
                    fontStyle: 'italic',
                    color: '#5b3712',
                    fontWeight: 700,
                  }}
                >
                  "{ev.word ?? '…'}"
                </p>
              </div>
            );
          }

          // ── Finish ─────────────────────────────────────────────────────
          if (ev.type === 'finish') {
            return (
              <div
                key={idx}
                style={{
                  textAlign: 'center',
                  padding: '24px 0 8px',
                  fontFamily: '"Lora", serif',
                  fontSize: '18px',
                  fontStyle: 'italic',
                  color: 'rgba(120,80,30,0.55)',
                  letterSpacing: '0.5px',
                }}
              >
                ✨ The End ✨
              </div>
            );
          }

          return null;
        })}

        {/* Loading dots (agent / audio_gen / world) */}
        {isProcessing && (
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', paddingTop: '4px' }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'rgba(139,92,246,0.45)',
                  animation: `tlBounce 1s ease-in-out ${i * 0.17}s infinite`,
                }}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div
            style={{
              fontFamily: '"Nunito", sans-serif',
              fontSize: '13px',
              color: '#991b1b',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              padding: '10px 14px',
              borderRadius: '10px',
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Anchor for auto-scroll */}
        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes tlBounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50%       { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
