import { Lock } from 'lucide-react';
import { CHARACTERS } from '@/lib/game/data';
import { heroAbility } from '@/lib/game/heroes';
import { Glyph } from './glyph';

// The partner's hero for two players on one device (the "Вдвох тут" mode of
// the hub). The partner may be any head of ОСББ the profile has opened, the
// first player's too.
export function CoopSelect({
  wins,
  value,
  onChange,
}: {
  wins: number;
  // The partner's hero id.
  value: string;
  onChange: (hero: string) => void;
}) {
  const partner = CHARACTERS.find((c) => c.id === value);
  return (
    <div className="coop-select on">
      <div className="coop-heroes" aria-label="Герой другого гравця">
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`crew-option ${value === c.id ? 'active' : ''}`}
            disabled={c.win > wins}
            onClick={() => onChange(c.id)}
            title={c.win > wins ? `Заверши ${c.win} повних експедицій` : c.desc}
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
        {partner ? `${heroAbility(partner.id).name}.` : ''} Ти: <b>WASD</b>,
        пробіл, <b>E</b>. Друг: <b>← ↑ ↓ →</b>, <b>/</b>, <b>.</b> (або другий
        геймпад).
      </p>
      <p>Ворогів удвічі більше, нагороди й магазин діляться на двох.</p>
    </div>
  );
}
