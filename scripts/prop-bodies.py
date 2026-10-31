"""Fits circles to the silhouette of every prop in the three atlases
(public/art/props-*.webp) and prints the BODY table of lib/game/arena.ts.

    python scripts/prop-bodies.py [--ts] [--report]

A prop's hitbox covers the whole object as it is drawn, not only its foot: the
house cannot overlap any part of it, enemies walk round all of it and hostile
bullets stop on any part of it. Each circle is [x, y, r] in fractions of the
prop's picture (from its top left, before mirroring). Thin parts (wires, rebar,
tendrils, glass shards) are not part of the body; holes are filled.
"""
from __future__ import annotations

import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SIDE = 128
ALPHA = 60
THEMES = ['rust', 'green', 'core']
# Flat things (puddles, glass, pools) lie on the ground and have no body.
FLAT = {'rust': {8}, 'green': {7}, 'core': {8}}
MAX_CIRCLES = 12
# A circle may reach a little past the silhouette: the edge is covered, and the
# eye forgives a few pixels of air round a thing, not a few pixels of it missing.
GROW = 1.12
SPILL = 0.3
STOP_UNCOVERED = 0.02
MIN_GAIN = 0.006
# A circle smaller than this (in picture pixels of SIDE) is a bump, not a body.
MIN_R = 7


def silhouette(theme: str, cell: int) -> np.ndarray:
    atlas = Image.open(f'public/art/props-{theme}.webp').convert('RGBA')
    w, h = atlas.size
    cw, ch = w // 3, h // 3
    tile = atlas.crop(((cell % 3) * cw, (cell // 3) * ch, (cell % 3 + 1) * cw, (cell // 3 + 1) * ch))
    tile = tile.resize((SIDE, SIDE), Image.LANCZOS)
    mask = np.array(tile)[:, :, 3] > ALPHA
    mask = ndimage.binary_fill_holes(mask)
    # Thin parts go (opening), then specks.
    mask = ndimage.binary_opening(mask, structure=np.ones((3, 3)), iterations=2)
    labels, n = ndimage.label(mask)
    if n > 1:
        sizes = ndimage.sum(mask, labels, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= 0.04 * sizes.max()]
        mask = np.isin(labels, keep)
    return ndimage.binary_fill_holes(mask)


def fit(mask: np.ndarray) -> list[tuple[float, float, float]]:
    area = mask.sum()
    dt = ndimage.distance_transform_edt(mask)
    yy, xx = np.mgrid[0:SIDE, 0:SIDE]
    covered = np.zeros_like(mask)
    circles: list[tuple[float, float, float]] = []
    cand = [(y, x) for y in range(0, SIDE, 2) for x in range(0, SIDE, 2) if mask[y, x] and dt[y, x] >= MIN_R]
    for _ in range(MAX_CIRCLES):
        best, best_score = None, 0.0
        for (y, x) in cand:
            r = dt[y, x] * GROW
            inside = (yy - y) ** 2 + (xx - x) ** 2 <= r * r
            gain = np.count_nonzero(inside & mask & ~covered)
            spill = np.count_nonzero(inside & ~mask)
            score = gain - SPILL * spill
            if score > best_score:
                best, best_score = (y, x, r, gain), score
        if best is None or best[3] < MIN_GAIN * area:
            break
        y, x, r, _ = best
        circles.append((x / SIDE, y / SIDE, r / SIDE))
        covered |= (yy - y) ** 2 + (xx - x) ** 2 <= r * r
        if np.count_nonzero(mask & ~covered) <= STOP_UNCOVERED * area:
            break
    return circles


def score(mask: np.ndarray, circles) -> tuple[float, float]:
    yy, xx = np.mgrid[0:SIDE, 0:SIDE]
    union = np.zeros_like(mask)
    for x, y, r in circles:
        union |= (yy - y * SIDE) ** 2 + (xx - x * SIDE) ** 2 <= (r * SIDE) ** 2
    cover = np.count_nonzero(union & mask) / max(1, mask.sum())
    precision = np.count_nonzero(union & mask) / max(1, union.sum())
    return cover, precision


def main() -> None:
    table = {}
    report = []
    for theme in THEMES:
        rows = []
        for cell in range(9):
            if cell in FLAT[theme]:
                rows.append(None)
                continue
            mask = silhouette(theme, cell)
            circles = fit(mask)
            cover, precision = score(mask, circles)
            report.append((theme, cell, len(circles), cover, precision))
            rows.append([[round(x, 3), round(y, 3), round(r, 3)] for x, y, r in circles])
        table[theme] = rows
    if '--report' in sys.argv:
        for theme, cell, n, cover, precision in report:
            print(f'{theme:6} cell {cell}: {n} circles, covers {cover:5.1%} of the object, {precision:5.1%} of the circles on it')
    if '--ts' in sys.argv:
        out = ['const BODY: readonly (readonly (readonly (readonly [number, number, number])[] | null)[])[] = [']
        for theme in THEMES:
            out.append(f'  // {theme}')
            out.append('  [')
            for rows in table[theme]:
                out.append('    null,' if rows is None else '    [' + ', '.join(f'[{x}, {y}, {r}]' for x, y, r in rows) + '],')
            out.append('  ],')
        out.append('];')
        print('\n'.join(out))
    if '--json' in sys.argv:
        json.dump(table, sys.stdout)


main()
