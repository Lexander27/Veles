import Dexie, { type EntityTable } from 'dexie';
import type { DateStr } from './lib/dates';
import { nameKey } from './lib/importNotes';
import type { Entry, Exercise, ExerciseKind, ImportRecord, Meta, Routine, Session, WorkSet } from './lib/types';

export class VelesDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>;
  entries!: EntityTable<Entry, 'id'>;
  routines!: EntityTable<Routine, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor(name = 'veles') {
    super(name);
    this.version(1).stores({
      exercises: 'id, name, muscle, archived',
      entries: 'id, date, exerciseId, sessionId, [exerciseId+date]',
      routines: 'id, name',
      sessions: 'id, date, routineId',
      meta: 'key',
    });
    // v2: track which entries/exercises came from a notes import.
    this.version(2).stores({
      exercises: 'id, name, muscle, archived, importId',
      entries: 'id, date, exerciseId, sessionId, importId, [exerciseId+date]',
    });
  }
}

export const db = new VelesDB();

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------- first run ----------

const STARTER: Array<[string, string, ExerciseKind]> = [
  ['Bench press', 'Chest', 'weight'],
  ['Incline bench press', 'Chest', 'weight'],
  ['Incline dumbbell press', 'Chest', 'weight'],
  ['Dumbbell fly', 'Chest', 'weight'],
  ['Dips', 'Chest', 'bodyweight'],
  ['Deadlift', 'Back', 'weight'],
  ['Barbell row', 'Back', 'weight'],
  ['Pull-up', 'Back', 'bodyweight'],
  ['Lat pulldown', 'Back', 'weight'],
  ['Seated cable row', 'Back', 'weight'],
  ['Squat', 'Legs', 'weight'],
  ['Romanian deadlift', 'Legs', 'weight'],
  ['Leg press', 'Legs', 'weight'],
  ['Leg curl', 'Legs', 'weight'],
  ['Leg extension', 'Legs', 'weight'],
  ['Calf raise', 'Legs', 'weight'],
  ['Overhead press', 'Shoulders', 'weight'],
  ['Lateral raise', 'Shoulders', 'weight'],
  ['Face pull', 'Shoulders', 'weight'],
  ['Barbell curl', 'Arms', 'weight'],
  ['Dumbbell curl', 'Arms', 'weight'],
  ['Triceps pushdown', 'Arms', 'weight'],
  ['Skull crusher', 'Arms', 'weight'],
  ['Hanging leg raise', 'Core', 'bodyweight'],
];

export async function ensureSeeded(database: VelesDB = db): Promise<void> {
  await database.transaction('rw', database.exercises, database.meta, async () => {
    const seeded = await database.meta.get('seeded');
    if (seeded) return;
    if ((await database.exercises.count()) === 0) {
      const now = Date.now();
      await database.exercises.bulkAdd(
        STARTER.map(([name, muscle, kind], i) => ({ id: newId(), name, muscle, kind, archived: false, createdAt: now + i })),
      );
    }
    await database.meta.put({ key: 'seeded', value: true });
  });
}

// ---------- exercises ----------

export async function createExercise(name: string, muscle: string, kind: ExerciseKind): Promise<Exercise> {
  const ex: Exercise = { id: newId(), name: name.trim(), muscle, kind, archived: false, createdAt: Date.now() };
  await db.exercises.add(ex);
  return ex;
}

export async function updateExercise(id: string, changes: Partial<Omit<Exercise, 'id'>>): Promise<void> {
  await db.exercises.update(id, changes);
}

// ---------- entries ----------

async function nextOrder(date: DateStr): Promise<number> {
  const list = await db.entries.where('date').equals(date).toArray();
  return list.reduce((m, e) => Math.max(m, e.order), -1) + 1;
}

