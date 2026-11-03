import { useState } from 'react';
import { MUSCLE_GROUPS, type ExerciseKind } from '../lib/types';

export interface ExerciseFormValue {
  name: string;
  muscle: string;
  kind: ExerciseKind;
}

export function ExerciseForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  existingNames,
}: {
  initial?: Partial<ExerciseFormValue>;
  submitLabel: string;
  onSubmit: (v: ExerciseFormValue) => void;
  onCancel?: () => void;
  existingNames?: string[];
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [muscle, setMuscle] = useState(initial?.muscle ?? 'Chest');
  const [kind, setKind] = useState<ExerciseKind>(initial?.kind ?? 'weight');
  const trimmed = name.trim();
  const duplicate =
    !!existingNames && trimmed !== '' && trimmed.toLowerCase() !== (initial?.name ?? '').toLowerCase() &&
    existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());

  return (
    <form
      className="stack"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed && !duplicate) onSubmit({ name: trimmed, muscle, kind });
      }}
    >
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hip thrust" autoFocus maxLength={60} />
        {duplicate && <span className="small" style={{ color: 'var(--danger)' }}>An exercise with this name already exists.</span>}
      </label>
      <div className="field">
        <span>Muscle group</span>
        <div className="chips" role="group" aria-label="Muscle group">
          {MUSCLE_GROUPS.map((m) => (
            <button type="button" key={m} className="chip" aria-pressed={muscle === m} onClick={() => setMuscle(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Type</span>
        <div className="segmented" role="group" aria-label="Exercise type">
          <button type="button" aria-pressed={kind === 'weight'} onClick={() => setKind('weight')}>
            Weight × reps
          </button>
          <button type="button" aria-pressed={kind === 'bodyweight'} onClick={() => setKind('bodyweight')}>
            Bodyweight reps
          </button>
        </div>
      </div>
      <div className="row">
        {onCancel && (
          <button type="button" className="btn outline grow" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn primary grow" disabled={!trimmed || duplicate}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
