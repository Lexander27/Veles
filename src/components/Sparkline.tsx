import type { Point } from '../lib/metrics';

export function Sparkline({ points, width = 80, height = 28 }: { points: Point[]; width?: number; height?: number }) {
  if (points.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = 3;
  const pts = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (width - pad * 2);
      const y = max === min ? height / 2 : pad + (1 - (p.value - min) / (max - min)) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#2E5BFF" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
