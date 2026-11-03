import type { DateStr } from './dates';
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
