import { useState } from 'react';

interface Props {
  title: string;
  data: unknown;
  icon?: string;
  defaultOpen?: boolean;
}

export default function JsonPanel({
  title,
  data,
  icon = '📋',
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  if (data === null || data === undefined) return null;

  return (
    <div className="rounded-2xl border border-purple-100 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-purple-50 to-indigo-50 hover:from-purple-100 hover:to-indigo-100 transition-colors text-left"
        aria-expanded={open}
      >
        <span className="font-bold text-purple-800 text-sm flex items-center gap-2">
          {icon} {title}
        </span>
        <span className="text-purple-400 text-xs font-mono">{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {open && (
        <div className="p-3 bg-gray-50 max-h-60 overflow-y-auto">
          <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
