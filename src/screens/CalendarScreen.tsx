import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { db, startRoutineDay } from '../db';
import { useExercises, useRoutines } from '../hooks';
import { IconBack, IconDumbbell, IconNext, IconPlus, IconRepeat } from '../components/Icons';
import { toast } from '../components/Toast';
import { addDays, formatLong, formatRelative, monthGrid, monthName, parseDate, todayStr, WEEKDAY_SHORT, type DateStr } from '../lib/dates';
import { summarizeSets, validSets } from '../lib/metrics';
import { nextWorkout, planDays } from '../lib/routines';
import { href, Link } from '../router';

export function CalendarScreen({ selected, onSelect }: { selected: DateStr; onSelect: (d: DateStr) => void }) {
  const today = todayStr();
  const sel = parseDate(selected);
  const [view, setView] = useState({ y: sel.getFullYear(), m: sel.getMonth() });
  const cells = useMemo(() => monthGrid(view.y, view.m), [view]);
  const first = cells[0].date;
  const last = cells[cells.length - 1].date;

  const monthEntries = useLiveQuery(() => db.entries.where('date').between(first, last, true, true).toArray(), [first, last]);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const { active } = useRoutines();
  const hasPlan = !!active?.plan;
  // 'done' = sets logged, 'added' = exercises added but not logged, 'scheduled' = on the routine plan.
  const marks = useMemo(() => {
    const m = new Map<DateStr, 'done' | 'added' | 'scheduled'>();
    for (const e of monthEntries ?? []) {
      if (validSets(e.sets).length > 0) m.set(e.date, 'done');
      else if (!m.has(e.date)) m.set(e.date, 'added');
    }
    if (active && sessions) {
      for (const p of planDays(active, sessions, today, last)) if (!m.has(p.date)) m.set(p.date, 'scheduled');
    }
    return m;
  }, [monthEntries, active, sessions, today, last]);

  const shiftMonth = (n: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const goToday = () => {
    const t = parseDate(today);
    setView({ y: t.getFullYear(), m: t.getMonth() });
    onSelect(today);
  };

  // Horizontal swipe on the grid changes month.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
  };

  const t = parseDate(today);
  const viewingCurrent = view.y === t.getFullYear() && view.m === t.getMonth();

  return (
    <div className="screen">
      <div className="cal-head">
        <h1 className="title" aria-live="polite">
          {monthName(view.m)} <span>{view.y}</span>
        </h1>
        <div className="row" style={{ gap: 4 }}>
          {(!viewingCurrent || selected !== today) && (
            <button className="btn plain sm" onClick={goToday}>
              Today
            </button>
          )}
          <button className="icon-btn" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            <IconBack size={18} />
          </button>
          <button className="icon-btn" aria-label="Next month" onClick={() => shiftMonth(1)}>
            <IconNext size={18} />
          </button>
        </div>
      </div>

      <div>
        <div className="cal-weekdays" aria-hidden="true">
          {WEEKDAY_SHORT.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="cal-grid" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {cells.map((c) => {
            const mark = marks.get(c.date);
            const cls = ['cal-day', c.inMonth ? '' : 'out', c.date === today ? 'today' : '', mark ?? ''].join(' ');
            return (
              <button
                key={c.date}
                className={cls}
                aria-pressed={c.date === selected}
                aria-label={`${formatLong(c.date)}${mark === 'done' ? ', workout logged' : mark === 'added' ? ', exercises added' : mark === 'scheduled' ? ', planned workout' : ''}`}
                onClick={() => {
                  onSelect(c.date);
                  if (!c.inMonth) {
                    const d = parseDate(c.date);
                    setView({ y: d.getFullYear(), m: d.getMonth() });
                  }
                }}
              >
                <span className="num">{c.day}</span>
                <span className={`dot ${mark === 'added' ? 'added' : ''}`} />
              </button>
            );
          })}
        </div>
        <div className="cal-legend" aria-hidden="true">
          <span><i className="sw done" /> Done</span>
          {hasPlan && <span><i className="sw scheduled" /> Planned</span>}
          <span><i className="sw added" /> Added, not logged</span>
        </div>
      </div>

      <div className="divider" />

      <DayPanel date={selected} />

      <Link className="fab" to={href('add', selected)}>
        <IconPlus size={22} />
        Add exercise
      </Link>
    </div>
  );
}

function DayPanel({ date }: { date: DateStr }) {
  const { byId } = useExercises();
  const { active } = useRoutines();
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('order'), [date]);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const routines = useLiveQuery(() => db.routines.toArray(), []);

  const today = todayStr();
  const daySessions = (sessions ?? []).filter((s) => s.date === date);
  const next = active && sessions ? nextWorkout(active, sessions, date) : null;
  const hasRoutineSession = daySessions.some((s) => s.routineId === active?.id);
  // With a plan, today and future days show what the plan says: a workout or a rest day.
  const plan = active?.plan && sessions && date >= today ? planDays(active, sessions, today, addDays(date, 60)) : null;
  const planned = plan?.find((p) => p.date === date);
  const nextPlanned = plan?.find((p) => p.date > date);
  const isRestDay = !!plan && !planned && !hasRoutineSession && (entries?.length ?? 0) === 0;
  const showNext = !!next && !hasRoutineSession && !isRestDay;
  const loggedSets = (entries ?? []).reduce((n, e) => n + validSets(e.sets).length, 0);

  const sessionLabel = (sessionId?: string) => {
    if (!sessionId) return null;
    const s = daySessions.find((x) => x.id === sessionId);
    const r = s && routines?.find((x) => x.id === s.routineId);
    const d = r?.days.find((x) => x.id === s?.dayId);
    return r && d ? `${d.name} · ${r.name}` : null;
  };

  const suggestion = planned ?? next;
  const addNext = async () => {
    if (!active || !suggestion) return;
    await startRoutineDay(date, active, suggestion.day.id);
    toast(`${suggestion.day.name} added`);
  };
  const dayWord = formatRelative(date) === 'Today' ? 'today' : formatRelative(date);

  // Group entries by session so a routine day reads as one block.
  const groups: Array<{ label: string | null; items: NonNullable<typeof entries> }> = [];
  for (const e of entries ?? []) {
    const label = sessionLabel(e.sessionId);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <section className="stack" style={{ gap: 4 }} aria-label={`Workouts on ${formatLong(date)}`}>
      <div className="between" style={{ alignItems: 'baseline' }}>
        <h2 className="h2">{formatLong(date)}</h2>
        {entries && entries.length > 0 && (
          <span className="small muted">
            {entries.length} {entries.length === 1 ? 'exercise' : 'exercises'} · {loggedSets} {loggedSets === 1 ? 'set' : 'sets'}
          </span>
        )}
      </div>

      {showNext && suggestion && active && (
        <div className="card accent" style={{ marginTop: 10, gap: 10 }}>
          <div className="between">
            <div className="stack" style={{ gap: 2 }}>
              <span className="label" style={{ color: 'var(--accent)' }}>
                {planned ? 'Planned workout' : 'Next workout'}
              </span>
              <span className="h2">{suggestion.day.name}</span>
              <span className="small muted">
                {active.name} · workout {suggestion.index + 1} of {active.days.length}
                {next?.last ? ` · last: ${active.days.find((d) => d.id === next.last!.dayId)?.name ?? '—'}, ${formatRelative(next.last.date)}` : ''}
              </span>
            </div>
            <span className="tile" style={{ background: '#fff' }}>
              <IconRepeat size={20} />
            </span>
          </div>
          {suggestion.day.exerciseIds.length > 0 && (
            <div className="chips">
              {suggestion.day.exerciseIds.map((id) => byId.get(id)).filter((ex) => ex && !ex.archived).map((ex) => (
                <span key={ex!.id} className="chip" style={{ height: 30, fontSize: 13, background: '#fff', borderColor: 'transparent' }}>
                  {ex!.name}
                </span>
              ))}
            </div>
          )}
          <button className="btn primary block" onClick={addNext} disabled={suggestion.day.exerciseIds.length === 0}>
            <IconPlus size={18} /> Add to {dayWord}
          </button>
        </div>
      )}

      {isRestDay && active && (
        <div className="card" style={{ marginTop: 10, gap: 10 }}>
          <div className="stack" style={{ gap: 2 }}>
            <span className="label">Rest day</span>
            <span className="small muted" style={{ lineHeight: 1.5 }}>
              {nextPlanned ? (
                <>
                  Next planned: <strong style={{ color: 'var(--ink)' }}>{nextPlanned.day.name}</strong>, {formatRelative(nextPlanned.date, today)}.
                </>
              ) : (
                'Nothing planned.'
              )}
            </span>
          </div>
          {next && next.day.exerciseIds.length > 0 && (
            <button className="btn outline block" onClick={async () => {
              await startRoutineDay(date, active, next.day.id);
              toast(`${next.day.name} added. The plan moves along with you`);
            }}>
              Train anyway: add {next.day.name} (your next workout)
            </button>
          )}
        </div>
      )}

      {entries && entries.length === 0 && !showNext && !isRestDay && (
        <div className="empty">
          <span>Nothing logged on this day.</span>
        </div>
      )}

      {groups.map((g, gi) => (
        <div key={gi} className="list" style={{ marginTop: 8 }}>
          {g.label && <span className="label" style={{ padding: '6px 0 2px' }}>{g.label}</span>}
          {g.items.map((e) => {
            const ex = byId.get(e.exerciseId);
            const summary = ex ? summarizeSets(e.sets, ex.kind) : null;
            return (
              <Link key={e.id} className="list-row" to={href('entry', e.id)}>
                <span className="tile">
                  <IconDumbbell size={20} />
                </span>
                <span className="stack grow" style={{ gap: 2 }}>
                  <span className="title">{ex?.name ?? 'Deleted exercise'}</span>
                  <span className="sub">{summary ?? 'Not logged yet — tap to add sets'}</span>
                </span>
                <IconNext size={18} style={{ color: '#9aa0ab' }} />
              </Link>
            );
          })}
        </div>
      ))}
    </section>
  );
}
