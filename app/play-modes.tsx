import type { ReactNode } from 'react';
import { Globe, User, Users } from 'lucide-react';
import './play-modes.css';

// Who plays the raid: the first thing in the hub, so that the three ways
// (alone, two on one device, two over the network) are seen before anything
// else and each opens only its own few controls.
export type PlayMode = 'solo' | 'local' | 'online';

const MODES = [
  { id: 'solo', name: 'Сам', hint: 'Один гравець', Icon: User },
  { id: 'local', name: 'Вдвох тут', hint: 'Один екран', Icon: Users },
  { id: 'online', name: 'Вдвох по мережі', hint: 'Кімната з кодом', Icon: Globe },
] as const;

export function PlayModes({
  mode,
  onMode,
  roomOpen,
  children,
}: {
  mode: PlayMode;
  onMode: (mode: PlayMode) => void;
  // A room is open: the other ways wait until it is closed.
  roomOpen: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="play-modes" aria-label="Хто грає">
      <span className="micro play-modes-title">ХТО ГРАЄ?</span>
      <div className="play-modes-tabs" role="radiogroup" aria-label="Хто грає">
        {MODES.map(({ id, name, hint, Icon }) => {
          const locked = roomOpen && id !== 'online';
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              disabled={locked}
              title={locked ? 'Спершу закрий кімнату' : undefined}
              className={`play-mode${mode === id ? ' active' : ''}`}
              onClick={() => onMode(id)}
            >
              <span className="play-mode-icon">
                <Icon size={20} />
              </span>
              <span className="play-mode-text">
                <b>{name}</b>
                <small>{hint}</small>
              </span>
            </button>
          );
        })}
      </div>
      {children}
    </section>
  );
}
