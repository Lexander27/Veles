import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, deleteEntry, updateNote, updateSets } from '../db';
import { IconBack, IconChart, IconClock, IconCopy, IconPlus, IconStar, IconTrash } from '../components/Icons';
import { toast } from '../components/Toast';
import { formatLong, formatShort } from '../lib/dates';
import { estimate1RM, formatNumber, formatSet, parseNumberInput, setMetric, summarizeSets, validSets } from '../lib/metrics';
import type { Entry, Exercise, WorkSet } from '../lib/types';
import { goBack, href, Link } from '../router';

interface Row {
  weight: string;
  reps: string;
}

const toRows = (sets: WorkSet[]): Row[] =>
  sets.map((s) => ({ weight: s.weight ? String(s.weight) : '', reps: s.reps ? String(s.reps) : '' }));

function toSets(rows: Row[]): WorkSet[] {
  return rows.map((r) => {
    const w = parseNumberInput(r.weight);
    const reps = parseNumberInput(r.reps);
    return { weight: Number.isFinite(w) && w > 0 ? w : 0, reps: Number.isFinite(reps) && reps > 0 ? Math.round(reps) : 0 };
  });
}

export function EntryScreen({ id }: { id: string }) {
  const entry = useLiveQuery(() => db.entries.get(id), [id]);
  const exercise = useLiveQuery(() => (entry ? db.exercises.get(entry.exerciseId) : undefined), [entry?.exerciseId]);

  if (entry === undefined) return <div className="screen no-tabs" />;
  if (!entry || !exercise) {
    return (
      <div className="screen no-tabs">
        <div className="empty">
          This entry no longer exists.
          <Link className="btn outline" to="#/">Back to calendar</Link>
        </div>
      </div>
    );
  }
  return <EntryEditor key={entry.id} entry={entry} exercise={exercise} />;
}

