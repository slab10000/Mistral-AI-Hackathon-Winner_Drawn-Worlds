import type { Dispatch, SetStateAction } from 'react';

interface Props {
  brushColor: string;
  setBrushColor: Dispatch<SetStateAction<string>>;
  brushSize: number;
  setBrushSize: Dispatch<SetStateAction<number>>;
  isEraser: boolean;
  setIsEraser: Dispatch<SetStateAction<boolean>>;
  onUndo: () => void;
  onClear: () => void;
}

const PALETTE = [
  '#111827', // near-black
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#A16207', // brown
  '#6B7280', // gray
  '#FFFFFF', // white
];

export default function ToolBar({
  brushColor,
  setBrushColor,
  brushSize,
  setBrushSize,
  isEraser,
  setIsEraser,
  onUndo,
  onClear,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white/90 backdrop-blur-sm rounded-2xl shadow-md border border-purple-100">
      {/* Color Palette */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Color palette">
        {PALETTE.map((color) => (
          <button
            key={color}
            aria-label={`Color ${color}`}
            onClick={() => {
              setBrushColor(color);
              setIsEraser(false);
            }}
            className={`w-7 h-7 rounded-full transition-all duration-150 hover:scale-110 shadow-sm ${
              brushColor === color && !isEraser
                ? 'ring-2 ring-offset-2 ring-purple-500 scale-115'
                : ''
            }`}
            style={{
              backgroundColor: color,
              border: color === '#FFFFFF' ? '1.5px solid #d1d5db' : 'none',
            }}
          />
        ))}

        {/* Custom color picker */}
        <label
          className="relative w-7 h-7 rounded-full overflow-hidden cursor-pointer hover:scale-110 transition-all shadow-sm border border-gray-200 flex items-center justify-center bg-gradient-to-br from-pink-200 via-purple-200 to-blue-200"
          title="Custom colour"
        >
          <span className="text-xs pointer-events-none select-none">🎨</span>
          <input
            type="color"
            value={brushColor}
            onChange={(e) => {
              setBrushColor(e.target.value);
              setIsEraser(false);
            }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            aria-label="Custom color picker"
          />
        </label>
      </div>

      <div className="h-8 w-px bg-gray-200 hidden sm:block" />

      {/* Brush size */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 whitespace-nowrap select-none">
          Size
        </span>
        <input
          type="range"
          min={2}
          max={40}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-20 accent-purple-500"
          aria-label="Brush size"
        />
        {/* Live preview dot */}
        <div
          className="rounded-full bg-gray-800 flex-shrink-0 transition-all"
          style={{
            width: Math.max(4, brushSize * 0.6),
            height: Math.max(4, brushSize * 0.6),
          }}
        />
      </div>

      <div className="h-8 w-px bg-gray-200 hidden sm:block" />

      {/* Tool toggles */}
      <div className="flex gap-2">
        <button
          onClick={() => setIsEraser(false)}
          aria-pressed={!isEraser}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
            !isEraser
              ? 'bg-purple-500 text-white shadow-md shadow-purple-200'
              : 'bg-gray-100 text-gray-600 hover:bg-purple-50'
          }`}
        >
          ✏️ Draw
        </button>
        <button
          onClick={() => setIsEraser(true)}
          aria-pressed={isEraser}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
            isEraser
              ? 'bg-pink-500 text-white shadow-md shadow-pink-200'
              : 'bg-gray-100 text-gray-600 hover:bg-pink-50'
          }`}
        >
          🧹 Erase
        </button>
      </div>

      <div className="h-8 w-px bg-gray-200 hidden sm:block" />

      {/* History controls */}
      <div className="flex gap-2">
        <button
          onClick={onUndo}
          className="px-3 py-1.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all"
          aria-label="Undo last stroke"
        >
          ↩ Undo
        </button>
        <button
          onClick={onClear}
          className="px-3 py-1.5 rounded-xl text-sm font-semibold bg-red-50 text-red-500 hover:bg-red-100 active:scale-95 transition-all"
          aria-label="Clear canvas"
        >
          🗑 Clear
        </button>
      </div>
    </div>
  );
}
