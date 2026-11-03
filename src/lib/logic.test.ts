import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, formatLong, monthGrid } from './dates';
import { estimate1RM, parseNumberInput, seriesFor, summarizeSets } from './metrics';
import { nextWorkout } from './routines';
import type { Entry, Routine, Session } from './types';

describe('dates', () => {
  it('builds a Monday-first month grid', () => {
    const nov = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(nov[0]).toEqual({ date: '2026-10-26', day: 26, inMonth: false });
    expect(nov[6]).toEqual({ date: '2026-11-01', day: 1, inMonth: true });
    expect(nov.length).toBe(42);
    expect(nov[nov.length - 1].date).toBe('2026-12-06');
    // February 2027 starts on Monday and has exactly four weeks.
    expect(monthGrid(2027, 1).length).toBe(28);
  });

  it('does date arithmetic on local days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-29', -1)).toBe('2026-03-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-25', '2026-11-03')).toBe(9); // across a DST change
    expect(formatLong('2026-11-03')).toBe('Tuesday, 3 Nov');
  });
});

const entry = (date: string, sets: Array<[number, number]>, extra: Partial<Entry> = {}): Entry => ({
  id: date + Math.random(),
  date,
  exerciseId: 'bench',
  order: 0,
  sets: sets.map(([weight, reps]) => ({ weight, reps })),
  createdAt: 0,
  ...extra,
});

describe('metrics', () => {
  it('estimates 1RM with Epley', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 10)).toBeCloseTo(133.33, 1);
    expect(estimate1RM(100, 0)).toBe(0);
  });

  it('builds one point per day and ignores empty sets', () => {
    const entries = [
      entry('2026-11-03', [[70, 8], [72.5, 5]]),
      entry('2026-11-03', [[75, 1]]),
      entry('2026-10-31', [[67.5, 8], [0, 0]]),
      entry('2026-10-29', []),
    ];
    expect(seriesFor(entries, 'top')).toEqual([
      { date: '2026-10-31', value: 67.5 },
      { date: '2026-11-03', value: 75 },
    ]);
    expect(seriesFor(entries, 'volume')[1].value).toBe(70 * 8 + 72.5 * 5 + 75);
    expect(seriesFor(entries, 'reps')[1].value).toBe(8);
  });

  it('summarizes sets and parses comma decimals', () => {
    expect(summarizeSets([{ weight: 70, reps: 8 }, { weight: 72.5, reps: 6 }], 'weight')).toBe('2 sets · top 72.5 kg × 6');
    expect(summarizeSets([{ weight: 0, reps: 10 }], 'bodyweight')).toBe('1 set · top BW × 10');
    expect(summarizeSets([], 'weight')).toBeNull();
    expect(parseNumberInput('72,5')).toBe(72.5);
    expect(Number.isNaN(parseNumberInput(''))).toBe(true);
  });
});

describe('routine cycle', () => {
  const routine: Routine = {
    id: 'ppl',
    name: 'PPL',
    createdAt: 0,
    days: [
      { id: 'push', name: 'Push', exerciseIds: [] },
      { id: 'pull', name: 'Pull', exerciseIds: [] },
      { id: 'legs', name: 'Legs', exerciseIds: [] },
    ],
  };
  const s = (date: string, dayId: string, createdAt = 0, routineId = 'ppl'): Session => ({ id: date + dayId, date, dayId, routineId, createdAt });

  it('starts at day 1', () => {
    expect(nextWorkout(routine, [], '2026-11-03')?.day.id).toBe('push');
  });

  it('suggests the day after the latest one, whatever the rest days', () => {
    const sessions = [s('2026-10-27', 'push'), s('2026-10-30', 'pull')];
    expect(nextWorkout(routine, sessions, '2026-11-03')?.day.id).toBe('legs');
  });

  it('wraps around and ignores sessions on or after the date', () => {
    const sessions = [s('2026-10-27', 'pull'), s('2026-10-30', 'legs'), s('2026-11-03', 'push'), s('2026-11-05', 'pull')];
    expect(nextWorkout(routine, sessions, '2026-11-03')?.day.id).toBe('push');
    expect(nextWorkout(routine, sessions, '2026-11-04')?.day.id).toBe('pull');
  });

  it('uses creation order for two sessions on one day, and ignores other routines', () => {
    const sessions = [s('2026-11-01', 'push', 1), s('2026-11-01', 'pull', 2), s('2026-11-02', 'legs', 3, 'other')];
    expect(nextWorkout(routine, sessions, '2026-11-03')?.day.id).toBe('legs');
  });

  it('restarts at day 1 if the last day was deleted', () => {
    expect(nextWorkout(routine, [s('2026-11-01', 'gone')], '2026-11-03')?.day.id).toBe('push');
    expect(nextWorkout({ ...routine, days: [] }, [], '2026-11-03')).toBeNull();
  });
});
