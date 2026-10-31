import { Check, Repeat } from 'lucide-react';
import { LOCATIONS } from '@/lib/game/encounters';
import { STORY_GOAL } from '@/lib/game/campaign-content';
import './story-goal.css';

// Where the raid stands on the way out of the loop: the three districts and,
// at the end, the morning that comes after 04:17.
export function StoryTrack({ chapter }: { chapter: number }) {
  return (
    <ol className="story-track" aria-label="Шлях із петлі">
      {LOCATIONS.map((location, i) => (
        <li
          key={location.id}
          className={i < chapter ? 'done' : i === chapter ? 'now' : ''}
          aria-current={i === chapter ? 'step' : undefined}
        >
          <span className="dot">{i < chapter ? <Check size={14} /> : i + 1}</span>
          <b>{location.name}</b>
        </li>
      ))}
      <li className="end">
        <span className="dot">{STORY_GOAL.end}</span>
        <b>{STORY_GOAL.endName}</b>
      </li>
    </ol>
  );
}

// The goal of the story, said once and plainly, with the way to it.
export function StoryGoal({
  chapter,
  attempt,
}: {
  chapter: number;
  // The number of this try: every lost raid is one more turn of the loop.
  attempt: number;
}) {
  return (
    <section className="story-goal" aria-label="Мета сюжету">
      <span className="micro">
        <Repeat size={14} /> МЕТА СЮЖЕТУ · СПРОБА № {attempt}
      </span>
      <h3>{STORY_GOAL.title}</h3>
      <p>{STORY_GOAL.text}</p>
      <StoryTrack chapter={chapter} />
    </section>
  );
}
