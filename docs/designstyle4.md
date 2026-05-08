# designstyle4 — Living System
**Version:** 1.0 (draft)
**Date:** 2026-05-06
**Direction:** C — "Living System" (organic + electric)
**Lead Designer:** Principal Designer II
**Companion to:** `.claude/docs/PRD.md` (v3.8), `.claude/docs/design-system.md` (Style 1 baseline)
**Moodboard:** `.claude/docs/moodboard/style4/README.md`

---

## 0. Why a fourth style

Style 1 (sage green, Rubik, capsule sidebar) is our production direction. Style 2 and Style 3 explore alternative palettes for stakeholder review.

**designstyle4 is different.** It is not "Style 1 in a different color." It is a parallel design language built on three convictions the moodboard surfaced:

1. **Software for architects should feel alive, not corporate.** Subtle motion, organic gradients, a creature watching from the corner — these signal a system that thinks, not a CRUD app that processes.
2. **Mindaro lime (`#ADFB49`) earns more visual real-estate than sage green ever can.** It pops against warm-paper neutrals without screaming. Used as accent, it makes routine actions feel like opening a fresh sketchbook.
3. **The MIRAI brand needs its own visual identity.** Right now MIRAI is "the gradient page." In Living System, MIRAI becomes a particle sphere — a monochrome, sentient-feeling artifact that exists only on AI surfaces. Brand green ≠ AI green.

This document is a parallel specification. We pick **one** style for v1.0 production. designstyle4 is the most ambitious of the four; it asks the most from engineering (CSS animation budget, custom mascot SVG) and the most from users (a less generic visual vocabulary). If we ship it well, it differentiates Reflect in a category of identical green/blue SaaS dashboards.

### 0.1 Three rules that cannot break
1. **Mindaro `#ADFB49` is action, not text.** Never use it for body or headline copy — fails AA contrast on every neutral. Buttons, focus rings, status dots, mascot eye, dashboard accent moments only.
2. **The chameleon mascot is the only illustrated character.** No icons-as-mascots, no avatar emojis, no other creatures. He appears in 4 specific places (§5.4) — never decoratively.
3. **MIRAI's particle sphere never mixes with brand green.** It lives in monochrome ink (`#0E1611`) on warm paper. The moment you tint it green, it becomes "another folder card" — and the AI loses its presence.

A fourth rule, carried from Style 1:
4. **Hidden ≠ secure.** Finance/admin masking is RLS at the DB layer (PRD §9.1), not just `display:none`.

### 0.2 What this doc owns
- §1 Philosophy — the why behind the look
- §2 Color tokens — every hex, named, with usage rules (Part 1)
- §3 Typography — Satoshi family, scale, pairings (Part 1)
- §4 Components — buttons, chips, cards, forms, sidebar (Part 2)
- §5 Mascot system — placeholder spec, 4 placement rules, animation budget (Part 2)
- §6 Motion + accessibility (Part 2)
- §7 MIRAI signature surface (Part 3)
- §8 Page-by-page application (Part 3)
- §9 Implementation plan + DoD (Part 3)

### 0.3 What this doc does NOT own
- Information architecture, user stories, success metrics → PRD
- The decision of which style ships → product/design review (after all 4 styles have prototypes)
- Backend, RLS, telemetry → PRD §9, §11

---

## 1. Design Philosophy

> **An architecture firm's software should feel like a well-stocked studio: warm paper underfoot, sharp tools at hand, a quiet creature in the corner that notices when you walk in.**

Style 1 is "architectural precision meets organic warmth." designstyle4 keeps the precision but pushes warmth into something rarer in B2B software: **liveliness**. The dot canvas breathes. The mascot blinks once every 8 seconds. The MIRAI sphere drifts. None of this is decorative — each motion is a 200ms confirmation that the system is *on*, that someone (something) is paying attention.

### 1.1 Voice in pixels
- **Restraint with one electric exception.** The whole palette is muted naturals — paper, stone, sage forest, warm black. Mindaro lime is the only saturated color, and it appears sparingly. The contrast is the point: 95% calm, 5% alive.
- **Architect-native vocabulary, unchanged.** Phases (Konsepsiya/SD/DD/CD/Tender/İcra), expertise badges, AZN, Asia/Baku — same as Style 1. No vocabulary regression.
- **MIRAI as a presence, not a panel.** The particle sphere is a creature too. It pulses when thinking, settles when answering. Users should feel they are talking to *something*, not querying an endpoint.

### 1.2 Visual axioms
| Axiom | Manifestation |
|---|---|
| Paper, not screen | Canvas `#FAFAF7` with stone dot grid `#D8D6CD` at 20px (14px on mobile). Cards on warm white `#FFFFFF`, hairline `#E8E6DD`. |
| Action is electric | Primary button `#ADFB49` on ink text `#0E1611`. Hover deepens to `#9BE83E`. Never used outside action context. |
| Brand is forest | Brand text `#1A5140`, deep `#0E3838`. These read as "Reflect" in headers, logos, sidebar accent — Mindaro is the *call*, sage forest is the *signature*. |
| AI is monochrome | MIRAI surface is ink-on-paper. Particle sphere `#0E1611` on canvas `#FAFAF7`. No green tint, ever. |
| Motion confirms life | 6 motion types, total CSS animation budget ≤ 4kb. Reduce-motion respected (§6.2). |
| One creature | The chameleon. Eye `#ADFB49`. Watches from sidebar foot, dashboard empty states, MIRAI loading, login. |

### 1.3 Inheritance from Style 1
designstyle4 keeps:
- The dot canvas (smaller dots: `#D8D6CD` instead of `#D1D5DB`, body padding 20px, 14px mobile)
- The capsule sidebar (border-radius 24px, dark — but with a different ink: `#0E1611` not `#0F0F0F`)
- The 8-page module structure (PRD §10)
- The phase vocabulary, AZN currency, Bakı timezone

