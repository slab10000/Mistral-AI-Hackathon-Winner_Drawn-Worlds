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
    <div
      className="overflow-hidden"
      style={{
        borderRadius: '6px',
        border: '1px solid rgba(175,138,80,0.2)',
      }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-left transition-colors"
        style={{
          padding: '8px 12px',
          background: open ? 'rgba(175,138,80,0.1)' : 'rgba(175,138,80,0.05)',
          borderBottom: open ? '1px solid rgba(175,138,80,0.15)' : 'none',
        }}
        aria-expanded={open}
      >
        <span
          style={{
            fontFamily: '"Nunito",sans-serif',
            fontSize: '11px',
            fontWeight: 700,
            color: 'rgba(100,65,15,0.7)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {icon} {title}
        </span>
        <span style={{ fontSize: '9px', color: 'rgba(175,138,80,0.6)', fontFamily: 'monospace' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div
          className="overflow-y-auto"
          style={{ maxHeight: '200px', background: 'rgba(253,248,239,0.6)', padding: '10px 12px' }}
        >
          <pre
            style={{
              fontSize: '10px',
              color: 'rgba(80,50,10,0.7)',
              fontFamily: '"Courier New", monospace',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
