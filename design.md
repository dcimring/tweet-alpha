# Design System - Tweet Alpha Terminal

This document details the **Premium Brutalist Theme** styling, fonts, colors, and layout guidelines applied to the **Tweet Alpha Terminal** frontend application.

---

## 1. Design Philosophy

The Tweet Alpha Terminal design is inspired by modern web brutalism: high-contrast elements, bold typography, solid boundaries, and dynamic micro-animations. 

Instead of traditional glassmorphism, soft gradients, and rounded container boxes, this layout features stark divisions, flat shadows, heavy lines, and light off-white surfaces, creating a highly satisfying, responsive, and tactile developer terminal.

---

## 2. Color Palette

The theme is built on a custom harmonized color token system defined in [src/index.css](file:///Users/danielcimring/Code/GitHub/tweet-alpha/src/index.css):

| CSS Variable | Hex Color | Role / Description |
| :--- | :--- | :--- |
| `--paper` | `#f4f3ee` | **Primary Canvas**: A warm, off-white cream background that forms the primary viewport and page background. |
| `--ink` | `#0a0a0a` | **Charcoal Ink**: Stark charcoal black used for all primary text, solid borders, and layout guidelines. |
| `--mute` | `#6e6e68` | **Dimmed Text**: Subdued gray for metadata, subtitles, timestamps, and secondary captions. |
| `--red` | `#d83a1f` | **Alert Crimson**: Vibrant, heavy red used for brand indicators, critical signal badges (`BUY` / `SELL`), and line charts. |
| `--yellow` | `#ffd400` | **Accent Highlight**: Neon yellow used for ticker strip highlights, trending widgets, bullish badges, and button hover states. |

---

## 3. Typography

The system utilizes two premium Google Fonts loaded dynamically in [index.html](file:///Users/danielcimring/Code/GitHub/tweet-alpha/index.html):

### A. Inter Tight
- **Role**: Primary Title & Header Typeface
- **Styling**: Configured with ultra-bold weights (`800`, `900`) and extremely tight letter spacing (`letter-spacing: -0.04em`).
- **Applied To**: Navbar brand logo, layout titles, KPI card numbers, and pricing headings.

### B. JetBrains Mono
- **Role**: Technical Metadata & Log Typeface
- **Styling**: Crisp, clean monospace format that ensures tabular metrics and log timelines are perfectly aligned.
- **Applied To**: Live status badge, metrics captions, timestamps, tag-cloud counters, Recharts hover tooltips, and background scrape runs rows.

---

## 4. Key Styling Tokens & Rules

### A. Sharp Boundaries
No border-radii are allowed. Every container, widget, card, and button has:
```css
border-radius: 0px;
border: var(--line) solid var(--ink); /* 2px solid charcoal black */
```

### B. Tactile Offset Shadows
Metric cards and panels float above the canvas using a flat black offset shadow. On hover, the container translates slightly to create a satisfying mechanical press effect:
```css
.glass-panel {
  box-shadow: 4px 4px 0px 0px var(--ink);
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.glass-panel:hover {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0px 0px var(--ink);
}
```

### C. Continuous Ticker tape
A horizontal continuous marquee loops across the top section:
- **Class**: `.strip .track`
- **Behavior**: Animates using `marquee-scroll-brutalist` moving infinitely at `40s` linear cadence. Doubles the array footprint to guarantee a seamless seam loop.

### D. Outlined Graph Paper Charts
Recharts widgets are designed to mimic hand-drawn graph paper plots:
- **Pie Chart Slices**: Rendered with high-contrast slices outlined in black (`stroke="#0a0a0a" strokeWidth={2}`).
- **Line Cost Chart**: Plots costs as a heavy red line (`stroke="#d83a1f" strokeWidth={3}`) marked by solid yellow dots outlined in black (`fill="#ffd400"`), rendering a beautiful retro financial plot.
- **Tooltips**: All hover card metrics render in a white, solid-bordered, monospace-font box.