designstyle4 rewrites:
- The entire color system (Style 1 sage `#1A8754` → forest `#1A5140` + Mindaro `#ADFB49`)
- The font stack (Rubik → Satoshi)
- The MIRAI gradient (emerald aurora → monochrome particle sphere)
- The mascot strategy (none → chameleon, 4 placements)

---

## 2. Color Tokens

The palette has nine groups. Every hex is named — never use raw values in components.

### 2.1 Brand (sage emerald + iridescent lime)

The brand has two halves: **Mindaro** (electric, action) and **sage forest** (signature, text, deep surfaces). They are designed to coexist — Mindaro pops *because* the rest of the palette is muted forest and warm naturals.

| Token | Hex | Use |
|---|---|---|
| `--brand-action` | `#ADFB49` | Primary button bg, focus ring, mascot eye, status dots, accent moments. **Never on text.** |
| `--brand-action-hover` | `#9BE83E` | Primary button :hover, active state |
| `--brand-action-soft` | `#ECFFB6` | Primary button bg in pressed/loading state, lime chip bg |
| `--brand-text` | `#1A5140` | Logo word "Reflect", H1 brand moments, brand chip text |
| `--brand-deep` | `#0E3838` | Sidebar header strip, section dividers in dark contexts |
| `--brand-mid` | `#5CA87C` | Secondary brand accent, gradient mid-stops |
| `--brand-soft` | `#B7E5BA` | Brand chip bg, success-adjacent backgrounds |
| `--brand-mist` | `#DCFCE7` | Featured row tint, hover wash on brand surfaces |

**Rule:** `--brand-action` (Mindaro) NEVER appears as foreground text. Contrast ratio against white is 1.4:1 — fails AA. Always pair with ink (`#0E1611`) when used as background.

### 2.2 Neutrals (architectural naturals, paper feel)

Warm whites over cool grays. The whole palette is shifted ~3° toward yellow — this is the "paper" feeling.

| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#FAFAF7` | Body background — the sheet |
| `--canvas-dots` | `#D8D6CD` | Dot grid (1px circle, 20px gap) |
| `--canvas-warm` | `#F4F2EC` | Cream sections (testimonials, gallery moments) |
| `--surface` | `#FFFFFF` | Card bg (kept pure white for max paper contrast) |
| `--surface-mist` | `#F0EFE9` | Card sub-surface, table zebra row |
| `--line` | `#E8E6DD` | Hairline border (cards, table rows) |
| `--line-soft` | `#EFEEE8` | Soft divider (inside cards) |

**Rule:** Body background is **always** `--canvas` with dots. Never plain white. The dots are part of the brand.

### 2.3 Text (warm black family)

Five steps. Each ratio chosen for AA against `--canvas` (`#FAFAF7`).

| Token | Hex | Contrast vs canvas | Use |
|---|---|---|---|
| `--ink` | `#0E1611` | 17.8:1 | Primary text on Mindaro buttons, hero headlines |
| `--text` | `#1F2925` | 14.2:1 | Body text, H1–H4 |
| `--text-soft` | `#4F5A55` | 7.4:1 | Secondary copy, table cell labels |
| `--text-muted` | `#7A857F` | 4.8:1 | Meta, timestamps, helper text |
| `--text-faint` | `#A8B0AB` | 2.9:1 | Disabled state only — **fails AA**, never use for active text |

**Rule:** All text on `--canvas` or `--surface` uses one of the first four. `--text-faint` is reserved for disabled UI; pair it with a non-text affordance (icon, pointer-events:none).

### 2.4 Status (functional rainbow, kept distinct from brand)

Each status has 3 tones: dot/border (color), background (bg), text (text — for chips/badges).

| Status | Color | Bg | Text |
|---|---|---|---|
| Ideas (violet) | `#A78BFA` | `#F4F0FE` | `#7C3AED` |
| Queued (grey) | `#94A3B8` | `#F1F5F2` | `#475569` |
| Active (blue) | `#3B82F6` | `#EAF2FF` | `#1D4ED8` |
| Review (amber) | `#D97706` | `#FFF6E5` | `#92400E` |
| Expert (deep violet) | `#7C5CD9` | `#F0EBFB` | `#5B3FB8` |
| Done (green) | `#22C55E` | `#ECF9EF` | `#15803D` |
| Cancel (red) | `#EF4444` | `#FEEEED` | `#B91C1C` |

**Rule:** Status colors NEVER overlap with brand. `--status-done-green` (`#22C55E`) and `--brand-action` (`#ADFB49`) are visually distinct and semantically different — done is a *result*, action is an *invitation*.

### 2.5 Presence (online status dots — REQ-PRESENCE)

| State | Color | Use |
|---|---|---|
| Online | `#22C55E` | Active in last 5min |
| Away | `#F59E0B` | Active 5–30min ago |
| Offline | `#A8B0AB` | >30min, also covers explicit "appear offline" |

Dots are 8px on avatars ≤32px, 10px on avatars >32px. White stroke 2px to lift off avatar bg.

### 2.6 Gradients (organic, "moment" surfaces only)

Six gradients. Used **only** in folder hero cards, project cards, dashboard featured row, and login orb. **Never on body chrome, buttons, or chips.**

| Token | Definition | Use |
|---|---|---|
| `--grad-feature` | radial 70% 30%, `#ADFB49` → `#B7E5BA` → `#5CA87C` | Dashboard "BU GÜN" featured card, primary CTA hero |
| `--grad-folder-sage` | linear 135deg, `#B7E5BA` → `#5CA87C` | Default folder card |
| `--grad-folder-lime` | linear 135deg, `#DCFCE7` → `#ADFB49` | Personal/private folders |
| `--grad-folder-forest` | linear 135deg, `#1A5140` → `#5CA87C` | Pinned/featured projects |
| `--grad-folder-peach` | linear 135deg, `#FED7AA` → `#FFB347` | Client-facing folders |
| `--grad-folder-lavender` | radial, `#84A6FF` → `#C8B4F0` | Shared/team folders |

### 2.7 MIRAI signature (monochrome AI)

