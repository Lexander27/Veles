import { addDays, type DateStr } from './dates';
import type { Routine, RoutineDay, Session } from './types';

export interface NextWorkout {
  day: RoutineDay;
  index: number;
  /** The session the suggestion follows from, if any. */
  last?: Session;
}

/** Latest session first: by date, then by creation time. */
export function sortSessionsDesc(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.createdAt - a.createdAt));
}

/**
 * The routine day to do next on `date`: the day after the most recent routine
 * day done before that date, wrapping around to day 1. Rest days don't matter —
 * the cycle only moves when a workout is logged.
 */
export function nextWorkout(routine: Routine, sessions: Session[], date: DateStr): NextWorkout | null {
  if (routine.days.length === 0) return null;
  const prior = sortSessionsDesc(sessions.filter((s) => s.routineId === routine.id && s.date < date));
  const last = prior[0];
  if (!last) return { day: routine.days[0], index: 0 };
  const lastIndex = routine.days.findIndex((d) => d.id === last.dayId);
  const index = lastIndex === -1 ? 0 : (lastIndex + 1) % routine.days.length;
  return { day: routine.days[index], index, last };
}

// ---------- repeating plan ----------

export interface PlannedDay {
  date: DateStr;
  day: RoutineDay;
  index: number;
}

export const PLAN_PRESETS: Array<{ id: string; label: string; pattern: boolean[] }> = [
  { id: 'daily', label: 'Every day', pattern: [true] },
  { id: 'every2', label: 'Every 2 days', pattern: [true, false] },
  { id: 'every3', label: 'Every 3 days', pattern: [true, false, false] },
];

export function presetOf(pattern: boolean[]): string {
  return PLAN_PRESETS.find((p) => p.pattern.length === pattern.length && p.pattern.every((v, i) => v === pattern[i]))?.id ?? 'custom';
}

/** "Every 2 days" or "6-day cycle · 4 training days" */
export function describePlan(pattern: boolean[]): string {
  const preset = PLAN_PRESETS.find((p) => p.id === presetOf(pattern));
  if (preset) return preset.label;
  const t = pattern.filter(Boolean).length;
  return `${pattern.length}-day cycle · ${t} training ${t === 1 ? 'day' : 'days'}`;
}

/** Days from one training slot to the next one in the cycle. */
function gapAfter(pattern: boolean[], slot: number): number {
  const L = pattern.length;
  for (let g = 1; g <= L; g++) if (pattern[(slot + g) % L]) return g;
  return L;
}

/**
 * Where the routine's workouts fall from `today` until `until`.
 *
 * The plan counts from your last workout: workout k sits on the k-th training
 * slot of the cycle (mod the number of slots), the next workout is due one gap
 * later, and an overdue workout moves to today. So missing a day never puts you
 * "behind" — everything simply shifts. Past dates are never planned.
 */
export function planDays(routine: Routine, sessions: Session[], today: DateStr, until: DateStr): PlannedDay[] {
  const pattern = routine.plan?.pattern;
  const N = routine.days.length;
  if (!pattern || !pattern.some(Boolean) || N === 0) return [];
  const slots = pattern.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const T = slots.length;

  const last = sortSessionsDesc(sessions.filter((s) => s.routineId === routine.id && s.date <= today))[0];
  // Workout i always sits on training slot (i mod T), so the plan is the same
  // whichever workout you count from.
  const slotOf = (i: number) => slots[i % T];
  let date: DateStr;
  let dayIdx: number;
  if (!last) {
    date = today;
    dayIdx = 0;
  } else {
    const found = routine.days.findIndex((d) => d.id === last.dayId);
    const i = found === -1 ? N - 1 : found;
    const due = addDays(last.date, gapAfter(pattern, slotOf(i)));
    date = due < today ? today : due;
    dayIdx = (i + 1) % N;
  }

  const out: PlannedDay[] = [];
  for (let guard = 0; date <= until && guard < 1000; guard++) {
    out.push({ date, day: routine.days[dayIdx], index: dayIdx });
    date = addDays(date, gapAfter(pattern, slotOf(dayIdx)));
    dayIdx = (dayIdx + 1) % N;
  }
  return out;
}
