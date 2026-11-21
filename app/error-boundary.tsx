import {
  Component,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { PROFILE_BACKUP_KEY } from '@/lib/game/profile';
import { SAVE_KEY } from '@/lib/game/model';
import { readSave, saveData } from '@/lib/game/save';

// A saved raid is the likeliest thing to crash the page again after a reload,
// so the second way out drops the raid and keeps the progress. The old save
// stays as the backup that "restore profile" in the settings brings back.
function dropRaid() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) localStorage.setItem(PROFILE_BACKUP_KEY, saved);
  localStorage.setItem(SAVE_KEY, saveData(readSave(saved).meta, null));
  location.reload();
}

// The last wall against a white page: when drawing fails, the player gets a
// way back instead of nothing.
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="crash" role="alert">
        <h1>Гра зупинилась через помилку</h1>
        <p>
          Прогрес лишився в збереженні. Перезавантаж сторінку, і гра відкриється
          знову.
        </p>
        <button
          type="button"
          className="primary"
          onClick={() => location.reload()}
        >
          Перезавантажити
        </button>
        <p>
          Якщо помилка повториться, скинь поточний рейд: ядра й відкриті
          предмети лишаться.
        </p>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (
              confirm(
                'Поточний рейд буде скинуто, прогрес лишиться. Продовжити?',
              )
            )
              dropRaid();
          }}
        >
          Скинути поточний рейд
        </button>
      </main>
    );
  }
}

// Dev only: a check in the browser breaks the page on purpose with
// window.__osbbCrash(), to see this screen instead of taking it on trust.
let broken = false;
const listeners = new Set<() => void>();
export function CrashSwitch() {
  const on = useSyncExternalStore(
    (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    () => broken,
  );
  if (on) throw new Error('crash switched on by __osbbCrash');
  return null;
}
if (import.meta.env.DEV)
  Object.assign(window, {
    __osbbCrash: () => {
      broken = true;
      listeners.forEach((listener) => listener());
    },
  });