| Token | Hex | Use |
|---|---|---|
| `--mirai-surface` | `#0E1611` | Particle sphere bg, MIRAI page hero |
| `--mirai-particle` | `#FAFAF7` | Particle dots — same as canvas, inverted |
| `--mirai-glow` | `rgba(173, 251, 73, 0.08)` | Subtle Mindaro tint on sphere edge — only place AI green appears |

**Rule:** MIRAI surface lives in monochrome. The 8% Mindaro glow on the sphere edge is the *only* connection to brand action — a whisper, not a statement.

### 2.8 Mascot tokens (the chameleon)

| Token | Hex | Use |
|---|---|---|
| `--mascot-body` | `#0E1611` | Body silhouette |
| `--mascot-eye` | `#ADFB49` | Eye highlight — the only colored pixel |

The mascot is monochrome ink with a single Mindaro eye. It blends with text contexts and pops in empty states.

### 2.9 Focus ring

| Token | Definition |
|---|---|
| `--focus-ring` | `0 0 0 3px rgba(173, 251, 73, 0.33)` |

Applied to all interactive elements on `:focus-visible`. The 33% opacity keeps it visible without stealing attention from the focused element itself.

---

## 3. Typography

### 3.1 Family: Satoshi

**Satoshi** by Indian Type Foundry. Geometric sans with slight humanist warmth — pairs the precision Style 1 lacks (Rubik is friendly but soft) with a paper-friendly feeling that Inter and Geist (cooler, screen-first) miss.

Loaded via Fontshare CDN:
```html
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700,900&display=swap" rel="stylesheet">
```

Weights used: 400 (body), 500 (UI labels, buttons), 600 (H3, table headers), 700 (H1, H2), 900 (hero only — single page, login).

**No italic.** Satoshi italic exists; we don't use it. Emphasis = weight, color, or size — never slant. (Carries Style 1's "Rubik toxunulmaz qalsin" rule.)

**Fallback stack:**
```css
font-family: 'Satoshi', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
```

### 3.2 Scale

8-step scale. Each step has a fixed line-height (no `line-height: 1.5` — too loose for UI density).

| Token | Size / LH | Weight | Use |
|---|---|---|---|
| `--text-hero` | 56 / 60 | 900 | Login, MIRAI page title |
| `--text-h1` | 32 / 38 | 700 | Page title (Tapşırıqlar, Layihələr) |
| `--text-h2` | 24 / 30 | 700 | Section heading inside page |
| `--text-h3` | 18 / 24 | 600 | Card title, table section |
| `--text-h4` | 16 / 22 | 600 | Inline subheading |
| `--text-body` | 14 / 20 | 400 | Default body, table cell |
| `--text-ui` | 13 / 18 | 500 | Button, chip, sidebar item |
| `--text-meta` | 12 / 16 | 400 | Timestamps, helper text, table column header |
| `--text-tiny` | 11 / 14 | 500 | Status badge, KPI label |

Mobile: `--text-hero` clamps to 32px, `--text-h1` to 22px, all body sizes unchanged.

### 3.3 Pairing rules

- **Page title row:** `--text-h1` paired with `--text-meta` muted ("47 açıq · 12 mənim · 3 gecikmiş") above it.
- **Card:** `--text-meta` muted (project name) → `--text-body` medium (task title) → meta row.
- **Featured/hero card:** `--text-h2` weight 700 with no meta above — let the card itself be the headline.
- **Numbers (KPI, currency):** use `--text-h2` weight 700, **always** with `font-variant-numeric: tabular-nums` to align decimals.

### 3.4 Vertical rhythm

Headings have asymmetric margin: more space above, less below — anchors them to the section they title rather than floating.

```css
h1, .h1 { margin: 32px 0 12px; }
h2, .h2 { margin: 28px 0 10px; }
h3, .h3 { margin: 20px 0 8px; }
```

Body paragraphs: `margin: 0 0 12px`. Lists: `margin: 0 0 12px`, item gap 6px.

### 3.5 Letter-spacing

| Use | Tracking |
|---|---|
| Hero / H1 | -0.02em |
| H2 / H3 | -0.01em |
| Body / UI | 0 |
| Caps labels (sidebar sections, "BU GÜN") | +0.08em |
| Numbers / monospace contexts | 0 |

**Rule:** Negative tracking only on weights ≥600. Loose tracking on light body text turns it gauzy.

---

---

## 4. Components

Every component is defined as: **anatomy → tokens → states → motion → accessibility**. If a component is not listed here, it does not exist in v1.0.

### 4.1 Buttons

Three variants. No fourth (no "destructive" — destructive intents use modal confirm with red text, not red button — keeps button system stable across themes).

#### `.btn-primary` — Mindaro action
```
height: 40px (mobile 44px)
padding: 0 18px
bg: --brand-action (#ADFB49)
text: --ink (#0E1611), 13/18, weight 500
border-radius: 10px
border: 0
```
- `:hover` → bg `--brand-action-hover` (`#9BE83E`), translateY(-1px), shadow `0 4px 12px rgba(173,251,73,0.25)`
- `:active` → translateY(0), bg `--brand-action-soft` (`#ECFFB6`)
- `:focus-visible` → outline 0, box-shadow `--focus-ring`
- `:disabled` → bg `--surface-mist`, text `--text-faint`, no shadow

#### `.btn-outline` — neutral secondary
```
bg: --surface (#FFFFFF)
text: --text (#1F2925), 13/18, weight 500
border: 1px solid --line (#E8E6DD)
```
- `:hover` → bg `--surface-mist`, border `--brand-text` (sage forest stroke — branded but quiet)
- `:focus-visible` → `--focus-ring`

#### `.btn-ghost` — tertiary
```
bg: transparent
text: --text-soft
```
- `:hover` → bg `--surface-mist`

**Sizes:** default (40px), sm (32px, 12/16 text), lg (48px, 14/20 text — used only on primary CTAs in hero).

### 4.2 Chips

