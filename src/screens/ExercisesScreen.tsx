import { useState } from 'react';
import { createExercise, updateExercise } from '../db';
import { useExercises } from '../hooks';
import { ExerciseForm } from '../components/ExerciseForm';
import { IconBack, IconPlus, IconSearch } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { toast } from '../components/Toast';
import { MUSCLE_GROUPS, type Exercise } from '../lib/types';
import { goBack, href, Link } from '../router';

export function ExercisesScreen() {
  const { list } = useExercises();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const query = q.trim().toLowerCase();
  const shown = list.filter((e) => e.archived === showArchived && (!query || e.name.toLowerCase().includes(query) || e.muscle.toLowerCase().includes(query)));
  const order = [...MUSCLE_GROUPS] as string[];
  const groups = order
    .map((m) => ({ title: m, items: shown.filter((e) => (order.includes(e.muscle) ? e.muscle : 'Other') === m) }))
    .filter((g) => g.items.length > 0);
  const archivedCount = list.filter((e) => e.archived).length;

  return (
    <div className="screen no-tabs">
      <div className="between" style={{ margin: '0 -8px' }}>
        <button className="icon-btn ghost" aria-label="Back" onClick={() => goBack('#/more')}>
          <IconBack />
        </button>
        <button className="btn soft sm" onClick={() => setEditing('new')}>
          <IconPlus size={16} /> New exercise
        </button>
      </div>
      <h1 className="h1">{showArchived ? 'Archived exercises' : 'Exercises'}</h1>

      <label className="search">
        <IconSearch size={18} style={{ color: 'var(--muted)' }} />
        <span className="sr-only">Search exercises</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" type="search" />
      </label>

      <div className="list">
        {groups.map((g) => (
          <div key={g.title} className="list">
            <span className="label" style={{ padding: '12px 0 2px' }}>{g.title}</span>
            {g.items.map((e) => (
              <button key={e.id} className="list-row" style={{ minHeight: 56 }} onClick={() => setEditing(e)}>
                <span className="stack grow" style={{ gap: 1 }}>
                  <span style={{ fontWeight: 500 }}>{e.name}</span>
                  <span className="small muted">{e.kind === 'bodyweight' ? 'Bodyweight reps' : 'Weight × reps'}</span>
                </span>
                <span className="small" style={{ color: 'var(--accent)', fontWeight: 600 }}>Edit</span>
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 && <div className="empty">{showArchived ? 'Nothing archived.' : 'No exercises found.'}</div>}
      </div>

      {(archivedCount > 0 || showArchived) && (
        <button className="btn plain" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Show active exercises' : `Show archived (${archivedCount})`}
        </button>
      )}

      {editing && (
        <Sheet label={editing === 'new' ? 'New exercise' : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <h2 className="h2">{editing === 'new' ? 'New exercise' : 'Edit exercise'}</h2>
          <ExerciseForm
            initial={editing === 'new' ? { name: q } : editing}
            existingNames={list.map((e) => e.name)}
            submitLabel={editing === 'new' ? 'Create' : 'Save'}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              if (editing === 'new') {
                await createExercise(v.name, v.muscle, v.kind);
                toast(`${v.name} created`);
              } else {
                await updateExercise(editing.id, v);
              }
              setEditing(null);
            }}
          />
          {editing !== 'new' && (
            <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <Link className="btn soft block" to={href('progress', editing.id)}>
                View progress
              </Link>
              <button
                className={`btn ${editing.archived ? 'outline' : 'danger'} block`}
                onClick={async () => {
                  await updateExercise(editing.id, { archived: !editing.archived });
                  toast(editing.archived ? `${editing.name} restored` : `${editing.name} archived. Its history is kept.`);
                  setEditing(null);
                }}
              >
                {editing.archived ? 'Restore exercise' : 'Archive exercise'}
              </button>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
