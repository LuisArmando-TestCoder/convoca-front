// ── Certificate fonts ────────────────────────────────────────────────────────
// A curated, varied list of beautiful Google Fonts for the certificate name.
//
// Two loading modes:
//  - `loadGoogleFont` (text-restricted): fetches only the label's characters so
//    the dropdown options render in their own font with a few-KB download.
//  - `loadFullFont` (full family): loads the complete font so the participant's
//    name renders correctly into the certificate image. This is what the canvas
//    renderer needs — a text-restricted file would fall back to a system font
//    for any glyph outside the label.

export interface CertificateFont {
  /** Display name shown in the picker. */
  label: string;
  /** The Google Font family name (used for the FontFace + canvas font string). */
  family: string;
  /** Google Fonts CSS2 API family spec (spaces → '+'). */
  spec: string;
  /** Short vibe tag for the picker. */
  vibe: string;
}

export const CERTIFICATE_FONTS: CertificateFont[] = [
  // High-end editorial / luxury serifs
  { label: "Playfair Display", family: "Playfair Display", spec: "Playfair+Display", vibe: "Editorial luxury" },
  { label: "Cormorant Garamond", family: "Cormorant Garamond", spec: "Cormorant+Garamond", vibe: "Refined serif" },
  { label: "Prata", family: "Prata", spec: "Prata", vibe: "Boutique" },
  { label: "Fraunces", family: "Fraunces", spec: "Fraunces", vibe: "Editorial character" },

  // Clean minimalist sans-serifs
  { label: "Instrument Sans", family: "Instrument Sans", spec: "Instrument+Sans", vibe: "Minimal" },
  { label: "Urbanist", family: "Urbanist", spec: "Urbanist", vibe: "Geometric" },
  { label: "Raleway", family: "Raleway", spec: "Raleway", vibe: "Sophisticated" },
  { label: "Syne", family: "Syne", spec: "Syne", vibe: "Trend-forward" },

  // Iconic / avant-garde display
  { label: "Italiana", family: "Italiana", spec: "Italiana", vibe: "Luxury magazine" },
  { label: "Abril Fatface", family: "Abril Fatface", spec: "Abril+Fatface", vibe: "Bold display" },
  { label: "Bricolage Grotesque", family: "Bricolage Grotesque", spec: "Bricolage+Grotesque", vibe: "Expressive" },

  // Classic / versatile
  { label: "Open Sans", family: "Open Sans", spec: "Open+Sans", vibe: "Versatile" },
  { label: "Manrope", family: "Manrope", spec: "Manrope", vibe: "Modern" },
  { label: "Inter", family: "Inter", spec: "Inter", vibe: "Neutral" },
];

/** Fonts loaded in full (all glyphs) — safe for canvas rendering. */
const fullLoaded = new Set<string>();
/** Fonts loaded text-restricted — enough for the dropdown preview only. */
const previewLoaded = new Set<string>();

/**
 * Load a single Google Font in FULL (all glyphs) via the FontFace API.
 * This is required for rendering the participant's name into the image.
 * Idempotent.
 */
export async function loadFullFont(font: CertificateFont): Promise<string> {
  if (fullLoaded.has(font.family)) return font.family;

  const fontUrl = `https://fonts.googleapis.com/css2?family=${font.spec}:wght@400;700&display=swap`;
  const response = await fetch(fontUrl);
  if (!response.ok) throw new Error(`Failed to load font "${font.label}".`);
  const cssText = await response.text();

  const urls = [...cssText.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
  if (urls.length === 0) throw new Error(`Could not find font file for "${font.label}".`);

  // Load the bold (700) weight for the certificate name.
  const fontFace = new FontFace(font.family, `url(${urls[urls.length - 1]})`, { weight: "700" });
  const loadedFont = await fontFace.load();
  document.fonts.add(loadedFont);
  await document.fonts.ready;

  fullLoaded.add(font.family);
  return font.family;
}

/**
 * Load a single Google Font text-restricted to just the label's characters.
 * Keeps the dropdown options tiny (a few KB). NOT sufficient for canvas
 * rendering of arbitrary names — use `loadFullFont` for that.
 * Idempotent.
 */
export async function loadGoogleFont(font: CertificateFont): Promise<string> {
  if (previewLoaded.has(font.family)) return font.family;

  const text = encodeURIComponent(font.label);
  const fontUrl = `https://fonts.googleapis.com/css2?family=${font.spec}:wght@400;700&display=swap&text=${text}`;
  const response = await fetch(fontUrl);
  if (!response.ok) throw new Error(`Failed to load font "${font.label}".`);
  const cssText = await response.text();

  const urls = [...cssText.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
  if (urls.length === 0) throw new Error(`Could not find font file for "${font.label}".`);

  const fontFace = new FontFace(font.family, `url(${urls[urls.length - 1]})`, { weight: "700" });
  const loadedFont = await fontFace.load();
  document.fonts.add(loadedFont);
  await document.fonts.ready;

  previewLoaded.add(font.family);
  return font.family;
}

/**
 * Lazy-load every font in a non-blocking background loop (text-restricted, for
 * the dropdown preview). Each font is fetched independently; failures don't
 * block the rest. The caller is notified as each font becomes ready.
 *
 * @param onReady Called with the family name as soon as that font finishes loading.
 */
export async function loadAllFonts(onReady?: (family: string) => void): Promise<void> {
  for (const font of CERTIFICATE_FONTS) {
    try {
      await loadGoogleFont(font);
      onReady?.(font.family);
    } catch {
      // Skip fonts that fail to load; the rest continue.
    }
  }
}