#!/usr/bin/env node
/**
 * Viewport audit — renders the real app in Chromium and MEASURES layout.
 *
 * This exists because static analysis cannot catch layout bugs. It reports
 * only what it can observe in a real engine:
 *   - horizontal overflow (the page or any element wider than the viewport)
 *   - touch targets smaller than 44px
 *   - text clipped by its container
 *   - text below the 12px readability floor
 * and writes a screenshot per viewport for human review.
 *
 * Usage:
 *   node scripts/viewport-audit.mjs                 # audit the login screen
 *   node scripts/viewport-audit.mjs --url http://localhost:5173/#chats
 *   node scripts/viewport-audit.mjs --out .audit/after
 *
 * NOTE ON COVERAGE: most screens sit behind Supabase auth. Without a test
 * account this reaches the unauthenticated screens only. Anything it did not
 * visit is reported as NOT MEASURED — never as passing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// Playwright is a dev dependency of web/, but this script lives at the repo
// root, so ESM resolution would not find it. Resolve from web/ explicitly.
const require = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = require('playwright');

const VIEWPORTS = [
  { name: '300', width: 300, height: 720 },
  { name: '320', width: 320, height: 720 },
  { name: '375', width: 375, height: 812 },
  { name: '425', width: 425, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
  { name: '2560', width: 2560, height: 1440 }
];

const TOUCH_MIN = 44;
const FONT_MIN = 12;

const args = process.argv.slice(2);
const readFlag = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index > -1 && args[index + 1] ? args[index + 1] : fallback;
};
const url = readFlag('--url', 'http://localhost:5173/');
const outDir = resolve(process.cwd(), readFlag('--out', '.audit/shots'));

/** Runs inside the page. Measures layout facts, not opinions. */
const measure = ({ touchMin, fontMin }) => {
  const visible = element => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const describe = element => {
    const id = element.id ? `#${element.id}` : '';
    const cls = typeof element.className === 'string' && element.className
      ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '';
    return `${element.tagName.toLowerCase()}${id}${cls}`;
  };

  const viewportWidth = document.documentElement.clientWidth;
  const elements = [...document.body.querySelectorAll('*')].filter(visible);

  // Page-level horizontal overflow.
  const pageOverflow = Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    0
  );

  const overflowing = [];
  const smallTargets = [];
  const clipped = [];
  const tinyText = [];

  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    // Element extends past the right edge of the viewport.
    if (rect.right > viewportWidth + 1 || rect.left < -1) {
      overflowing.push({ el: describe(element), left: Math.round(rect.left), right: Math.round(rect.right) });
    }

    // Interactive elements must be comfortably tappable.
    const interactive = ['button', 'a', 'input', 'select', 'textarea'].includes(element.tagName.toLowerCase())
      || element.getAttribute('role') === 'button'
      || element.tabIndex >= 0;
    if (interactive && style.pointerEvents !== 'none' && (rect.height < touchMin || rect.width < touchMin)) {
      smallTargets.push({ el: describe(element), w: Math.round(rect.width), h: Math.round(rect.height) });
    }

    // Text clipped by its own box (hidden overflow with no ellipsis).
    const hasOwnText = [...element.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (hasOwnText) {
      const size = parseFloat(style.fontSize);
      if (size && size < fontMin) tinyText.push({ el: describe(element), size });
      const overflowsX = element.scrollWidth > element.clientWidth + 1;
      const overflowsY = element.scrollHeight > element.clientHeight + 1;
      const hides = style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden';
      const ellipsis = style.textOverflow === 'ellipsis';
      if (hides && !ellipsis && (overflowsX || overflowsY)) {
        clipped.push({ el: describe(element), text: element.textContent.trim().slice(0, 40) });
      }
    }
  }

  const dedupe = (list, key) => {
    const seen = new Set();
    return list.filter(item => !seen.has(item[key]) && seen.add(item[key]));
  };

  return {
    pageOverflow,
    overflowing: dedupe(overflowing, 'el').slice(0, 12),
    smallTargets: dedupe(smallTargets, 'el').slice(0, 12),
    clipped: dedupe(clipped, 'el').slice(0, 12),
    tinyText: dedupe(tinyText, 'el').slice(0, 12),
    counts: {
      overflowing: overflowing.length,
      smallTargets: smallTargets.length,
      clipped: clipped.length,
      tinyText: tinyText.length
    }
  };
};

