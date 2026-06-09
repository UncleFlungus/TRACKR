import { useEffect, useRef } from 'react';

interface Props {
  /** Stroke color (CSS rgba/hex). Default matches grape palette. */
  color?: string;
  /** Spacing between grid points in CSS px. */
  spacing?: number;
  /** Radius of cursor influence in CSS px. */
  radius?: number;
  /** Max displacement applied at the cursor's exact location. */
  strength?: number;
}

/**
 * Canvas-based grid that subtly warps toward the cursor.
 *
 * Behavior:
 *  - On devices with a fine pointer (mouse/trackpad): grid reacts to mousemove.
 *  - On coarse pointer devices (touch): renders static, no animation loop.
 *  - Lerps point positions toward their target so the warp feels viscous,
 *    not snappy.
 *
 * Positioned absolutely; place inside a `relative` parent and size that
 * parent (e.g. `min-h-screen`).
 */
export default function InteractiveGrid({
  color = 'rgba(184, 165, 243, 0.55)',
  spacing = 44,
  radius = 200,
  strength = 32,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Cursor position in canvas-local coordinates. Initialized off-screen so
  // no warp is visible until the user actually moves the mouse.
  const mouseRef = useRef({ x: -10000, y: -10000 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // TypeScript's narrowing doesn't carry into inner functions, so we alias
    // to non-null locals once. All inner functions reference these.
    const c: HTMLCanvasElement = canvas;
    const g: CanvasRenderingContext2D = ctx;
    // Touch devices: render once, no animation loop. Avoids battery drain
    // on a feature that has no input source on these devices anyway.
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

          // Target position (where the point wants to be).
          let targetX = p.baseX;
          let targetY = p.baseY;
          if (dist < radius && dist > 0.01) {
            // Quadratic falloff for a softer, more "organic" feel.
            const falloff = 1 - dist / radius;
            const force = falloff * falloff * strength;
            targetX = p.baseX + (dx / dist) * force;
            targetY = p.baseY + (dy / dist) * force;
          }

          // Lerp toward target — 0.18 gives a viscous feel without lag.
          p.x += (targetX - p.x) * 0.18;
          p.y += (targetY - p.y) * 0.18;
        }
      }

      // Single batched stroke pass — much cheaper than one stroke per segment.
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
