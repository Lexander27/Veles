import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, deleteRoutine, newId, saveRoutine, setActiveRoutine } from '../db';
import { useExercises, useRoutines } from '../hooks';
import { IconBack, IconCheck, IconClose, IconDown, IconPlus, IconSearch, IconTrash, IconUp } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { toast } from '../components/Toast';
import { exerciseMatches } from '../lib/importNotes';
import type { Routine, RoutineDay } from '../lib/types';
import { goBack, Link } from '../router';

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export function RoutineEditScreen({ id }: { id: string }) {
  const routine = useLiveQuery(() => db.routines.get(id).then((r) => r ?? null), [id]);
  if (routine === undefined) return <div className="screen no-tabs" />;
  if (routine === null) {
    return (
      <div className="screen no-tabs">
        <div className="empty">
          This routine no longer exists.
          <Link className="btn outline" to="#/routines">Back to routines</Link>
        </div>
      </div>
    );
  }
  return <Editor key={routine.id} initial={routine} />;
}

function Editor({ initial }: { initial: Routine }) {
  const [r, setR] = useState(initial);
  const { active, routines } = useRoutines();
  const { byId } = useExercises();
  const [pickerDay, setPickerDay] = useState<string | null>(null);

  const update = (next: Routine) => {
    setR(next);
    void saveRoutine(next);
  };
  const updateDay = (dayId: string, patch: Partial<RoutineDay>) =>
    update({ ...r, days: r.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)) });

  const isActive = active?.id === r.id;

  const onDelete = async () => {
    if (!confirm(`Delete the routine “${r.name}”? Logged workouts stay in your calendar.`)) return;
    await deleteRoutine(r.id);
    toast('Routine deleted');
    goBack('#/routines');
  };

  return (
    <div className="screen no-tabs" style={{ gap: 18 }}>
      <div className="between" style={{ margin: '0 -8px' }}>
        <button className="icon-btn ghost" aria-label="Back" onClick={() => goBack('#/routines')}>
          <IconBack />
        </button>
        <span className="small muted">Edit routine</span>
        <button className="icon-btn ghost" aria-label="Delete routine" onClick={onDelete}>
          <IconTrash size={20} />
        </button>
      </div>

      <label className="field">
        <span>Routine name</span>
        <input className="input" value={r.name} maxLength={40} onChange={(e) => update({ ...r, name: e.target.value })} onBlur={() => !r.name.trim() && update({ ...r, name: 'Routine' })} />
      </label>

      {routines.length > 1 && (
        <button className={`btn ${isActive ? 'soft' : 'outline'} block`} onClick={() => setActiveRoutine(isActive ? null : r.id)}>
          {isActive ? (
            <>
              <IconCheck size={18} /> Used for “Next workout”
            </>
          ) : (
            'Use this routine for “Next workout”'
          )}
        </button>
      )}

      <div className="stack" style={{ gap: 12 }}>
        <span className="label">Days in the cycle</span>
        {r.days.map((d, i) => (
          <div key={d.id} className="card" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--accent)', width: 22 }}>{i + 1}</span>
              <label className="grow">
                <span className="sr-only">Day {i + 1} name</span>
                <input className="input" value={d.name} maxLength={30} onChange={(e) => updateDay(d.id, { name: e.target.value })} style={{ fontWeight: 600 }} />
              </label>
              <button className="icon-btn ghost" aria-label={`Move day ${i + 1} up`} disabled={i === 0} style={{ opacity: i === 0 ? 0.3 : 1 }} onClick={() => update({ ...r, days: move(r.days, i, -1) })}>
                <IconUp size={18} />
              </button>
              <button className="icon-btn ghost" aria-label={`Move day ${i + 1} down`} disabled={i === r.days.length - 1} style={{ opacity: i === r.days.length - 1 ? 0.3 : 1 }} onClick={() => update({ ...r, days: move(r.days, i, 1) })}>
                <IconDown size={18} />
              </button>
            </div>

            <div className="list">
              {d.exerciseIds.length === 0 && <span className="small muted" style={{ padding: '4px 0' }}>No exercises yet.</span>}
              {d.exerciseIds.map((exId, j) => (
                <div key={exId} className="row" style={{ gap: 4, minHeight: 44, borderBottom: '1px solid var(--line-soft)' }}>
                  <span className="grow" style={{ fontSize: 15, fontWeight: 500 }}>{byId.get(exId)?.name ?? 'Deleted exercise'}</span>
                  <button className="icon-btn ghost" aria-label="Move up" disabled={j === 0} style={{ opacity: j === 0 ? 0.3 : 1 }} onClick={() => updateDay(d.id, { exerciseIds: move(d.exerciseIds, j, -1) })}>
                    <IconUp size={16} />
                  </button>
                  <button className="icon-btn ghost" aria-label="Move down" disabled={j === d.exerciseIds.length - 1} style={{ opacity: j === d.exerciseIds.length - 1 ? 0.3 : 1 }} onClick={() => updateDay(d.id, { exerciseIds: move(d.exerciseIds, j, 1) })}>
                    <IconDown size={16} />
                  </button>
                  <button className="icon-btn ghost" aria-label={`Remove ${byId.get(exId)?.name ?? 'exercise'}`} onClick={() => updateDay(d.id, { exerciseIds: d.exerciseIds.filter((x) => x !== exId) })}>
                    <IconClose size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="between">
              <button className="btn plain sm" onClick={() => setPickerDay(d.id)}>
                <IconPlus size={16} /> Exercises
              </button>
              {r.days.length > 1 && (
                <button
                  className="btn plain sm"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => confirm(`Remove “${d.name}” from the cycle?`) && update({ ...r, days: r.days.filter((x) => x.id !== d.id) })}
                >
                  Remove day
                </button>
              )}
            </div>
          </div>
        ))}
        <button className="btn outline block" onClick={() => update({ ...r, days: [...r.days, { id: newId(), name: `Day ${r.days.length + 1}`, exerciseIds: [] }] })}>
          <IconPlus size={18} /> Add day
        </button>
      </div>

      <button className="btn primary block" style={{ height: 56 }} onClick={() => goBack('#/routines')}>
        Done
      </button>

      {pickerDay && (
        <ExercisePicker
          selected={r.days.find((d) => d.id === pickerDay)?.exerciseIds ?? []}
          onClose={() => setPickerDay(null)}
          onChange={(ids) => updateDay(pickerDay, { exerciseIds: ids })}
        />
      )}
    </div>
  );
}

