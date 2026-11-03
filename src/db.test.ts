import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { VelesDB, ensureSeeded, exportBackup, importBackup } from './db';

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
});
