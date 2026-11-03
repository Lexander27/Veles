import { describe, expect, it } from 'vitest';
import { guessMuscle, nameIndex, nameKey, parseExerciseLine, parseNotes } from './importNotes';
import type { Exercise } from './types';

const USER_NOTES = `26/10/2026
Lat pulldown 25x12 47.5x10 50x10 50x10
Lat hori 47.3x10 48.4x10 48.4x10
Lat row 33.1x10 34.3x10 34.3x10

Bicep pull 6.8x10 14.75x10 14.75x10 14.75x10
Decline bicep 7x10 7x10 8x10

28/10/2026
Cable lat 2.3x10 4.5x10 4.5x10 5.75x10
Rear delt cable 5.75x15 6.8x10 6.8x10
Shoulder press 23x10 23x10 25.3x10

Decline situp 5x12 5x12 6x10
Hyperextension 17.5x12 17.5x12 20x10

30/10/2026
Supine press 4.5x12 24.5x10 24.5x10 24.5x8
Decline Bench 25x10 30x10 35x7
Pec fly 47.3x10 47.3x10 52x7

Tricep extension 9x12 21.55x10 22.5x10 22.5x9
Dip assist 23x10 23x10 23x7

1/11/2026
Lat pulldown 25x12 50x10 50x10 52x8
Lat hori 48.4x10 48.4x10 48.4x10
Lat row 34.3x10 34.3x10 34.3x10

Bicep pull 6.8x10 14.75x10 14.75x10 15.8x10
Decline bicep 8x10 8x9 8x9`;

describe('parseNotes', () => {
  it('reads the user’s notes exactly', () => {
    const { days, orphanLines } = parseNotes(USER_NOTES);
    expect(orphanLines).toEqual([]);
    expect(days.map((d) => d.date)).toEqual(['2026-10-26', '2026-10-28', '2026-10-30', '2026-11-01']);
    expect(days.map((d) => d.lines.length)).toEqual([5, 5, 5, 5]);
    expect(days.every((d) => d.reasons.length === 0)).toBe(true);
    expect(days[0].lines[0]).toMatchObject({
      name: 'Lat pulldown',
      sets: [
        { weight: 25, reps: 12 },
        { weight: 47.5, reps: 10 },
        { weight: 50, reps: 10 },
        { weight: 50, reps: 10 },
      ],
    });
    expect(days[2].lines[3].sets[1]).toEqual({ weight: 21.55, reps: 10 });
    expect(days[3].lines[4]).toMatchObject({ name: 'Decline bicep', sets: [{ weight: 8, reps: 10 }, { weight: 8, reps: 9 }, { weight: 8, reps: 9 }] });
  });

  it('flags notes in parentheses and lines it cannot read, like a run', () => {
    const { days } = parseNotes(`2/11/2026 (gym was packed)
Squat 100x5 (felt heavy) 100x5
Run 5km 25min

3.11.26
(rest day, just a walk)

4/11/2026
Bench 60 x 8, 62,5kg×6`);
    expect(days[0].notes).toEqual(['gym was packed']);
    expect(days[0].lines[0]).toMatchObject({ name: 'Squat', sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }], notes: ['felt heavy'] });
    expect(days[0].lines[1].problem).toMatch(/No sets/);
    expect(days[0].reasons).toEqual(['Has a note', '1 line couldn’t be read']);
    expect(days[1].date).toBe('2026-11-03');
    expect(days[1].reasons).toContain('No sets found');
    expect(days[2].lines[0].sets).toEqual([{ weight: 60, reps: 8 }, { weight: 62.5, reps: 6 }]);
    expect(days[2].reasons).toEqual([]);
  });

  it('handles odd input', () => {
    expect(parseNotes('just text\n31/02/2026\nSquat 100x5').days[0].reasons[0]).toMatch(/not a valid date/);
    expect(parseNotes('just text').orphanLines).toEqual(['just text']);
    expect(parseExerciseLine('Pull-up BWx8 bwx6').sets).toEqual([{ weight: 0, reps: 8 }, { weight: 0, reps: 6 }]);
  });
});

describe('name matching', () => {
  it('treats spacing, case, hyphens and plurals as the same name', () => {
    expect(nameKey('Lat Pull-down')).toBe(nameKey('lat pulldowns'));
    expect(nameKey('Bicep curl')).toBe(nameKey('Biceps curls'));
    expect(nameKey('Lat row')).not.toBe(nameKey('Lat hori'));
  });

  it('matches "also known as" names', () => {
    const ex: Exercise[] = [
      { id: 'a', name: 'Lat pulldown', muscle: 'Back', kind: 'weight', archived: false, createdAt: 0 },
      { id: 'b', name: 'Seated cable row', muscle: 'Back', kind: 'weight', archived: false, createdAt: 0, aliases: ['Lat hori'] },
    ];
    const idx = nameIndex(ex);
    expect(idx.get(nameKey('lat pulldown'))).toBe('a');
    expect(idx.get(nameKey('Lat Hori'))).toBe('b');
  });

  it('guesses muscle groups', () => {
    expect(guessMuscle('Bicep pull')).toBe('Arms');
    expect(guessMuscle('Rear delt cable')).toBe('Shoulders');
    expect(guessMuscle('Cable lat')).toBe('Back');
    expect(guessMuscle('Decline situp')).toBe('Core');
    expect(guessMuscle('Hanging leg raise')).toBe('Core');
    expect(guessMuscle('Pec fly')).toBe('Chest');
    expect(guessMuscle('Something odd')).toBe('Other');
  });
});

describe('drop sets', () => {
  it('reads "9x5drop6.8x3" as a set followed by a drop set', () => {
    const l = parseExerciseLine('Bicep pull 6.8x10 9x5drop6.8x3 9x7drop6.8x2');
    expect(l.name).toBe('Bicep pull');
    expect(l.problem).toBeUndefined();
    expect(l.sets).toEqual([
      { weight: 6.8, reps: 10 },
      { weight: 9, reps: 5 },
      { weight: 6.8, reps: 3, drop: true },
      { weight: 9, reps: 7 },
      { weight: 6.8, reps: 2, drop: true },
    ]);
  });

  it('handles spaces, chains and capitals, and keeps "drop" in names', () => {
    expect(parseExerciseLine('Curl 10x8 DROP 8x6 drop 6x5').sets.map((s) => !!s.drop)).toEqual([false, true, true]);
    expect(parseExerciseLine('Drop curl 10x8').name).toBe('Drop curl');
    expect(parseExerciseLine('Curl 10x8 drop').problem).toMatch(/drop/);
  });
});
