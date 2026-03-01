import { useEffect, useRef } from 'react';

export default function DreamyParticles() {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    if (!bgCanvas || !fgCanvas) return;
    
    // Use alpha: false to avoid unnecessary compositing overhead if possible, though we need transparency
    const bgCtx = bgCanvas.getContext('2d', { alpha: true, desynchronized: true });
    const fgCtx = fgCanvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!bgCtx || !fgCtx) return;

    let particles: Particle[] = [];
    let animationFrameId: number;
    let lastTime = performance.now();
    
    // Avoid re-reading innerWidth/innerHeight every frame
    let cw = window.innerWidth;
    let ch = window.innerHeight;
    
    let mouseX = cw / 2;
    let mouseY = ch / 2;

    const resize = () => {
      cw = window.innerWidth;
      ch = window.innerHeight;
      bgCanvas.width = cw;
      bgCanvas.height = ch;
      fgCanvas.width = cw;
      fgCanvas.height = ch;
    };
    window.addEventListener('resize', resize, { passive: true });
    resize();

    // Throttle Mouse Tracking
    let lastMouseTime = 0;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      
      // Fast path for glow div update (avoids React state overhead)
      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      }

      const now = performance.now();
      if (now - lastMouseTime > 30) { // Limit spawn rate to ~30fps
        lastMouseTime = now;
        if (Math.random() < 0.6) {
          for (let i = 0; i < 2; i++) {
            particles.push(new Particle({ startX: mouseX, startY: mouseY, type: 'trail' }));
          }
        }
      }
    };

    // Click Burst
    const handleClick = (e: MouseEvent) => {
      const cx = e.clientX;
      const cy = e.clientY;
      for (let i = 0; i < 15; i++) { // Back to 15 for bigger burst
        particles.push(new Particle({ startX: cx, startY: cy, type: 'burst' }));
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('click', handleClick, { passive: true });

    type ParticleType = 'ambient' | 'trail' | 'burst';

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      sizeDelta: number;
      life: number;
      maxLife: number;
      isForeground: boolean;

      constructor(opts: { startX?: number; startY?: number; type?: ParticleType } = {}) {
        const type = opts.type || 'ambient';
        this.isForeground = type !== 'ambient';

        if (opts.startX !== undefined && opts.startY !== undefined) {
          this.x = opts.startX + (Math.random() - 0.5) * 20;
          this.y = opts.startY + (Math.random() - 0.5) * 20;
        } else {
          this.x = Math.random() * cw;
          this.y = Math.random() * ch;
        }
        
        if (type === 'burst') {
          this.vx = (Math.random() - 0.5) * 6;
          this.vy = (Math.random() - 0.5) * 6;
          this.maxLife = 600 + Math.random() * 400; 
          this.size = Math.random() * 4 + 3;
        } else if (type === 'trail') {
          this.vx = (Math.random() - 0.5) * 1.5;
          this.vy = (Math.random() - 0.5) * 1.5 - 0.5;
          this.maxLife = 500 + Math.random() * 300; 
          this.size = Math.random() * 2 + 1.5;
        } else {
          this.vx = (Math.random() - 0.5) * 0.4;
          this.vy = (Math.random() - 0.5) * 0.4 - 0.2; 
          this.maxLife = 1000 + Math.random() * 200; 
          this.size = Math.random() * 3 + 2; 
        }

        this.sizeDelta = (Math.random() - 0.5) * 0.05; 
        this.life = this.maxLife;
      }

      update(dt: number) {
        if (this.isForeground) {
          this.vx *= 0.98;
          this.vy *= 0.98;
        }

        this.x += this.vx * (dt / 16);
        this.y += this.vy * (dt / 16);
        this.life -= dt;
        this.size += this.sizeDelta * (dt / 16);
        if (this.size < 0.1) this.size = 0.1;
      }

      draw(ctx: CanvasRenderingContext2D) {
        let opacity = 0;
        const fadeRatio = this.life / this.maxLife;
        
        if (fadeRatio > 0.8) {
          opacity = (1 - fadeRatio) * 5; 
        } else {
          opacity = fadeRatio / 0.8;
        }

        opacity *= this.isForeground ? 0.9 : 0.6;

        ctx.save();
        ctx.globalAlpha = Math.max(0, opacity);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        
        ctx.fillStyle = this.isForeground ? '#e9d5ff' : '#fde68a';
        ctx.shadowBlur = this.isForeground ? Math.max(5, this.size * 2) : Math.max(10, this.size * 3);
        ctx.shadowColor = this.isForeground ? '#d8b4fe' : '#fcd34d';
        
        ctx.fill();
        ctx.restore();
      }
    }

    const render = (time: number) => {
      const deltaTime = time - lastTime;
      lastTime = time;

      // Avoid huge delta jumps if tab is inactive
      if (deltaTime > 100) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      bgCtx.clearRect(0, 0, cw, ch);
      fgCtx.clearRect(0, 0, cw, ch);
      
      // Significantly reduced spawn count for ambient particles
      const spawnCount = Math.floor((cw * ch) / 600000); 
      for (let i = 0; i < (Math.random() < 0.3 ? spawnCount + 1 : spawnCount); i++) {
        particles.push(new Particle({ type: 'ambient' }));
      }
      
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update(deltaTime);
        if (p.life <= 0) {
          particles.splice(i, 1);
        } else {
          p.draw(p.isForeground ? fgCtx : bgCtx);
        }
      }
      
      animationFrameId = requestAnimationFrame(render);
    };
    
    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <>
      <div 
        ref={glowRef} 
        className="ambient-mouse-glow pointer-events-none" 
        style={{ top: 0, left: 0, transform: 'translate(-50%, -50%)', willChange: 'transform' }}
      />
      
      <canvas
        ref={bgCanvasRef}
        className="pointer-events-none fixed inset-0 z-0"
        style={{ filter: 'blur(2px)', willChange: 'transform' }}
      />
      
      <canvas
        ref={fgCanvasRef}
        className="pointer-events-none fixed inset-0 z-50"
        style={{ willChange: 'transform' }}
      />
    </>
  );
}