```
height: 26px
padding: 0 10px
border-radius: 6px
font: --text-meta, weight 500
display: inline-flex; align-items: center; gap: 6px
```

Three contexts:
- **Default:** bg `--surface-mist`, text `--text-soft`
- **Brand:** bg `--brand-mist` (`#DCFCE7`), text `--brand-text` (`#1A5140`)
- **Status:** bg + text from §2.4 status pair

Chips never have a border. Chips inside a card never have a background — they inherit the card and use only color + a leading dot.

### 4.3 Inputs

```
height: 40px (mobile 44px)
padding: 0 14px
bg: --surface
border: 1px solid --line
border-radius: 10px
font: --text-body, weight 400
color: --text
placeholder: --text-muted
```
- `:hover` → border `--text-muted`
- `:focus-visible` → border `--brand-text`, box-shadow `--focus-ring`, bg `--surface`
- `:disabled` → bg `--surface-mist`, color `--text-faint`
- `:invalid` (after blur) → border `#EF4444`, helper text `--status-cancel-text` below

Text areas: same tokens, `min-height: 96px`, `padding: 12px 14px`.

Search inputs in toolbars use `bg: --canvas` (not surface) — sits *into* the card, not on top.

### 4.4 Cards

```
bg: --surface
border: 1px solid --line
border-radius: 14px (mobile 12px)
padding: 20px (mobile 16px)
box-shadow: 0 1px 2px rgba(14,22,17,0.04)
```

- `:hover` (on interactive cards) → border `--brand-mid`, shadow `0 4px 16px rgba(14,22,17,0.06)`, translateY(-2px)

**Variants:**
- `.card-feature` — bg `--grad-feature`, no border, text `--ink`. Used once per page max (the "BU GÜN" / featured slot).
- `.card-folder-{sage|lime|forest|peach|lavender}` — bg from §2.6 gradients, no border. Min-height 140px.
- `.card-mirai` — bg `--mirai-surface` (`#0E1611`), text `--canvas`. Particle sphere bg image.

### 4.5 Sidebar (capsule, ink)

The capsule sidebar from Style 1, but ink — slightly warmer than `#0F0F0F`:

```
bg: #0E1611 (--ink, same token as primary text — they rhyme)
color: #A8B0AB (--text-faint as default sidebar text)
border-radius: 24px
margin: 20px (matches body padding)
width: 240px
padding: 20px 0
```

#### Sidebar item
```
height: 40px (mobile 48px)
padding: 0 16px (item rail at 16px from edge)
font: --text-ui, weight 500
color: #A8B0AB
gap: 12px (icon + label)
```
- `:hover` → bg `rgba(255,255,255,0.04)`, color `#FAFAF7`
- `.active` → color `#FAFAF7`, bg `rgba(173,251,73,0.08)`, **left rail accent** 3px Mindaro `#ADFB49` from item top to bottom (4px inset)
- Section labels (`SƏNƏDLƏR`, `İDARƏETMƏ`): 11/14 weight 500, tracking +0.1em, color `#5CA87C` (brand mid — quiet sage, not white)

Sidebar header: 32px logo + "Reflect" wordmark in `--brand-mist` (`#DCFCE7`), weight 700, 16/22.

Sidebar footer: chameleon mascot 48×48px, sits 20px from bottom edge, eye blinks every 8s (§5.3).

### 4.6 Topbar / page header

Pages do NOT have a separate topbar component. Page header is part of `<main>`:

```html
<header class="page-head">
  <div class="page-head-meta">47 açıq · 12 mənim</div>
  <h1 class="h1">Tapşırıqlar</h1>
  <div class="page-head-actions">
    <input class="input search">
    <button class="btn-outline">Mənim (12)</button>
    <button class="btn-primary">+ Yeni</button>
  </div>
</header>
```

Mobile: actions wrap below title, primary CTA full-width on its own line.

### 4.7 Tables

```
font: --text-body
th: --text-meta, weight 500, color --text-muted, tracking +0.05em, text-transform uppercase, padding 12px 14px, border-bottom 1px --line
td: padding 14px, border-bottom 1px --line-soft
tr:hover td → bg --surface-mist
```

Numerical columns: `text-align: right`, `font-variant-numeric: tabular-nums`.

### 4.8 Avatars

```
border-radius: 999px
default size: 32px (sm 24, lg 40, xl 64)
fallback: linear-gradient(135deg, --brand-mid, --brand-mist), text --brand-text initials weight 600
border: 2px solid --surface (when stacked)
presence dot: bottom-right, see §2.5
```

### 4.9 Kanban column (Tapşırıqlar)

Six columns: İdeyalar / **BU GÜN** / İcrada / Yoxlamada / Ekspertizada / Tamamlandı.

**BU GÜN column** is the ink column (carried from Style 1):
```
bg: --ink (#0E1611)
border-radius: 16px
header color: --brand-action (#ADFB49)
cards inside: bg #1F2925, border #2D3833, color #FAFAF7
featured card (top): bg --brand-action, color --ink
```

All other columns: transparent bg, regular `.tcard` children. Header label uses status color from §2.4.

### 4.10 Empty states

Every list/page has a defined empty state. Anatomy:
1. Mascot 96×96px, default pose
2. H3 line ("Hələ heç nə yoxdur burada")
3. Body line muted ("İlk tapşırığınızı yaradın və başlayın")
4. Single primary CTA

Mascot is the *only* illustration. No spot illustrations, no Lottie, no hand-drawn arrows.

### 4.11 Toast / inline alerts

```
position: fixed bottom 24px right 24px (mobile bottom 16px, full width minus 16px)
bg: --ink
color: --canvas
border-radius: 12px
padding: 12px 16px
shadow: 0 8px 24px rgba(14,22,17,0.16)
border-left: 3px solid {status color}
```

Auto-dismiss 4s. Hover pauses dismiss. Action button inline (right side), Mindaro text on ink bg.

---

## 5. Mascot system — the chameleon

### 5.1 Why a chameleon

