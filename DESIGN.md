# Convoca visual identity

## Direction

Minimalismo utilitario premium. Convoca is a check-in tool, so the interface borrows from Linear and Apple Wallet: clean surfaces, generous whitespace, one calm accent, and typography that reads without effort. The design removes any line, button, or color that does not make check-in faster. A clean screen gives the organizer a calmer mind.

## Feeling

The product should feel quiet and under control. Success has a soft, fluid micro-interaction: when a guest scans their QR, the confirmation arrives with a spring checkmark and a single expanding ripple. It reads as a visual breath, a signal to the organizer that everything is fine.

## Color

Analog and relaxing. A warm neutral base with one desaturated forest green accent. Success lives in the same green family, so a passing glance reads as "ok".

### Light mode

| Token | Value | Role |
| --- | --- | --- |
| brand | `#2C5F4A` | Primary action, focus, active state |
| brand-600 | `#274F3E` | Hover / pressed brand |
| brand-700 | `#204335` | Brand text on light |
| brand-050 | `#F0F5F2` | Soft brand wash |
| brand-100 | `#E2ECE6` | Stronger brand wash |
| accent | `#648A7A` | Analog secondary for subtle depth |
| ink | `#1C1B18` | Primary text |
| slate-700 | `#46443E` | Strong secondary text |
| slate-500 | `#6E6A62` | Body text, metadata |
| slate-400 | `#9C978C` | Placeholders, disabled |
| slate-300 | `#D9D5CB` | Borders, dividers |
| slate-200 | `#EAE7DE` | Hairlines on elevations |
| slate-100 | `#F3F1EA` | App background |
| slate-050 | `#F8F7F3` | Subtle hover fills |
| white | `#FFFFFF` | Elevated surface |
| success | `#2E7D5B` | Checked in |
| warn | `#9A6B1F` | Already scanned |
| danger | `#B0442F` | Not found / wrong event |

### Dark mode

The same warm analog family, inverted. Background `#17150F`, surface `#1E1B15`, ink `#EDEBE4`, brand `#4C8A6B`. Borders are warm white at low opacity. Success and warning tints use low-alpha fills so they stay calm on dark.

## Typography

Inter, geometric and spotless. It matches the "impeccable geometric" reference: tight tracking on display, relaxed body, no decoration.

- Display: 800 weight, `letter-spacing -0.02em`, line height 1.15
- Body: 400 weight, line height 1.55, max width 65ch
- Metadata and numbers: `font-variant-numeric: tabular-nums` so live counts align in a glance

## Spacing, radius, elevation

- Content max width 1120px
- Radius: 14px cards, 10px controls, 20px modals, full radius only for pills
- Shadows are warm and barely there. No colored glows, no gradient fills

## Components

- Buttons: flat. Primary is solid forest green with white text. Ghost is transparent with a warm hairline. Active press moves down 1px
- Cards: white surface, 1px warm hairline, very soft shadow. Cards exist only where elevation separates a group
- Forms: label above, helper below label, error below input. Focus ring in brand green
- Topbar: solid near-white with a hairline, no heavy blur
- Badges: calm tinted fills with the matching deep text
- Tables: uppercase hairline headers, hairline row dividers only

## Success micro-interaction

On a successful scan the operator sees a centered confirmation over the camera:

1. A spring checkmark draws itself (path length 0 to 1, about 0.5s)
2. One ripple ring expands and fades from the mark
3. The panel enters with a soft spring on scale and translate

Duplicate, not found, and wrong event use the same container with a warn or danger glyph and no celebration. All animation honors `prefers-reduced-motion`.

## What we avoid

- Gradient text, gradient buttons, neon glow
- Glassmorphism layers on scrolling content
- Emoji as status icons
- More than one accent color
- Anything on screen that does not speed up or clarify check-in