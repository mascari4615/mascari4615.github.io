import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * 제 창으로 뜨는 배선.
 *
 * 브라우저 창으로는 창틀·최소화·닫기 단추를 없앨 수 없고 배경도 진짜로 뚫리지 않는다.
 * 얘 전용 창 프로그램이 따로 있는데, **그걸 부르는 배선이 사라져** 브라우저 창으로만
 * 뜨고 있었다 — 조수님이 「투명화가 여전히 안 되는데?」라고 알려 줄 때까지 몰랐다.
 *
 * 배선은 프로세스를 띄우는 일이라 단위 시험으로 실행해 볼 수 없다. 대신 **어긋나면
 * 조용히 브라우저로 물러서는 자리들**을 붙잡아 둔다 — 이름이 바뀌거나 넘기는 이름이
 * 달라지면 아무 소리 없이 옛날로 돌아간다.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const 읽기 = (...p) => readFileSync(join(root, ...p), 'utf8');

const web = 읽기('src', 'body', 'web.ts');
const conf = JSON.parse(읽기('..', '..', 'apps', 'karmolab-tauri', 'src-tauri-companion', 'tauri.conf.json'));

test('제 창이 있으면 그걸 먼저 쓴다', () => {
  assert.match(web, /const own = ownWindowExe\(\)/);
  assert.match(web, /if \(own !== null[\s\S]{0,60}\) return openOwnWindow\(/);
});

test('찾는 프로그램 이름이 저쪽이 굽는 이름과 같다 — 다르면 조용히 브라우저로 돌아간다', () => {
  const 찾는이름 = /'(companion-window\.exe)'/.exec(web)?.[1];
  assert.equal(찾는이름, `${conf.productName}.exe`);
});

test('구운 것을 먼저, 없으면 개발 산출물 — 나중에 구워도 손 안 대게', () => {
  assert.match(web, /\['release', 'debug'\]/);
});

test('주소와 크기를 저쪽이 읽는 이름으로 넘긴다', () => {
  const rust = 읽기('..', '..', 'apps', 'karmolab-tauri', 'src-tauri-companion', 'src', 'main.rs');
  for (const 이름 of ['COMPANION_URL', 'COMPANION_WIDTH', 'COMPANION_HEIGHT']) {
    assert.ok(rust.includes(이름), `저쪽이 ${이름} 을 읽어야 한다`);
    assert.ok(web.includes(이름), `이쪽이 ${이름} 을 넘겨야 한다`);
  }
});

test('저쪽 창은 창틀이 없고 배경이 뚫린다 — 이게 브라우저 창과 다른 이유다', () => {
  const rust = 읽기('..', '..', 'apps', 'karmolab-tauri', 'src-tauri-companion', 'src', 'main.rs');
  assert.match(rust, /\.decorations\(false\)/);
  assert.match(rust, /\.transparent\(true\)/);
});