function EntryEditor({ entry, exercise }: { entry: Entry; exercise: Exercise }) {
  const [rows, setRows] = useState<Row[]>(() => (entry.sets.length ? toRows(entry.sets) : [{ weight: '', reps: '' }]));
  const [note, setNote] = useState(entry.note ?? '');
  const lastInput = useRef<HTMLInputElement | null>(null);
  const focusNew = useRef(false);
  const bw = exercise.kind === 'bodyweight';

  // Earlier entries of this exercise (for "last time", history and PRs).
  const history = useLiveQuery(
    () =>
      db.entries
        .where('[exerciseId+date]')
        .between([exercise.id, ''], [exercise.id, entry.date], true, true)
        .toArray()
        .then((list) =>
          list
            .filter((e) => e.id !== entry.id && validSets(e.sets).length > 0 && (e.date < entry.date || e.createdAt < entry.createdAt))
            .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.createdAt - a.createdAt)),
        ),
    [exercise.id, entry.date, entry.id],
  );
  const last = history?.[0];

  // Save as you type (short debounce), and always on leave.
  const sets = useMemo(() => toSets(rows), [rows]);
  const pending = useRef<WorkSet[] | null>(null);
  useEffect(() => {
    pending.current = sets;
    const t = setTimeout(() => {
      void updateSets(entry.id, sets.filter((s) => s.reps > 0 || s.weight > 0));
      pending.current = null;
    }, 300);
    return () => clearTimeout(t);
  }, [sets, entry.id]);
  useEffect(
    () => () => {
      if (pending.current) void updateSets(entry.id, pending.current.filter((s) => s.reps > 0 || s.weight > 0));
    },
    [entry.id],
  );
  useEffect(() => {
    if (focusNew.current) {
      lastInput.current?.focus();
      focusNew.current = false;
    }
  }, [rows.length]);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => {
    focusNew.current = true;
    setRows((rs) => {
      const prev = rs[rs.length - 1];
      const fromLast = last?.sets[rs.length];
      const seed = prev && (prev.weight || prev.reps) ? prev : fromLast ? toRows([fromLast])[0] : { weight: '', reps: '' };
      return [...rs, { ...seed }];
    });
  };
  const removeRow = (i: number) => setRows((rs) => (rs.length === 1 ? [{ weight: '', reps: '' }] : rs.filter((_, j) => j !== i)));
  const copyLast = () => last && setRows(toRows(last.sets.filter((s) => s.reps > 0)));
  const isEmpty = rows.every((r) => !r.weight && !r.reps);

  // Personal records compared with everything before this entry.
  const prs = useMemo(() => {
    if (!history || history.length === 0) return [];
    const metrics = bw ? (['reps', 'totalReps'] as const) : (['top', 'e1rm', 'volume'] as const);
    const names = { top: 'top weight', e1rm: 'est. 1RM', volume: 'volume', reps: 'max reps', totalReps: 'total reps' };
    const out: string[] = [];
    for (const m of metrics) {
      const now = setMetric(sets, m);
      if (now === null) continue;
      const best = Math.max(...history.map((e) => setMetric(e.sets, m) ?? 0));
      if (now > best) out.push(names[m]);
    }
    return out;
  }, [sets, history, bw]);

  const onDelete = async () => {
    if (!confirm(`Remove ${exercise.name} from ${formatLong(entry.date)}?`)) return;
    pending.current = null;
    await deleteEntry(entry.id);
    toast(`${exercise.name} removed`);
    goBack();
  };

  const best = validSets(sets).length ? Math.max(...validSets(sets).map((s) => estimate1RM(s.weight, s.reps))) : 0;

  return (
    <div className="screen no-tabs" style={{ gap: 18 }}>
      <div className="between" style={{ margin: '0 -8px' }}>
        <button className="icon-btn ghost" aria-label="Back" onClick={() => goBack()}>
          <IconBack />
        </button>
        <span className="small muted">{formatLong(entry.date)}</span>
        <button className="icon-btn ghost" aria-label="Remove this exercise from the day" onClick={onDelete}>
          <IconTrash size={20} />
        </button>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h1 className="h1">{exercise.name}</h1>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="badge gray">{exercise.muscle}</span>
          <span className="badge gray">{bw ? 'Bodyweight' : 'Weight × reps'}</span>
          <Link className="badge" to={href('progress', exercise.id)} style={{ textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <IconChart size={14} /> Progress
          </Link>
        </div>
      </div>

      {last && (
        <div className="card" style={{ flexDirection: 'row', alignItems: 'center', padding: '12px 14px', gap: 12 }}>
          <IconClock size={20} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <div className="grow small" style={{ lineHeight: 1.4 }}>
            <span className="muted">Last time ({formatShort(last.date, false)}):</span>{' '}
            <strong>{validSets(last.sets).map((s) => formatSet(s, exercise.kind)).join(', ')}</strong>
          </div>
          {isEmpty && (
            <button className="btn soft sm" onClick={copyLast}>
              <IconCopy size={16} /> Copy
            </button>
          )}
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        <div className="sets-head">
          <span style={{ textAlign: 'center' }}>Set</span>
          <span style={{ textAlign: 'center' }}>{bw ? '+kg' : 'kg'}</span>
          <span style={{ textAlign: 'center' }}>Reps</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div className="set-row" key={i}>
            <span className="n">{i + 1}</span>
            <label>
              <span className="sr-only">Set {i + 1} {bw ? 'added weight' : 'weight'} in kg</span>
              <input
                className="input"
                inputMode="decimal"
                enterKeyHint="next"
                placeholder={bw ? '0' : last?.sets[i] ? formatNumber(last.sets[i].weight) : 'kg'}
                value={r.weight}
                ref={i === rows.length - 1 ? lastInput : undefined}
                onChange={(e) => setRow(i, { weight: e.target.value.replace(/[^0-9.,]/g, '') })}
              />
            </label>
            <label>
              <span className="sr-only">Set {i + 1} reps</span>
              <input
                className="input"
                inputMode="numeric"
                enterKeyHint="done"
                placeholder={last?.sets[i] ? String(last.sets[i].reps) : 'reps'}
                value={r.reps}
                onChange={(e) => setRow(i, { reps: e.target.value.replace(/[^0-9]/g, '') })}
              />
            </label>
            <button className="icon-btn ghost" aria-label={`Delete set ${i + 1}`} onClick={() => removeRow(i)} style={{ color: 'var(--muted)' }}>
              <IconTrash size={18} />
            </button>
          </div>
        ))}
        <button className="btn plain" onClick={addRow} style={{ alignSelf: 'center' }}>
          <IconPlus size={18} /> Add set
        </button>
      </div>

      {prs.length > 0 && (
        <div className="card accent" style={{ flexDirection: 'row', alignItems: 'center', padding: '12px 14px' }}>
          <IconStar size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span className="small">
            <strong>New personal record</strong> — {prs.join(', ')}
          </span>
        </div>
      )}

      {!bw && best > 0 && (
        <span className="small muted" style={{ textAlign: 'center', marginTop: -8 }}>
          Estimated 1RM today: <strong style={{ color: 'var(--ink)' }}>{formatNumber(Math.round(best * 2) / 2)} kg</strong>
        </span>
      )}

      <label className="field">
        <span>Note</span>
        <textarea
          className="input"
          value={note}
          placeholder="How did it feel?"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (entry.note ?? '') && updateNote(entry.id, note)}
        />
      </label>

      {history && history.length > 0 && (
        <div className="stack" style={{ gap: 0 }}>
          <span className="label">History</span>
          {history.slice(0, 5).map((h) => (
            <div key={h.id} className="between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span className="small muted">{formatShort(h.date)}</span>
              <span className="small" style={{ fontWeight: 500 }}>{summarizeSets(h.sets, exercise.kind)}</span>
            </div>
          ))}
        </div>
      )}

      <button
        className="btn primary block"
        style={{ height: 56, marginTop: 4 }}
        onClick={async () => {
          if (note !== (entry.note ?? '')) await updateNote(entry.id, note);
          goBack();
        }}
      >
        Done
      </button>
    </div>
  );
}
