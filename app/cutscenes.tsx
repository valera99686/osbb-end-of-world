import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Play, Pause, Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { CUTSCENES, SCENE_BY_ID, sceneUnlocked } from '@/lib/game/cutscenes';
import type { Meta } from '@/lib/game/model';

export function SceneArt({ art }: { art: number }) {
  return (
    <svg
      className="scene-art"
      viewBox={`${(art % 3) * 512} ${Math.floor(art / 3) * 512} 512 512`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <image href="/art/cutscenes-v1.png" width="1536" height="1024" />
    </svg>
  );
}
export function CutscenePlayer({
  progress,
  onAdvance,
  onClose,
}: {
  progress: { id: string; index: number };
  onAdvance: (index: number) => void;
  onClose: () => void;
}) {
  const [auto, setAuto] = useState(false),
    scene = SCENE_BY_ID[progress.id],
    shot = scene.shots[progress.index],
    last = progress.index === scene.shots.length - 1;
  useEffect(() => {
    if (!auto) return;
    const timer = window.setTimeout(
      () => {
        if (last) onClose();
        else onAdvance(progress.index + 1);
      },
      Math.max(6500, shot.text.length * 60),
    );
    return () => clearTimeout(timer);
  }, [auto, last, onAdvance, onClose, progress.index, shot.text.length]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="game-dialog cinema-dialog"
        showCloseButton={false}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (last) onClose();
            else onAdvance(progress.index + 1);
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onAdvance(Math.max(0, progress.index - 1));
          }
        }}
      >
        <DialogTitle className="sr-only">{scene.title}</DialogTitle>
        <DialogDescription className="sr-only">
          Історія міста. Стрілки перемикають кадри, Escape пропускає сцену.
        </DialogDescription>
        <div className="cinema-top">
          <span>ОСББ / ХРОНІКА ЕВАКУАЦІЇ</span>
          <button className="text-button" onClick={onClose}>
            Пропустити
          </button>
        </div>
        <div className="cinema-stage" key={`${scene.id}-${progress.index}`}>
          <SceneArt art={shot.art} />
          <div className="cinema-haze" />
          <div className="cinema-stamp">{shot.time}</div>
          <div className="cinema-caption">
            <span className="eyebrow">{shot.speaker}</span>
            <p>{shot.text}</p>
          </div>
        </div>
        <div className="cinema-controls">
          <button
            className="text-button"
            disabled={progress.index === 0}
            onClick={() => onAdvance(progress.index - 1)}
            aria-label="Попередній кадр"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="cinema-progress">
            <b>{scene.title}</b>
            <span>
              {progress.index + 1} / {scene.shots.length}
            </span>
          </div>
          <button
            className="text-button cinema-auto"
            onClick={() => setAuto(!auto)}
            aria-label={auto ? 'Вимкнути автоперегляд' : 'Автоперегляд'}
          >
            {auto ? <Pause size={17} /> : <Play size={17} />} Авто
          </button>
          <button
            className="primary small"
            onClick={() => (last ? onClose() : onAdvance(progress.index + 1))}
          >
            {last ? 'До гри' : 'Далі'}
            <ArrowRight size={17} />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function StoryLibrary({
  meta,
  onPlay,
  onBack,
}: {
  meta: Meta;
  onPlay: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <section className="collection-page">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} /> До притулку
      </button>
      <p className="eyebrow">ЩО СТАЛОСЯ З МІСТОМ</p>
      <h2>Ніч о 04:17</h2>
      <p className="lead">
        Історія відкривається через рейди. Переглянуті сцени можна відтворити
        знову.
      </p>
      <div className="story-grid">
        {CUTSCENES.map((s) => {
          const unlocked = sceneUnlocked(s.id, meta.wins);
          return (
            <button
              key={s.id}
              disabled={!unlocked}
              className="story-card"
              onClick={() => onPlay(s.id)}
            >
              <div className="story-thumb">
                {unlocked ? (
                  <SceneArt art={s.shots[0].art} />
                ) : (
                  <Lock size={32} />
                )}
                <span>{unlocked ? <Play size={22} /> : null}</span>
              </div>
              <small>
                {s.id === 'prologue'
                  ? 'ПРОЛОГ'
                  : `РОЗДІЛ ${s.chapter + 1} · ${s.victory ? 'ПІСЛЯ ПЕРЕМОГИ' : 'ПРИБУТТЯ'}`}
              </small>
              <h3>{unlocked ? s.title : 'Невідома сторінка'}</h3>
              <p>
                {unlocked
                  ? meta.scenesSeen.includes(s.id)
                    ? 'Переглянути знову'
                    : 'Нова сцена'
                  : `Пройди розділ ${s.victory ? s.chapter + 1 : s.chapter}`}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
