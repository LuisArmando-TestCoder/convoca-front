// ── Certificate PDF builder ──────────────────────────────────────────────────
// Composites a recipient's name into the certificate image (offscreen canvas,
// fitted + centered inside the saved box) and exports a single-page PDF as
// base64, ready to attach to the certificate email.

import { PDFDocument } from "pdf-lib";
import { fitTextInBox, type Box } from "./certificate";

const FONT_FAMILY = '"Inter", ui-sans-serif, system-ui, sans-serif';
const FONT_WEIGHT = 700;

/**
 * Render the name into the image at the given box and return a PNG data URL.
 * The font is sized to fill the box height exactly, then shrunk if it overflows
 * the box width — always centered in the box.
 */
export function renderNameIntoImage(
  image: HTMLImageElement,
  name: string,
  box: Box,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);

  if (name.trim()) {
    const fit = fitTextInBox(ctx, name.trim(), box, FONT_FAMILY, FONT_WEIGHT);
    if (fit.fontSize > 0) {
      ctx.font = `${FONT_WEIGHT} ${fit.fontSize}px ${FONT_FAMILY}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#0b1220"; // ink — matches the design system
      ctx.fillText(name.trim(), fit.textX, fit.baselineY);
    }
  }

  return canvas.toDataURL("image/png");
}

/**
 * Build a single-page PDF from the composited image and return it as base64.
 * The page is sized to the image's aspect ratio (landscape/portrait aware).
 */
export async function buildCertificatePdf(
  image: HTMLImageElement,
  name: string,
  box: Box,
): Promise<string> {
  const pngDataUrl = renderNameIntoImage(image, name, box);
  const pngBytes = Uint8Array.from(atob(pngDataUrl.split(",")[1]!), (c) => c.charCodeAt(0));

  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(pngBytes);

  const w = png.width;
  const h = png.height;
  const page = pdf.addPage([w, h]);
  page.drawImage(png, { x: 0, y: 0, width: w, height: h });

  const bytes = await pdf.save();
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}