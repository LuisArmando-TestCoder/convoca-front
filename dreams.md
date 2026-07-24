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
