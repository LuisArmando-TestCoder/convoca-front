// ── Certificate box math ─────────────────────────────────────────────────────
// Pure helpers for the certificate tool: converting mouse positions on the
// displayed image into image-pixel coordinates, normalizing a dragged box, and
// computing the font size that fits a name inside the box (height-exact, then
// shrunk if it overflows the width) — always centered.

export interface Box {
  /** Top-left corner in image pixels. */
  x1: number;
  y1: number;
  /** Bottom-right corner in image pixels. */
  x2: number;
  y2: number;
}

export interface ImageMetrics {
  /** Displayed width/height of the <img> element (CSS px). */
  displayWidth: number;
  displayHeight: number;
  /** Natural (source) pixel dimensions. */
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * Convert a mouse position (relative to the image's bounding client rect) into
 * image-pixel coordinates, accounting for the display→natural scale factor.
 */
export function clientToImage(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  metrics: ImageMetrics,
): { x: number; y: number } {
  const scaleX = metrics.naturalWidth / metrics.displayWidth;
  const scaleY = metrics.naturalHeight / metrics.displayHeight;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  return {
    x: Math.max(0, Math.min(metrics.naturalWidth, x)),
    y: Math.max(0, Math.min(metrics.naturalHeight, y)),
  };
}

/** Normalize a box so x1<=x2 and y1<=y2 regardless of drag direction. */
export function normalizeBox(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return {
    x1: Math.min(a.x, b.x),
    y1: Math.min(a.y, b.y),
    x2: Math.max(a.x, b.x),
    y2: Math.max(a.y, b.y),
  };
}

export interface BoxMetrics {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  maxWidth: number;
  maxHeight: number;
}

/** Center + max width/height of a box (max = the box's own dimensions). */
export function boxMetrics(box: Box): BoxMetrics {
  const width = Math.abs(box.x2 - box.x1);
  const height = Math.abs(box.y2 - box.y1);
  return {
    width,
    height,
    centerX: (box.x1 + box.x2) / 2,
    centerY: (box.y1 + box.y2) / 2,
    maxWidth: width,
    maxHeight: height,
  };
}

export interface FitResult {
  /** Font size in image pixels. */
  fontSize: number;
  /** Baseline y (image pixels) for the centered text. */
  baselineY: number;
  /** Text x (image pixels) for centered text. */
  textX: number;
  /** Measured text width at the chosen size. */
  textWidth: number;
}

/**
 * Compute the font size that fills the box height exactly, then shrink it if the
 * text's measured width exceeds the box width. Returns the centered position.
 *
 * @param ctx A 2D canvas context used only for text measurement.
 * @param text The name to render.
 * @param box The box in image pixels.
 * @param fontFamily CSS font family (e.g. `"Inter", sans-serif`).
 * @param weight Font weight (e.g. 700).
 */
export function fitTextInBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: Box,
  fontFamily: string,
  weight: number,
): FitResult {
  const { width, height, centerX, centerY } = boxMetrics(box);
  if (width <= 0 || height <= 0) {
    return { fontSize: 0, baselineY: centerY, textX: centerX, textWidth: 0 };
  }

  // Start at a size that fills the height exactly (cap height ≈ 0.72 × em).
  let fontSize = height / 0.72;
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  let textWidth = ctx.measureText(text).width;

  // Shrink while the text overflows the box width.
  while (textWidth > width && fontSize > 1) {
    fontSize *= 0.95;
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    textWidth = ctx.measureText(text).width;
  }

  // Center horizontally; baseline centered vertically (cap height ≈ 0.72em).
  const textX = centerX - textWidth / 2;
  const baselineY = centerY + fontSize * 0.36;

  return { fontSize, baselineY, textX, textWidth };
}