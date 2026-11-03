import { useCallback, useEffect, useState } from 'react';
import { ensureSeeded } from './db';
import { IconCalendar, IconChart, IconMore, IconRepeat } from './components/Icons';
import { ToastHost } from './components/Toast';
import { todayStr, type DateStr } from './lib/dates';
import { href, Link, useRoute } from './router';
import { AddSheet } from './screens/AddSheet';
import { CalendarScreen } from './screens/CalendarScreen';
import { EntryScreen } from './screens/EntryScreen';
import { ExercisesScreen } from './screens/ExercisesScreen';
import { MoreScreen } from './screens/MoreScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { RoutineEditScreen } from './screens/RoutineEditScreen';
import { RoutinesScreen } from './screens/RoutinesScreen';

function loadSelected(): DateStr {
  try {
    const v = sessionStorage.getItem('veles.selected');
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  } catch {
    /* ignore */
  }
  return todayStr();
}

export function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [selected, setSelectedState] = useState<DateStr>(loadSelected);
  const setSelected = useCallback((d: DateStr) => {
    setSelectedState(d);
    try {
      sessionStorage.setItem('veles.selected', d);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    ensureSeeded().finally(() => setReady(true));
    // Ask the browser not to evict our data (granted automatically for installed apps on Android).
    void navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  // Scroll to top on screen change.
  const key = route.join('/');
  useEffect(() => {
    if (route[0] !== 'add') window.scrollTo(0, 0);
  }, [key]);

  if (!ready) return <div className="app" />;

  const [name, arg] = route;
  let screen: React.ReactNode;
  let tab: 'cal' | 'progress' | 'routines' | 'more' | null = null;
  switch (name) {
    case undefined:
    case 'add':
      tab = 'cal';
      screen = (
        <>
          <CalendarScreen selected={name === 'add' && arg ? arg : selected} onSelect={setSelected} />
          {name === 'add' && arg && <AddSheet date={arg} />}
        </>
      );
      break;
    case 'entry':
      screen = <EntryScreen id={arg} />;
      break;
    case 'progress':
      tab = 'progress';
      screen = <ProgressScreen exerciseId={arg} />;
      break;
    case 'routines':
      tab = 'routines';
      screen = <RoutinesScreen />;
      break;
    case 'routine':
      screen = <RoutineEditScreen id={arg} />;
      break;
    case 'more':
      tab = 'more';
      screen = <MoreScreen />;
      break;
    case 'exercises':
      screen = <ExercisesScreen />;
      break;
    default:
      tab = 'cal';
      screen = <CalendarScreen selected={selected} onSelect={setSelected} />;
  }

  return (
    <div className="app">
      <main>{screen}</main>
      {tab && (
        <nav className="tabbar" aria-label="Main">
          <TabLink to="#/" current={tab === 'cal'} label="Calendar" icon={<IconCalendar />} />
          <TabLink to={href('progress')} current={tab === 'progress'} label="Progress" icon={<IconChart />} />
          <TabLink to={href('routines')} current={tab === 'routines'} label="Routines" icon={<IconRepeat />} />
          <TabLink to={href('more')} current={tab === 'more'} label="More" icon={<IconMore />} />
        </nav>
      )}
      <ToastHost />
    </div>
  );
}

function TabLink({ to, current, label, icon }: { to: string; current: boolean; label: string; icon: React.ReactNode }) {
  // Tabs replace history so the back button doesn't walk through every tab.
  return (
    <Link to={to} replace aria-current={current ? 'page' : undefined}>
      {icon}
      {label}
    </Link>
  );
}
