// Accessibility smoke check for one screen of the web game.
//
// Open the game at the width you want to test (Chrome DevTools: Ctrl+Shift+M,
// 360 x 640), go to a screen, paste this file into the console and run
//
//   __a11y('hub')
//
// It lists, for what is on screen right now: horizontal overflow, controls
// narrower or lower than 32 px, controls without a name, controls pushed
// outside the viewport, text under 11 px and text whose contrast against a
// plain background is below WCAG AA (4.5:1, 3:1 for large text). Text over
// pictures and gradients is skipped: judge it by eye (docs/qa/accessibility.md).
window.__a11y = (label) => {
  const vw = innerWidth,
    vh = innerHeight;
  const out = {
    screen: label,
    vw,
    scrollW: document.documentElement.scrollWidth,
    overflowX: document.documentElement.scrollWidth > vw + 1,
    small: [],
    tiny: [],
    noName: [],
    cut: [],
    lowContrast: [],
  };
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return (
      r.width > 0 &&
      r.height > 0 &&
      cs.visibility !== 'hidden' &&
      cs.display !== 'none' &&
      cs.opacity !== '0'
    );
  };
  const luminance = (c) => {
    const [r, g, b] = c.map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  // The plain colour behind an element, or null when a picture or gradient is there.
  const background = (e) => {
    for (let n = e; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') return null;
      const p = parse(cs.backgroundColor);
      if (p && p.a > 0.95) return p.c;
    }
    return [10, 20, 26];
  };
  for (const e of document.querySelectorAll(
    'button, a, [role=button], input, select, summary',
  )) {
    if (!visible(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh * 3) continue;
    const name = (e.getAttribute('aria-label') || e.textContent || e.title || '').trim();
    if (!name && e.tagName !== 'INPUT')
      out.noName.push(e.className.toString().slice(0, 40) || e.tagName);
    if (r.width < 32 || r.height < 32)
      out.small.push(
        `${name.slice(0, 24) || e.className.toString().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      );
    if (r.right > vw + 2 || r.left < -2)
      out.cut.push(`${name.slice(0, 24)} left ${Math.round(r.left)} right ${Math.round(r.right)}`);
  }
  for (const e of document.querySelectorAll('p, span, b, small, h1, h2, h3, h4, li, label, em, div')) {
    const own = [...e.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join('')
      .trim();
    if (!own || !visible(e)) continue;
    const cs = getComputedStyle(e);
    const size = parseFloat(cs.fontSize);
    if (size < 11) out.tiny.push(`${own.slice(0, 22)} ${size}px`);
    const fg = parse(cs.color);
    const bg = background(e);
    if (fg && bg) {
      const a = luminance(fg.c);
      const b = luminance(bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const need = size >= 18 || (size >= 14 && parseInt(cs.fontWeight) >= 700) ? 3 : 4.5;
      if (ratio < need) out.lowContrast.push(`${own.slice(0, 22)} ${ratio.toFixed(1)}:1 ${size}px`);
    }
  }
  for (const k of ['small', 'tiny', 'noName', 'cut', 'lowContrast']) {
    out[k + 'Count'] = out[k].length;
    out[k] = [...new Set(out[k])].slice(0, 8);
  }
  return out;
};
