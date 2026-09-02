// 상단바 이동 버튼. 앱과 웹이 다름. 웹 쪽이 비면 카모랩에서 온 사람이 돌아갈 길 없음
// (2026-09-03 전까지 웹은 미표시)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(dirname(fileURLToPath(import.meta.url))), 'app.mjs');

test('웹에서도 카모랩으로 돌아가는 링크를 그린다', async () => {
  const source = await readFile(APP, 'utf8');
  assert.match(source, /const KARMOLAB_WEB_URL = 'https:\/\/blog\.mascari4615\.com\/karmolab\/'/);
  const web = /if \(!isDesktop\(\)\) \{\s*el\.innerHTML = '<a class="go" id="nav-back" href="' \+ KARMOLAB_WEB_URL \+ '">← KarmoLab<\/a>';\s*return;/;
  assert.match(source, web);
});

test('웹 분기가 이동 버튼 묶음을 숨기지 않는다', async () => {
  const source = await readFile(APP, 'utf8');
  const fn = source.slice(source.indexOf('function mountDesktopNav'), source.indexOf('function mountUploader'));
  assert.doesNotMatch(fn, /el\.hidden = true/);
});
