// Colour filters for colour-blind players, applied to the whole screen (the
// menus and the fight alike) as an SVG colour matrix. Each is the usual
// «daltonization»: simulate how the eye of that kind sees a colour, take the
// difference from what is really there (what the eye loses), and move that
// difference into the channels the eye does see, so that colours it would mix
// up (red and green, or blue and yellow) come out apart.

export type Cvd = 'off' | 'protan' | 'deutan' | 'tritan';
export const CVD_KINDS = ['protan', 'deutan', 'tritan'] as const;
export type CvdKind = (typeof CVD_KINDS)[number];
type M3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

// How the eye of each kind sees colours (Machado, Oliveira and Fernandes 2009,
// full severity, linear RGB).
export const SEEN: Record<CvdKind, M3> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
// Where the lost difference goes: for red-green blindness into green and blue,
// for blue-yellow blindness into red and green.
const SHIFT: Record<CvdKind, M3> = {
  protan: [
    [0, 0, 0],
    [0.7, 1, 0],
    [0.7, 0, 1],
  ],
  deutan: [
    [0, 0, 0],
    [0.7, 1, 0],
    [0.7, 0, 1],
  ],
  tritan: [
    [0, 0, 1.2],
    [0, 0, 1.2],
    [0, 0, 0],
  ],
};

const mul = (a: M3, b: M3): M3 =>
  a.map((row) =>
    [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]),
  ) as unknown as M3;
const IDENTITY: M3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// The one matrix that does it all: colour + shift × (colour − seen colour).
export function cvdMatrix(kind: CvdKind): M3 {
  const lost = IDENTITY.map((row, i) =>
    row.map((v, j) => v - SEEN[kind][i][j]),
  ) as unknown as M3;
  const moved = mul(SHIFT[kind], lost);
  return IDENTITY.map((row, i) =>
    row.map((v, j) => v + moved[i][j]),
  ) as unknown as M3;
}
// The same as the 4×5 text of an SVG feColorMatrix (alpha is left alone).
export function cvdValues(kind: CvdKind): string {
  const m = cvdMatrix(kind);
  return [
    ...m.map((row) => `${row.map((v) => v.toFixed(5)).join(' ')} 0 0`),
    '0 0 0 1 0',
  ].join('  ');
}
// A colour as the eye of that kind sees it (linear 0..1), for the tests.
export function seen(kind: CvdKind, rgb: [number, number, number]) {
  return SEEN[kind].map((row) => row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]);
}
export const CVD_LABELS: Record<Cvd, string> = {
  off: 'Вимкнено',
  protan: 'Протанопія',
  deutan: 'Дейтеранопія',
  tritan: 'Тританопія',
};

export function readCvd(x: unknown): Cvd {
  return x === 'protan' || x === 'deutan' || x === 'tritan' ? x : 'off';
}
