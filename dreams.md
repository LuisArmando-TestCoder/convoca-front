# dreams.md — Convoca Web

Post-task reflections, so future work compounds on hindsight.

---

## 2026-07-23 — Initial build: event check-in dashboard (Next.js 14)

**What shipped.** The full operator + participant UX: OTP auth (owner + collaborator),
events list with create/clone, an event detail page (overview stats, participants
table with manual add / CSV import / CSV export / QR view / resend / delete,
self-registration links), a mobile QR scanner with a traffic-light check-in
result, a public self-registration page, and owner-only team management. One
cohesive token-based design system, `next build` green (8 routes, type-checked +
linted).

**What went well.**
- **Design tokens first.** Committing to one `globals.css` with CSS variables and
  a small set of primitives (`.btn`, `.card`, `.badge`, `.tabs`, `.scan-result`)
  kept every page cohesive with zero CSS-framework weight, and made new screens
  fast to assemble.
- **Shared components over copy-paste.** `VerifyCodeForm` (login + register),
  `Modal`, `Toast`, `QrModal`, and the panel components meant each page composes
  rather than re-implements.
- **Thin API seam.** `src/lib/api.ts` centralizes the token + error shape, so
  every screen handles failures the same way (`ApiError` → toast).

**What could have been better.**
1. **The scanner can only be truly verified on a device with a camera + HTTPS.**
   I proved compile/lint/build, but the live decode → check-in loop needs a real
   phone against the running API. A tiny "manual hash entry" fallback in the scan
   page would make it testable on a desktop without a webcam.
2. **`api()` parses the error body but the scan page re-parses `err.message` as
   JSON** to recover the structured `CheckinResult` on 409/404. That's brittle —
   the API client should optionally return the parsed error payload so callers
   don't string-parse. A `ApiError.data` field would be cleaner.
3. **No optimistic UI / caching.** Every action re-fetches participants + stats.
   Fine at event scale, but SWR or a local mutation would cut flicker on large
   lists.
4. **Left the deprecated `document.execCommand`-free path aside** — not relevant
   here, but the CSV import previews only the first 50 rows; very large files
   render a truncated preview with no "…and N more" affordance. Minor polish.
5. **Accessibility is decent but not audited.** Modals trap Escape + overlay click
   and use `aria-modal`, toasts are `aria-live`, but I didn't run an axe pass or
   verify full keyboard focus-trapping in the modal. Worth a sweep before launch.

---

## 2026-07-23 — Editable everything + pending-send UX

- **`EventFields` extraction paid off:** one presentational component now backs both the create modal and the settings editor, so the two can't drift. Should have built it this way from day one.
- **Pending vs. sent** is expressed purely from `qrSentAt` (no new field): a "QR" column badge + a Send/Resend button. Deriving UI state from existing data beat adding a status enum.
- **Edit clarity:** the edit modal warns that changing a field voids the QR (because the hash changes) — surfacing the backend's identity model to the user instead of hiding it.

---

## 2026-07-24 — Dynamic participant fields everywhere

- **`EventFields` grew a builder** ("+ Add field" + example chips: Country, Phone, Company…), and because it's the single source for the event form, create + settings both got it for free.
- **Everything reflects the schema:** add/edit modals render inputs per field, the table renders a column per field, CSV/Excel import maps headers → field keys (alias-tolerant), the template/export match, and the self-reg wizard appends one step per field.
- **`pv(participant, key)`** reads `fields[key]` with a legacy `country`/`phone` fallback, so old participants still display without a migration.
- **Lesson:** keeping stable field `key`s (not re-derived from the label on every edit) is what makes stored values survive label edits.

## Landing = vertical pitch-deck funnel (2026-07-24)
- Rebuilt `/` as a 7-slide scroll-snap deck: hero+CTA → pain → turning point → 3 capability slides framed as "How would it feel…" → result payoff + CTA.
- Deck is its own `100dvh` scroll container so the fixed topbar and right-side nav dots overlay cleanly; `scroll-snap-type: y proximity` keeps snapping non-trapping.
- IntersectionObserver (root = deck) drives reveal-on-scroll + active nav dot. All content is data-driven (PAINS, CAPABILITIES) for DRY, cohesive slides.
- Could improve next: add real product screenshots/loop video per capability slide, and keyboard arrow-key deck navigation.

## Landing = Lenis + Framer Motion (2026-07-24)
- Dropped CSS scroll-snap; landing now scrolls on native document with Lenis (duration 1.15) for ultra-smooth inertial scroll, torn down on unmount so the dashboard/scan pages are unaffected.
- Framer Motion drives reveals (whileInView, once, staggered `custom` delays) and a mouse-reactive parallax: pointer feeds two useMotionValue springs; ambient aura blobs + hero content translate opposite directions.
- Respects prefers-reduced-motion via useReducedMotion (skips Lenis + pointer parallax). Nav dots use IntersectionObserver + lenis.scrollTo.
- Could improve next: keyboard arrow-key nav, and lazy-load framer-motion only on the landing to trim the 47kB route.
