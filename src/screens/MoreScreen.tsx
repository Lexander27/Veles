import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db, exportBackup, importBackup } from '../db';
import { IconDownload, IconDumbbell, IconNext, IconUpload } from '../components/Icons';
import { toast } from '../components/Toast';
import { formatShort, todayStr } from '../lib/dates';
import { href, Link } from '../router';

export function MoreScreen() {
  const counts = useLiveQuery(async () => ({
    exercises: await db.exercises.filter((e) => !e.archived).count(),
    entries: await db.entries.count(),
    days: new Set((await db.entries.toArray()).map((e) => e.date)).size,
  }), []);
  const lastBackup = useLiveQuery(() => db.meta.get('lastBackup').then((m) => (m?.value as string | undefined) ?? null), []);
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
      if (!confirm('Replace ALL data on this phone with this backup? This cannot be undone.')) return;
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
      </div>

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
            <IconUpload size={18} /> Import
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

      <p className="small muted" style={{ textAlign: 'center' }}>Veles v{__APP_VERSION__} · works offline</p>
    </div>
  );
}
