// The box that scrolls around an element: a window of the game (the flats,
// a dialog) or the page itself.
export function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight)
      return p;
  }
  return document.scrollingElement as HTMLElement;
}
