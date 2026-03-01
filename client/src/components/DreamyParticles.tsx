import { useEffect, useRef } from 'react';

export default function DreamyParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    let animationFrameId: number;
    let lastTime = performance.now();

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      sizeDelta: number;
      life: number;
      maxLife: number;

      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = (Math.random() - 0.5) * 0.4 - 0.2; // slight upward drift
        this.size = Math.random() * 3 + 2; // 2 to 5 px radius
        this.sizeDelta = (Math.random() - 0.5) * 0.05; // very slowly increase/decrease
        
        // Disappears after 1 second (1000ms)
        this.maxLife = 1000 + Math.random() * 200; // ~1 to 1.2 seconds max life
        this.life = this.maxLife;
      }

      update(deltaTime: number) {
        // Move
        this.x += this.vx * (deltaTime / 16);
        this.y += this.vy * (deltaTime / 16);
        
        // Age
        this.life -= deltaTime;
        
        // Change size
        this.size += this.sizeDelta * (deltaTime / 16);
        if (this.size < 0.1) this.size = 0.1;
      }

      draw(ctx: CanvasRenderingContext2D) {
        // Calculate smooth fade in and fade out
        let opacity = 0;
        const fadeRatio = this.life / this.maxLife;
        
        // Quick fade in (first 20% of life), smooth fade out (last 80% of life)
        if (fadeRatio > 0.8) {
          // completely new -> fading in
          opacity = (1 - fadeRatio) * 5; 
        } else {
          // fading out for the rest of its life
          opacity = fadeRatio / 0.8;
        }

        // Apply a base opacity limit to make it dreamy and not too harsh
        opacity *= 0.6;

        ctx.save();
        ctx.globalAlpha = Math.max(0, opacity);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = '#fde68a'; // Tailwind amber-200 / yellow-ish
        
        // Blurry effect glow
        ctx.shadowBlur = Math.max(10, this.size * 3);
        ctx.shadowColor = '#fcd34d'; // Tailwind amber-300
        
        ctx.fill();
        ctx.restore();
      }
    }

    const render = (time: number) => {
      const deltaTime = time - lastTime;
      lastTime = time;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Spawn particles frequently to keep the screen populated
      // Spawning multiple per frame to ensure a dreamy atmosphere even with short 1-second lifespans
      const spawnCount = Math.floor(canvas.width * canvas.height / 300000); // Scale with screen size
      for (let i = 0; i < spawnCount + 1; i++) {
        if (Math.random() < 0.5) { 
          particles.push(new Particle());
        }
      }
      
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update(deltaTime);
        p.draw(ctx);
        if (p.life <= 0) {
          particles.splice(i, 1);
        }
      }
      
      animationFrameId = requestAnimationFrame(render);
    };
    
    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ filter: 'blur(2px)' }}
    />
  );
}