export async function addEntry(date: DateStr, exerciseId: string, sessionId?: string): Promise<Entry> {
  const entry: Entry = {
    id: newId(),
    date,
    exerciseId,
    order: await nextOrder(date),
    sets: [],
    sessionId,
    createdAt: Date.now(),
  };
  await db.entries.add(entry);
  return entry;
}

export async function updateSets(entryId: string, sets: WorkSet[]): Promise<void> {
  await db.entries.update(entryId, { sets });
}

export async function updateNote(entryId: string, note: string): Promise<void> {
  await db.entries.update(entryId, { note });
}

/** Deletes an entry; a routine session left with no entries is removed too, so the cycle stays honest. */
export async function deleteEntry(entryId: string): Promise<void> {
  await db.transaction('rw', db.entries, db.sessions, async () => {
    const entry = await db.entries.get(entryId);
    if (!entry) return;
    await db.entries.delete(entryId);
    if (entry.sessionId) {
      const left = await db.entries.where('sessionId').equals(entry.sessionId).count();
      if (left === 0) await db.sessions.delete(entry.sessionId);
    }
  });
}

/** Most recent earlier entry of the same exercise that has sets. */
export async function previousEntry(exerciseId: string, beforeDate: DateStr, excludeId?: string): Promise<Entry | undefined> {
  const list = await db.entries
    .where('[exerciseId+date]')
    .between([exerciseId, Dexie.minKey], [exerciseId, beforeDate], true, false)
    .toArray();
  return list
    .filter((e) => e.id !== excludeId && e.sets.some((s) => s.reps > 0))
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.createdAt - a.createdAt))[0];
}

// ---------- routines ----------

export async function saveRoutine(routine: Routine): Promise<void> {
  await db.routines.put(routine);
}

export async function deleteRoutine(id: string): Promise<void> {
  await db.transaction('rw', db.routines, db.sessions, db.entries, db.meta, async () => {
    await db.routines.delete(id);
    const sessions = await db.sessions.where('routineId').equals(id).toArray();
    for (const s of sessions) {
      // Keep the logged exercises, just detach them from the routine.
      await db.entries.where('sessionId').equals(s.id).modify({ sessionId: undefined });
    }
    await db.sessions.where('routineId').equals(id).delete();
    const active = await db.meta.get('activeRoutineId');
    if (active?.value === id) await db.meta.delete('activeRoutineId');
  });
}

/** "My next workout is X" — the suggestion and the plan continue from it. */
export async function setNextWorkout(routineId: string, dayId: string, date: DateStr): Promise<void> {
  await db.routines.update(routineId, { next: { dayId, date, setAt: Date.now() } });
}

export async function setActiveRoutine(id: string | null): Promise<void> {
  if (id === null) await db.meta.delete('activeRoutineId');
  else await db.meta.put({ key: 'activeRoutineId', value: id });
}

/** Adds every exercise of a routine day to a date, as one session. */
export async function startRoutineDay(date: DateStr, routine: Routine, dayId: string): Promise<Session> {
  const day = routine.days.find((d) => d.id === dayId);
  if (!day) throw new Error('Routine day not found');
  return db.transaction('rw', db.sessions, db.entries, db.exercises, async () => {
    const session: Session = { id: newId(), date, routineId: routine.id, dayId, createdAt: Date.now() };
    await db.sessions.add(session);
    let order = await nextOrder(date);
    for (const exerciseId of day.exerciseIds) {
      const ex = await db.exercises.get(exerciseId);
      if (!ex || ex.archived) continue;
      await db.entries.add({ id: newId(), date, exerciseId, order: order++, sets: [], sessionId: session.id, createdAt: Date.now() });
    }
    return session;
  });
}

// ---------- merging & aliases ----------

/**
 * Folds `sourceId` into `targetId`: its history moves over, routines point at
 * the target, and its names become the target's "also known as" names.
 */
