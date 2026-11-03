import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { createExercise, db, mergeAliases, mergeExercises, updateExercise } from '../db';
import { useExercises } from '../hooks';
import { ExerciseForm } from '../components/ExerciseForm';
import { IconBack, IconClose, IconPlus, IconSearch } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { toast } from '../components/Toast';
import { exerciseMatches, nameKey } from '../lib/importNotes';
import { MUSCLE_GROUPS, type Exercise } from '../lib/types';
import { goBack, href, Link } from '../router';

export function ExercisesScreen() {
  const { list, byId } = useExercises();
  const [q, setQ] = useState('');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const shown = list.filter((e) => e.archived === showArchived && exerciseMatches(e, q));
  const order = [...MUSCLE_GROUPS] as string[];
  const groups = order
    .map((m) => ({ title: m, items: shown.filter((e) => (order.includes(e.muscle) ? e.muscle : 'Other') === m) }))
    .filter((g) => g.items.length > 0);
  const archivedCount = list.filter((e) => e.archived).length;
  const editing = editingId && editingId !== 'new' ? byId.get(editingId) : undefined;
  const merging = mergingId ? byId.get(mergingId) : undefined;

  return (
    <div className="screen no-tabs">
      <div className="between" style={{ margin: '0 -8px' }}>
        <button className="icon-btn ghost" aria-label="Back" onClick={() => goBack('#/more')}>
          <IconBack />
        </button>
        <button className="btn soft sm" onClick={() => setEditingId('new')}>
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
              <button key={e.id} className="list-row" style={{ minHeight: 56 }} onClick={() => setEditingId(e.id)}>
                <span className="stack grow" style={{ gap: 1 }}>
                  <span style={{ fontWeight: 500 }}>{e.name}</span>
                  <span className="small muted">
                    {e.kind === 'bodyweight' ? 'Bodyweight reps' : 'Weight × reps'}
                    {e.aliases?.length ? ` · also: ${e.aliases.join(', ')}` : ''}
                  </span>
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

      {editingId === 'new' && (
        <Sheet label="New exercise" onClose={() => setEditingId(null)}>
          <h2 className="h2">New exercise</h2>
          <ExerciseForm
            initial={{ name: q }}
            existingNames={list.map((e) => e.name)}
            submitLabel="Create"
            onCancel={() => setEditingId(null)}
            onSubmit={async (v) => {
              await createExercise(v.name, v.muscle, v.kind);
              toast(`${v.name} created`);
              setEditingId(null);
            }}
          />
        </Sheet>
      )}

      {editing && !merging && (
        <EditSheet exercise={editing} allNames={list.map((e) => e.name)} onClose={() => setEditingId(null)} onMerge={() => setMergingId(editing.id)} />
      )}

      {merging && (
        <MergeSheet
          source={merging}
          onClose={() => setMergingId(null)}
          onDone={() => {
            setMergingId(null);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

function EditSheet({ exercise, allNames, onClose, onMerge }: { exercise: Exercise; allNames: string[]; onClose: () => void; onMerge: () => void }) {
  const [alias, setAlias] = useState('');
  const aliases = exercise.aliases ?? [];

  const addAlias = async () => {
    const next = mergeAliases(exercise, [alias]);
    if (next.length === aliases.length) {
      toast('That name is already used for this exercise');
      return;
    }
    await updateExercise(exercise.id, { aliases: next });
    setAlias('');
  };

  return (
    <Sheet label={`Edit ${exercise.name}`} onClose={onClose}>
      <h2 className="h2">Edit exercise</h2>
      <ExerciseForm
        key={exercise.id}
        initial={exercise}
        existingNames={allNames}
        submitLabel="Save"
        onCancel={onClose}
        onSubmit={async (v) => {
          await updateExercise(exercise.id, { ...v, aliases: aliases.filter((a) => nameKey(a) !== nameKey(v.name)) });
          onClose();
        }}
      />

      <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <span className="label">Also known as</span>
        <span className="small muted" style={{ marginTop: -4 }}>Other names you use for it. Imported notes with these names go into this exercise.</span>
        {aliases.length > 0 && (
          <div className="chips">
            {aliases.map((a) => (
              <span key={a} className="chip" style={{ paddingRight: 4 }}>
                {a}
                <button
                  className="icon-btn ghost"
                  style={{ width: 28, height: 28 }}
                  aria-label={`Remove the name ${a}`}
                  onClick={() => updateExercise(exercise.id, { aliases: aliases.filter((x) => x !== a) })}
                >
                  <IconClose size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (alias.trim()) void addAlias();
          }}
        >
          <label className="grow">
            <span className="sr-only">Add another name</span>
            <input className="input" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Add another name" maxLength={60} />
          </label>
          <button type="submit" className="btn soft" disabled={!alias.trim()}>
            Add
          </button>
        </form>
      </div>

      <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <Link className="btn soft block" to={href('progress', exercise.id)}>
          View progress
        </Link>
        <button className="btn outline block" onClick={onMerge}>
          Merge into another exercise…
        </button>
        <button
          className={`btn ${exercise.archived ? 'outline' : 'danger'} block`}
          onClick={async () => {
            await updateExercise(exercise.id, { archived: !exercise.archived });
            toast(exercise.archived ? `${exercise.name} restored` : `${exercise.name} archived. Its history is kept.`);
            onClose();
          }}
        >
          {exercise.archived ? 'Restore exercise' : 'Archive exercise'}
        </button>
      </div>
    </Sheet>
  );
}

function MergeSheet({ source, onClose, onDone }: { source: Exercise; onClose: () => void; onDone: () => void }) {
  const { list } = useExercises();
  const [q, setQ] = useState('');
  const count = useLiveQuery(() => db.entries.where('exerciseId').equals(source.id).count(), [source.id]);
  const options = list.filter((e) => e.id !== source.id && !e.archived && exerciseMatches(e, q));

  const pick = async (target: Exercise) => {
    const msg =
      `Merge “${source.name}” into “${target.name}”?\n\n` +
      `• ${count ?? 0} logged ${count === 1 ? 'workout moves' : 'workouts move'} to ${target.name}\n` +
      `• “${source.name}” becomes an also-known-as name of ${target.name}\n` +
      `• Routines using ${source.name} will use ${target.name}`;
    if (!confirm(msg)) return;
    await mergeExercises(source.id, target.id);
    toast(`Merged into ${target.name}`);
    onDone();
  };

  return (
    <Sheet label={`Merge ${source.name}`} onClose={onClose}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 className="h2">Merge “{source.name}” into…</h2>
        <span className="small muted">Pick the main exercise to keep. Its name stays; “{source.name}” becomes another name for it.</span>
      </div>
      <label className="search">
        <IconSearch size={18} style={{ color: 'var(--muted)' }} />
        <span className="sr-only">Search exercises</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" type="search" autoFocus />
      </label>
      <div className="list">
        {options.map((e) => (
          <button key={e.id} className="list-row" style={{ minHeight: 52 }} onClick={() => pick(e)}>
            <span className="stack grow" style={{ gap: 1 }}>
              <span style={{ fontWeight: 500 }}>{e.name}</span>
              <span className="small muted">
                {e.muscle}
                {e.aliases?.length ? ` · also: ${e.aliases.join(', ')}` : ''}
              </span>
            </span>
          </button>
        ))}
        {options.length === 0 && <div className="empty">No other exercises match.</div>}
      </div>
      <button className="btn outline block" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
