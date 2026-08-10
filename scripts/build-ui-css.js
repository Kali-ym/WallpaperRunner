const fs = require('fs')

const extract = fs.readFileSync('src/renderer/_mockup-extract.css', 'utf8')
const mockup = extract
  .split(/\r?\n/)
  .map((l) => (l.startsWith('    ') ? l.slice(4) : l))
  .join('\n')

const header = `/* WallpaperRunner UI — from docs/index.html + dual theme */
:root,
[data-theme='dark'] {
  color-scheme: dark;
  --bg: oklch(16% 0.012 55);
  --bg-deep: oklch(12% 0.01 55);
  --surface: oklch(20% 0.014 55);
  --surface-2: oklch(24% 0.016 55);
  --fg: oklch(94% 0.012 75);
  --muted: oklch(68% 0.02 70);
  --border: oklch(32% 0.016 55);
  --accent: oklch(76% 0.16 62);
  --accent-strong: oklch(70% 0.17 55);
  --accent-ink: oklch(18% 0.03 55);
  --danger: oklch(68% 0.18 25);
  --ok: oklch(72% 0.14 150);
  --radius: 12px;
  --radius-sm: 8px;
  --rail-w: 248px;
  --header-h: 64px;
  --font-display: "Segoe UI Variable Display", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  --font-body: "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif;
  --font-mono: "Cascadia Mono", "JetBrains Mono", "Consolas", ui-monospace, monospace;
  --shadow-soft: 0 12px 40px oklch(0% 0 0 / 0.45);
  --focus: 0 0 0 2px oklch(16% 0.012 55), 0 0 0 4px oklch(76% 0.16 62 / 0.55);
  --hairline: oklch(100% 0 0 / 0.06);
  --hover-fill: oklch(100% 0 0 / 0.05);
  --panel-tint: oklch(100% 0 0 / 0.03);
  --deep-scrim: oklch(12% 0.01 55 / 0.72);
  --text: var(--fg);
  --ink: var(--fg);
  --panel: var(--surface);
  --line: var(--border);
  --shadow: var(--shadow-soft);
  --font-sans: var(--font-body);
}

[data-theme='light'] {
  color-scheme: light;
  --bg: oklch(96% 0.012 75);
  --bg-deep: oklch(93% 0.014 75);
  --surface: oklch(99% 0.008 75);
  --surface-2: oklch(97% 0.01 75);
  --fg: oklch(22% 0.02 55);
  --muted: oklch(48% 0.02 55);
  --border: oklch(86% 0.02 70);
  --accent: oklch(58% 0.14 55);
  --accent-strong: oklch(52% 0.15 55);
  --accent-ink: oklch(98% 0.01 75);
  --danger: oklch(55% 0.18 25);
  --ok: oklch(52% 0.12 150);
  --shadow-soft: 0 12px 36px oklch(30% 0.02 55 / 0.12);
  --focus: 0 0 0 2px oklch(96% 0.012 75), 0 0 0 4px oklch(58% 0.14 55 / 0.45);
  --hairline: oklch(0% 0 0 / 0.08);
  --hover-fill: oklch(0% 0 0 / 0.04);
  --panel-tint: oklch(0% 0 0 / 0.03);
  --deep-scrim: oklch(96% 0.012 75 / 0.78);
  --text: var(--fg);
  --ink: var(--fg);
  --panel: var(--surface);
  --line: var(--border);
  --shadow: var(--shadow-soft);
}

`

const body = mockup.replace(/:root\s*\{[\s\S]*?\}\s*/, '')

const extras = fs.readFileSync('src/renderer/_styles-extras.css', 'utf8')

fs.writeFileSync('src/renderer/styles.css', `${header}\n${body}\n${extras}`)
console.log('wrote styles.css', fs.statSync('src/renderer/styles.css').size)
