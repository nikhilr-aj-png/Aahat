import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('crop preview object URL is recreated safely under React Strict Mode', async () => {
  const cropper = await readFile(
    new URL('../web/src/components/AvatarCropModal.jsx', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(cropper, /useMemo\(\(\) => URL\.createObjectURL/);
  assert.match(cropper, /const nextUrl = URL\.createObjectURL\(file\)/);
  assert.match(cropper, /setObjectUrl\(nextUrl\)/);
  assert.match(cropper, /return \(\) => URL\.revokeObjectURL\(nextUrl\)/);
  assert.match(cropper, /\{objectUrl && \(/);
});
