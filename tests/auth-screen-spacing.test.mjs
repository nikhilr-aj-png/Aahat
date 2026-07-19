import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('login and signup share one premium responsive spacing system', () => {
  const screen = read('web/src/components/AuthScreenProduction.jsx');
  const styles = read('web/src/components/AuthScreenProduction.css');
  assert.match(screen, /aahat-auth-card auth-mode-\$\{mode\}/);
  assert.match(screen, /aahat-auth-header/);
  assert.match(screen, /auth-footer-actions/);
  assert.match(screen, /auth-footer-actions single/);
  assert.equal([...screen.matchAll(/type="button" className="auth-link-btn"/g)].length, 3);
  assert.match(styles, /\.aahat-auth-card \.auth-form[\s\S]+gap: 16px/);
  assert.match(styles, /\.aahat-auth-header[\s\S]+gap: 20px[\s\S]+margin-bottom: 26px/);
  assert.match(styles, /\.auth-footer-actions[\s\S]+gap: 10px/);
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /max-height: calc\(100dvh - 32px\)/);
  assert.match(styles, /overflow-y: auto/);
  assert.match(styles, /@media \(max-height: 820px\) and \(min-width: 521px\)/);
  assert.match(styles, /@media \(max-height: 620px\) and \(min-width: 521px\)/);
});
