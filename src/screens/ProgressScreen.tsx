import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '../db';
import { useExercises } from '../hooks';
import { Chart, RANGES, type Range } from '../components/Chart';
import { IconDown, IconNext } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { Sparkline } from '../components/Sparkline';
import { addDays, formatLong, formatShort, parseDate, todayStr } from '../lib/dates';
import { formatNumber, METRICS, metricsFor, seriesFor, type Metric, type Point } from '../lib/metrics';
import type { Entry, Exercise } from '../lib/types';
import { href, navigate } from '../router';

const RANGE_DAYS: Record<Range, number | null> = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, All: null };

function load<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage unavailable: setting just isn't remembered */
  }
}

export function ProgressScreen({ exerciseId }: { exerciseId?: string }) {
  const { byId } = useExercises();
  const entries = useLiveQuery(() => db.entries.toArray(), []);
  const [range, setRangeState] = useState<Range>(() => load('veles.range', RANGES, '3M'));
  const [metricPref, setMetricPref] = useState<Metric>(() => load('veles.metric', Object.keys(METRICS) as Metric[], 'top'));
  const [picked, setPicked] = useState<Point | null>(null);
  const [picking, setPicking] = useState(false);
  const setRange = (r: Range) => {
    setRangeState(r);
    save('veles.range', r);
  };

  // Exercises that have logged sets, most recently trained first.
  const tracked = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries ?? []) {
      if (!e.sets.some((s) => s.reps > 0)) continue;
      map.set(e.exerciseId, [...(map.get(e.exerciseId) ?? []), e]);
    }
    return [...map.entries()]
      .map(([id, list]) => ({ exercise: byId.get(id), entries: list, last: list.reduce((m, e) => (e.date > m ? e.date : m), '') }))
      .filter((t): t is { exercise: Exercise; entries: Entry[]; last: string } => !!t.exercise)
      .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : a.exercise.name.localeCompare(b.exercise.name)));
  }, [entries, byId]);

  if (!entries) return <div className="screen" />;

  const current = tracked.find((t) => t.exercise.id === exerciseId) ?? tracked[0];

  if (!current) {
    return (
      <div className="screen">
        <h1 className="h1">Progress</h1>
        <div className="empty" style={{ paddingTop: 48 }}>
          <strong style={{ color: 'var(--ink)', fontSize: 16 }}>No progress to show yet</strong>
          <span>Log some sets from the calendar and your graphs will appear here.</span>
        </div>
      </div>
    );
  }

  const ex = current.exercise;
  const available = metricsFor(ex.kind);
  const metric = available.includes(metricPref) ? metricPref : available[0];
  const info = METRICS[metric];
  const series = seriesFor(current.entries, metric);
  const latest = series[series.length - 1];
  const shown = picked ?? latest;

  const today = todayStr();
  const days = RANGE_DAYS[range];
  const inRange = days === null ? series : series.filter((p) => p.date >= addDays(today, -days));
  const change = inRange.length >= 2 ? inRange[inRange.length - 1].value - inRange[0].value : null;
  const best = Math.max(...series.map((p) => p.value));

  const choose = (id: string) => {
    setPicked(null);
    setPicking(false);
    navigate(href('progress', id), { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="screen">
      <h1 className="h1">Progress</h1>

      <div className="card" style={{ gap: 14 }}>
        <div className="between" style={{ alignItems: 'flex-start' }}>
          <div className="stack grow" style={{ gap: 2 }}>
            <button
              onClick={() => setPicking(true)}
              style={{ border: 'none', background: 'transparent', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 15, fontWeight: 600, minHeight: 32, alignSelf: 'flex-start' }}
              aria-label={`Exercise: ${ex.name}. Change exercise`}
            >
              {ex.name} <IconDown size={16} />
            </button>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>
              {formatNumber(shown.value)} <span style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 500 }}>{info.unit}</span>
            </span>
            <span className="small" style={{ color: picked ? 'var(--ink)' : 'var(--muted)' }}>
              {picked ? `${formatLong(picked.date)} ${parseDate(picked.date).getFullYear()}` : `${info.description} · last ${formatShort(latest.date)}`}
            </span>
            {!picked && change !== null && (
              <span className="small" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {change > 0 ? '▲' : change < 0 ? '▼' : '='} {formatNumber(Math.abs(Math.round(change * 10) / 10))} {info.unit} in {range === 'All' ? 'total' : range}
              </span>
            )}
          </div>
        </div>

        <div className="segmented" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>

        <Chart key={`${ex.id}-${metric}`} points={series} unit={info.unit} range={range} label={`${ex.name}, ${info.label}`} onSelect={setPicked} />

        <div className="chips" role="group" aria-label="Metric">
          {available.map((m) => (
            <button
              key={m}
              className="chip"
              aria-pressed={metric === m}
              onClick={() => {
                setMetricPref(m);
                save('veles.metric', m);
              }}
            >
              {METRICS[m].label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <Stat label="Best" value={`${formatNumber(best)} ${info.unit}`} />
          <Stat label="Sessions" value={String(series.length)} />
          <Stat label="Since" value={formatShort(series[0].date, false)} />
        </div>
      </div>

      <div className="list">
        <div className="between" style={{ paddingBottom: 4 }}>
          <h2 className="label">All exercises</h2>
        </div>
        {tracked.map((t) => (
          <ExerciseRow key={t.exercise.id} exercise={t.exercise} entries={t.entries} active={t.exercise.id === ex.id} onClick={() => choose(t.exercise.id)} />
        ))}
      </div>

      {picking && (
        <Sheet label="Choose exercise" onClose={() => setPicking(false)}>
          <h2 className="h2">Choose exercise</h2>
          <div className="list">
            {tracked.map((t) => (
              <button key={t.exercise.id} className="list-row" style={{ minHeight: 52 }} onClick={() => choose(t.exercise.id)}>
                <span className="grow title" style={{ fontWeight: t.exercise.id === ex.id ? 700 : 500, color: t.exercise.id === ex.id ? 'var(--accent)' : undefined }}>
                  {t.exercise.name}
                </span>
                <span className="small muted">{formatShort(t.last, false)}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span className="small muted">{label}</span>
      <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  );
}

function ExerciseRow({ exercise, entries, active, onClick }: { exercise: Exercise; entries: Entry[]; active: boolean; onClick: () => void }) {
  const metric = metricsFor(exercise.kind)[0];
  const series = seriesFor(entries, metric);
  const latest = series[series.length - 1];
  const monthAgo = addDays(todayStr(), -30);
  const base = [...series].reverse().find((p) => p.date <= monthAgo) ?? series[0];
  const diff = latest && base && latest !== base ? latest.value - base.value : null;
  const unit = METRICS[metric].unit;
  return (
    <button className="list-row" onClick={onClick} aria-current={active ? 'true' : undefined} style={{ minHeight: 60 }}>
      <span className="stack grow" style={{ gap: 2 }}>
        <span className="title" style={{ fontSize: 15, color: active ? 'var(--accent)' : undefined }}>
          {exercise.name}
        </span>
        <span className="sub">
          {formatNumber(latest.value)} {unit}
          {diff !== null && diff !== 0 && (
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
              {' '}· {diff > 0 ? '+' : '−'}
              {formatNumber(Math.abs(Math.round(diff * 10) / 10))} {unit}
            </span>
          )}
        </span>
      </span>
      <Sparkline points={series.slice(-12)} />
      <IconNext size={16} style={{ color: '#9aa0ab' }} />
    </button>
  );
}
