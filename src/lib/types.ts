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
}

export interface WorkSet {
  /** kg. For bodyweight exercises this is added weight (0 = none). */
  weight: number;
  reps: number;
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
  createdAt: number;
}

export interface RoutineDay {
  id: string;
  name: string;
  exerciseIds: string[];
}

export interface Routine {
  id: string;
  name: string;
  days: RoutineDay[];
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
