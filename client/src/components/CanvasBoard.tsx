import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

// ---------------------------------------------------------------------------
// Public handle — used by parent to extract drawing data or control the canvas
// ---------------------------------------------------------------------------

export interface CanvasBoardHandle {
  getDataURL: () => string;
  clear: () => void;
  undo: () => void;
  isEmpty: () => boolean;
}

interface Props {
  brushColor: string;
  brushSize: number;
  isEraser: boolean;
  disabled?: boolean;
}

// Internal drawing canvas resolution (independent of CSS display size)
const CANVAS_W = 700;
const CANVAS_H = 480;
const MAX_HISTORY = 40;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CanvasBoard = forwardRef<CanvasBoardHandle, Props>(
  ({ brushColor, brushSize, isEraser, disabled = false }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const lastPos = useRef<{ x: number; y: number } | null>(null);
    const history = useRef<ImageData[]>([]);

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    const getCtx = useCallback((): CanvasRenderingContext2D | null => {
      // willReadFrequently: true — avoids repeated GPU readback warnings
      // from getImageData calls in isEmpty() and saveSnapshot()
      return canvasRef.current?.getContext('2d', { willReadFrequently: true }) ?? null;
    }, []);

    const fillWhite = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, [getCtx]);

    // Initialize white background
    useEffect(() => {
      fillWhite();
    }, [fillWhite]);

    // -------------------------------------------------------------------------
    // Coordinate mapping (CSS px → canvas px)
    // -------------------------------------------------------------------------

    const getPos = useCallback(
      (e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        if (window.TouchEvent && e instanceof TouchEvent) {
          const touch = e.touches[0] ?? e.changedTouches[0];
          if (!touch) return null;
          return {
            x: (touch.clientX - rect.left) * scaleX,
            y: (touch.clientY - rect.top) * scaleY,
          };
        }

        const me = e as MouseEvent;
        return {
          x: (me.clientX - rect.left) * scaleX,
          y: (me.clientY - rect.top) * scaleY,
        };
      },
      [],
    );

    // -------------------------------------------------------------------------
    // Draw event handlers
    // -------------------------------------------------------------------------

    const saveSnapshot = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      if (history.current.length >= MAX_HISTORY) history.current.shift();
      history.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    }, [getCtx]);

    const startDraw = useCallback(
      (e: MouseEvent | TouchEvent) => {
        if (disabled) return;
        e.preventDefault();
        const pos = getPos(e);
        if (!pos) return;
        saveSnapshot();
        isDrawing.current = true;
        lastPos.current = pos;
      },
      [disabled, getPos, saveSnapshot],
    );

    const draw = useCallback(
      (e: MouseEvent | TouchEvent) => {
        if (disabled) return;
        e.preventDefault();
        if (!isDrawing.current || !lastPos.current) return;
        const pos = getPos(e);
        if (!pos) return;

        const ctx = getCtx();
        if (!ctx) return;

        ctx.beginPath();
        ctx.moveTo(lastPos.current.x, lastPos.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = isEraser ? '#FFFFFF' : brushColor;
        ctx.lineWidth = isEraser ? brushSize * 2.5 : brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over';
        ctx.stroke();

        lastPos.current = pos;
      },
      [disabled, getPos, getCtx, brushColor, brushSize, isEraser],
    );

    const stopDraw = useCallback(() => {
      isDrawing.current = false;
      lastPos.current = null;
    }, []);

    // -------------------------------------------------------------------------
    // Attach / detach native listeners
    // -------------------------------------------------------------------------

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.addEventListener('mousedown', startDraw);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDraw);
      canvas.addEventListener('mouseleave', stopDraw);
      canvas.addEventListener('touchstart', startDraw, { passive: false });
      canvas.addEventListener('touchmove', draw, { passive: false });
      canvas.addEventListener('touchend', stopDraw);

      return () => {
        canvas.removeEventListener('mousedown', startDraw);
        canvas.removeEventListener('mousemove', draw);
        canvas.removeEventListener('mouseup', stopDraw);
        canvas.removeEventListener('mouseleave', stopDraw);
        canvas.removeEventListener('touchstart', startDraw);
        canvas.removeEventListener('touchmove', draw);
        canvas.removeEventListener('touchend', stopDraw);
      };
    }, [startDraw, draw, stopDraw]);

    // -------------------------------------------------------------------------
    // Imperative handle exposed to parent
    // -------------------------------------------------------------------------

    useImperativeHandle(
      ref,
      () => ({
        getDataURL: () => {
          const canvas = canvasRef.current;
          if (!canvas) return '';
          // Composite onto a white offscreen canvas to guarantee no transparency
          const off = document.createElement('canvas');
          off.width = canvas.width;
          off.height = canvas.height;
          const octx = off.getContext('2d')!;
          octx.fillStyle = '#FFFFFF';
          octx.fillRect(0, 0, off.width, off.height);
          octx.drawImage(canvas, 0, 0);
          return off.toDataURL('image/png');
        },
        clear: () => {
          history.current = [];
          fillWhite();
        },
        undo: () => {
          const canvas = canvasRef.current;
          const ctx = getCtx();
          if (!canvas || !ctx || history.current.length === 0) return;
          ctx.putImageData(history.current.pop()!, 0, 0);
        },
        isEmpty: () => {
          const canvas = canvasRef.current;
          const ctx = getCtx();
          if (!canvas || !ctx) return true;
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          // Canvas is empty if all pixels are white (255,255,255,255)
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) return false;
          }
          return true;
        },
      }),
      [fillWhite, getCtx],
    );

    return (
      <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-purple-200 bg-white">
        {/* Decorative corner stars */}
        <span className="absolute top-2 left-2 text-purple-200 text-lg pointer-events-none select-none">✦</span>
        <span className="absolute top-2 right-2 text-pink-200 text-lg pointer-events-none select-none">✦</span>
        <span className="absolute bottom-2 left-2 text-yellow-200 text-lg pointer-events-none select-none">✦</span>
        <span className="absolute bottom-2 right-2 text-blue-200 text-lg pointer-events-none select-none">✦</span>

        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block w-full touch-none"
          style={{ cursor: disabled ? 'not-allowed' : isEraser ? 'cell' : 'crosshair' }}
        />
      </div>
    );
  },
);

CanvasBoard.displayName = 'CanvasBoard';
export default CanvasBoard;