A chameleon adapts. He changes color to match context. He's calm, observant, slightly humorous — the right register for "software for architects" (creative + precise + not corporate).

He is **not** the brand mascot in the marketing sense. He's a UI character — a guide, an empty-state companion, a loading buddy. He never appears in pricing pages, contracts, or finance contexts (those are serious).

### 5.2 Visual spec (v1 placeholder)

For v1.0 we ship a **placeholder SVG**: a single-path silhouette with one Mindaro eye. Replaceable later by a commissioned illustration without changing component code.

```svg
<!-- 64×64 viewBox, single path, eye as <circle> -->
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path d="..." fill="var(--mascot-body)"/>
  <circle cx="42" cy="22" r="3" fill="var(--mascot-eye)"/>
</svg>
```

Specs:
- Viewbox 64×64
- Body fill: `var(--mascot-body)` (`#0E1611`)
- Eye fill: `var(--mascot-eye)` (`#ADFB49`)
- Tail curls right (mascot is right-handed — camera-left orientation reads as approachable)
- Pose: relaxed, weight on front legs, head slightly raised

The SVG is checked into `/preview/style4/mascot.svg` (single file, 4 sizes via CSS).

### 5.3 Animation: the blink

The single canonical animation. CSS-only.

```css
@keyframes mascot-blink {
  0%, 96%, 100% { transform: scaleY(1); }
  98% { transform: scaleY(0.1); }
}
.mascot-eye {
  transform-origin: center;
  transform-box: fill-box;
  animation: mascot-blink 8s ease-in-out infinite;
}
```

**Rules:**
- Single eye, blinks once every 8 seconds
- `prefers-reduced-motion: reduce` disables the animation entirely
- No idle bounce, no walk cycle, no head turn in v1.0 — those are v2.0 candidates if we ever ship a commissioned illustration

### 5.4 Placement (the only 4 places he appears)

| Surface | Size | Pose | Note |
|---|---|---|---|
| Sidebar foot | 48×48 | default | Always visible, blinks. The "always-on companion." |
| Empty states | 96×96 | default | List / search / inbox empties (§4.10) |
| MIRAI loading | 64×64 | default, eye replaced by `--brand-action-soft` | While AI is thinking — sits left of the particle sphere, blinks at normal cadence |
| Login page | 128×128 | default | Below the form, replaces decorative hero illustration |

**Forbidden placements:** dashboard widgets, modals, toasts, error pages, finance/admin surfaces, any printable export. Five appearances is too many; four is the contract.

### 5.5 Accessibility

The mascot is decorative. Every `<svg>` instance:
- `role="img"` only when in empty state (with `<title>Hələ tapşırıq yoxdur</title>`)
- `aria-hidden="true"` in sidebar foot, MIRAI loading
- Never serves a functional purpose — losing him never breaks a flow

### 5.6 Don'ts

- **Don't** color him in brand green (`--brand-text`). Body stays ink.
- **Don't** add additional eyes or expressions. One eye, one Mindaro.
- **Don't** float him over content with z-index — he's a sibling, not a layer.
- **Don't** animate him during scroll, hover, or click. The 8-second blink is the entire motion budget.

---

## 6. Motion + Accessibility

### 6.1 Motion budget

Total CSS animation/transition budget across the entire product: **≤ 4kb minified**. This is a hard cap. Animation is a feature; bloat is not.

Six motion tokens cover everything:

| Token | Definition | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Most UI transitions (hover lift, panel open) |
| `--ease-in` | `cubic-bezier(0.55, 0, 1, 0.45)` | Exits, dismiss |
| `--ease-spring` | `cubic-bezier(0.5, 1.5, 0.5, 1)` | Toast entry, modal open |
| `--dur-fast` | `120ms` | Hover, focus, color shifts |
| `--dur-base` | `220ms` | Card lift, panel slide |
| `--dur-slow` | `420ms` | Modal, route transition, mirai sphere drift step |

**Animations allowed by surface:**
- Hover: color, border, transform translateY, box-shadow (`--dur-fast`)
- Click feedback: scale 0.98 → 1 (`--dur-fast`)
- Card hover: translateY(-2px) (`--dur-base`)
- Mascot blink: 8s loop (§5.3)
- MIRAI sphere drift: 12s loop (§7.3)
- Modal/drawer: opacity + translate (`--dur-slow`)
- Dot canvas: **no animation**. The canvas is static. Liveness comes from the mascot and MIRAI.

**Forbidden:**
- Parallax scrolling
- Auto-playing carousels
- Background gradient animations
- Letter-by-letter text reveals
- Scroll-linked animations (cause jank, kill batteries)

### 6.2 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This is global. The mascot stops blinking, the MIRAI sphere stops drifting, all hovers become instant. No exceptions.

### 6.3 Color contrast (WCAG 2.2)

Every text/bg combination tested. `--text-faint` is the only token that fails AA — and it's reserved for disabled UI (which has paired affordances).

Passing combinations (AA = 4.5:1 normal text, 3:1 large text 18pt+/14pt bold):

| Foreground | Background | Ratio | AA |
|---|---|---|---|
| `--ink` | `--brand-action` | 14.6:1 | AAA |
| `--text` | `--canvas` | 14.2:1 | AAA |
| `--text-soft` | `--canvas` | 7.4:1 | AAA |
| `--text-muted` | `--canvas` | 4.8:1 | AA |
| `--canvas` | `--ink` | 17.8:1 | AAA |
| `--brand-text` | `--canvas` | 9.1:1 | AAA |
| `--brand-text` | `--brand-mist` | 8.6:1 | AAA |

Status text on status bg combinations all pass AA — verified per §2.4 pairings.

### 6.4 Focus visibility

`:focus-visible` ALWAYS shows the focus ring. Never suppressed via `outline: none` without a replacement. The Mindaro 33% ring is visible on every neutral background and on dark sidebar.

Tab order follows DOM order. Skip-to-content link is the first focusable element on every page (sr-only until focused).

### 6.5 Keyboard

