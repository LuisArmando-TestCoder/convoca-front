# Convoca — Web (frontend)

The Next.js dashboard + public pages for the Convoca event check-in SaaS. Talks
to the Convoca API ([convoca-back](https://github.com/LuisArmando-TestCoder/convoca-back)).

- **Framework:** Next.js 14 (App Router) + React 18, TypeScript
- **Styling:** one cohesive design system in `src/app/globals.css` (design tokens,
  no CSS framework dependency)
- **QR scanning:** `html5-qrcode` (any phone camera, no native app)

## The person's UX pipeline

1. **Onboard** — `/register-org`: create an organization with a Gmail App Password.
2. **Sign in** — `/login`: passwordless OTP (owners **and** collaborators).
3. **Manage participants** — `/dashboard/events/[id]`: add manually, import CSV,
   export CSV, resend/download the QR, see live stats.
4. **Self-registration** — `/register/[linkId]`: a public form people fill in
   themselves; the QR is emailed automatically.
5. **Execute the event** — `/dashboard/events/[id]/scan`: mobile QR scanner with a
   traffic-light result (green = checked in, amber = already attended, red =
   not found).
6. **Report & measure** — the Overview tab: registered vs. checked-in, attendance
   rate, breakdown by country.
7. **Team** — `/dashboard/team`: owners invite collaborators by email.

## Setup

```bash
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL to your API
npm install
npm run dev                        # http://localhost:3000
npm run build                      # production build (type-check + lint)
```

> The QR scanner needs camera access, which browsers only grant over **HTTPS**
> (or `localhost`). Deploy behind TLS for on-site scanning.

## Structure

```
src/app/
  page.tsx                       # landing (3 product pillars)
  login/ · register-org/         # OTP auth
  register/[linkId]/             # public self-registration
  dashboard/
    layout.tsx                   # auth guard + app shell + session context
    page.tsx                     # events list + create/clone
    events/[id]/page.tsx         # tabs: overview / participants / links / settings
    events/[id]/scan/page.tsx    # QR scanner + check-in
    team/page.tsx                # collaborators (owner only)
src/components/                  # Toast, Modal, StatsPanel, ParticipantsPanel,
                                 # LinksPanel, QrModal, VerifyCodeForm, session
src/lib/                         # api client, types, csv, useMe hook
```

All data access goes through `src/lib/api.ts` (Bearer token + error normalization);
every repeated UI pattern is a shared component so the app stays DRY and cohesive.
