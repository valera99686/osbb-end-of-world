// A canvas that a sprite was painted on is a slow thing to draw from: on a
// machine with a fast GPU forty of them cost 30 ms a frame (every drawImage
// takes the pixels up again), while the very same picture decoded from a PNG
// is a texture that stays on the GPU and costs 6 ms. `fast` hands back the
// canvas at once and the decoded copy as soon as it is ready, so always draw
// what it returns. Only for sprites that are painted once and never touched
// again; a canvas that keeps changing must be drawn as it is.
const decoded = new WeakMap<object, ImageBitmap>();
const started = new WeakSet<object>();

async function decode(canvas: HTMLCanvasElement) {
  try {
    if (
      typeof canvas.toBlob !== 'function' ||
      typeof createImageBitmap !== 'function'
    )
      return;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve),
    );
    if (blob) decoded.set(canvas, await createImageBitmap(blob));
  } catch {
    // The canvas itself keeps working, only slower.
  }
}

export function fast(canvas: HTMLCanvasElement): CanvasImageSource {
  const bitmap = decoded.get(canvas);
  if (bitmap) return bitmap;
  if (!started.has(canvas)) {
    started.add(canvas);
    void decode(canvas);
  }
  return canvas;
}
