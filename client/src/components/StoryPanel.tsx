interface Props {
  title: string | null;
  text: string | null;
  moral: string | null;
  isLoading: boolean;
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 py-2 animate-pulse">
      <div style={{ height: '22px', background: 'rgba(175,138,80,0.15)', borderRadius: '4px', width: '65%' }} />
      <div style={{ height: '1px', background: 'rgba(175,138,80,0.2)', margin: '4px 0' }} />
      <div style={{ height: '14px', background: 'rgba(175,138,80,0.1)', borderRadius: '3px' }} />
      <div style={{ height: '14px', background: 'rgba(175,138,80,0.1)', borderRadius: '3px', width: '90%' }} />
      <div style={{ height: '14px', background: 'rgba(175,138,80,0.1)', borderRadius: '3px', width: '82%' }} />
      <div style={{ height: '14px', background: 'rgba(175,138,80,0.1)', borderRadius: '3px' }} />
      <div style={{ height: '14px', background: 'rgba(175,138,80,0.1)', borderRadius: '3px', width: '75%' }} />
      <div style={{ height: '14px', background: 'rgba(175,138,80,0.1)', borderRadius: '3px', width: '88%' }} />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 text-center py-12"
      style={{ opacity: 0.7 }}
    >
      <span style={{ fontSize: '52px', filter: 'drop-shadow(0 0 8px rgba(250,204,21,0.5))', animation: 'float 3s ease-in-out infinite' }}>
        🌟
      </span>
      <div>
        <p style={{ fontFamily: '"Lora",serif', fontSize: '17px', fontWeight: 700, color: 'rgba(120,85,40,0.8)', marginBottom: '6px' }}>
          Draw something magical!
        </p>
        <p style={{ fontFamily: '"Nunito",sans-serif', fontSize: '12px', color: 'rgba(120,85,40,0.5)', maxWidth: '200px', lineHeight: 1.6 }}>
          Pick up a brush, create your world, then tap <strong>Generate Story</strong>.
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function StoryPanel({ title, text, moral, isLoading }: Props) {
  if (isLoading) return <Skeleton />;
  if (!text)     return <EmptyState />;

  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);

  return (
    <div className="flex flex-col gap-0">

      {/* Chapter title */}
      {title && (
        <div className="mb-4">
          <h2
            style={{
              fontFamily: '"Lora", serif',
              fontSize: '18px',
              fontWeight: 700,
              color: '#4a2c0a',
              lineHeight: 1.25,
              letterSpacing: '-0.2px',
            }}
          >
            {title}
          </h2>
          {/* Ornamental rule */}
          <div className="flex items-center gap-2 mt-2">
            <div style={{ flex:1, height:'1px', background:'linear-gradient(90deg, transparent, rgba(175,138,80,0.4))' }} />
            <span style={{ fontSize:'10px', color:'rgba(175,138,80,0.55)' }}>✦</span>
            <div style={{ flex:1, height:'1px', background:'linear-gradient(90deg, rgba(175,138,80,0.4), transparent)' }} />
          </div>
        </div>
      )}

      {/* Story body — first paragraph gets the drop-cap via CSS class */}
      <div className="story-body">
        {paragraphs.map((para, i) => (
          <p
            key={i}
            style={{
              fontFamily: '"Lora", serif',
              fontSize: '14px',
              lineHeight: 1.85,
              color: '#3d2008',
              marginBottom: i < paragraphs.length - 1 ? '14px' : 0,
              textAlign: 'justify',
            }}
          >
            {para}
          </p>
        ))}
      </div>

      {/* Moral */}
      {moral && (
        <div
          className="mt-5 pt-4"
          style={{ borderTop: '1px solid rgba(175,138,80,0.2)' }}
        >
          <div className="flex items-start gap-2">
            <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>💛</span>
            <p
              style={{
                fontFamily: '"Lora", serif',
                fontSize: '12.5px',
                fontStyle: 'italic',
                color: 'rgba(100,65,15,0.75)',
                lineHeight: 1.65,
              }}
            >
              <strong style={{ fontStyle:'normal' }}>Moral: </strong>
              {moral}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
