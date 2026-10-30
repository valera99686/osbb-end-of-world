import { Lock, Users } from 'lucide-react';
import { CHARACTERS } from '@/lib/game/data';
import { coopPartners } from '@/lib/game/coop';
import { heroAbility } from '@/lib/game/heroes';
import { Glyph } from './glyph';

// Local co-op switch for the hub: two players on one device. The partner may
// be any head of ОСББ the profile has opened, the first player's too.
export function CoopSelect({
  wins,
  value,
  onChange,
}: {
  wins: number;
  // The partner's hero id, '' when playing alone.
  value: string;
  onChange: (hero: string) => void;
}) {
  const open = coopPartners(wins),
    on = !!value,
    partner = CHARACTERS.find((c) => c.id === value);
  return (
    <div className={`coop-select${on ? ' on' : ''}`}>
      <div className="coop-head">
        <span className="micro">
          <Users size={14} /> ВДВОХ НА ОДНОМУ ПРИСТРОЇ
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className={`coop-switch${on ? ' active' : ''}`}
          onClick={() => onChange(on ? '' : (open[0]?.id ?? ''))}
        >
          {on ? 'Увімкнено' : 'Вимкнено'}
        </button>
      </div>
      {on ? (
        <>
          <div className="coop-heroes" aria-label="Герой другого гравця">
            {CHARACTERS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`crew-option ${value === c.id ? 'active' : ''}`}
                disabled={c.win > wins}
                onClick={() => onChange(c.id)}
                title={
                  c.win > wins ? `Заверши ${c.win} повних експедицій` : c.desc
                }
              >
                {c.win > wins ? (
                  <Lock size={15} />
                ) : (
                  <Glyph name={c.icon} size={17} />
                )}
                <span>{c.name}</span>
              </button>
            ))}
          </div>
          <p>
            <b>Другий гравець: {partner?.name}.</b>{' '}
            {partner ? `${heroAbility(partner.id).name}: ${heroAbility(partner.id).text}` : ''}{' '}
            Перший веде будинок (<b>WASD</b>, пробіл, <b>E</b>), другий —
            другий будинок на ногах зі стрілками (<b>← ↑ ↓ →</b>, <b>/</b> —
            ривок, <b>.</b> — вміння). У кожного будинку свої модулі: нагороди й
            магазин діляться на двох, гроші спільні й удвічі щедріші. Другий
            геймпад теж підходить. Ворогів удвічі більше, і босів теж двоє (по одному на
            кожного), зате й гармат удвічі більше.
          </p>
        </>
      ) : (
        <p>
          Другий гравець із клавіатури, геймпада чи екрана. Без мережі й без
          рахунків.
        </p>
      )}
    </div>
  );
}
