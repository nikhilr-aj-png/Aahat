#!/usr/bin/env node
/**
 * Design-system audit.
 *
 * Static analysis of every stylesheet, reporting the mechanically detectable
 * signals of an inconsistent design system: token sprawl, touch targets below
 * the 44px guideline, unreadable type, missing focus states, specificity wars.
 *
 * This measures structure, NOT appearance. It cannot tell you whether a screen
 * looks good — only whether it is internally consistent and meets the
 * accessibility floors. Visual review still requires a human or a browser.
 *
 * Usage: node scripts/design-audit.mjs [--json]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../web/src', import.meta.url));

const collectStylesheets = (dir, found = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectStylesheets(full, found);
    else if (entry.name.endsWith('.css')) found.push(full);
  }
  return found;
};

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

const files = collectStylesheets(ROOT);
const sources = files.map(file => ({ file: relative(ROOT, file), css: stripComments(readFileSync(file, 'utf8')) }));
const all = sources.map(source => source.css).join('\n');

const distinct = pattern => [...new Set([...all.matchAll(pattern)].map(match => match[1].trim()))];
const numbers = pattern => [...all.matchAll(pattern)].map(match => Number(match[1]));

const TOUCH_TARGET_MIN = 44;   // WCAG 2.5.5 / iOS HIG / Material
const READABLE_FONT_MIN = 12;  // below this, body text is hard to read on mobile
const NARROWEST_VIEWPORT = 300;

const report = {
  files: files.length,
  radii: distinct(/border-radius:\s*([^;!}]+)/g).length,
  durations: distinct(/transition:[^;}]*?([0-9.]+m?s)/g).length,
  fontSizes: distinct(/font-size:\s*([^;!}]+)/g).length,
  breakpoints: [...new Set(numbers(/max-width:\s*([0-9]+)px/g))].length,
  zIndexes: [...new Set(numbers(/z-index:\s*(-?[0-9]+)/g))].length,
  importants: (all.match(/!important/g) || []).length,
  smallTouchTargets: numbers(/min-height:\s*([0-9]+)px/g).filter(v => v > 0 && v < TOUCH_TARGET_MIN).length,
  unreadableFonts: numbers(/font-size:\s*([0-9.]+)px/g).filter(v => v < READABLE_FONT_MIN).length,
  overflowRisks: [...new Set(numbers(/(?:^|[;{\s])(?:min-)?width:\s*([0-9]{3,})px/g).filter(v => v > NARROWEST_VIEWPORT))],
  focusVisible: (all.match(/:focus-visible/g) || []).length,
  reducedMotion: (all.match(/prefers-reduced-motion/g) || []).length,
  lightMode: (all.match(/prefers-color-scheme:\s*light/g) || []).length
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const line = (label, value, note = '') => console.log(`  ${label.padEnd(34)} ${String(value).padStart(6)}  ${note}`);
  console.log(`\nDesign-system audit — ${report.files} stylesheets\n`);
  console.log('Token consistency (fewer is better)');
  line('distinct border-radius values', report.radii, 'target <= 6');
  line('distinct transition durations', report.durations, 'target <= 4');
  line('distinct font-size values', report.fontSizes, 'target <= 10');
  line('distinct breakpoints', report.breakpoints, 'target <= 8');
  line('distinct z-index values', report.zIndexes, 'target <= 8');
  line('!important declarations', report.importants, 'lower is better');
  console.log('\nAccessibility floors');
  line(`min-height below ${TOUCH_TARGET_MIN}px`, report.smallTouchTargets, 'target 0');
  line(`font-size below ${READABLE_FONT_MIN}px`, report.unreadableFonts, 'target 0');
  line(':focus-visible rules', report.focusVisible, 'higher is better');
  line('prefers-reduced-motion blocks', report.reducedMotion, 'higher is better');
  line('light-mode rules', report.lightMode, 'target > 0 if light mode ships');
  console.log('\nResponsive risk');
  line(`fixed widths above ${NARROWEST_VIEWPORT}px`, report.overflowRisks.length, report.overflowRisks.join(', ') || 'none');
  console.log('\nNote: this measures structure, not appearance. It cannot verify');
  console.log('that a screen looks correct — only that it is consistent and');
  console.log('meets the accessibility floors.\n');
}

export default report;
