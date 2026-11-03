import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { db, runImport, undoImport, type ImportPlan } from '../db';
import { useExercises } from '../hooks';
import { IconBack, IconCheck, IconEdit } from '../components/Icons';
import { toast } from '../components/Toast';
import { formatLong, parseDate } from '../lib/dates';
import { formatNumber, groupSets } from '../lib/metrics';
import { guessMuscle, nameIndex, nameKey, parseDayBlock, parseNotes, type ParsedDay } from '../lib/importNotes';
import { MUSCLE_GROUPS, type Exercise, type ImportRecord, type WorkSet } from '../lib/types';
import { goBack, href, Link, navigate } from '../router';

const EXAMPLE = `26/10/2026
Lat pulldown 25x12 47.5x10 50x10
Bicep curl 10x12 12.5x10 (left arm tired)

28/10/2026
Shoulder press 23x10 23x10 25.3x10`;

type Decision = 'import' | 'skip';
type Resolved = { id: string } | { newKey: string };

function loadDraft(): string {
  try {
    return sessionStorage.getItem('veles.importDraft') ?? '';
  } catch {
    return '';
  }
}
function saveDraft(t: string) {
  try {
    sessionStorage.setItem('veles.importDraft', t);
  } catch {
    /* ignore */
  }
}

const setText = (s: WorkSet) => `${s.weight ? formatNumber(s.weight) : 'BW'}×${s.reps}`;
const setsText = (sets: WorkSet[]) => groupSets(sets).map((g) => g.map(setText).join(' → ')).join('   ');

