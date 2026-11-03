import type { DateStr } from './dates';
import type { Entry, ExerciseKind, WorkSet } from './types';

export type Metric = 'top' | 'e1rm' | 'volume' | 'reps' | 'totalReps';

export interface MetricInfo {
  id: Metric;
  label: string;
  unit: string;
  description: string;
}

export const METRICS: Record<Metric, MetricInfo> = {
  top: { id: 'top', label: 'Top weight', unit: 'kg', description: 'Heaviest set' },
  e1rm: { id: 'e1rm', label: 'Est. 1RM', unit: 'kg', description: 'Estimated one-rep max (Epley)' },
  volume: { id: 'volume', label: 'Volume', unit: 'kg', description: 'Total kg × reps' },
  reps: { id: 'reps', label: 'Max reps', unit: 'reps', description: 'Most reps in one set' },
  totalReps: { id: 'totalReps', label: 'Total reps', unit: 'reps', description: 'All reps in the session' },
};

export function metricsFor(kind: ExerciseKind): Metric[] {
  return kind === 'bodyweight' ? ['reps', 'totalReps'] : ['top', 'e1rm', 'volume'];
}

/** Epley estimate. A single rep is the weight itself. */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function validSets(sets: WorkSet[]): WorkSet[] {
  return sets.filter((s) => s.reps > 0);
}

export function setMetric(sets: WorkSet[], metric: Metric): number | null {
  const v = validSets(sets);
  if (v.length === 0) return null;
  // Drop sets add to volume and total reps, but aren't "best set" material.
  const main = v.filter((s) => !s.drop);
  const best = main.length ? main : v;
  switch (metric) {
    case 'top':
      return Math.max(...best.map((s) => s.weight));
    case 'e1rm':
      return Math.max(...best.map((s) => estimate1RM(s.weight, s.reps)));
    case 'volume':
      return v.reduce((sum, s) => sum + s.weight * s.reps, 0);
    case 'reps':
      return Math.max(...best.map((s) => s.reps));
    case 'totalReps':
      return v.reduce((sum, s) => sum + s.reps, 0);
  }
}

export interface Point {
  date: DateStr;
  value: number;
}

/** One point per day (entries on the same day are merged), sorted by date. */
export function seriesFor(entries: Entry[], metric: Metric): Point[] {
  const byDate = new Map<DateStr, WorkSet[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(...e.sets);
    byDate.set(e.date, list);
  }
  const points: Point[] = [];
  for (const [date, sets] of byDate) {
    const value = setMetric(sets, metric);
    if (value !== null) points.push({ date, value: Math.round(value * 100) / 100 });
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The heaviest set (by weight, then reps) — "70 kg × 8". */
export function bestSet(sets: WorkSet[]): WorkSet | null {
  const all = validSets(sets);
  const v = all.some((s) => !s.drop) ? all.filter((s) => !s.drop) : all;
  if (v.length === 0) return null;
  return v.reduce((best, s) => (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best));
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-GB');
  return n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

export function formatSet(s: WorkSet, kind: ExerciseKind): string {
  if (kind === 'bodyweight') {
    return s.weight > 0 ? `BW+${formatNumber(s.weight)} kg × ${s.reps}` : `BW × ${s.reps}`;
  }
  return `${formatNumber(s.weight)} kg × ${s.reps}`;
}

/** Sets grouped so each drop set stays with the set it continues. */
export function groupSets(sets: WorkSet[]): WorkSet[][] {
  const groups: WorkSet[][] = [];
  for (const s of sets) {
    if (s.drop && groups.length) groups[groups.length - 1].push(s);
    else groups.push([s]);
  }
  return groups;
}

/** "70 kg × 8, 9 kg × 5 → 6.8 kg × 3" */
export function formatSets(sets: WorkSet[], kind: ExerciseKind): string {
  return groupSets(validSets(sets))
    .map((g) => g.map((s) => formatSet(s, kind)).join(' → '))
    .join(', ');
}

/** "4 sets · top 70 kg × 8", or null when nothing is logged. Drop sets count with their main set. */
export function summarizeSets(sets: WorkSet[], kind: ExerciseKind): string | null {
  const v = validSets(sets);
  if (v.length === 0) return null;
  const best = bestSet(v)!;
  const n = groupSets(v).length;
  const drops = v.filter((s) => s.drop).length;
  return `${n} ${n === 1 ? 'set' : 'sets'}${drops ? ` (+${drops} ${drops === 1 ? 'drop' : 'drops'})` : ''} · top ${formatSet(best, kind)}`;
}

/** Parses user input like "72,5" or "72.5". Returns NaN for empty/invalid. */
export function parseNumberInput(raw: string): number {
  const t = raw.trim().replace(',', '.');
  if (t === '') return NaN;
  return Number(t);
}
