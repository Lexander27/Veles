import { createElement, useEffect, useState, type AnchorHTMLAttributes } from 'react';

// Tiny hash router: '#/entry/abc' → ['entry', 'abc']. Hash routes keep the
// Android back button working and need no server config on static hosting.

function current(): string[] {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
}

// How many in-app screens deep we are, so "back" never leaves the app.
let depth = 0;
let pushing = false;
let replacing = false;

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    if (pushing) depth++;
    else if (!replacing) depth = Math.max(0, depth - 1);
    pushing = false;
    replacing = false;
  });
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const on = () => setRoute(current());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function href(...parts: string[]): string {
  return '#/' + parts.map(encodeURIComponent).join('/');
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (path === window.location.hash || (path === '#/' && window.location.hash === '')) return;
  if (opts.replace) {
    replacing = true;
    window.location.replace(path);
  } else {
    pushing = true;
    window.location.hash = path.replace(/^#/, '');
  }
}

/** An in-app link: a real <a href> that navigates through the router. */
export function Link({ to, replace, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean }) {
  return createElement('a', {
    ...rest,
    href: to,
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      navigate(to, { replace });
    },
  });
}

/** Go back one screen, or to a fallback when the app was opened on this screen. */
export function goBack(fallback = '#/'): void {
  if (depth > 0) window.history.back();
  else navigate(fallback, { replace: true });
}
