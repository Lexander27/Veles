import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Bottom sheet dialog. Closes on backdrop tap and Escape.
 * `tall`: full height, for sheets with a search box, so the list doesn't drop behind the keyboard as it gets shorter.
 */
export function Sheet({ label, onClose, children, tall }: { label: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${tall ? ' tall' : ''}`} role="dialog" aria-modal="true" aria-label={label} ref={ref} tabIndex={-1}>
        <div className="handle" />
        {children}
      </div>
    </div>
  );
}