- All interactive elements operable via keyboard
- `Esc` closes modals, drawers, popovers
- `/` focuses the global search input (page-head)
- `g + d` (chord) navigates to Dashboard, `g + t` to Tapşırıqlar (advertised in `Cmd+K`)
- `Cmd+K` opens command palette (PRD §10.4)

### 6.6 Screen reader

- Every interactive element has an accessible name (label or aria-label)
- Status dots have `<span class="sr-only">Online</span>` companions
- Mascot uses `aria-hidden="true"` except in empty states (§5.5)
- MIRAI streamed responses use `aria-live="polite"`, never `assertive` (would interrupt the user)

### 6.7 Touch targets

Mobile minimum 44×44px (iOS HIG) and 48×48dp (Material). Buttons grow from 40px to 44px. Sidebar items grow from 40px to 48px. Chips stay at 26px but are not touch targets — clicking them filters; the filter clear button is 44px.

### 6.8 Reduced data

For `prefers-reduced-data: reduce` (Save Data header):
- Folder gradients fall back to `--brand-soft` solid
- MIRAI particle sphere falls back to a static SVG
- Avatars without uploaded images use the gradient fallback (no network fetch)

---

---

## 7. MIRAI signature surface

MIRAI is the AI assistant (PRD §7). In Style 1 it lives on a gradient page — readable but generic. In designstyle4, MIRAI gets its own visual identity: the **particle sphere**.

### 7.1 The sphere

A 3D-feeling sphere rendered in 2D, made of ~400 white dots on ink background. Looks like a sentient atom.

```
size: 360px (desktop), 240px (mobile)
bg: --mirai-surface (#0E1611)
particles: --mirai-particle (#FAFAF7), 1px circles, opacity gradient (0.4 → 1.0 outward → 0.4)
edge glow: --mirai-glow (rgba(173, 251, 73, 0.08)), radial 0% to 100%, blurred 24px
```

**v1.0 implementation:** static SVG with ~400 `<circle>` elements in a Fibonacci-distributed sphere projection. Pre-rendered, single asset, ~6kb gzipped. Lives at `/preview/style4/mirai-sphere.svg`.

**v2.0 candidate:** Three.js / canvas-based sphere with rotation. Costs ~80kb runtime — defer until v1.0 ships.

### 7.2 Sphere surface usage

The sphere appears on exactly three surfaces:

1. **MIRAI page hero** — full sphere, 360px, centered above input
2. **MIRAI loading state** — sphere thumbnail 64×64 inline with chameleon mascot, "MIRAI düşünür..."
3. **Dashboard MIRAI widget** — sphere thumbnail 80×80 in upper-left of the widget card

**Forbidden surfaces:** loading skeletons, login (login uses orb gradient), 404 page, settings, anywhere AI is not actively involved.

### 7.3 Drift animation

The sphere has one motion: a 12-second slow drift.

```css
@keyframes mirai-drift {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  33% { transform: translate(2px, -3px) rotate(0.4deg); }
  66% { transform: translate(-1px, 2px) rotate(-0.3deg); }
}
.mirai-sphere {
  animation: mirai-drift 12s ease-in-out infinite;
}
```

Tiny — barely perceptible. The point is that the sphere is *not still*. Pair with `prefers-reduced-motion` opt-out (§6.2).

When MIRAI is "thinking" (request in flight), drift speed doubles to 6s and edge glow opacity ramps to 16%. When response complete, returns to 12s/8%.

### 7.4 Chrome around MIRAI

The MIRAI page has a distinct chrome:

- Background `--mirai-surface` (`#0E1611`) — full bleed, no canvas dots
- Text `--canvas` (`#FAFAF7`) — reading inverted
- Input box: bg `rgba(255,255,255,0.04)`, border `rgba(255,255,255,0.08)`, focus ring Mindaro
- Send button: `.btn-primary` (Mindaro on ink — extra contrast in dark context)
- Conversation cards: bg `rgba(255,255,255,0.04)`, border `rgba(255,255,255,0.08)`, padding 20px, border-radius 14px
- Persona pill ("MIRAI") above each AI bubble: bg `rgba(173,251,73,0.08)`, color `--brand-action`, height 22px

**The MIRAI page is the only dark page in the product** (besides the sidebar capsule). This is intentional: AI deserves its own theater.

### 7.5 Source citations

Every MIRAI response has a sources strip below the bubble:

```
[Şəhərsalma TŞ_v3.pdf · s.12]  [Aksent_kontrakt.docx · s.4]
```

Chips: bg `rgba(255,255,255,0.04)`, color `--canvas`, hover bg `rgba(173,251,73,0.08)`. Clicking opens the source doc in a side panel (PRD §7.4).

If MIRAI cannot cite, response chrome shifts: persona pill becomes `--text-muted`, message reads "Bunu mənbədən təsdiqləyə bilmirəm — özüm yaratdım." This is a feature, not a bug — honest AI signaling.

---

## 8. Page-by-page application

Eight pages (PRD §10). Each gets a one-page spec: layout, key components, hero/empty state.

### 8.1 Login (`/login`)

- Bg: full-bleed `--canvas` with dot grid, blurred Mindaro orb (radial `--brand-action` → transparent, 600px) bottom-right
- Center card: 400px wide, surface, padding 40px, radius 18px, shadow `0 24px 64px rgba(14,22,17,0.08)`
- Logo: 48px sage forest mark + "Reflect" wordmark `--brand-text` weight 700
- Form: email input → password input → `.btn-primary` full-width "Daxil ol"
- Below form: chameleon mascot 128×128, "İlk dəfə? Demo hesabı yarat →" link `--brand-text`
- Bottom-right corner: language toggle AZ / EN / RU as quiet `.chip` cluster

### 8.2 Dashboard (`/`)

Inherits Style 1 canonical layout. Three rows × twelve-column grid (mobile: stacks).

**Row 1 (height ≈ 320px):**
- Cols 1–7: **Featured project card** (`.card-feature`, `--grad-feature`) — current Aksent Group project, big phase chip, next milestone, lead avatar
- Cols 8–12: **Focus timer** (REQ-FOCUS) — circular progress, current task title, "25:00" tabular numbers, mascot 64px next to ring (eye blinks)

