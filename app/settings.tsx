import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Copy,
  Download,
  FileUp,
  Music,
  RotateCcw,
  Save,
  Upload,
  Volume2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { dateKey } from '@/lib/game/modes';
import {
  exportSave,
  type Meta,
  type Run,
  type Settings,
} from '@/lib/game/model';

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className={`settings-toggle ${value ? 'on' : ''}`}
      onClick={() => onChange(!value)}
    >
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <i aria-hidden="true" />
    </button>
  );
}
function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: [number, string][];
  onChange: (value: number) => void;
}) {
  return (
    <div className="settings-row">
      <b>{label}</b>
      <div className="filter-buttons" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            className={value === v ? 'active' : ''}
            onClick={() => onChange(v)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
function Volume({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <label className="settings-range">
      <span>
        {icon} {label}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{ '--fill': `${percent}%` } as CSSProperties}
      />
      <b>{percent}%</b>
    </label>
  );
}
export function SettingsDialog({
  open,
  onOpenChange,
  meta,
  run,
  native,
  locked,
  hasProfileBackup,
  onChange,
  onImport,
  onProfileAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: Meta;
  run: Run | null;
  native: boolean;
  // Mid-battle the profile cannot be swapped out from under the engine.
  locked: boolean;
  hasProfileBackup: boolean;
  onChange: (settings: Settings) => void;
  onImport: (code: string) => string | null;
  onProfileAction: (action: 'reset' | 'restore') => void;
}) {
  const s = meta.settings;
  const [showCode, setShowCode] = useState(false),
    [copied, setCopied] = useState<{ code: string; text: string } | null>(null),
    [draft, setDraft] = useState(''),
    [error, setError] = useState(''),
    [wasOpen, setWasOpen] = useState(open);
  // Android back, gamepad B and the profile actions close the dialog from
  // outside, so the reset keys off `open` itself: every opening starts clean.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setShowCode(false);
      setCopied(null);
      setDraft('');
      setError('');
    }
  }
  // Built from the current profile, so the shown code is never older than it.
  const code = useMemo(
    () => (showCode ? exportSave(meta, run) : ''),
    [showCode, meta, run],
  );
  const area = useRef<HTMLTextAreaElement>(null),
    file = useRef<HTMLInputElement>(null);
  const vibrate =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const set = (patch: Partial<Settings>) => onChange({ ...s, ...patch });
  async function copy() {
    const text = code;
    try {
      await navigator.clipboard.writeText(text);
      setCopied({
        code: text,
        text: 'Код скопійовано. Встав його на іншому пристрої.',
      });
    } catch {
      area.current?.focus();
      area.current?.select();
      setCopied({ code: text, text: 'Код виділено — скопіюй його вручну.' });
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([code], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `osbb-save-${dateKey(new Date())}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function load() {
    const message = onImport(draft);
    if (message) setError(message);
    else onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="game-modal settings-modal">
        <DialogTitle>Налаштування</DialogTitle>
        <DialogDescription>
          Зміни діють одразу й зберігаються на цьому пристрої.
        </DialogDescription>
        <section className="settings-section">
          <h3>Звук</h3>
          <Volume
            label="Музика"
            icon={<Music size={16} />}
            value={s.music}
            onChange={(music) => set({ music })}
          />
          <Volume
            label="Ефекти"
            icon={<Volume2 size={16} />}
            value={s.sfx}
            onChange={(sfx) => set({ sfx })}
          />
          {!meta.sound && (
            <p className="settings-note">
              Звук вимкнено кнопкою на верхній панелі.
            </p>
          )}
        </section>
        <section className="settings-section">
          <h3>Бій</h3>
          <Segmented
            label="Тряска екрана"
            value={s.shake}
            options={[
              [0, '0%'],
              [0.5, '50%'],
              [1, '100%'],
            ]}
            onChange={(shake) => set({ shake })}
          />
          <Toggle
            label="Числа шкоди"
            hint="Показувати шкоду над ворогами."
            value={s.damageNumbers}
            onChange={(damageNumbers) => set({ damageNumbers })}
          />
          <Toggle
            label="Менше спалахів"
            hint="Приглушує спалахи, миготіння й пульсацію екрана."
            value={s.reducedFlashes}
            onChange={(reducedFlashes) => set({ reducedFlashes })}
          />
          <Toggle
            label="Вібрація"
            hint={
              vibrate
                ? 'Короткий відгук на удари, ривок і перемогу.'
                : 'Цей пристрій або браузер не підтримує вібрацію.'
            }
            value={s.vibration}
            onChange={(vibration) => set({ vibration })}
          />
        </section>
        <section className="settings-section">
          <h3>Доступність</h3>
          <Segmented
            label="Розмір тексту"
            value={s.textScale}
            options={[
              [1, '100%'],
              [1.15, '115%'],
              [1.3, '130%'],
            ]}
            onChange={(textScale) => set({ textScale })}
          />
          <Toggle
            label="Кольори для дальтоніків"
            hint="Контрастніші кольори снарядів, небезпечних зон і посилених ворогів."
            value={s.colorblind}
            onChange={(colorblind) => set({ colorblind })}
          />
        </section>
        <section className="settings-section">
          <h3>Збереження</h3>
          <p className="settings-note">
            Перенеси прогрес на інший пристрій: створи код тут і встав його там.
            Поточний рейд теж зберігається в коді.
          </p>
          {code ? (
            <>
              <textarea
                ref={area}
                className="settings-code"
                readOnly
                rows={4}
                value={code}
                aria-label="Код збереження"
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="settings-actions">
                <button type="button" className="secondary" onClick={copy}>
                  <Copy size={16} /> Копіювати
                </button>
                {!native && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={download}
                  >
                    <Download size={16} /> Завантажити .txt
                  </button>
                )}
              </div>
              {copied?.code === code && (
                <p className="settings-note" aria-live="polite">
                  {copied.text}
                </p>
              )}
            </>
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={() => setShowCode(true)}
            >
              <Upload size={16} /> Створити код збереження
            </button>
          )}
          <label className="settings-field">
            <b>Імпорт профілю</b>
            <textarea
              className="settings-code"
              rows={3}
              value={draft}
              placeholder="Встав код OSBB1:…"
              onChange={(e) => {
                setDraft(e.target.value);
                setError('');
              }}
            />
          </label>
          <div className="settings-actions">
            <button
              type="button"
              className="secondary"
              disabled={!draft.trim() || locked}
              onClick={load}
            >
              <Save size={16} /> Завантажити
            </button>
            {!native && (
              <button
                type="button"
                className="secondary"
                disabled={locked}
                onClick={() => file.current?.click()}
              >
                <FileUp size={16} /> Відкрити файл
              </button>
            )}
            <input
              ref={file}
              type="file"
              accept=".txt,text/plain"
              hidden
              onChange={(e) => {
                const picked = e.target.files?.[0];
                e.target.value = '';
                if (!picked) return;
                picked
                  .text()
                  .then((text) => {
                    setDraft(text.slice(0, 200000));
                    setError('');
                  })
                  .catch(() => setError('Не вдалося прочитати файл.'));
              }}
            />
          </div>
          {error && (
            <p className="settings-error" role="alert">
              {error}
            </p>
          )}
          <p className="settings-note">
            Перед імпортом або скиданням поточний профіль зберігається як
            резервна копія.
            {locked && ' Під час бою профіль змінювати не можна.'}
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="secondary danger"
              disabled={locked}
              onClick={() => onProfileAction('reset')}
            >
              Скинути весь прогрес
            </button>
            {hasProfileBackup && (
              <button
                type="button"
                className="secondary"
                disabled={locked}
                onClick={() => onProfileAction('restore')}
              >
                <RotateCcw size={16} /> Відновити прогрес до скидання
              </button>
            )}
          </div>
        </section>
        <button className="primary" onClick={() => onOpenChange(false)}>
          Готово
        </button>
      </DialogContent>
    </Dialog>
  );
}
