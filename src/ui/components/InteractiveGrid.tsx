import { useEffect, useRef } from 'react';

interface Props {
  /** Stroke color. Defaults to the grape palette. */
  color?: string;
  /** Spacing between grid points in CSS px. */
  spacing?: number;
  /** Radius of cursor influence in CSS px. */
  radius?: number;
  /** Max displacement applied at the cursor's exact location. */
  strength?: number;
}

/**
 * Canvas grid that warps toward the cursor on mouse and trackpad, and renders
 * static on touch. Points lerp toward their targets so the warp feels viscous
 * rather than snappy.
 *
 * Absolutely positioned: put it in a `relative` parent and size that parent.
 */
export default function InteractiveGrid({
  color = 'rgba(184, 165, 243, 0.55)',
  spacing = 44,
  radius = 200,
  strength = 32,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Canvas-local coordinates, starting off-screen so nothing warps until the
  // mouse actually moves.
  const mouseRef = useRef({ x: -10000, y: -10000 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Narrowing doesn't carry into the inner functions, so alias to non-null
    // locals once and use those throughout.
    const c: HTMLCanvasElement = canvas;
    const g: CanvasRenderingContext2D = ctx;
    // Touch: render once, no loop. There's no cursor to follow, so the
    // animation would only drain battery.
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;

    type Point = { baseX: number; baseY: number; x: number; y: number };
    let points: Point[] = [];
    let cols = 0;
    let rows = 0;
    let rafId = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = c.getBoundingClientRect();
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      cols = Math.ceil(rect.width / spacing) + 1;
      rows = Math.ceil(rect.height / spacing) + 1;

      points = [];
      for (let r = 0; r < rows; r++) {
        for (let c2 = 0; c2 < cols; c2++) {
          const x = c2 * spacing;
          const y = r * spacing;
          points.push({ baseX: x, baseY: y, x, y });
        }
      }
    }

    function pointAt(c: number, r: number): Point {
      return points[r * cols + c];
    }

    function render() {
      const rect = c.getBoundingClientRect();
      g.clearRect(0, 0, rect.width, rect.height);

      if (!isCoarse) {
        const mx = mouseRef.current.x;
        const my = mouseRef.current.y;

        for (const p of points) {
          const dx = mx - p.baseX;
          const dy = my - p.baseY;
          const dist = Math.hypot(dx, dy);

          // Where the point wants to be.
          let targetX = p.baseX;
          let targetY = p.baseY;
          if (dist < radius && dist > 0.01) {
            // Quadratic falloff, which reads softer than linear.
            const falloff = 1 - dist / radius;
            const force = falloff * falloff * strength;
            targetX = p.baseX + (dx / dist) * force;
            targetY = p.baseY + (dy / dist) * force;
          }

          // 0.18 is viscous without feeling laggy.
          p.x += (targetX - p.x) * 0.18;
          p.y += (targetY - p.y) * 0.18;
        }
      }

      // One batched stroke pass, far cheaper than stroking each segment.
      g.strokeStyle = color;
      g.lineWidth = 1;
      g.beginPath();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p = pointAt(c, r);
          if (c < cols - 1) {
            const q = pointAt(c + 1, r);
            g.moveTo(p.x, p.y);
            g.lineTo(q.x, q.y);
          }
          if (r < rows - 1) {
            const q = pointAt(c, r + 1);
            g.moveTo(p.x, p.y);
            g.lineTo(q.x, q.y);
          }
        }
      }
      g.stroke();
    }

    function loop() {
      render();
      rafId = requestAnimationFrame(loop);
    }

    function onMouseMove(e: MouseEvent) {
      const rect = c.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onMouseLeave() {
      mouseRef.current = { x: -10000, y: -10000 };
    }

    resize();
    window.addEventListener('resize', resize);

    if (isCoarse) {
      render();
    } else {
      window.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseleave', onMouseLeave);
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [color, spacing, radius, strength]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
}
