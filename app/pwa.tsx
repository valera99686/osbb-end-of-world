import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
// The prompt can fire before React mounts, so catch it at import time.
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function standalone() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}
export function useInstallPrompt(enabled: boolean) {
  const prompt = useSyncExternalStore(
    subscribe,
    () => deferred,
    () => null,
  );
  async function install() {
    const e = deferred;
    if (!e) return;
    deferred = null;
    notify();
    try {
      await e.prompt();
      await e.userChoice;
    } catch {
      // The browser may refuse a second prompt; the button is gone anyway.
    }
  }
  return { canInstall: enabled && !!prompt && !standalone(), install };
}
// Registers the offline worker and reports a newer version waiting to take
// over. Reloads only after the player asks for it.
export function useServiceWorker(enabled: boolean) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const requested = useRef(false);
  useEffect(() => {
    if (
      !enabled ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    )
      return;
    const sw = navigator.serviceWorker;
    let reg: ServiceWorkerRegistration | null = null,
      alive = true;
    const onController = () => {
      if (requested.current) window.location.reload();
    };
    const offer = (worker: ServiceWorker | null) => {
      if (alive && worker && sw.controller) setWaiting(worker);
    };
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => {
        if (worker.state === 'installed') offer(worker);
      };
      check();
      worker.addEventListener('statechange', check);
    };
    const onFound = () => track(reg?.installing ?? null);
    const onVisible = () => {
      if (!document.hidden) reg?.update().catch(() => {});
    };
    sw.addEventListener('controllerchange', onController);
    document.addEventListener('visibilitychange', onVisible);
    sw.register('/sw.js')
      .then((r) => {
        reg = r;
        offer(r.waiting);
        track(r.installing);
        r.addEventListener('updatefound', onFound);
      })
      .catch(() => {});
    return () => {
      alive = false;
      sw.removeEventListener('controllerchange', onController);
      document.removeEventListener('visibilitychange', onVisible);
      reg?.removeEventListener('updatefound', onFound);
    };
  }, [enabled]);
  function update() {
    requested.current = true;
    if (!waiting) return window.location.reload();
    waiting.postMessage('skipWaiting');
    // Old workers without the message handler never hand over.
    setTimeout(() => window.location.reload(), 4000);
  }
  return { updateReady: !!waiting, update };
}