**Row 2 (height auto):**
- Cols 1–8: **Tapşırıqlar (BU GÜN)** — ink-bg ribbon with 5 cards, see §4.9 styling. "Hamısına bax →" link top-right.
- Cols 9–12: **Folders** — 2×2 grid of `.card-folder-*` (sage, lime, forest, peach mixed)

**Row 3 (height ≈ 200px):**
- Cols 1–5: **KPI strip** — 3 stat cards (açıq tapşırıq, gecikmiş, bu həftə tamamlanan) tabular numbers
- Cols 6–8: **Yenilənmiş layihələr** — list of 4 recent projects with phase chip
- Cols 9–12: **Komanda presence** (REQ-PRESENCE) — 7 avatar grid with online/away/offline dots, "Online indi (3)" count

**Removed from Style 1:** finance widget (REQ-DASH-08).

**Empty state (new account):** mascot 96px center, "Reflect-ə xoş gəlmisən" + "İlk layihəni yarat" `.btn-primary`.

### 8.3 Tapşırıqlar (`/tapsiriqlar`)

Six-column kanban (§4.9). Order: İdeyalar · **BU GÜN** · İcrada · Yoxlamada · Ekspertizada · Tamamlandı.

- Page head: meta count, H1, search input, 3 filter buttons, primary "+ Yeni"
- View toggles below: Lövhə · Cədvəl · Təqvim · Gantt (chips, default Lövhə)
- BU GÜN column ink, others transparent — see §4.9
- Empty Tamamlandı stub: "+ N daha" — clicks expand archived

**Cədvəl view:** standard table (§4.7), columns: Tapşırıq · Layihə · İcraçı · Phase · Vaxt · Status.

### 8.4 Layihələr (`/layihelər`)

Bento grid: large folder card + 6 medium folders + 1 "+ Yeni" placeholder card (dashed border `--line`, ghost mascot).

- Each folder: 280px tall, name H3 weight 700 ink, phase chip top-left, team avatar stack bottom-right, progress bar 4px Mindaro
- Hover: card lift, gradient tilts (no — too gimmicky, just translateY)
- Filter chips above grid: Status · Phase · Komanda · Müddət

### 8.5 Layihə (`/layihelər/:id`)

Three-pane layout:
- Left rail (240px): phase navigator (Konsepsiya → İcra), milestones, team
- Center (auto): current phase content — sketch grid, drawing list, RFI thread, decisions log
- Right rail (320px): MIRAI panel (collapsed by default — sphere thumbnail + "MIRAI-dən soruş")

Header strip: project name H1, client chip, location (Bakı, Yasamal), phase progress bar, primary "+ Sənəd əlavə et"

### 8.6 Müştərilər (`/müşterilər`)

Table-first (§4.7). Columns: Müştəri · Aktiv layihələr · Son əlaqə · NPS · Mənbə · Ünvan.

Header chips: All · Active · Cold · Lead. Right side: search, "+ Yeni müştəri".

Row click → drawer (right side, 480px) with full client card, contact log, related projects.

### 8.7 Hesabatlar (`/hesabatlar`)

Three KPI cards (Layihələr, Gəlir AZN, Komanda yükü), then three chart cards (per PRD §10.7):
- Phase distribution (donut)
- Revenue by month (bar)
- Capacity heatmap (cells)

Charts: ink axes, Mindaro accent for current period, sage forest for past, `--text-muted` for grid lines. No 3D, no shadows on bars.

Export pill top-right: "PDF · Excel · CSV" segmented control.

### 8.8 MIRAI (`/mirai`)

Full dark page (§7.4). Hero: 360px particle sphere centered, "MIRAI" hero text below in `--canvas` weight 900, tracking -0.02em. One-line tagline `--text-muted-light`.

Below: input box (full-width max 720px), suggestions row (4 chip prompts: "Bu həftəki tapşırıqları yığ", "Aksent kontraktını yoxla", ...).

Conversation thread: alternating user/MIRAI bubbles. User: right-aligned, `rgba(255,255,255,0.06)` bg. MIRAI: left-aligned, persona pill above, sources below.

Empty state: just the sphere + tagline. Mascot does NOT appear here — sphere is the character.

### 8.9 Sazlamalar (`/sazlamalar`)

Standard settings page: left nav rail (Profil · Komanda · Bildirişlər · İnteqrasiyalar · Faktura · Təhlükəsizlik), right form area. White card, no gradients. Quietest page in the system.

---

## 9. Implementation plan + DoD

### 9.1 Build order

Two engineers, ~3 weeks for full HTML preview parity with Style 1.

