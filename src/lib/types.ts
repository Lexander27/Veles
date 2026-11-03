import type { DateStr } from './dates';

/** 'weight': kg × reps. 'bodyweight': reps, with optional added kg. */
export type ExerciseKind = 'weight' | 'bodyweight';

export interface Exercise {
  id: string;
  name: string;
  muscle: string;
  kind: ExerciseKind;
  archived: boolean;
  createdAt: number;
  /** Other names for the same exercise ("also known as"). Used when matching imported notes. */
  aliases?: string[];
  /** Set when the exercise was created by an import (so the import can be undone). */
  importId?: string;
}

export interface WorkSet {
  /** kg. For bodyweight exercises this is added weight (0 = none). */
  weight: number;
  reps: number;
  /** A drop set: continues the set before it at a lower weight, without rest. */
  drop?: boolean;
}

/** One exercise done on one day, with its sets. */
export interface Entry {
  id: string;
  date: DateStr;
  exerciseId: string;
  order: number;
  sets: WorkSet[];
  note?: string;
  /** Set when the entry was added as part of a routine day. */
  sessionId?: string;
  /** Set when the entry came from "Import from notes". */
  importId?: string;
  createdAt: number;
}

/** A record of one notes import, kept so it can be undone. */
export interface ImportRecord {
  id: string;
  at: number;
  days: number;
  entries: number;
  createdExerciseIds: string[];
  addedAliases: Array<{ exerciseId: string; alias: string }>;
}

export interface RoutineDay {
  id: string;
  name: string;
  exerciseIds: string[];
}

/**
 * A repeating plan. `pattern` is the cycle: true = training day, false = rest.
 * Workouts fill the training days in routine order. The plan counts from your
 * last workout, so a missed day moves everything forward.
 */
export interface RoutinePlan {
  pattern: boolean[];
}

export interface Routine {
  id: string;
  name: string;
  days: RoutineDay[];
  plan?: RoutinePlan;
  createdAt: number;
}

/** A routine day done (or planned) on a date. Drives the "next workout" cycle. */
export interface Session {
  id: string;
  date: DateStr;
  routineId: string;
  dayId: string;
  createdAt: number;
}

export interface Meta {
  key: string;
  value: unknown;
}

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Other'] as const;
