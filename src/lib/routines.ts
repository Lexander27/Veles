import { addDays, type DateStr } from './dates';
import type { NextOverride, Routine, RoutineDay, Session } from './types';

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

/** Was this session logged after the "next workout" was picked by hand? */
function isAfter(s: Session, o: NextOverride): boolean {
  return s.date > o.date || (s.date === o.date && s.createdAt > o.setAt);
}

/**
 * Where the cycle stands, looking at sessions that pass `include`:
 * the index of the next workout, and the session it follows (if any).
 * A next workout picked by hand wins until a workout is logged after it.
 */
function position(routine: Routine, sessions: Session[], include: (s: Session) => boolean, asOf: DateStr) {
  const N = routine.days.length;
  const prior = sortSessionsDesc(sessions.filter((s) => s.routineId === routine.id && include(s)));
  const last = prior[0];
  const o = routine.next;
  const oIdx = o ? routine.days.findIndex((d) => d.id === o.dayId) : -1;
  if (o && oIdx !== -1 && o.date <= asOf && !(last && isAfter(last, o))) {
    return { index: oIdx, last, overridden: true };
  }
  if (!last) return { index: 0, last: undefined, overridden: false };
  const lastIndex = routine.days.findIndex((d) => d.id === last.dayId);
  return { index: lastIndex === -1 ? 0 : (lastIndex + 1) % N, last, overridden: false };
}

/**
 * The routine day to do next on `date`: the day after the most recent routine
 * day done before that date, wrapping around to day 1 — or the one you picked
 * by hand. Rest days don't matter; the cycle only moves when a workout is logged.
 */
export function nextWorkout(routine: Routine, sessions: Session[], date: DateStr): NextWorkout | null {
  if (routine.days.length === 0) return null;
  const { index, last } = position(routine, sessions, (s) => s.date < date, date);
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

  // Workout i always sits on training slot (i mod T), so the plan is the same
  // whichever workout you count from.
  const slotOf = (i: number) => slots[i % T];
  const { index, last } = position(routine, sessions, (s) => s.date <= today, today);
  let dayIdx = index;
  let date: DateStr = today;
  if (last) {
    // The rest gap after the workout before this one, counted from your last workout.
    const due = addDays(last.date, gapAfter(pattern, slotOf((index - 1 + N) % N)));
    if (due > today) date = due;
  }

  const out: PlannedDay[] = [];
  for (let guard = 0; date <= until && guard < 1000; guard++) {
    out.push({ date, day: routine.days[dayIdx], index: dayIdx });
    date = addDays(date, gapAfter(pattern, slotOf(dayIdx)));
    dayIdx = (dayIdx + 1) % N;
  }
  return out;
}