**Week 1 — Foundations**
- Day 1–2: `tokens.css` for style4 (all §2 tokens, motion tokens §6.1)
- Day 2–3: `mascot.svg` (placeholder, single path, animated eye)
- Day 3–4: `mirai-sphere.svg` (Fibonacci 400 particles, edge glow)
- Day 4–5: `shell.js` adapted (sidebar 24px capsule, ink #0E1611, mascot foot inject)
- Day 5: `login.html` — first page, validates tokens end-to-end

**Week 2 — Core pages**
- Day 6–7: `dashboard.html` — three rows, focus timer + presence panel, mascot in focus widget
- Day 8: `tapsiriqlar.html` — six-column kanban, BU GÜN ink column
- Day 9: `layiheler.html` — bento folder grid
- Day 10: `layihe.html` — three-pane project detail

**Week 3 — Long tail + polish**
- Day 11: `musteriler.html` — table + drawer
- Day 12: `hesabatlar.html` — KPI + charts
- Day 13: `mirai.html` — dark hero, particle sphere
- Day 14: `sazlamalar.html` — settings forms
- Day 15: cross-page audit, mobile pass, reduced-motion + a11y QA

### 9.2 File structure

```
preview/style4/
├── tokens.css              # §2 colors, §3 typography, §6 motion
├── shell.js                # sidebar + topbar inject (forked from style1/shell.js)
├── mascot.svg              # §5.2 placeholder chameleon
├── mirai-sphere.svg        # §7.1 particle sphere
├── login.html
├── dashboard.html
├── tapsiriqlar.html
├── layiheler.html
├── layihe.html
├── musteriler.html
├── hesabatlar.html
├── mirai.html
└── sazlamalar.html
```

No build step. Pure HTML + Tailwind CDN + tokens.css. Same constraints as Style 1.

### 9.3 Definition of Done

A page is "done" when:

**Visual**
- [ ] All colors come from tokens — zero raw hexes in HTML
- [ ] All typography uses scale tokens (§3.2) — no `font-size: 15px` arbitrary values
- [ ] Cards, buttons, chips, inputs match §4 specs exactly
- [ ] Empty state implemented and screenshot-able (§4.10)

**Motion**
- [ ] Total animation CSS ≤ 4kb across the file (use `wc -c` on extracted `<style>`)
- [ ] `prefers-reduced-motion` tested — mascot stops, sphere stops, all transitions become instant
- [ ] No layout shift during animation (test with Chrome DevTools Animations panel)

**Accessibility**
- [ ] Lighthouse a11y score ≥ 95
- [ ] All interactive elements keyboard-reachable; tab order matches DOM
- [ ] All text passes AA contrast (axe DevTools clean, except known `--text-faint` disabled-only)
- [ ] Mascot `aria-hidden` everywhere except empty states (§5.5)

**Mobile**
- [ ] Renders correctly at 360px wide
- [ ] Touch targets ≥44px
- [ ] Sticky topbar, drawer sidebar (inherited from Style 1 mobile patterns)
- [ ] Tables scroll horizontally with edge fade

**Performance**
- [ ] Page weight ≤ 80kb (HTML + tokens.css + svg, excluding fonts)
- [ ] LCP < 1.5s on simulated Slow 4G
- [ ] No CLS from font swap (font-display: swap acceptable; reserve space)

### 9.4 Decision points before coding

Before Week 1 starts, the team needs decisions on:

1. **Mascot illustration source.** Placeholder SVG ships v1.0; do we commission a final illustration for v2.0, and from whom? Suggest: brief one Bakı illustrator (₼800–1200) for a v2.0 set including the v1.0 default pose + 3 emotion variants (happy/loading/empty).
2. **Particle sphere fidelity.** v1.0 static SVG is ~6kb. v2.0 canvas-based rotation is ~80kb. Confirm v1.0 is acceptable for ship; v2.0 only if user testing demands it.
3. **MIRAI dark page exception.** This is the only dark page besides the sidebar. Confirm with PM that page-level dark mode is brand-acceptable (it's an aesthetic choice, not a system dark mode toggle).
4. **Satoshi licensing.** Fontshare CDN is free for commercial use; confirm legal review approves CDN dependency, or we self-host (~120kb font subset).

### 9.5 Style selection criteria (for the four-style review)

When product/design picks the v1.0 production style, evaluate designstyle4 on:

- **Differentiation:** does Reflect look like *another* B2B SaaS, or like itself? designstyle4 wins here.
- **Implementation cost:** designstyle4 is +1 week vs Style 1 (mascot + sphere + Satoshi swap).
- **User comprehension:** do architects "get it" in usability tests? The mascot risks being seen as childish; the sphere risks being seen as gimmicky. Test before committing.
- **Localization:** Satoshi has limited Cyrillic and no Arabic. If we ship Russian or Arabic in v1.0, Satoshi falls back ungracefully — Style 1 (Rubik) is multi-script-safe by default. **This is the strongest argument against designstyle4 for v1.0.**
- **Maintenance:** designstyle4 has more moving parts (mascot SVG, sphere SVG, motion tokens, dark MIRAI surface). More surface area for drift over 12 months.

**Recommendation (Designer II):** designstyle4 is the most exciting of the four directions. It's also the riskiest. If Reflect's v1.0 audience is AZ-only and design ambition is high, ship it. If we need RU/AR localization in months 1–6, ship Style 1 and revisit designstyle4 as a "Reflect Pro" or v2.0 visual refresh.

---

## Appendix A — Token quick reference

```css
:root {
  /* Brand */
  --brand-action: #ADFB49;
  --brand-action-hover: #9BE83E;
  --brand-action-soft: #ECFFB6;
  --brand-text: #1A5140;
  --brand-deep: #0E3838;
  --brand-mid: #5CA87C;
  --brand-soft: #B7E5BA;
  --brand-mist: #DCFCE7;

  /* Neutrals */
  --canvas: #FAFAF7;
  --canvas-dots: #D8D6CD;
  --canvas-warm: #F4F2EC;
  --surface: #FFFFFF;
  --surface-mist: #F0EFE9;
  --line: #E8E6DD;
  --line-soft: #EFEEE8;

  /* Text */
  --ink: #0E1611;
  --text: #1F2925;
  --text-soft: #4F5A55;
  --text-muted: #7A857F;
  --text-faint: #A8B0AB;

  /* MIRAI */
  --mirai-surface: #0E1611;
  --mirai-particle: #FAFAF7;
  --mirai-glow: rgba(173, 251, 73, 0.08);

  /* Mascot */
  --mascot-body: #0E1611;
  --mascot-eye: #ADFB49;

  /* Focus */
  --focus-ring: 0 0 0 3px rgba(173, 251, 73, 0.33);

  /* Motion */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in: cubic-bezier(0.55, 0, 1, 0.45);
  --ease-spring: cubic-bezier(0.5, 1.5, 0.5, 1);
  --dur-fast: 120ms;
  --dur-base: 220ms;
  --dur-slow: 420ms;
}
```

Status tokens (§2.4) and gradient tokens (§2.6) follow the same pattern — see those sections for full names.

---

*End of designstyle4 v1.0 (draft). Next: ship `preview/style4/login.html` to validate the tokens.*
