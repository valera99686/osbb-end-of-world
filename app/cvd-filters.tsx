// The three colour filters for colour-blind players (lib/game/cvd.ts), as SVG
// colour matrices the page can point to: the stylesheet puts one over the whole
// screen when the setting is on (html[data-cvd]).
import { CVD_KINDS, cvdValues } from '@/lib/game/cvd';

export function CvdFilters() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', pointerEvents: 'none' }}
    >
      {CVD_KINDS.map((kind) => (
        <filter
          key={kind}
          id={`cvd-${kind}`}
          colorInterpolationFilters="linearRGB"
          x="0"
          y="0"
          width="100%"
          height="100%"
        >
          <feColorMatrix type="matrix" values={cvdValues(kind)} />
        </filter>
      ))}
    </svg>
  );
}
