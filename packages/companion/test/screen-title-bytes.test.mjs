// **창 이름이 깨져서 들어오고 있었다** (TASK-KAR-201).
//
// 142회차에 probe 로 끝에서 끝까지 찔러 보다가 얘가 스스로 적은 줄에서 봤다:
//
//   [알아챔] 창이 바뀌었다 — 「(1) sasaki_VR180(@Sasaki_Vr180) / X ?? ?????? 3?? 」
//
// 바이트를 떠서 재니 이랬다:
//
//   ... 2f 58 20 bfdc 20 c6e4 c0cc c1f6 20 33 b0b3 ...
//   utf8  로 읽으면: "/ X ?? ?????? 3??"
//   cp949 로 읽으면: "/ X 외 페이지 3개 - 개인 - Microsoft Edge"
//
// **스크립트가 CP949 로 뱉고 우리는 UTF-8 로 읽는다.** 창 이름의 한글이 전부 물음표가 된다.
//
// 99회차에 같은 병을 한 번 고쳤다 — 그때는 `GetWindowText` 가 바이트 판에 묶여서 제목이
// 물음표로 왔고, `CharSet.Unicode` 로 고쳤다. **읽는 쪽은 그때 고쳐졌는데 내보내는 쪽이
// 남아 있었다.** 스크립트 안에 `[Console]::OutputEncoding = UTF8` 이 있지만, PowerShell 이
// 파이프로 넘길 때는 콘솔 코드페이지가 이긴다.
//
// 이게 왜 아픈가: 얘는 창 이름으로 **조수님이 지금 뭘 하는지**를 판단한다. 이름이 물음표면
// 「지금 뭐 하고 있네」가 통째로 헛말이 되고, 그 헛말이 **기억에도 남는다**
// (「닮은 옛말: 화면을 봤다. 지금 앞에 있는 창은 ...」).

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'capture-screen.ps1');

/** 바이트 그대로 받는다 — 여기서 utf8 로 읽어 버리면 재려는 것이 사라진다. */
async function rawLines() {
  const out = join(mkdtempSync(join(tmpdir(), 'companion-title-')), 'shot.png');
  const { stdout } = await run(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-OutPath', out],
    { timeout: 90_000, windowsHide: true, encoding: 'buffer', maxBuffer: 1 << 27 },
  );
  return stdout.toString('latin1').split(/\r?\n/).map((line) => Buffer.from(line, 'latin1'));
}

/** 이 바이트들이 진짜 UTF-8 인가 — 깨진 자리는 U+FFFD 로 나온다. */
function isUtf8(bytes) {
  return !bytes.toString('utf8').includes('�');
}

test('창 이름이 UTF-8 로 나온다 — 한글이 물음표가 되면 안 된다', async () => {
  const lines = await rawLines();
  const title = lines.find((one) => one.toString('latin1').startsWith('TITLE='));
  assert.ok(title !== undefined, 'TITLE= 이 없다');
  if (title.every((byte) => byte < 0x80)) {
    /* 지금 앞창 이름이 영문뿐이면 잴 것이 없다. 0 을 초록으로 쓰지 않는다. */
    return;
  }
  assert.ok(
    isUtf8(title),
    `창 이름이 UTF-8 이 아니다 — ${title.slice(0, 40).toString('hex')} (cp949 로 읽어야 말이 된다)`,
  );
});

test('창 안에서 읽은 것도 UTF-8 로 나온다', async () => {
  const lines = await rawLines();
  const tree = lines.find((one) => one.toString('latin1').startsWith('TREE='));
  assert.ok(tree !== undefined, 'TREE= 가 없다');
  if (tree.every((byte) => byte < 0x80)) return;
  assert.ok(isUtf8(tree), `읽은 것이 UTF-8 이 아니다 — ${tree.slice(0, 40).toString('hex')}`);
});
