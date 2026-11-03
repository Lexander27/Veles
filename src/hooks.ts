import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from './db';
import type { Exercise, Routine } from './lib/types';

export function useExercises(): { list: Exercise[]; byId: Map<string, Exercise>; loaded: boolean } {
  const list = useLiveQuery(() => db.exercises.toArray(), []);
  return useMemo(() => {
    const all = (list ?? []).sort((a, b) => a.name.localeCompare(b.name));
    return { list: all, byId: new Map(all.map((e) => [e.id, e])), loaded: list !== undefined };
  }, [list]);
}

export function useRoutines(): { routines: Routine[]; active: Routine | undefined; loaded: boolean } {
  const routines = useLiveQuery(() => db.routines.orderBy('name').toArray(), []);
  const activeId = useLiveQuery(() => db.meta.get('activeRoutineId').then((m) => (m?.value as string | undefined) ?? null), []);
  return useMemo(() => {
    const list = routines ?? [];
    // With a single routine it is the active one, no setup needed.
    const active = list.find((r) => r.id === activeId) ?? (list.length === 1 ? list[0] : undefined);
    return { routines: list, active, loaded: routines !== undefined && activeId !== undefined };
  }, [routines, activeId]);
}
