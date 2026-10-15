import { useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { ACHIEVEMENT_BY_ID } from '@/lib/game/achievements';
import { AchievementIcon } from './records';

export type Toast =
  | { id: string; kind: 'achievement'; ids: string[] }
  | { id: string; kind: 'update' };
// Bursts (an old profile catching up) collapse into one summary card.
export function achievementToasts(ids: string[]): Toast[] {
  const known = ids.filter((id) => ACHIEVEMENT_BY_ID[id]);
  if (!known.length) return [];
  if (known.length <= 2)
    return known.map((id) => ({
      id: 'a-' + id,
      kind: 'achievement',
      ids: [id],
    }));
  return [{ id: 'a-' + known.join('-'), kind: 'achievement', ids: known }];
}
function AchievementToast({
  toast,
  onDismiss,
}: {
  toast: Extract<Toast, { kind: 'achievement' }>;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 5200);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);
  const first = ACHIEVEMENT_BY_ID[toast.ids[0]];
  const many = toast.ids.length > 1;
  return (
    <div className="toast achievement-toast">
      <span className="achievement-icon">
        <AchievementIcon name={many ? 'Trophy' : first.icon} size={20} />
      </span>
      <div>
        <small>
          {many
            ? `НОВІ ДОСЯГНЕННЯ · ${toast.ids.length}`
            : 'ДОСЯГНЕННЯ ВІДКРИТО'}
        </small>
        <b>
          {many
            ? toast.ids
                .slice(0, 3)
                .map((id) => ACHIEVEMENT_BY_ID[id].title)
                .join(', ') + (toast.ids.length > 3 ? '…' : '')
            : first.title}
        </b>
        {!many && <p>{first.text}</p>}
      </div>
      <button aria-label="Закрити" onClick={() => onDismiss(toast.id)}>
        <X size={16} />
      </button>
    </div>
  );
}
export function Toasts({
  items,
  onDismiss,
  onUpdate,
}: {
  items: Toast[];
  onDismiss: (id: string) => void;
  onUpdate: () => void;
}) {
  return (
    <div className="toast-stack" aria-live="polite">
      {items.slice(0, 3).map((toast) =>
        toast.kind === 'update' ? (
          <div className="toast update-toast" key={toast.id}>
            <span className="achievement-icon">
              <RefreshCw size={20} />
            </span>
            <div>
              <small>НОВА ВЕРСІЯ</small>
              <b>Доступне оновлення</b>
              <p>Прогрес збережено. Перезапуск займе секунду.</p>
            </div>
            <span className="toast-actions">
              <button className="primary small" onClick={onUpdate}>
                Оновити
              </button>
              <button aria-label="Пізніше" onClick={() => onDismiss(toast.id)}>
                <X size={16} />
              </button>
            </span>
          </div>
        ) : (
          <AchievementToast
            key={toast.id}
            toast={toast}
            onDismiss={onDismiss}
          />
        ),
      )}
    </div>
  );
}