function ExercisePicker({ selected, onChange, onClose }: { selected: string[]; onChange: (ids: string[]) => void; onClose: () => void }) {
  const { list } = useExercises();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const shown = list.filter((e) => !e.archived && exerciseMatches(e, query));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <Sheet label="Choose exercises" onClose={onClose}>
      <div className="between">
        <h2 className="h2">Choose exercises</h2>
        <button className="btn primary sm" onClick={onClose}>
          Done ({selected.length})
        </button>
      </div>
      <label className="search">
        <IconSearch size={18} style={{ color: 'var(--muted)' }} />
        <span className="sr-only">Search exercises</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" type="search" />
      </label>
      <div className="list">
        {shown.map((e) => {
          const on = selected.includes(e.id);
          return (
            <button key={e.id} className="list-row" style={{ minHeight: 52 }} aria-pressed={on} onClick={() => toggle(e.id)}>
              <span className="grow stack" style={{ gap: 1 }}>
                <span style={{ fontWeight: 500 }}>{e.name}</span>
                <span className="small muted">{e.muscle}</span>
              </span>
              <span
                style={{
                  width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: on ? 'var(--accent)' : 'transparent', border: on ? 'none' : '2px solid #c9cdd4', color: '#fff',
                }}
              >
                {on && <IconCheck size={16} />}
              </span>
            </button>
          );
        })}
        {shown.length === 0 && <div className="empty">No matches. Create exercises in More → Exercises.</div>}
      </div>
    </Sheet>
  );
}
