import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { addEntry, createExercise, db, startRoutineDay } from '../db';
import { useExercises, useRoutines } from '../hooks';
import { ExerciseForm } from '../components/ExerciseForm';
import { IconClose, IconPlus, IconRepeat, IconSearch } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { toast } from '../components/Toast';
import { formatLong, type DateStr } from '../lib/dates';
import { MUSCLE_GROUPS, type Exercise } from '../lib/types';
import { nextWorkout } from '../lib/routines';
import { exerciseMatches } from '../lib/importNotes';
import { goBack, href, navigate } from '../router';

export function AddSheet({ date }: { date: DateStr }) {
  const { list, byId } = useExercises();
  const { active } = useRoutines();
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const recentIds = useLiveQuery(async () => {
    const latest = await db.entries.orderBy('date').reverse().limit(200).toArray();
    const ids: string[] = [];
    for (const e of latest) if (!ids.includes(e.exerciseId)) ids.push(e.exerciseId);
    return ids.slice(0, 8);
  }, []);

  const visible = list.filter((e) => !e.archived);
  const q = query.trim().toLowerCase();
  const matches = q ? visible.filter((e) => exerciseMatches(e, q)) : visible;
  const groups = useMemo(() => {
    const order = [...MUSCLE_GROUPS] as string[];
    const map = new Map<string, Exercise[]>();
    for (const e of matches) {
      const k = order.includes(e.muscle) ? e.muscle : 'Other';
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return order.filter((k) => map.has(k)).map((k) => ({ title: k, items: map.get(k)! }));
  }, [matches]);

  const pick = async (exerciseId: string) => {
    const entry = await addEntry(date, exerciseId);
    navigate(href('entry', entry.id), { replace: true });
  };

  const next = active && sessions ? nextWorkout(active, sessions, date) : null;

  const addDay = async (dayId: string) => {
    if (!active) return;
    const day = active.days.find((d) => d.id === dayId);
    await startRoutineDay(date, active, dayId);
    toast(`${day?.name ?? 'Routine day'} added`);
    goBack();
  };

  return (
    <Sheet label={`Add exercise to ${formatLong(date)}`} onClose={() => goBack()}>
      <div className="between">
        <div className="stack" style={{ gap: 2 }}>
          <h1 className="h2" style={{ fontSize: 22 }}>{creating ? 'New exercise' : 'Add exercise'}</h1>
          <span className="small muted">to {formatLong(date)}</span>
        </div>
        <button className="icon-btn soft" aria-label="Close" onClick={() => goBack()}>
          <IconClose size={18} />
        </button>
      </div>

      {creating ? (
        <ExerciseForm
          initial={{ name: query }}
          submitLabel="Create and add"
          existingNames={list.map((e) => e.name)}
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => {
            const ex = await createExercise(v.name, v.muscle, v.kind);
            await pick(ex.id);
          }}
        />
      ) : (
        <>
          <label className="search">
            <IconSearch size={18} style={{ color: 'var(--muted)' }} />
            <span className="sr-only">Search exercises</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exercises" type="search" />
          </label>

          {!q && active && active.days.length > 0 && (
            <div className="stack">
              <span className="label">From routine · {active.name}</span>
              <div className="chips">
                {active.days.map((d, i) => (
                  <button
                    key={d.id}
                    className="chip"
                    style={next?.day.id === d.id ? { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 600 } : undefined}
                    onClick={() => addDay(d.id)}
                    disabled={d.exerciseIds.length === 0}
                  >
                    <IconRepeat size={14} />
                    {i + 1}. {d.name}
                    {next?.day.id === d.id ? ' (next)' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!q && recentIds && recentIds.length > 0 && (
            <div className="stack">
              <span className="label">Recent</span>
              <div className="chips">
                {recentIds.map((id) => byId.get(id)).filter((e): e is Exercise => !!e && !e.archived).map((e) => (
                  <button key={e.id} className="chip" onClick={() => pick(e.id)}>
                    {e.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="list">
            {groups.map((g) => (
              <div key={g.title} className="list">
                <span className="label" style={{ padding: '12px 0 2px' }}>{g.title}</span>
                {g.items.map((e) => (
                  <div key={e.id} className="list-row" style={{ minHeight: 56, padding: 0 }}>
                    <button
                      className="grow stack"
                      style={{ gap: 1, border: 'none', background: 'transparent', textAlign: 'left', padding: '8px 0' }}
                      onClick={() => pick(e.id)}
                    >
                      <span style={{ fontSize: 16, fontWeight: 500 }}>{e.name}</span>
                      <span className="small muted">{e.kind === 'bodyweight' ? 'Bodyweight reps' : 'Weight × reps'}</span>
                    </button>
                    <button className="icon-btn soft" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }} aria-label={`Add ${e.name}`} onClick={() => pick(e.id)}>
                      <IconPlus size={18} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {groups.length === 0 && <div className="empty">No exercise called “{query.trim()}” yet.</div>}
          </div>

          <button className="btn outline block" onClick={() => setCreating(true)}>
            <IconPlus size={18} />
            {q ? `Create “${query.trim()}”` : 'Create new exercise'}
          </button>
        </>
      )}
    </Sheet>
  );
}
