# KodNest Premium Build System

Design system for KodNest. Calm, intentional, coherent, confident. B2C-ready.

## Contents

| File | Purpose |
|------|--------|
| `tokens.css` | Colors, typography, spacing scale, layout vars |
| `base.css` | Reset, body, headings, body text, utilities |
| `layout.css` | Top Bar, Context Header, Workspace, Panel, Proof Footer |
| `components.css` | Buttons, badges, inputs, cards, prompt box, error/empty states |
| `index.css` | Single entry — imports all above |
| `reference.html` | Reference page showing full layout and components |

## Usage

Link the system in your app:

```html
<link rel="stylesheet" href="design-system/index.css">
```

Or in JS/CSS:

```css
@import './design-system/index.css';
```

## Layout structure

Every page: **Top Bar** → **Context Header** → **Primary Workspace (70%) + Secondary Panel (30%)** → **Proof Footer**.

Use classes `kn-page`, `kn-topbar`, `kn-context-header`, `kn-main`, `kn-workspace`, `kn-panel`, `kn-proof-footer` to build the shell. Fill workspace and panel with `kn-card`, `kn-btn`, `kn-input`, `kn-prompt-box`, etc.

## Spacing

Use only: `8px`, `16px`, `24px`, `40px`, `64px` (tokens: `--kn-space-1` … `--kn-space-5`).

## Colors (max 4)

- Background: `#F7F6F3`
- Text: `#111111`
- Accent: `#8B0000`
- Success / Warning: muted green, muted amber (semantic use only)

No gradients, glassmorphism, or neon.
