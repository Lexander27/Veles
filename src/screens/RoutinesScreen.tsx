import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId, saveRoutine, setActiveRoutine } from '../db';
import { useExercises, useRoutines } from '../hooks';
import { IconNext, IconPlus, IconRepeat } from '../components/Icons';
import { addDays, formatRelative, todayStr } from '../lib/dates';
import { describePlan, nextWorkout, sortSessionsDesc } from '../lib/routines';
import type { Routine } from '../lib/types';
import { href, Link, navigate } from '../router';

export function RoutinesScreen() {
  const { routines, active, loaded } = useRoutines();
  const { byId } = useExercises();
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const today = todayStr();

  const create = async () => {
    const r: Routine = {
      id: newId(),
      name: `Routine ${routines.length + 1}`,
      days: [{ id: newId(), name: 'Workout 1', exerciseIds: [] }],
      createdAt: Date.now(),
    };
    await saveRoutine(r);
    if (routines.length === 0) await setActiveRoutine(r.id);
    navigate(href('routine', r.id));
  };

  return (
    <div className="screen">
      <div className="between">
        <h1 className="h1">Routines</h1>
        <button className="btn soft sm" onClick={create}>
          <IconPlus size={16} /> New
        </button>
      </div>

      {loaded && routines.length === 0 && (
        <div className="card accent" style={{ gap: 10 }}>
          <span className="h2">Set up your split</span>
          <span className="small" style={{ lineHeight: 1.5 }}>
            A routine is a cycle of workouts, like <strong>Push → Pull → Legs</strong>. After you log a day, the calendar suggests the next one as your{' '}
            <strong>Next workout</strong>. You can also give it a plan, like every 2 days, to see your workouts ahead on the calendar.
          </span>
          <button className="btn primary" onClick={create}>
            <IconPlus size={18} /> Create a routine
          </button>
        </div>
      )}

      <div className="stack" style={{ gap: 12 }}>
        {routines.map((r) => {
          // "Next" from today's point of view counts a workout already done today.
          const next = sessions ? nextWorkout(r, sessions, addDays(today, 1)) : null;
          const last = sessions ? sortSessionsDesc(sessions.filter((s) => s.routineId === r.id && s.date <= today))[0] : undefined;
          const isActive = active?.id === r.id;
          return (
            <Link key={r.id} to={href('routine', r.id)} className="card" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 10 }}>
              <div className="between">
                <div className="row" style={{ gap: 10 }}>
                  <span className="tile">
                    <IconRepeat size={20} />
                  </span>
                  <div className="stack" style={{ gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 17 }}>{r.name}</span>
                    <span className="small muted">
                      {r.days.length} {r.days.length === 1 ? 'workout' : 'workouts'}
                      {r.plan ? ` · ${describePlan(r.plan.pattern)}` : ''}
                      {last ? ` · last trained ${formatRelative(last.date).toLowerCase() === 'today' ? 'today' : formatRelative(last.date)}` : ''}
                    </span>
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {isActive && <span className="badge">Active</span>}
                  <IconNext size={18} style={{ color: '#9aa0ab' }} />
                </div>
              </div>
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {r.days.map((d, i) => (
                  <li key={d.id} className="small" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 700, color: next?.day.id === d.id ? 'var(--accent)' : 'var(--muted)', minWidth: 18 }}>{i + 1}.</span>
                    <span style={{ fontWeight: 600, color: next?.day.id === d.id ? 'var(--accent)' : undefined }}>{d.name}</span>
                    <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {d.exerciseIds.map((id) => byId.get(id)?.name).filter(Boolean).join(', ') || 'no exercises yet'}
                    </span>
                    {next?.day.id === d.id && <span className="badge" style={{ marginLeft: 'auto', flexShrink: 0 }}>Next</span>}
                  </li>
                ))}
              </ol>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
