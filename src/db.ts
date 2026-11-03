import Dexie, { type EntityTable } from 'dexie';
import type { DateStr } from './lib/dates';
import type { Entry, Exercise, ExerciseKind, Meta, Routine, Session, WorkSet } from './lib/types';

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