export async function mergeExercises(sourceId: string, targetId: string, database: VelesDB = db): Promise<void> {
  if (sourceId === targetId) return;
  await database.transaction('rw', database.exercises, database.entries, database.routines, async () => {
    const [source, target] = await Promise.all([database.exercises.get(sourceId), database.exercises.get(targetId)]);
    if (!source || !target) throw new Error('Exercise not found');
    await database.entries.where('exerciseId').equals(sourceId).modify({ exerciseId: targetId });
    const routines = await database.routines.toArray();
    for (const r of routines) {
      if (!r.days.some((d) => d.exerciseIds.includes(sourceId))) continue;
      r.days = r.days.map((d) => ({ ...d, exerciseIds: [...new Set(d.exerciseIds.map((id) => (id === sourceId ? targetId : id)))] }));
      await database.routines.put(r);
    }
    const aliases = mergeAliases(target, [source.name, ...(source.aliases ?? [])]);
    await database.exercises.update(targetId, { aliases });
    await database.exercises.delete(sourceId);
  });
}

/** Target's aliases plus new names, without duplicates of each other or of the main name. */
export function mergeAliases(target: Pick<Exercise, 'name' | 'aliases'>, names: string[]): string[] {
  const seen = new Set([nameKey(target.name)]);
  const out: string[] = [];
  for (const n of [...(target.aliases ?? []), ...names]) {
    const k = nameKey(n);
    if (!n.trim() || seen.has(k)) continue;
    seen.add(k);
    out.push(n.trim());
  }
  return out;
}

// ---------- import from notes ----------

export interface ImportPlan {
  newExercises: Array<{ key: string; name: string; muscle: string; kind: ExerciseKind; aliases: string[] }>;
  addAliases: Array<{ exerciseId: string; alias: string }>;
  entries: Array<{ date: DateStr; exercise: { id: string } | { newKey: string }; sets: WorkSet[]; note?: string }>;
}

export async function runImport(plan: ImportPlan, database: VelesDB = db): Promise<ImportRecord> {
  const importId = newId();
  return database.transaction('rw', database.exercises, database.entries, database.meta, async () => {
    const now = Date.now();
    const created = new Map<string, string>();
    for (const [i, n] of plan.newExercises.entries()) {
      const id = newId();
      created.set(n.key, id);
      await database.exercises.add({ id, name: n.name, muscle: n.muscle, kind: n.kind, archived: false, createdAt: now + i, aliases: n.aliases, importId });
    }
    const addedAliases: ImportRecord['addedAliases'] = [];
    for (const a of plan.addAliases) {
      const ex = await database.exercises.get(a.exerciseId);
      if (!ex) continue;
      const aliases = mergeAliases(ex, [a.alias]);
      if (aliases.length > (ex.aliases ?? []).length) {
        await database.exercises.update(ex.id, { aliases });
        addedAliases.push(a);
      }
    }
    const orderByDate = new Map<DateStr, number>();
    let n = 0;
    for (const e of plan.entries) {
      const exerciseId = 'id' in e.exercise ? e.exercise.id : created.get(e.exercise.newKey);
      if (!exerciseId) continue;
      if (!orderByDate.has(e.date)) {
        const existing = await database.entries.where('date').equals(e.date).toArray();
        orderByDate.set(e.date, existing.reduce((m, x) => Math.max(m, x.order), -1) + 1);
      }
      const order = orderByDate.get(e.date)!;
      orderByDate.set(e.date, order + 1);
      await database.entries.add({ id: newId(), date: e.date, exerciseId, order, sets: e.sets, note: e.note, importId, createdAt: now + n++ });
    }
    const record: ImportRecord = {
      id: importId,
      at: now,
      days: new Set(plan.entries.map((e) => e.date)).size,
      entries: n,
      createdExerciseIds: [...created.values()],
      addedAliases,
    };
    const list = ((await database.meta.get('imports'))?.value as ImportRecord[] | undefined) ?? [];
    await database.meta.put({ key: 'imports', value: [record, ...list] });
    return record;
  });
}

