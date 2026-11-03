import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, daysBetween, formatLong, formatShort, monthName, parseDate, todayStr, type DateStr } from '../lib/dates';
import { formatNumber, type Point } from '../lib/metrics';
import { IconBack, IconNext } from './Icons';

export type Range = '1M' | '3M' | '6M' | '1Y' | 'All';
export const RANGES: Range[] = ['1M', '3M', '6M', '1Y', 'All'];
const SPAN: Record<Exclude<Range, 'All'>, number> = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366 };

const H = 210;
const PAD = { top: 44, right: 14, bottom: 26, left: 42 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const raw = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/**
 * Interactive line chart over time. Drag sideways to move through time,
 * tap a point to see its value and date.
 */
export function Chart({
  points,
  unit,
  range,
  label,
  onSelect,
}: {
  points: Point[];
  unit: string;
  range: Range;
  label: string;
  onSelect?: (p: Point | null) => void;
}) {
  const clipId = useId().replace(/:/g, '');
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const today = todayStr();

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Time is measured in days from the first point.
  const origin = points[0]?.date ?? today;
  const dn = (d: DateStr) => daysBetween(origin, d);
  const todayDn = dn(today);
  const lastDn = points.length ? dn(points[points.length - 1].date) : todayDn;
  const rightEdge = Math.max(todayDn, lastDn);

  const span = range === 'All' ? Math.max(14, rightEdge + 2) : SPAN[range];
  const [end, setEnd] = useState(rightEdge);
  const [selected, setSelected] = useState<number | null>(null);

  // Reset the window when the data or range changes.
  useEffect(() => {
    setEnd(rightEdge);
    setSelected(null);
  }, [range, origin, rightEdge, points.length]);
  useEffect(() => {
    onSelect?.(selected === null ? null : points[selected] ?? null);
  }, [selected, points, onSelect]);

  // The window can move back until its start is just before the first point.
  const minEnd = range === 'All' ? rightEdge : Math.min(rightEdge, span - 2);
  const clampEnd = (e: number) => Math.min(rightEdge, Math.max(minEnd, e));
  const x0 = range === 'All' ? -1 : end - span;
  const x1 = range === 'All' ? rightEdge + 1 : end;

  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const sx = (d: number) => PAD.left + ((d - x0) / (x1 - x0)) * plotW;

  const days = useMemo(() => points.map((p) => daysBetween(origin, p.date)), [points, origin]);
  const visibleIdx = days.map((d, i) => (d >= x0 && d <= x1 ? i : -1)).filter((i) => i >= 0);

  // Y scale fits the visible points (and the neighbours that the line runs to).
  const yRange = useMemo(() => {
    const idx = new Set(visibleIdx);
    if (visibleIdx.length) {
      if (visibleIdx[0] > 0) idx.add(visibleIdx[0] - 1);
      if (visibleIdx[visibleIdx.length - 1] < points.length - 1) idx.add(visibleIdx[visibleIdx.length - 1] + 1);
    }
    const vals = [...idx].map((i) => points[i].value);
    if (vals.length === 0) return null;
    return niceTicks(Math.min(...vals), Math.max(...vals));
  }, [visibleIdx.join(','), points]);

  const yMin = yRange ? yRange[0] : 0;
  const yMax = yRange ? yRange[yRange.length - 1] : 1;
  const sy = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  // X labels: weeks for 1M, months otherwise (thinned out for long windows).
  const xTicks = useMemo(() => {
    const out: Array<{ d: number; label: string }> = [];
    const startDate = addDays(origin, Math.floor(x0));
    const total = x1 - x0;
    if (total <= 40) {
      let d = startDate;
      while (parseDate(d).getDay() !== 1) d = addDays(d, 1);
      for (; dn(d) <= x1; d = addDays(d, 7)) out.push({ d: dn(d), label: formatShort(d, false) });
    } else {
      // Months on a fixed grid (every 1, 2, 3 or 6) so labels don't jump while panning.
      const every = total > 800 ? 6 : total > 400 ? 3 : total > 200 ? 2 : 1;
      const s = parseDate(startDate);
      let m = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      for (;;) {
        const ds = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
        if (dn(ds) > x1) break;
        if (m.getMonth() % every === 0) {
          const name = monthName(m.getMonth()).slice(0, 3);
          out.push({ d: dn(ds), label: m.getMonth() === 0 || total > 400 ? `${name} ’${String(m.getFullYear()).slice(2)}` : name });
        }
        m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      }
    }
    // Drop labels that would overlap.
    const kept: typeof out = [];
    for (const t of out) {
      const x = sx(t.d);
      if (x < PAD.left - 2 || x > width - 10) continue;
      if (kept.length && x - sx(kept[kept.length - 1].d) < 44) continue;
      kept.push(t);
    }
    return kept;
  }, [x0, x1, origin, width]);

  // ---- pointer: drag to pan, tap to select ----
  const drag = useRef<{ id: number; x: number; end: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { id: e.pointerId, x: e.clientX, end, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 8) {
      d.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (d.moved && range !== 'All') setEnd(clampEnd(d.end - (dx / plotW) * span));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best: number | null = null;
    let bestDist = 36;
    for (const i of visibleIdx) {
      const dist = Math.abs(sx(days[i]) - px);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setSelected(best === selected ? null : best);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!visibleIdx.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const cur = selected ?? (e.key === 'ArrowLeft' ? visibleIdx[visibleIdx.length - 1] + 1 : visibleIdx[0] - 1);
      const nextI = Math.min(points.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      setSelected(nextI);
      const d = days[nextI];
      if (range !== 'All' && (d < x0 || d > x1)) setEnd(clampEnd(d + span / 2));
    } else if (e.key === 'Escape') setSelected(null);
  };

  const pan = (dir: -1 | 1) => setEnd((e) => clampEnd(e + (dir * span) / 2));
  const canPanBack = range !== 'All' && end > minEnd + 0.5;
  const canPanFwd = range !== 'All' && end < rightEdge - 0.5;

  const sel = selected !== null ? points[selected] : null;
  const selX = selected !== null ? sx(days[selected]) : 0;
  const selInView = selected !== null && days[selected] >= x0 && days[selected] <= x1;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(days[i]).toFixed(1)},${sy(p.value).toFixed(1)}`).join(' ');
  const wStart = addDays(origin, range === 'All' ? 0 : Math.ceil(x0));
  const wEnd = addDays(origin, Math.floor(Math.min(x1, rightEdge)));
  const windowLabel = `${formatShort(wStart, wStart.slice(0, 4) !== wEnd.slice(0, 4))} – ${formatShort(wEnd)}`;

  if (points.length === 0) {
    return <div className="empty" style={{ height: H }}>No data yet. Log some sets to see your graph.</div>;
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div
        ref={wrap}
        className="chart-wrap"
        tabIndex={0}
        role="img"
        aria-label={`${label}. ${visibleIdx.length} points from ${windowLabel}. Use arrow keys to step through points.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
        style={{ cursor: range === 'All' ? 'default' : 'grab' }}
      >
        <svg width={width} height={H} aria-hidden="true">
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.left - 8} y={PAD.top - 10} width={plotW + 16} height={plotH + 20} />
            </clipPath>
          </defs>
          {yRange?.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={sy(t)} y2={sy(t)} stroke={t === yMin ? '#E6E8EC' : '#F0F1F4'} />
              <text x={PAD.left - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="#5F6672">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t.d} x={sx(t.d)} y={H - 6} textAnchor="middle" fontSize="11" fill="#5F6672">
              {t.label}
            </text>
          ))}
          <g clipPath={`url(#${clipId})`}>
            {selInView && <line x1={selX} x2={selX} y1={PAD.top - 6} y2={PAD.top + plotH} stroke="#2E5BFF" strokeDasharray="3 3" />}
            <path d={path} fill="none" stroke="#2E5BFF" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) =>
              days[i] >= x0 - 2 && days[i] <= x1 + 2 ? (
                <circle
                  key={p.date}
                  cx={sx(days[i])}
                  cy={sy(p.value)}
                  r={i === selected ? 6 : visibleIdx.length > 60 ? 2.5 : 3.5}
                  fill={i === selected ? '#2E5BFF' : '#FFFFFF'}
                  stroke="#2E5BFF"
                  strokeWidth={2}
                />
              ) : null,
            )}
          </g>
        </svg>
        {sel && selInView && (
          <div className="chart-tip" style={{ left: Math.min(width - 60, Math.max(60, selX)) }}>
            <strong>
              {formatNumber(sel.value)} {unit}
            </strong>
            <span>{formatLong(sel.date)} {parseDate(sel.date).getFullYear()}</span>
          </div>
        )}
      </div>
      <div className="chart-nav">
        <button className="icon-btn ghost" aria-label="Earlier" onClick={() => pan(-1)} disabled={!canPanBack} style={{ opacity: canPanBack ? 1 : 0.3 }}>
          <IconBack size={18} />
        </button>
        <span className="small muted" style={{ textAlign: 'center' }}>
          {windowLabel}
        </span>
        <button className="icon-btn ghost" aria-label="Later" onClick={() => pan(1)} disabled={!canPanFwd} style={{ opacity: canPanFwd ? 1 : 0.3 }}>
          <IconNext size={18} />
        </button>
      </div>
    </div>
  );
}
