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

import { formatSets, setMetric } from './metrics';
import { describePlan, planDays } from './routines';

describe('drop set metrics', () => {
  const sets = [
    { weight: 9, reps: 5 },
    { weight: 6.8, reps: 3, drop: true },
    { weight: 9, reps: 7 },
    { weight: 6.8, reps: 2, drop: true },
  ];
  it('counts drops in volume but not as separate sets or best sets', () => {
    expect(setMetric(sets, 'volume')).toBeCloseTo(9 * 5 + 6.8 * 3 + 9 * 7 + 6.8 * 2);
    expect(setMetric([{ weight: 50, reps: 3 }, { weight: 40, reps: 15, drop: true }], 'e1rm')).toBeCloseTo(55);
    expect(summarizeSets(sets, 'weight')).toBe('2 sets (+2 drops) · top 9 kg × 7');
    expect(formatSets(sets, 'weight')).toBe('9 kg × 5 → 6.8 kg × 3, 9 kg × 7 → 6.8 kg × 2');
  });
});

describe('routine plan', () => {
  const days = ['w1', 'w2', 'w3', 'w4'].map((id) => ({ id, name: id.toUpperCase(), exerciseIds: [] }));
  // 6-day cycle: W1, rest, W2, W3, rest, W4
  const routine: Routine = { id: 'r', name: 'R', createdAt: 0, days, plan: { pattern: [true, false, true, true, false, true] } };
  const s = (date: string, dayId: string): Session => ({ id: date, date, dayId, routineId: 'r', createdAt: 0 });
  const plan = (sessions: Session[], today: string, until: string) => planDays(routine, sessions, today, until).map((p) => `${p.date.slice(8)}:${p.day.id}`);

  it('lays the cycle out from today when nothing is logged', () => {
    expect(plan([], '2026-11-02', '2026-11-08')).toEqual(['02:w1', '04:w2', '05:w3', '07:w4', '08:w1']);
  });

  it('counts from the last workout', () => {
    expect(plan([s('2026-11-02', 'w1')], '2026-11-02', '2026-11-08')).toEqual(['04:w2', '05:w3', '07:w4', '08:w1']);
  });

  it('shifts when a workout is late: done Thursday instead of Wednesday', () => {
    // W2 was planned for the 4th but done on the 5th, so W3 moves to the 6th.
    expect(plan([s('2026-11-02', 'w1'), s('2026-11-05', 'w2')], '2026-11-05', '2026-11-09')).toEqual(['06:w3', '08:w4', '09:w1']);
  });

  it('moves an overdue workout to today, and never plans the past', () => {
    expect(plan([s('2026-11-02', 'w1')], '2026-11-07', '2026-11-09')).toEqual(['07:w2', '08:w3']);
  });

  it('every 2 days rotates through all workouts', () => {
    const r2 = { ...routine, plan: { pattern: [true, false] } };
    expect(planDays(r2, [], '2026-11-02', '2026-11-10').map((p) => p.day.id)).toEqual(['w1', 'w2', 'w3', 'w4', 'w1']);
    expect(describePlan([true, false])).toBe('Every 2 days');
    expect(describePlan(routine.plan!.pattern)).toBe('6-day cycle · 4 training days');
  });

  it('has no plan without a pattern', () => {
    expect(planDays({ ...routine, plan: undefined }, [], '2026-11-02', '2026-11-30')).toEqual([]);
  });
});
