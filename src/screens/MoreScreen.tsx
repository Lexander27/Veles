import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db, deleteAllWorkouts, exportBackup, importBackup, resetEverything, undoImport } from '../db';
import { IconDownload, IconDumbbell, IconEdit, IconNext, IconUpload } from '../components/Icons';
import { toast } from '../components/Toast';
import { formatShort, toDateStr, todayStr } from '../lib/dates';
import type { ImportRecord } from '../lib/types';
import { href, Link } from '../router';

export function MoreScreen() {
  const counts = useLiveQuery(async () => ({
    exercises: await db.exercises.filter((e) => !e.archived).count(),
    entries: await db.entries.count(),
    days: new Set((await db.entries.toArray()).map((e) => e.date)).size,
  }), []);
  const lastBackup = useLiveQuery(() => db.meta.get('lastBackup').then((m) => (m?.value as string | undefined) ?? null), []);
  const imports = useLiveQuery(() => db.meta.get('imports').then((m) => (m?.value as ImportRecord[] | undefined) ?? []), []);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const doExport = async () => {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const name = `veles-backup-${todayStr()}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    // On Android, the share sheet lets you save to Drive, Files, email…
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Veles backup' });
        await db.meta.put({ key: 'lastBackup', value: todayStr() });
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await db.meta.put({ key: 'lastBackup', value: todayStr() });
    toast('Backup saved');
  };

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!confirm('Restore this backup? It replaces ALL data on this phone. This cannot be undone.')) return;
      await importBackup(data);
      toast('Backup restored');
    } catch (e) {
      alert(e instanceof Error && e.message.includes('Veles') ? e.message : 'Could not read this file. Is it a Veles backup?');
    }
  };

  const askPersist = async () => {
    const ok = await navigator.storage?.persist?.();
    setPersisted(!!ok);
    toast(ok ? 'Storage is now protected' : 'The browser did not allow it yet — installing the app usually helps');
  };

  return (
    <div className="screen">
      <h1 className="h1">More</h1>

      <div className="list">
        <Link className="list-row" to={href('exercises')}>
          <span className="tile">
            <IconDumbbell size={20} />
          </span>
          <span className="stack grow" style={{ gap: 2 }}>
            <span className="title">Exercises</span>
            <span className="sub">{counts ? `${counts.exercises} in your library` : ' '}</span>
          </span>
          <IconNext size={18} style={{ color: '#9aa0ab' }} />
        </Link>
        <Link className="list-row" to={href('import')}>
          <span className="tile">
            <IconEdit size={20} />
          </span>
          <span className="stack grow" style={{ gap: 2 }}>
            <span className="title">Import from notes</span>
            <span className="sub">Paste old workouts, like “Lat pulldown 50x10”</span>
          </span>
          <IconNext size={18} style={{ color: '#9aa0ab' }} />
        </Link>
      </div>

      {imports && imports.length > 0 && (
        <section className="stack" style={{ gap: 0 }} aria-labelledby="imports-h">
          <h2 id="imports-h" className="label" style={{ paddingBottom: 4 }}>Recent imports</h2>
          {imports.map((r) => (
            <div key={r.id} className="list-row" style={{ minHeight: 56 }}>
              <span className="stack grow" style={{ gap: 1 }}>
                <span style={{ fontWeight: 500 }}>{r.entries} exercises on {r.days} days</span>
                <span className="small muted">Imported {formatShort(toDateStr(new Date(r.at)))}</span>
              </span>
              <button
                className="btn danger sm"
                onClick={async () => {
                  if (!confirm(`Undo this import? Its ${r.entries} exercises on ${r.days} days will be removed, including any changes you made to them.`)) return;
                  await undoImport(r.id);
                  toast('Import undone');
                }}
              >
                Undo
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="card" style={{ gap: 12 }} aria-labelledby="backup-h">
        <h2 id="backup-h" className="h2">Backup</h2>
        <span className="small muted" style={{ lineHeight: 1.5 }}>
          Your data lives only on this phone, nothing is sent anywhere. Export a backup file now and then, so a reset phone doesn’t cost you your history.
          {counts && ` You have ${counts.days} workout ${counts.days === 1 ? 'day' : 'days'} logged.`}
        </span>
        <span className="small" style={{ fontWeight: 600 }}>Last backup: {lastBackup ? formatShort(lastBackup) : 'never'}</span>
        <div className="row">
          <button className="btn primary grow" onClick={doExport}>
            <IconDownload size={18} /> Export
          </button>
          <button className="btn outline grow" onClick={() => fileInput.current?.click()}>
            <IconUpload size={18} /> Restore
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void doImport(f);
            }}
          />
        </div>
      </section>

      <section className="card" style={{ gap: 8 }} aria-labelledby="storage-h">
        <h2 id="storage-h" className="h2">Storage</h2>
        <span className="small muted" style={{ lineHeight: 1.5 }}>
          {persisted
            ? 'Protected: the browser won’t clear Veles data to free up space.'
            : 'Not protected yet. Add Veles to your home screen, then tap below so Android keeps the data even when space runs low.'}
        </span>
        {!persisted && (
          <button className="btn soft" onClick={askPersist}>
            Protect my data
          </button>
        )}
      </section>

      <section className="card" style={{ gap: 10 }} aria-labelledby="delete-h">
        <h2 id="delete-h" className="h2">Delete data</h2>
        <span className="small muted" style={{ lineHeight: 1.5 }}>Export a backup first if you might want it back. These can’t be undone.</span>
        <button
          className="btn danger block"
          onClick={async () => {
            if (!confirm('Delete ALL logged workouts? Your exercises and routines stay.')) return;
            if (!confirm('Are you sure? Every workout and all progress will be gone.')) return;
            await deleteAllWorkouts();
            toast('All workouts deleted');
          }}
        >
          Delete all workouts
        </button>
        <button
          className="btn danger block"
          onClick={async () => {
            if (!confirm('Reset Veles? Workouts, routines and your own exercises will all be deleted, like a fresh install.')) return;
            if (!confirm('Are you sure? This deletes everything.')) return;
            await resetEverything();
            toast('Veles has been reset');
          }}
        >
          Reset everything
        </button>
      </section>

      <p className="small muted" style={{ textAlign: 'center' }}>Veles v{__APP_VERSION__} · works offline</p>
    </div>
  );
}
