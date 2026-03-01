import { useRef } from 'react';
import CanvasBoard, { type CanvasBoardHandle } from './CanvasBoard';

interface Props {
  prompt: string;           // shown to the child
  onSubmit: (dataUrl: string) => void;
  onSkip: () => void;
  busy: boolean;
}

/**
 * Full-page drawing prompt shown during an "ask_user_to_draw" interaction.
 * The child draws, then taps "Done" to submit.
 */
export default function DrawPrompt({ prompt, onSubmit, onSkip, busy }: Props) {
  const canvasRef = useRef<CanvasBoardHandle>(null);

  const handleDone = () => {
    const dataUrl = canvasRef.current?.getDataURL();
    if (!dataUrl || canvasRef.current?.isEmpty()) {
      // Allow submitting a blank canvas (agent will handle it gracefully)
    }
    onSubmit(dataUrl ?? '');
  };

  return (
    <div
      className="absolute inset-0 flex flex-col z-10"
      style={{ background: '#fdf8ef' }}
    >
      {/* Prompt text */}
      <div
        className="flex-shrink-0 px-5 pt-5 pb-3 text-center"
        style={{
          borderBottom: '1px solid rgba(175,138,80,0.2)',
        }}
      >
        <p style={{ fontSize: '11px', fontFamily: '"Nunito",sans-serif', fontWeight: 700, color: 'rgba(120,80,30,0.55)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          ✏️ Your turn!
        </p>
        <p style={{ fontFamily: '"Lora",serif', fontSize: '17px', fontWeight: 700, color: '#5b3712', lineHeight: 1.4 }}>
          {prompt}
        </p>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 p-3">
        <CanvasBoard
          ref={canvasRef}
          brushColor="#3B82F6"
          brushSize={8}
          isEraser={false}
          disabled={busy}
        />
      </div>

      {/* Action buttons */}
      <div className="flex-shrink-0 flex gap-2 px-4 pb-4">
        <button
          onClick={onSkip}
          disabled={busy}
          style={{
            fontFamily: '"Nunito",sans-serif',
            fontSize: '12px',
            fontWeight: 700,
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid rgba(175,138,80,0.3)',
            background: 'transparent',
            color: 'rgba(100,65,15,0.55)',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          Skip
        </button>
        <button
          onClick={handleDone}
          disabled={busy}
          style={{
            flex: 1,
            fontFamily: '"Nunito",sans-serif',
            fontSize: '14px',
            fontWeight: 900,
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: busy
              ? 'rgba(0,0,0,0.08)'
              : 'linear-gradient(135deg, #7c3aed, #db2777)',
            color: busy ? '#aaa' : '#fff',
            boxShadow: busy ? 'none' : '0 4px 15px rgba(124,58,237,0.4)',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? '🔍 Reading…' : '✅ Done drawing!'}
        </button>
      </div>
    </div>
  );
}
