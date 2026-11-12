// The proposed purchases of docs/finmodel.md, shown where they would live in
// the game: the Shelter, the end of a won raid, the Workshop, the campaign and
// a shop in the main menu. Every one is a demo: no payment is connected and
// nothing is sold.
import {
  ArrowLeft,
  BatteryCharging,
  Building2,
  Coffee,
  Disc3,
  Gift,
  Hexagon,
  Lock,
  Paintbrush,
  Sparkles,
  UserPlus,
  Warehouse,
} from 'lucide-react';
import type { ComponentType } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export type OfferId =
  | 'coffee'
  | 'record'
  | 'cores-s'
  | 'cores-m'
  | 'cores-l'
  | 'generator'
  | 'storage'
  | 'facade-mosaic'
  | 'facade-brick'
  | 'garland'
  | 'chapter'
  | 'hero'
  | 'bundle';

type Section = 'support' | 'cores' | 'comfort' | 'look' | 'content' | 'bundle';

type Offer = {
  section: Section;
  title: string;
  price: string;
  buy: string;
  gives: string;
  honest: string;
  Icon: ComponentType<{ size?: number }>;
};

const SECTIONS: { id: Section; title: string; note: string }[] = [
  {
    id: 'support',
    title: 'Підтримати розробку',
    note: 'Подяка автору. На проходження не впливає.',
  },
  {
    id: 'cores',
    title: 'Ядра',
    note: 'Валюта Майстерні. Перемоги дає вміння, а не ядра.',
  },
  {
    id: 'comfort',
    title: 'Зручність',
    note: 'Пришвидшує тих, кому важко. У змаганнях не діє.',
  },
  {
    id: 'look',
    title: 'Вигляд будинку',
    note: 'Лише вигляд: на бій не впливає.',
  },
  {
    id: 'content',
    title: 'Доповнення',
    note: 'Новий зміст після сюжету. Подовжує гру, а не скорочує.',
  },
  { id: 'bundle', title: 'Набори', note: 'Кілька покупок разом, дешевше.' },
];

export const OFFERS: Record<OfferId, Offer> = {
  coffee: {
    section: 'support',
    title: 'Кава для ОСББ',
    price: '40 грн',
    buy: 'Пригостити',
    gives:
      '+50% ядер після кожного рейду й кружка на фасаді будинку. Раз і назавжди, без підписок.',
    honest:
      'ботами перевірено: перемог кава не купує, сюжет іде стільки ж часу. Це подяка розробнику, а не прискорення.',
    Icon: Coffee,
  },
  record: {
    section: 'support',
    title: 'Платівка Притулку',
    price: '50 грн',
    buy: 'Купити',
    gives:
      'Музика гри файлами для плеєра: чотири теми локацій і Притулку, кожна в трьох шарах.',
    honest:
      'у самій грі вся музика й так звучить безкоштовно: це сувенір і подяка автору.',
    Icon: Disc3,
  },
  'cores-s': {
    section: 'cores',
    title: 'Жменя ядер',
    price: '20 грн',
    buy: 'Купити',
    gives: '10 ядер: приблизно стільки дає один програний рейд.',
    honest:
      'ядра лише раніше відкривають креслення й модифікатори Майстерні (усі разом коштують 169 ядер). Ботами перевірено: +50% ядер не скоротили проходження.',
    Icon: Hexagon,
  },
  'cores-m': {
    section: 'cores',
    title: 'Ящик ядер',
    price: '50 грн',
    buy: 'Купити',
    gives: '30 ядер: приблизно стільки дає один виграний рейд.',
    honest:
      'ядра лише раніше відкривають креслення й модифікатори Майстерні. Ботами перевірено: +50% ядер не скоротили проходження.',
    Icon: Hexagon,
  },
  'cores-l': {
    section: 'cores',
    title: 'Контейнер ядер',
    price: '120 грн',
    buy: 'Купити',
    gives: '80 ядер: майже половина всієї Майстерні.',
    honest:
      'Майстерня відкриється раніше, але перемогу на складності 10 однаково треба вибороти: прокачка без уважності не виграє (ботами перевірено).',
    Icon: Hexagon,
  },
  generator: {
    section: 'comfort',
    title: 'Запасний генератор',
    price: '80 грн',
    buy: 'Купити',
    gives:
      'Раз за рейд упалий будинок підводиться з половиною міцності. Перед рейдом його можна вимкнути.',
    honest:
      'ботами перевірено: неуважному гравцеві сюжет коротшає з 14 до 10 год, уважному майже нічого не дає. У денному забігу не діє, а досягнення «жар 10» з ним позначається.',
    Icon: BatteryCharging,
  },
  storage: {
    section: 'comfort',
    title: 'Більший склад',
    price: '30 грн',
    buy: 'Купити',
    gives:
      'Склад запасних модулів на 60 місць замість 30: менше доводиться розбирати знахідки.',
    honest: 'запасні модулі в бою не діють, тож це лише зручність, а не сила.',
    Icon: Warehouse,
  },
  'facade-mosaic': {
    section: 'look',
    title: 'Фасад «Мозаїка»',
    price: '60 грн',
    buy: 'Купити',
    gives:
      'Смальтова мозаїка з соняшниками на торці будинку, у бою й у Притулку.',
    honest: 'лише вигляд: міцність, шкода й швидкість ті самі.',
    Icon: Paintbrush,
  },
  'facade-brick': {
    section: 'look',
    title: 'Фасад «Цегла 70-х»',
    price: '60 грн',
    buy: 'Купити',
    gives: 'Червона цегла, дерев’яні рами й бабусині фіранки.',
    honest: 'лише вигляд: міцність, шкода й швидкість ті самі.',
    Icon: Paintbrush,
  },
  garland: {
    section: 'look',
    title: 'Гірлянди на балконах',
    price: '30 грн',
    buy: 'Купити',
    gives: 'Різнокольорові вогники на балконах, що блимають у такт музиці.',
    honest: 'лише вигляд; з налаштуванням «Менше спалахів» не блимають.',
    Icon: Sparkles,
  },
  chapter: {
    section: 'content',
    title: 'Розділ «Сусідній будинок»',
    price: '120–200 грн',
    buy: 'Купити',
    gives:
      'Четверта локація після фіналу: новий бос, два герої й розділ сюжету.',
    honest:
      'подовжує гру приблизно на 3–5 год (оцінка), а не скорочує її. Самого розділу ще немає: це план.',
    Icon: Building2,
  },
  hero: {
    section: 'content',
    title: 'Герой: двірник Степан',
    price: '60 грн',
    buy: 'Купити',
    gives:
      'Десятий голова ОСББ зі своїм вмінням (мітла-вихор відкидає ворогів) і епілогом.',
    honest:
      'не сильніший за дев’ятьох безкоштовних героїв, лише інший. Героя ще немає: це план.',
    Icon: UserPlus,
  },
  bundle: {
    section: 'bundle',
    title: 'Пакет управдома',
    price: '150 грн',
    buy: 'Купити',
    gives:
      'Кава для ОСББ, Запасний генератор і Ящик ядер разом (окремо 170 грн).',
    honest:
      'те саме, що й окремо: гру не проходить за тебе, а скіл однаково сильніший.',
    Icon: Gift,
  },
};

