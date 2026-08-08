/**
 * 무거운 일이 도는 **중에** 말을 걸면 얼마나 기다리나.
 *
 * 8회차에 「사람 말 앞지르기」로 35.5초를 18.3초로 줄였다. 그건 **줄 서 있는 것들** 사이에서
 * 앞으로 보내는 수였고, 이미 **돌고 있는** 무거운 일 뒤에서는 여전히 기다린다. 재는 자리가
 * 없으면 그게 얼마인지 아무도 모른다 — 못 재는 것은 못 고친다(7회차).
 *
 * 재는 법: 코어에 무거운 감각을 하나 밀어 넣고, 곧바로 사람 말을 건넨 뒤 **대답이 나오기까지**
 * 를 잰다. 두뇌는 가짜(즉답)라 여기서 나오는 값은 **순전히 줄 서기 때문에 생긴 지연**이다.
 *
 *   node scripts/measure-lanes.mjs
 */
import { Companion, alwaysRespond, InMemoryMemory } from '../dist/index.js';

const 무거운일ms = Number(process.env.LANE_HEAVY_MS ?? '3000');

const 잰다 = async () => {
  const 나온말 = [];
  // 몸 이름 = 통로 이름이어야 그 몸으로 말이 나간다.
  const 몸 = {
    name: 'web',
    sense: { name: 'web:sense', start() {} },
    voice: {
      name: 'web:voice',
      speak(u) {
        나온말.push({ text: u.text, at: Date.now() });
      },
    },
  };

  const 얘 = new Companion({
    bodies: [몸],
    onCycle: (r) => console.log(`  [turn] ${r.sensation.channel} → ${r.utterance ? '말함: ' + r.utterance.text : '안 말함: ' + (r.decision?.reason ?? r.error?.message ?? '?')}`),
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    // 사람 말은 이 통로로 온다 — 앞지르기 대상.
    interruptChannels: ['web'],
    brain: {
      name: '재는두뇌',
      async think(input) {
        /* 화면 보기처럼 **무거운 일**을 흉내 낸다. 진짜 화면 보기는 찍고·옮기고·그림을
           읽느라 수 초가 걸린다(8회차 진단). */
        if (input.sensation.channel === 'screen') {
          await new Promise((r) => setTimeout(r, 무거운일ms));
          return '(화면 봤다)';
        }
        return `(대답) ${input.sensation.text}`;
      },
    },
  });

  await 얘.start();

  // ① 무거운 일을 밀어 넣는다 (기다리지 않는다 — 실제로도 뒤에서 돈다).
  const 무거운것 = 얘.feed({ channel: 'screen', kind: 'text', text: '화면을 봤다', at: Date.now() });
  // 그 일이 확실히 **돌기 시작한** 뒤에 말을 건다.
  await new Promise((r) => setTimeout(r, 200));

  // ② 사람이 말을 건다.
  const 건넨때 = Date.now();
  await 얘.feed({ channel: 'web', kind: 'text', text: '있어?', at: 건넨때 });
  await 무거운것;
  await 얘.stop();

  const 대답 = 나온말.find((m) => m.text.includes('있어?'));
  return { 기다린ms: 대답 === undefined ? null : 대답.at - 건넨때, 나온말: 나온말.map((m) => m.text) };
};

const r = await 잰다();
console.log(`[계통] 무거운 일 ${무거운일ms}ms 가 도는 중에 말을 걸었다`);
console.log(`[계통] 대답까지 ${r.기다린ms === null ? '(대답 없음)' : `${r.기다린ms}ms`}`);
console.log(`[계통] 나온 말 순서: ${r.나온말.join(' → ')}`);
