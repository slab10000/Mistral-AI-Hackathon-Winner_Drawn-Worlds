import { useState } from 'react';

interface Props {
  onOpen: () => void;
}

// Deterministic star field — seeded so it's stable across renders
const STARS = Array.from({ length: 140 }, (_, i) => ({
  x: ((i * 1973 + 7) % 1000) / 10,
  y: ((i * 3571 + 13) % 1000) / 10,
  r: 0.4 + ((i * 1231) % 3) * 0.45,
  delay: ((i * 997) % 40) / 10,
  opacity: 0.15 + ((i * 491) % 7) / 14,
}));

// Larger sparkle glyphs
const SPARKLES = [
  { x: 7,  y: 11, s: 11, d: 0.0  },
  { x: 88, y: 7,  s: 8,  d: 0.7  },
  { x: 14, y: 76, s: 13, d: 1.2  },
  { x: 77, y: 83, s: 9,  d: 1.8  },
  { x: 49, y: 5,  s: 7,  d: 1.0  },
  { x: 4,  y: 49, s: 10, d: 2.3  },
  { x: 93, y: 53, s: 8,  d: 0.5  },
  { x: 37, y: 91, s: 11, d: 1.5  },
  { x: 63, y: 17, s: 6,  d: 2.8  },
  { x: 83, y: 41, s: 8,  d: 2.0  },
  { x: 22, y: 33, s: 9,  d: 0.3  },
  { x: 56, y: 68, s: 7,  d: 3.2  },
];

export default function BookCover({ onOpen }: Props) {
  const [opening, setOpening] = useState(false);

  const handleClick = () => {
    if (opening) return;
    const audio = new Audio('/magical_explosion.mp3');
    audio.play().catch(() => {});
    setOpening(true);
    setTimeout(onOpen, 800);
  };

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden cursor-pointer select-none"
      style={{
        background:
          'radial-gradient(ellipse 90% 80% at 50% 38%, #1e0a3c 0%, #0d0420 52%, #03010a 100%)',
      }}
      onClick={handleClick}
    >
      {/* ─── Tiny star field ─────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {STARS.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${s.r * 2}px`,
              height: `${s.r * 2}px`,
              opacity: s.opacity,
              animation: `starTwinkle 3.5s ${s.delay}s ease-in-out infinite`,
            }}
          />
        ))}
        {SPARKLES.map((s, i) => (
          <span
            key={i}
            className="absolute leading-none"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              fontSize: `${s.s}px`,
              color: '#fde68a',
              opacity: 0.55,
              animation: `starTwinkle 2.8s ${s.d}s ease-in-out infinite`,
            }}
          >
            ✦
          </span>
        ))}
      </div>

      {/* ─── Ambient glow behind the book ──────────────────── */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '560px',
          height: '360px',
          background:
            'radial-gradient(ellipse, rgba(109,40,217,0.22) 0%, transparent 70%)',
          filter: 'blur(56px)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-52%)',
        }}
      />

      {/* ─── The Book ───────────────────────────────────────── */}
      <div
        className={opening ? 'book-opening' : 'book-wobble'}
        style={{ filter: 'drop-shadow(0 40px 60px rgba(0,0,0,0.9))' }}
      >
        <div style={{ position: 'relative', width: '264px', height: '376px' }}>

          {/* Spine shadow left edge */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '22px',
              borderRadius: '3px 0 0 3px',
              background:
                'linear-gradient(90deg, #0d0020 0%, #2a0860 55%, #4c1d95 100%)',
              boxShadow: '-8px 0 20px rgba(0,0,0,0.9)',
            }}
          />

          {/* Page-stack peek */}
          <div
            style={{
              position: 'absolute',
              left: '22px',
              right: '-6px',
              top: '4px',
              bottom: '4px',
              background:
                'linear-gradient(90deg, #b8a88a 0%, #d4c4a0 25%, #e8dcc8 60%, #f5efe0 100%)',
              borderRadius: '0 3px 3px 0',
            }}
          />

          {/* Front cover */}
          <div
            style={{
              position: 'absolute',
              left: '22px',
              top: 0,
              right: 0,
              bottom: 0,
              borderRadius: '0 10px 10px 0',
              overflow: 'hidden',
              boxShadow:
                '10px 14px 50px rgba(0,0,0,0.85), 2px 2px 10px rgba(0,0,0,0.6)',
            }}
          >
            {/* ── CSS cover design (fallback + base layer) ── */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center text-center"
              style={{
                background:
                  'linear-gradient(158deg, #3b0764 0%, #1e1b4b 38%, #0f0a2e 72%, #05031a 100%)',
                padding: '22px 18px',
              }}
            >
              {/* Outer gold frame */}
              <div
                className="absolute pointer-events-none"
                style={{
                  inset: '8px',
                  border: '1px solid rgba(253,230,138,0.32)',
                  borderRadius: '5px',
                }}
              />
              <div
                className="absolute pointer-events-none"
                style={{
                  inset: '14px',
                  border: '1px solid rgba(253,230,138,0.13)',
                  borderRadius: '2px',
                }}
              />

              <div
                style={{
                  fontSize: '10px',
                  letterSpacing: '7px',
                  color: 'rgba(253,230,138,0.38)',
                  marginBottom: '14px',
                }}
              >
                ✦ ✦ ✦
              </div>

              {/* Hero star */}
              <div
                style={{
                  fontSize: '76px',
                  lineHeight: 1,
                  marginBottom: '14px',
                  filter:
                    'drop-shadow(0 0 22px rgba(250,204,21,0.9)) drop-shadow(0 0 50px rgba(250,204,21,0.4))',
                  animation: 'coverStarPulse 3s ease-in-out infinite',
                }}
              >
                ✨
              </div>

              <h1
                style={{
                  fontFamily: '"Lora", serif',
                  fontSize: '38px',
                  fontWeight: 900,
                  lineHeight: 1.1,
                  color: '#fde68a',
                  textShadow:
                    '0 0 32px rgba(253,230,138,0.55), 0 2px 8px rgba(0,0,0,0.95)',
                }}
              >
                Drawn
                <br />
                Worlds
              </h1>

              <div
                style={{
                  width: '72px',
                  height: '1px',
                  background:
                    'linear-gradient(90deg, transparent, rgba(253,230,138,0.65), transparent)',
                  margin: '13px auto',
                }}
              />

              <p
                style={{
                  fontFamily: '"Nunito", sans-serif',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'rgba(196,181,253,0.85)',
                  letterSpacing: '0.4px',
                }}
              >
                Draw it · Dream it
                <br />
                Hear it
              </p>

              <div
                style={{
                  fontSize: '9px',
                  letterSpacing: '9px',
                  color: 'rgba(253,230,138,0.28)',
                  marginTop: '16px',
                }}
              >
                ⋆ ⋆ ⋆
              </div>
            </div>

            {/* User's cover image — overlays CSS design when it loads */}
            <img
              src="/book-cover.png"
              alt="Drawn Worlds"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ zIndex: 2 }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        </div>
      </div>

      {/* ─── "tap to open" hint ─────────────────────────────── */}
      <p
        className="mt-10"
        style={{
          fontFamily: '"Nunito", sans-serif',
          fontSize: '11px',
          fontWeight: 700,
          color: 'rgba(196,181,253,0.7)',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          animation: 'gentlePulse 2.8s ease-in-out infinite',
        }}
      >
        ✦ tap anywhere to open ✦
      </p>
    </div>
  );
}