export function DemoOffer({
  offer,
  onClose,
}: {
  offer: OfferId | null;
  onClose: () => void;
}) {
  const o = offer ? OFFERS[offer] : null;
  return (
    <Dialog open={!!o} onOpenChange={(open) => !open && onClose()}>
      {o && (
        <DialogContent className="game-modal coffee-modal">
          <DialogTitle>
            <o.Icon size={20} /> {o.title}
          </DialogTitle>
          <DialogDescription>
            Демо: так виглядала б добровільна покупка, якщо гру випустити в
            Google Play. Оплата не підключена, нічого не продається. Уся гра
            проходиться безкоштовно.
          </DialogDescription>
          <div className="coffee-offer">
            <b>{o.price}</b>
            <span>{o.gives}</span>
          </div>
          <p className="help-settings-note">Чесно: {o.honest}</p>
          <button className="primary" disabled>
            {o.buy} · {o.price}
          </button>
          <p className="help-settings-note">
            Пропозиція з фінмоделі (docs/finmodel.md). Реклами в грі немає й не
            буде, а там, де є змагання, покупки не діють.
          </p>
          <button className="secondary" onClick={onClose}>
            Зрозуміло
          </button>
        </DialogContent>
      )}
    </Dialog>
  );
}

// The shop of the main menu: every proposed purchase on one page, by section.
export function DemoShop({
  onBack,
  onOffer,
}: {
  onBack: () => void;
  onOffer: (id: OfferId) => void;
}) {
  const ids = Object.keys(OFFERS) as OfferId[];
  return (
    <section className="collection-page demo-shop">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} /> Головне меню
      </button>
      <p className="eyebrow">ДЕМО · ОПЛАТА НЕ ПІДКЛЮЧЕНА</p>
      <div className="collection-title">
        <div>
          <h2>Магазин ОСББ</h2>
          <p className="lead">
            Так виглядав би магазин, якщо гру випустити в Google Play. Уся гра
            проходиться безкоштовно; покупки разові й добровільні, реклами немає
            й не буде.
          </p>
        </div>
      </div>
      {SECTIONS.map((section) => (
        <div className="demo-shop-section" key={section.id}>
          <div className="demo-shop-heading">
            <h3>{section.title}</h3>
            <span>{section.note}</span>
          </div>
          <div className="demo-shop-grid">
            {ids
              .filter((id) => OFFERS[id].section === section.id)
              .map((id) => {
                const o = OFFERS[id];
                return (
                  <article className="demo-shop-card" key={id}>
                    <span className="demo-shop-icon">
                      <o.Icon size={26} />
                    </span>
                    <h3>{o.title}</h3>
                    <b className="demo-shop-price">{o.price}</b>
                    <p>{o.gives}</p>
                    <p className="demo-shop-honest">Чесно: {o.honest}</p>
                    <button className="primary" disabled>
                      <Lock size={15} /> {o.buy} · демо
                    </button>
                    <button
                      className="text-button small"
                      onClick={() => onOffer(id)}
                    >
                      Детальніше
                    </button>
                  </article>
                );
              })}
          </div>
        </div>
      ))}
      <p className="help-settings-note">
        Чому так: ботами поміряно, що покупки не замінюють уміння (докладно в
        docs/finmodel.md). Там, де є змагання (рекорд денного забігу, досягнення
        «жар 10»), покупки не діють. Гра кооперативна, PvP немає, тож ніхто не
        отримує переваги над іншою людиною.
      </p>
    </section>
  );
}