export function ImportScreen() {
  const { list: exercises, byId } = useExercises();
  const [step, setStep] = useState<'paste' | 'review' | 'done'>('paste');
  const [text, setText] = useState(loadDraft);
  const [days, setDays] = useState<ParsedDay[]>([]);
  const [orphans, setOrphans] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [muscles, setMuscles] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  const [result, setResult] = useState<ImportRecord | null>(null);
  const [busy, setBusy] = useState(false);
  // Jumping around the review: which day/name to highlight, and where "Show day" cycles to.
  const [highlight, setHighlight] = useState<{ day: string; name?: string } | null>(null);
  const [jumpedDay, setJumpedDay] = useState<string | null>(null);
  const nameCursor = useRef<Record<string, number>>({});
  const lastFlagged = useRef<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const jumpTo = (id: string, hl: { day: string; name?: string } | null) => {
    setHighlight(hl);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 2500);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const index = useMemo(() => nameIndex(exercises), [exercises]);
  const decisionOf = (d: ParsedDay): Decision | undefined => decisions[d.key] ?? (d.reasons.length ? undefined : 'import');
  const included = days.filter((d) => decisionOf(d) === 'import' && d.date);

  // Every exercise name in the days being imported.
  const names = useMemo(() => {
    const map = new Map<string, { display: string; days: Set<string>; sets: WorkSet[] }>();
    for (const d of days) {
      if (decisionOf(d) === 'skip') continue;
      for (const l of d.lines) {
        if (!l.name || l.sets.length === 0) continue;
        const k = nameKey(l.name);
        const item = map.get(k) ?? { display: l.name, days: new Set<string>(), sets: [] };
        item.days.add(d.key);
        item.sets.push(...l.sets);
        map.set(k, item);
      }
    }
    return map;
  }, [days, decisions]);

  const targetOf = (k: string) => targets[k] ?? index.get(k) ?? 'new';
  const resolve = (k: string, seen = new Set<string>()): Resolved => {
    const t = targetOf(k);
    if (t.startsWith('same:')) {
      const other = t.slice(5);
      if (seen.has(other) || !names.has(other)) return { newKey: k };
      seen.add(k);
      return resolve(other, seen);
    }
    if (t === 'new' || !byId.has(t)) return { newKey: k };
    return { id: t };
  };
  const resolvedName = (r: Resolved) => ('id' in r ? byId.get(r.id)?.name ?? '?' : names.get(r.newKey)?.display ?? '?');

  // Already-logged exercises on the same dates are skipped, so importing twice is harmless.
  const dates = [...new Set(days.map((d) => d.date).filter(Boolean))] as string[];
  const existing = useLiveQuery(
    async () => {
      const list = await db.entries.where('date').anyOf(dates).toArray();
      return new Set(list.filter((e) => e.sets.some((s) => s.reps > 0)).map((e) => `${e.date}|${e.exerciseId}`));
    },
    [dates.join(',')],
  );
  const isDuplicate = (date: string | null, r: Resolved) => !!date && 'id' in r && !!existing?.has(`${date}|${r.id}`);

  const read = () => {
    const parsed = parseNotes(text);
    setDays(parsed.days.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')));
    setOrphans(parsed.orphanLines);
    setDecisions({});
    setEditing(null);
    setStep('review');
    window.scrollTo(0, 0);
  };

  const reread = () => {
    if (!editing) return;
    const day = parseDayBlock(editing.text.trim(), editing.key);
    setDays((ds) => ds.map((d) => (d.key === editing.key ? day : d)));
    setDecisions((dec) => {
      const next = { ...dec };
      delete next[editing.key];
      return next;
    });
    setEditing(null);
  };

  const buildPlan = (): ImportPlan => {
    const plan: ImportPlan = { newExercises: [], addAliases: [], entries: [] };
    const usedNew = new Map<string, WorkSet[]>();
    for (const d of included) {
      const merged = new Map<string, { exercise: Resolved; sets: WorkSet[]; notes: string[] }>();
      for (const l of d.lines) {
        if (!l.name || l.sets.length === 0) continue;
        const r = resolve(nameKey(l.name));
        if (isDuplicate(d.date, r)) continue;
        const k = 'id' in r ? `id:${r.id}` : `new:${r.newKey}`;
        const m = merged.get(k) ?? { exercise: r, sets: [], notes: [] };
        m.sets.push(...l.sets);
        m.notes.push(...l.notes);
        merged.set(k, m);
        if ('newKey' in r) usedNew.set(r.newKey, [...(usedNew.get(r.newKey) ?? []), ...l.sets]);
      }
      [...merged.values()].forEach((m, i) => {
        const notes = [...(i === 0 ? d.notes : []), ...m.notes];
        plan.entries.push({ date: d.date!, exercise: m.exercise, sets: m.sets, note: notes.length ? notes.join('; ') : undefined });
      });
    }
    for (const [k, sets] of usedNew) {
      const display = names.get(k)?.display ?? k;
      const aliases = [...names.entries()]
        .filter(([other]) => other !== k && (() => { const r = resolve(other); return 'newKey' in r && r.newKey === k; })())
        .map(([, v]) => v.display);
      plan.newExercises.push({
        key: k,
        name: display,
        muscle: muscles[k] ?? guessMuscle(display),
        kind: sets.every((s) => s.weight === 0) ? 'bodyweight' : 'weight',
        aliases,
      });
    }
    for (const [k, v] of names) {
      const r = resolve(k);
      if (!('id' in r)) continue;
      const ex = byId.get(r.id);
      if (ex && nameKey(ex.name) !== k && !(ex.aliases ?? []).some((a) => nameKey(a) === k)) plan.addAliases.push({ exerciseId: r.id, alias: v.display });
    }
    return plan;
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const rec = await runImport(buildPlan());
      setResult(rec);
      setText('');
      saveDraft('');
      setStep('done');
      window.scrollTo(0, 0);
    } finally {
      setBusy(false);
    }
  };

  // ---------- paste ----------
  if (step === 'paste') {
    return (
      <div className="screen no-tabs">
        <Header title="Import from notes" onBack={() => goBack('#/more')} />
        <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>
          Paste your workout notes. A line with a date (<strong>26/10/2026</strong>) starts a day, and each line after it is an exercise followed by its sets as{' '}
          <strong>weight x reps</strong>. Nothing is saved until you’ve checked everything on the next screen.
        </p>
        <label className="field">
          <span>Your notes</span>
          <textarea
            className="input"
            style={{ minHeight: 300, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14, lineHeight: 1.5 }}
            value={text}
            placeholder={EXAMPLE}
            onChange={(e) => {
              setText(e.target.value);
              saveDraft(e.target.value);
            }}
          />
        </label>
        <div className="row">
          {'clipboard' in navigator && 'readText' in navigator.clipboard && (
            <button
              className="btn outline grow"
              onClick={async () => {
                try {
                  const t = await navigator.clipboard.readText();
                  setText(t);
                  saveDraft(t);
                } catch {
                  toast('Couldn’t read the clipboard. Long-press the box and choose Paste.');
                }
              }}
            >
              Paste
            </button>
          )}
          <button className="btn primary grow" disabled={!text.trim()} onClick={read}>
            Read notes
          </button>
        </div>
      </div>
    );
  }

  // ---------- done ----------
  if (step === 'done' && result) {
    return (
      <div className="screen no-tabs">
        <Header title="Import finished" onBack={() => navigate('#/more', { replace: true })} />
        <div className="card accent" style={{ gap: 8 }}>
          <span className="h2">
            <IconCheck size={20} style={{ verticalAlign: -3, color: 'var(--accent)' }} /> {result.entries} exercises on {result.days} days imported
          </span>
          <span className="small" style={{ lineHeight: 1.5 }}>
            {result.createdExerciseIds.length > 0 ? `${result.createdExerciseIds.length} new exercises were added to your library. ` : ''}
            Not happy with it? You can undo the whole import here, or later under More → Recent imports.
          </span>
        </div>
        <Link className="btn primary block" to="#/" replace>
          Open calendar
        </Link>
        <Link className="btn outline block" to={href('progress')} replace>
          See progress
        </Link>
        <button
          className="btn danger block"
          onClick={async () => {
            if (!confirm('Undo this import? All workouts it added will be removed.')) return;
            await undoImport(result.id);
            toast('Import undone');
            setResult(null);
            setStep('paste');
          }}
        >
          Undo this import
        </button>
      </div>
    );
  }

  // ---------- review ----------
  const undecided = days.filter((d) => decisionOf(d) === undefined).length;
  const entriesCount = buildPlanCount();
  function buildPlanCount() {
    let n = 0;
    for (const d of included) {
      const seen = new Set<string>();
      for (const l of d.lines) {
        if (!l.name || l.sets.length === 0) continue;
        const r = resolve(nameKey(l.name));
        const k = 'id' in r ? r.id : 'n' + r.newKey;
        if (!seen.has(k) && !isDuplicate(d.date, r)) n++;
        seen.add(k);
      }
    }
    return n;
  }
  const newCount = new Set([...names.keys()].map((k) => resolve(k)).filter((r): r is { newKey: string } => 'newKey' in r).map((r) => r.newKey)).size;
  const activeExercises = exercises.filter((e) => !e.archived);

  return (
    <div className="screen no-tabs" style={{ gap: 18 }}>
      <Header title="Check your import" onBack={() => setStep('paste')} />

      {days.length === 0 ? (
        <div className="empty">
          No dates found. Each day should start with a line like <strong>26/10/2026</strong>.
          <button className="btn outline" onClick={() => setStep('paste')}>Back to notes</button>
        </div>
      ) : (
        <span className="small muted" style={{ lineHeight: 1.5 }}>
          Found {days.length} {days.length === 1 ? 'day' : 'days'} and {names.size} different exercise names. Check how each name is matched, then decide about any flagged days.
        </span>
      )}

      {names.size > 0 && (
        <section className="stack" style={{ gap: 0 }} aria-labelledby="names-h">
          <h2 id="names-h" className="label" style={{ paddingBottom: 4, scrollMarginTop: 16 }}>
            Exercises · {newCount} new
          </h2>
          {[...names.entries()].sort((a, b) => a[1].display.localeCompare(b[1].display)).map(([k, v]) => {
            const t = targetOf(k);
            const r = resolve(k);
            const matched: Exercise | undefined = 'id' in r ? byId.get(r.id) : undefined;
            const isNew = 'newKey' in r && r.newKey === k;
            const viaAlias = matched && nameKey(matched.name) !== k && (matched.aliases ?? []).some((a) => nameKey(a) === k);
            return (
              <div key={k} className="stack" style={{ gap: 8, padding: '12px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div className="between">
                  <span style={{ fontWeight: 600 }}>{v.display}</span>
                  <button
                    className="btn plain sm"
                    style={{ padding: 0, height: 32 }}
                    onClick={() => {
                      const list = [...v.days];
                      const i = (nameCursor.current[k] ?? 0) % list.length;
                      nameCursor.current[k] = i + 1;
                      setJumpedDay(list[i]);
                      jumpTo(`day-${list[i]}`, { day: list[i], name: k });
                    }}
                  >
                    {v.days.size === 1 ? 'Show day' : `Show day ${((nameCursor.current[k] ?? 0) % v.days.size) + 1} of ${v.days.size}`} ↓
                  </button>
                </div>
                <label className="field">
                  <span className="sr-only">What is “{v.display}”?</span>
                  <select className="input" value={t} onChange={(e) => setTargets({ ...targets, [k]: e.target.value })} style={{ height: 44 }}>
                    <option value="new">New exercise “{v.display}”</option>
                    <optgroup label="Same as an exercise in your library">
                      {activeExercises.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </optgroup>
                    {[...names.entries()].some(([o]) => o !== k && targetOf(o) === 'new') && (
                      <optgroup label="Same as another new name here">
                        {[...names.entries()]
                          .filter(([o]) => o !== k && targetOf(o) === 'new')
                          .map(([o, ov]) => (
                            <option key={o} value={`same:${o}`}>
                              {ov.display}
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                {matched && (
                  <span className="small" style={{ color: 'var(--accent)' }}>
                    <IconCheck size={14} style={{ verticalAlign: -2 }} /> Goes into <strong>{matched.name}</strong>
                    {nameKey(matched.name) !== k && !viaAlias ? `, and “${v.display}” is saved as also known as` : viaAlias ? ' (also known as)' : ''}
                  </span>
                )}
                {!matched && !isNew && 'newKey' in r && (
                  <span className="small" style={{ color: 'var(--accent)' }}>
                    Goes into the new exercise <strong>{resolvedName(r)}</strong> (also known as “{v.display}”)
                  </span>
                )}
                {isNew && (
                  <label className="row small" style={{ gap: 8 }}>
                    <span className="muted">Muscle group</span>
                    <select className="input" style={{ height: 36, width: 'auto', fontSize: 14, padding: '0 8px' }} value={muscles[k] ?? guessMuscle(v.display)} onChange={(e) => setMuscles({ ...muscles, [k]: e.target.value })}>
                      {MUSCLE_GROUPS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            );
          })}
        </section>
      )}

      {orphans.length > 0 && (
        <div className="card" style={{ gap: 6, background: 'var(--warn-soft)', borderColor: 'transparent' }}>
          <span className="small" style={{ fontWeight: 600, color: 'var(--warn)' }}>These lines come before any date and will be ignored:</span>
          {orphans.map((o, i) => (
            <code key={i} className="small" style={{ whiteSpace: 'pre-wrap' }}>{o}</code>
          ))}
        </div>
      )}

      {days.length > 0 && (
        <section className="stack" style={{ gap: 12 }} aria-labelledby="days-h">
          <h2 id="days-h" className="label">Days</h2>
          {days.map((d) => {
            const dec = decisionOf(d);
            const flagged = d.reasons.length > 0;
            return (
              <div
                key={d.key}
                id={`day-${d.key}`}
                className="card"
                style={{
                  gap: 10,
                  scrollMarginTop: 16,
                  opacity: dec === 'skip' ? 0.6 : 1,
                  borderColor: highlight?.day === d.key ? 'var(--accent)' : flagged && !dec ? 'var(--warn)' : undefined,
                  boxShadow: highlight?.day === d.key ? '0 0 0 3px var(--accent-soft)' : undefined,
                  transition: 'box-shadow 0.3s, border-color 0.3s',
                }}
              >
                <div className="between">
                  <span style={{ fontWeight: 700 }}>{d.date ? `${formatLong(d.date)} ${parseDate(d.date).getFullYear()}` : d.dateText}</span>
                  {dec === 'skip' ? <span className="badge gray">Skipped</span> : flagged && !dec ? <span className="badge" style={{ color: 'var(--warn)', background: 'var(--warn-soft)' }}>Needs a decision</span> : null}
                </div>

                {flagged && (
                  <span className="small" style={{ color: 'var(--warn)', fontWeight: 600 }}>
                    {d.reasons.join(' · ')}
                  </span>
                )}

                {editing?.key === d.key ? (
                  <div className="stack">
                    <textarea
                      className="input"
                      style={{ minHeight: 160, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14 }}
                      value={editing.text}
                      onChange={(e) => setEditing({ key: d.key, text: e.target.value })}
                      aria-label="Edit this day's text"
                    />
                    <span className="small muted">Fix the text and tap Re-read. Delete lines you don’t want, like a run.</span>
                    <div className="row">
                      <button className="btn outline grow sm" onClick={() => setEditing(null)}>Cancel</button>
                      <button className="btn primary grow sm" onClick={reread}>Re-read</button>
                    </div>
                  </div>
                ) : (
                  <div className="stack" style={{ gap: 6 }}>
                    {d.notes.length > 0 && (
                      <span className="small" style={{ background: 'var(--surface)', padding: '6px 10px', borderRadius: 8 }}>
                        Note: {d.notes.join('; ')}
                      </span>
                    )}
                    {d.lines.map((l, i) => {
                      if (!l.name || l.sets.length === 0) {
                        return (
                          <div key={i} className="small" style={{ color: 'var(--warn)' }}>
                            <span style={{ textDecoration: 'line-through' }}>{l.raw.trim()}</span>
                            <br />
                            <span>{l.problem}. This line will be left out.</span>
                          </div>
                        );
                      }
                      const r = resolve(nameKey(l.name));
                      const dup = isDuplicate(d.date, r);
                      const lit = highlight?.day === d.key && highlight.name === nameKey(l.name);
                      return (
                        <div key={i} className="stack" style={{ gap: 1, borderRadius: 8, margin: '0 -8px', padding: '2px 8px', background: lit ? 'var(--accent-soft)' : undefined, transition: 'background 0.3s' }}>
                          <span className="small" style={{ fontWeight: 600 }}>
                            {resolvedName(r)}
                            {nameKey(resolvedName(r)) !== nameKey(l.name) && <span className="muted" style={{ fontWeight: 400 }}> (written “{l.name}”)</span>}
                            {dup && <span className="muted" style={{ fontWeight: 400 }}> · already logged, skipped</span>}
                          </span>
                          <span className="small muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{setsText(l.sets)}</span>
                          {l.notes.length > 0 && <span className="small">Note: {l.notes.join('; ')}</span>}
                          {l.problem && <span className="small" style={{ color: 'var(--warn)' }}>{l.problem}. The rest of the line is left out.</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {editing?.key !== d.key && (
                  <div className="row" style={{ gap: 8 }}>
                    <div className="segmented grow" role="group" aria-label="Import this day?">
                      <button aria-pressed={dec === 'import'} disabled={!d.date} onClick={() => setDecisions({ ...decisions, [d.key]: 'import' })}>
                        Import
                      </button>
                      <button aria-pressed={dec === 'skip'} onClick={() => setDecisions({ ...decisions, [d.key]: 'skip' })}>
                        Skip
                      </button>
                    </div>
                    <button className="btn plain sm" onClick={() => setEditing({ key: d.key, text: d.raw })}>
                      <IconEdit size={16} /> Edit
                    </button>
                  </div>
                )}
                {jumpedDay === d.key && editing?.key !== d.key && (
                  <button className="btn plain sm" style={{ alignSelf: 'flex-start', padding: 0, height: 28 }} onClick={() => { setJumpedDay(null); jumpTo('names-h', null); }}>
                    ↑ Back to exercise names
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {days.length > 0 && (
        <div className="stack" style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '12px 0 calc(var(--safe-bottom) + 12px)', margin: '0 0 -32px', borderTop: '1px solid var(--line)' }}>
          {undecided > 0 ? (
            <button
              className="btn block"
              style={{ height: 56, background: 'var(--warn-soft)', color: 'var(--warn)' }}
              onClick={() => {
                const flagged = days.filter((d) => decisionOf(d) === undefined);
                const at = flagged.findIndex((d) => d.key === lastFlagged.current);
                const next = flagged[(at + 1) % flagged.length];
                lastFlagged.current = next.key;
                jumpTo(`day-${next.key}`, { day: next.key });
              }}
            >
              Next flagged day ↓ ({undecided} to decide)
            </button>
          ) : (
          <button className="btn primary block" style={{ height: 56 }} disabled={busy || entriesCount === 0 || !!editing} onClick={doImport}>
            {entriesCount === 0
                ? 'Nothing to import'
                : `Import ${entriesCount} exercises on ${new Set(included.map((d) => d.date)).size} days`}
          </button>
          )}
        </div>
      )}
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div style={{ margin: '0 -8px' }}>
        <button className="icon-btn ghost" aria-label="Back" onClick={onBack}>
          <IconBack />
        </button>
      </div>
      <h1 className="h1">{title}</h1>
    </div>
  );
}
