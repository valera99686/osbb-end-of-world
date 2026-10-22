import { useState } from 'react';
import { Pin, RefreshCw } from 'lucide-react';
import { dateKey } from '@/lib/game/modes';
import { NOTICES, noticeIndex } from '@/lib/game/notices';

// A paper on the door of the Shelter: a different joke every day, and a button
// to read the next one.
export function NoticeBoard() {
  const day = dateKey(new Date());
  const [shift, setShift] = useState(0);
  const notice = NOTICES[noticeIndex(day, shift)];
  return (
    <aside className="notice-board" aria-label="Оголошення на дверях під’їзду">
      <div className="notice-head">
        <span className="micro">
          <Pin size={14} /> ОГОЛОШЕННЯ
        </span>
        <button
          type="button"
          className="notice-next"
          onClick={() => setShift((n) => n + 1)}
          aria-label="Інше оголошення"
        >
          <RefreshCw size={14} /> Ще
        </button>
      </div>
      <p className="notice-text" aria-live="polite">
        {notice.text}
      </p>
      <small>{notice.sign}</small>
    </aside>
  );
}