const run = async () => {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();

  // Warm-up pass. On a cold dev server the first viewport measures while Vite
  // is still compiling and reports a false BLANK. Compile once, discard.
  const warmup = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const warmupPage = await warmup.newPage();
  await warmupPage.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await warmupPage.waitForTimeout(1500);
  await warmup.close();

  const results = [];
  let reachedApp = false;

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: viewport.width <= 768,
      hasTouch: viewport.width <= 768
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 160)); });

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    }

    // Wait for the app to actually paint. A fixed timeout is not enough: on a
    // cold dev-server start the first viewport measured an empty #root and
    // reported a false "no problems" result.
    await page.waitForFunction(
      () => {
        const root = document.getElementById('root');
        return root && root.children.length > 0 && document.body.innerText.trim().length > 50;
      },
      { timeout: 30000 }
    ).catch(() => {});
    // Fonts change metrics, so measuring before they load reports wrong sizes.
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    // Let entry animations settle.
    await page.waitForTimeout(600);

    const bodyText = await page.evaluate(() => document.body.innerText.trim().length).catch(() => 0);
    if (bodyText > 0) reachedApp = true;

    const measured = await page.evaluate(measure, { touchMin: TOUCH_MIN, fontMin: FONT_MIN });
    await page.screenshot({ path: resolve(outDir, `${viewport.name}.png`), fullPage: false });

    results.push({ viewport: viewport.name, width: viewport.width, ...measured, consoleErrors: consoleErrors.slice(0, 3), rendered: bodyText > 0 });
    await context.close();
  }

  await browser.close();
  writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(results, null, 2));

  console.log(`\nViewport audit — ${url}`);
  console.log(`Screenshots + report.json: ${outDir}\n`);
  if (!reachedApp) {
    console.log('  WARNING: the page rendered no text at any viewport.');
    console.log('  Nothing below is a pass — the app did not load.\n');
  }
  console.log('  viewport  overflow  small-targets  clipped-text  tiny-text');
  for (const row of results) {
    const flag = value => (value ? String(value).padStart(4) : '   .');
    if (!row.rendered) {
      // A blank screen has no measurable problems. It must never read as a pass.
      console.log(`  ${row.viewport.padEnd(9)}  *** BLANK — nothing rendered at this width ***`);
      continue;
    }
    console.log(
      `  ${row.viewport.padEnd(9)} ${flag(row.pageOverflow)}px  ${flag(row.counts.smallTargets)}          ` +
      `${flag(row.counts.clipped)}         ${flag(row.counts.tinyText)}`
    );
  }

  const worst = results.filter(row => row.pageOverflow > 0 || row.counts.clipped > 0);
  if (worst.length) {
    console.log('\n  Detail for viewports with overflow or clipping:');
    for (const row of worst) {
      console.log(`\n  [${row.viewport}px] page overflows by ${row.pageOverflow}px`);
      for (const item of row.overflowing.slice(0, 5)) {
        console.log(`     overflow: ${item.el}  (right edge ${item.right}px)`);
      }
      for (const item of row.clipped.slice(0, 5)) {
        console.log(`     clipped:  ${item.el}  "${item.text}"`);
      }
    }
  }
  console.log('\n  Screenshots are for human review — this script measures');
  console.log('  layout facts and cannot judge whether a screen looks good.\n');

  const blank = results.filter(row => !row.rendered);
  if (blank.length) {
    console.log(`  BLANK viewports (hard failure): ${blank.map(row => row.viewport).join(', ')}`);
  }
  const failed = results.some(row => row.pageOverflow > 0 || !row.rendered);
  process.exitCode = failed ? 1 : 0;
};

run().catch(error => {
  console.error('Viewport audit failed:', error.message);
  process.exitCode = 1;
});
