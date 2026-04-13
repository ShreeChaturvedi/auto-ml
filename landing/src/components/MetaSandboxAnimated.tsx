import { useEffect, useRef } from 'react';

import rawSvg from '@/assets/meta-sandbox.svg?raw';

/**
 * data-flow-thankyou.svg scene (Y-rotation + pyramid) for the SANDBOX meta card.
 * SVG is injected from `meta-sandbox.svg`; geometry updates run here because
 * `set:html` does not execute embedded &lt;script&gt; tags.
 */
export default function MetaSandboxAnimated() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const svg = host.querySelector('svg');
    if (!svg) return;

    const $ = <T extends Element>(suffix: string) =>
      svg.querySelector<T>(`#${CSS.escape(`ms-${suffix}`)}`);

    const reduced =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const s = 56.57;
    const h = 60;
    const cx = 180;
    const cy = 150;
    const vs = 0.5;
    const p = 5.66;

    const V: [number, number, number][] = [
      [-s, 0, -s],
      [s, 0, -s],
      [s, 0, s],
      [-s, 0, s],
      [-s, h, -s],
      [s, h, -s],
      [s, h, s],
      [-s, h, s],
    ];

    const GL: [[number, number, number], [number, number, number]][] = [
      [[-s, 0, -s / 2], [s, 0, -s / 2]],
      [[-s, 0, 0], [s, 0, 0]],
      [[-s, 0, s / 2], [s, 0, s / 2]],
      [[-s / 2, 0, -s], [-s / 2, 0, s]],
      [[0, 0, -s], [0, 0, s]],
      [[s / 2, 0, -s], [s / 2, 0, s]],
    ];

    const WI = [
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ] as const;

    const WN: [number, number, number][] = [
      [0, 0, -1],
      [1, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
    ];

    const ND: { x: number; z: number; h: number }[] = [
      { x: -s, z: 0, h: 20 },
      { x: s, z: 0, h: 30 },
      { x: -s / 2, z: s, h: 15 },
      { x: s / 2, z: -s, h: 30 },
    ];
    const NL = ['a', 'b', 'c', 'd'] as const;

    const PB: [number, number, number][] = [
      [-p, 8, -p],
      [p, 8, -p],
      [p, 8, p],
      [-p, 8, p],
    ];

    function R(x: number, y: number, z: number, a: number): [number, number, number] {
      const c = Math.cos(a);
      const sn = Math.sin(a);
      return [x * c - z * sn, y, x * sn + z * c];
    }

    function P(q: [number, number, number], a: number): [number, number] {
      const r = R(q[0], q[1], q[2], a);
      return [cx + r[0], cy + r[2] * vs - r[1]];
    }

    function pts(arr: [number, number, number][], a: number): string {
      let o = '';
      for (let i = 0; i < arr.length; i++) {
        if (i) o += ' ';
        const q = P(arr[i], a);
        o += `${q[0].toFixed(1)},${q[1].toFixed(1)}`;
      }
      return o;
    }

    function sL(el: SVGLineElement, a3: [number, number, number], b3: [number, number, number], ang: number) {
      const p1 = P(a3, ang);
      const p2 = P(b3, ang);
      el.setAttribute('x1', p1[0].toFixed(1));
      el.setAttribute('y1', p1[1].toFixed(1));
      el.setAttribute('x2', p2[0].toFixed(1));
      el.setAttribute('y2', p2[1].toFixed(1));
    }

    function sC(el: SVGCircleElement, q: [number, number, number], a: number) {
      const r = P(q, a);
      el.setAttribute('cx', r[0].toFixed(1));
      el.setAttribute('cy', r[1].toFixed(1));
    }

    const spd = (Math.PI * 2) / 25000;
    let raf = 0;

    function frame(t: number) {
      const a = Math.PI / 4 + t * spd;

      $('floor')?.setAttribute('points', pts([V[0], V[1], V[2], V[3]], a));

      for (let i = 0; i < 6; i++) {
        const line = $(`gl${i}`) as SVGLineElement | null;
        if (line) sL(line, GL[i][0], GL[i][1], a);
      }

      for (let i = 0; i < 4; i++) {
        const el = $(`w${i}`) as SVGPolygonElement | null;
        if (!el) continue;
        const w = WI[i];
        el.setAttribute('points', pts([V[w[0]], V[w[1]], V[w[2]], V[w[3]]], a));
        const n = WN[i];
        const zc = n[0] * Math.sin(a) + n[2] * Math.cos(a);
        if (zc > 0) {
          el.setAttribute('fill', 'rgba(255,255,255,0.04)');
          el.setAttribute('stroke', 'rgba(255,255,255,0.10)');
        } else {
          el.setAttribute('fill', 'rgba(255,255,255,0.07)');
          el.setAttribute('stroke', 'rgba(255,255,255,0.16)');
        }
        el.setAttribute('stroke-width', '1');
      }

      for (let i = 0; i < 4; i++) {
        const pil = $(`pil${i}`) as SVGLineElement | null;
        if (pil) sL(pil, V[i], V[i + 4], a);
      }

      const sy = 20 + 6 * Math.sin(t / 1200);
      $('scan')?.setAttribute('points', pts([[-s, sy, -s], [s, sy, -s], [s, sy, s], [-s, sy, s]], a));

      for (let i = 0; i < 4; i++) {
        const n = ND[i];
        const l = NL[i];
        const nh = n.h + 3 * Math.sin(t / 800 + i * 1.5);
        const line = $(`nl${l}`) as SVGLineElement | null;
        const circ = $(`nd${l}`) as SVGCircleElement | null;
        if (line) sL(line, [n.x, 0, n.z], [n.x, nh, n.z], a);
        if (circ) sC(circ, [n.x, nh, n.z], a);
      }

      const po = 4 * Math.sin(t / 1000);
      const pb: [number, number, number][] = [];
      for (let i = 0; i < 4; i++) pb.push([PB[i][0], PB[i][1] + po, PB[i][2]]);
      const pa: [number, number, number] = [0, 32 + po, 0];

      $('pyr-base')?.setAttribute('points', pts(pb, a));

      const pyrShadow = $('pyr-shadow');
      if (pyrShadow) {
        pyrShadow.setAttribute(
          'points',
          pts(
            [
              [pb[0][0], pb[0][1] - 3, pb[0][2]],
              [pb[1][0], pb[1][1] - 3, pb[1][2]],
              [pb[2][0], pb[2][1] - 3, pb[2][2]],
              [pb[3][0], pb[3][1] - 3, pb[3][2]],
            ],
            a,
          ),
        );
      }

      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const el = $(`pyrf${i}`) as SVGPolygonElement | null;
        if (!el) continue;
        el.setAttribute('points', pts([pb[i], pb[j], pa], a));
        const fn = WN[i];
        const fz = fn[0] * Math.sin(a) + fn[2] * Math.cos(a);
        if (fz > 0) {
          el.setAttribute('fill', 'rgba(255,255,255,0.18)');
          el.setAttribute('stroke', 'rgba(255,255,255,0.35)');
        } else {
          el.setAttribute('fill', 'rgba(255,255,255,0.42)');
          el.setAttribute('stroke', 'rgba(255,255,255,0.58)');
        }
        el.setAttribute('stroke-width', '0.75');
      }

      const beam = $('beam') as SVGLineElement | null;
      if (beam) sL(beam, [0, pa[1], 0], [0, 85 + po, 0], a);
      const bkDot = $('bk-dot') as SVGCircleElement | null;
      if (bkDot) sC(bkDot, [0, 85 + po, 0], a);
      const bkRing = $('bk-ring') as SVGCircleElement | null;
      if (bkRing) sC(bkRing, [0, 85 + po, 0], a);

      const rcy = cy - (8 + po);
      $('ring-i')?.setAttribute('cy', rcy.toFixed(1));
      $('ring-o')?.setAttribute('cy', rcy.toFixed(1));

      $('edge-top')?.setAttribute('points', pts([V[4], V[5], V[6], V[7], V[4]], a));
    }

    function loop(t: number) {
      frame(t);
      if (!reduced) raf = requestAnimationFrame(loop);
    }

    if (reduced) {
      frame(typeof performance !== 'undefined' ? performance.now() : 0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={hostRef}
      className="meta-sandbox-host h-full w-full [&_svg]:h-full [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: rawSvg }}
    />
  );
}