/** Removes everything an import added. Exercises it created are kept only if you've used them since. */
export async function undoImport(importId: string, database: VelesDB = db): Promise<void> {
  await database.transaction('rw', database.exercises, database.entries, database.routines, database.meta, async () => {
    const list = ((await database.meta.get('imports'))?.value as ImportRecord[] | undefined) ?? [];
    const record = list.find((r) => r.id === importId);
    await database.entries.where('importId').equals(importId).delete();
    const routines = await database.routines.toArray();
    const inRoutine = new Set(routines.flatMap((r) => r.days.flatMap((d) => d.exerciseIds)));
    for (const ex of await database.exercises.where('importId').equals(importId).toArray()) {
      const used = (await database.entries.where('exerciseId').equals(ex.id).count()) > 0 || inRoutine.has(ex.id);
      if (!used) await database.exercises.delete(ex.id);
    }
    for (const a of record?.addedAliases ?? []) {
      const ex = await database.exercises.get(a.exerciseId);
      if (ex?.aliases) await database.exercises.update(ex.id, { aliases: ex.aliases.filter((x) => x !== a.alias) });
    }
    await database.meta.put({ key: 'imports', value: list.filter((r) => r.id !== importId) });
  });
}

// ---------- deleting ----------

/** Deletes every logged workout (and routine progress). Exercises and routines stay. */
export async function deleteAllWorkouts(database: VelesDB = db): Promise<void> {
  await database.transaction('rw', database.entries, database.sessions, database.meta, async () => {
    await database.entries.clear();
    await database.sessions.clear();
    await database.meta.delete('imports');
  });
}

/** Back to a fresh install: everything deleted, starter exercises restored. */
export async function resetEverything(database: VelesDB = db): Promise<void> {
  await database.transaction('rw', [database.exercises, database.entries, database.routines, database.sessions, database.meta], async () => {
    await Promise.all([database.exercises.clear(), database.entries.clear(), database.routines.clear(), database.sessions.clear(), database.meta.clear()]);
  });
  await ensureSeeded(database);
}

// ---------- backup ----------

export interface Backup {
  app: 'veles';
  version: 1;
  exportedAt: string;
  exercises: Exercise[];
  entries: Entry[];
  routines: Routine[];
  sessions: Session[];
  meta: Meta[];
}

export async function exportBackup(database: VelesDB = db): Promise<Backup> {
  return {
    app: 'veles',
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: await database.exercises.toArray(),
    entries: await database.entries.toArray(),
    routines: await database.routines.toArray(),
    sessions: await database.sessions.toArray(),
    meta: await database.meta.toArray(),
  };
}

export function isBackup(data: unknown): data is Backup {
  const d = data as Partial<Backup> | null;
  return (
    !!d &&
    d.app === 'veles' &&
    d.version === 1 &&
    Array.isArray(d.exercises) &&
    Array.isArray(d.entries) &&
    Array.isArray(d.routines) &&
    Array.isArray(d.sessions) &&
    Array.isArray(d.meta)
  );
}

/** Replaces everything on this device with the backup. */
export async function importBackup(data: unknown, database: VelesDB = db): Promise<void> {
  if (!isBackup(data)) throw new Error('This file is not a Veles backup.');
  await database.transaction('rw', [database.exercises, database.entries, database.routines, database.sessions, database.meta], async () => {
    await Promise.all([database.exercises.clear(), database.entries.clear(), database.routines.clear(), database.sessions.clear(), database.meta.clear()]);
    await database.exercises.bulkAdd(data.exercises);
    await database.entries.bulkAdd(data.entries);
    await database.routines.bulkAdd(data.routines);
    await database.sessions.bulkAdd(data.sessions);
    await database.meta.bulkAdd(data.meta);
    if (!data.meta.some((m) => m.key === 'seeded')) await database.meta.put({ key: 'seeded', value: true });
  });
}
