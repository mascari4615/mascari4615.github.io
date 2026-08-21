// 두뇌가 죽으면 **사람이 알아야 한다.**
//
// 102회차에 `COMPANION_BRAIN=assistant` 로 띄우니 대답이 없었다. 103회차에 재 보니
// 두뇌가 던지고 있었다 — 「AI Studio API: .env에 GEMINI_API_KEY가 필요합니다」.
// 코어는 그 오류를 `onCycle.error` 로 성실히 넘겼는데 **받는 쪽에서 아무도 안 봤다.**
// 밖에서는 「가끔 말을 안 한다」로만 보인다. 이 프로젝트가 되풀이해 데인 모양이다
// (97·98회차: 조용히 안 붙으면 「왜 아무 말도 없지」가 된다).
//
// 여기서 재는 것은 「코어가 오류를 넘기나」 + 「그 오류에 사람이 읽을 말이 들어 있나」다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion } from '../dist/index.js';

function bareMemory() {
  const rows = [];
  return { async remember(e) { rows.push(e); }, async recent() { return rows; } };
}

test('두뇌가 터지면 그 사연이 밖으로 나온다 — 조용히 삼키지 않는다', async () => {
  const reports = [];
  const companion = new Companion({
    brain: {
      name: '못 쓰는 두뇌',
      async think() { throw new Error('AI Studio API: .env에 GEMINI_API_KEY가 필요합니다.'); },
    },
    memory: bareMemory(),
    attention: { async shouldRespond() { return { respond: true, reason: '검사' }; } },
    onCycle: (r) => reports.push(r),
  });
  await companion.feed({ channel: 'web', text: '오늘 뭐 했어?', at: Date.now(), test: true });

  const failed = reports.filter((r) => r.error);
  assert.equal(failed.length, 1, '터진 turn 이 보고되지 않으면 아무도 못 본다');
  assert.equal(failed[0].utterance, null, '말은 못 했다');
  assert.match(failed[0].error.message, /GEMINI_API_KEY/, '왜 못 했는지가 사연에 남아야 한다');
  assert.equal(failed[0].sensation.channel, 'web', '누구에게 답 못 했는지도 알아야 한다');
});
