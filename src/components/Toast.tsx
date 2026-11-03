import { useEffect, useState } from 'react';

let push: ((msg: string) => void) | null = null;

export function toast(msg: string): void {
  push?.(msg);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    push = (m) => {
      setMsg(m);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2600);
    };
    return () => {
      push = null;
      clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  return (
    <div className="toast" role="status">
      {msg}
    </div>
  );
}
