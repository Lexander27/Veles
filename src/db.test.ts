import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { VelesDB, deleteAllWorkouts, ensureSeeded, exportBackup, importBackup, mergeExercises, resetEverything, runImport, undoImport } from './db';

describe('database', () => {
  it('seeds the starter exercises only once', async () => {
    const d = new VelesDB('t-seed');
    await ensureSeeded(d);
    const n = await d.exercises.count();
    expect(n).toBeGreaterThan(10);
    await d.exercises.clear();
    await ensureSeeded(d);
    expect(await d.exercises.count()).toBe(0);
  });

  it('round-trips a backup and rejects foreign files', async () => {
    const a = new VelesDB('t-a');
    await ensureSeeded(a);
    const ex = (await a.exercises.toArray())[0];
    await a.entries.add({ id: 'e1', date: '2026-11-03', exerciseId: ex.id, order: 0, sets: [{ weight: 70, reps: 8 }], createdAt: 1 });
    await a.routines.add({ id: 'r1', name: 'PPL', days: [{ id: 'd1', name: 'Push', exerciseIds: [ex.id] }], createdAt: 1 });
    const backup = JSON.parse(JSON.stringify(await exportBackup(a)));

    const b = new VelesDB('t-b');
    await ensureSeeded(b);
    await b.entries.add({ id: 'stale', date: '2020-01-01', exerciseId: 'x', order: 0, sets: [], createdAt: 0 });
    await importBackup(backup, b);
    expect(await b.entries.toArray()).toEqual(await a.entries.toArray());
    expect(await b.routines.count()).toBe(1);
    expect(await b.exercises.count()).toBe(await a.exercises.count());

    await expect(importBackup({ hello: 'world' }, b)).rejects.toThrow('not a Veles backup');
    expect(await b.entries.count()).toBe(1);
  });

  it('merges one exercise into another', async () => {
    const d = new VelesDB('t-merge');
    const base = { muscle: 'Back', kind: 'weight' as const, archived: false, createdAt: 0 };
    await d.exercises.bulkAdd([
      { id: 'main', name: 'Seated cable row', ...base, aliases: ['Cable row'] },
      { id: 'dup', name: 'Lat hori', ...base, aliases: ['Horizontal row'] },
    ]);
    await d.entries.add({ id: 'e1', date: '2026-10-26', exerciseId: 'dup', order: 0, sets: [{ weight: 47.3, reps: 10 }], createdAt: 0 });
    await d.routines.add({ id: 'r', name: 'R', createdAt: 0, days: [{ id: 'x', name: 'Pull', exerciseIds: ['dup', 'main'] }] });
    await mergeExercises('dup', 'main', d);
    expect(await d.exercises.get('dup')).toBeUndefined();
    expect((await d.exercises.get('main'))!.aliases).toEqual(['Cable row', 'Lat hori', 'Horizontal row']);
    expect((await d.entries.get('e1'))!.exerciseId).toBe('main');
    expect((await d.routines.get('r'))!.days[0].exerciseIds).toEqual(['main']);
  });

  it('imports, then undoes an import completely', async () => {
    const d = new VelesDB('t-import');
    await ensureSeeded(d);
    const pulldown = (await d.exercises.toArray()).find((e) => e.name === 'Lat pulldown')!;
    const before = await d.exercises.count();
    const rec = await runImport(
      {
        newExercises: [{ key: 'bicеp', name: 'Bicep pull', muscle: 'Arms', kind: 'weight', aliases: ['Biceps pull'] }],
        addAliases: [{ exerciseId: pulldown.id, alias: 'Lat pull' }],
        entries: [
          { date: '2026-10-26', exercise: { id: pulldown.id }, sets: [{ weight: 50, reps: 10 }] },
          { date: '2026-10-26', exercise: { newKey: 'bicеp' }, sets: [{ weight: 14.75, reps: 10 }], note: 'felt good' },
          { date: '2026-11-01', exercise: { id: pulldown.id }, sets: [{ weight: 52, reps: 8 }] },
        ],
      },
      d,
    );
    expect(rec).toMatchObject({ days: 2, entries: 3 });
    expect(await d.exercises.count()).toBe(before + 1);
    expect((await d.exercises.get(pulldown.id))!.aliases).toEqual(['Lat pull']);
    const day = await d.entries.where('date').equals('2026-10-26').sortBy('order');
    expect(day.map((e) => e.order)).toEqual([0, 1]);
    expect(day[1].note).toBe('felt good');

    await undoImport(rec.id, d);
    expect(await d.entries.count()).toBe(0);
    expect(await d.exercises.count()).toBe(before);
    expect((await d.exercises.get(pulldown.id))!.aliases).toEqual([]);
    expect((await d.meta.get('imports'))!.value).toEqual([]);
  });

  it('deletes all workouts, or resets everything', async () => {
    const d = new VelesDB('t-delete');
    await ensureSeeded(d);
    await d.entries.add({ id: 'e', date: '2026-11-01', exerciseId: 'x', order: 0, sets: [], createdAt: 0 });
    await d.routines.add({ id: 'r', name: 'R', createdAt: 0, days: [] });
    await deleteAllWorkouts(d);
    expect(await d.entries.count()).toBe(0);
    expect(await d.routines.count()).toBe(1);
    await d.exercises.add({ id: 'mine', name: 'My thing', muscle: 'Other', kind: 'weight', archived: false, createdAt: 0 });
    await resetEverything(d);
    expect(await d.routines.count()).toBe(0);
    expect(await d.exercises.get('mine')).toBeUndefined();
    expect(await d.exercises.count()).toBeGreaterThan(10);
  });
});
