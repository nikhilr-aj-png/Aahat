import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('avatar selection opens a draggable circular crop preview before upload', async () => {
  const [cropper, settings] = await Promise.all([
    readFile(new URL('../web/src/components/AvatarCropModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../web/src/components/SettingsPanelProduction.jsx', import.meta.url), 'utf8')
  ]);
  assert.match(settings, /setCropFile\(file\)/);
  assert.match(settings, /<AvatarCropModal/);
  assert.match(settings, /const saved = await uploadAvatar\(croppedFile\)/);
  assert.match(cropper, /crop-circle-overlay/);
  assert.match(cropper, /onPointerMove/);
  assert.match(cropper, /type="range" min="1" max="3"/);
  assert.match(cropper, /canvas\.toBlob\(resolve, 'image\/webp'/);
  assert.match(cropper, /context\.drawImage/);
  assert.match(cropper, /Save photo/);
});
