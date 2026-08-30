#!/usr/bin/env node
/**
 * atlas. 지형도를 굽고, 자를 대고, 어떻게 보는지 알려 준다 (TASK-KAR-233).
 *
 * 왜 이게 필요한가: 지도를 만드는 데 필요한 명령이 다섯 군데로 흩어져 있었다
 * (굽기, 링크 펼치기, 자 넷). 흩어진 명령은 안 쓰이고, 안 쓰이면 지도는
 * 조용히 옛것이 된다. 이 프로젝트가 이미 두 번 겪은 죽음이다.
 *
 * 쓰기:
 *   npm run atlas          # 굽고 자를 다 대고 어떻게 보는지 알려 준다
 *   npm run atlas -- --자만 # 굽지 않고 자만 (지금 상태가 성한지)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.includes('--자만') || process.argv.includes('--check');

/** 한 걸음 돌리고 결과만 남긴다. 긴 출력은 접는다. 사람이 볼 것은 결과다. */
function step(label, file, args = []) {
  process.stdout.write(`\n▸ ${label}\n`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(HERE, file), ...args], { encoding: 'utf8' });
  timings.push([label, (Date.now() - t0) / 1000]);
  const lines = (r.stdout || '').split('\n').filter((l) => l.trim());
  /* 굽기는 말이 많다. 마지막 몇 줄이 결론이다. */
  for (const l of lines.slice(-6)) console.log('   ' + l);
  if (r.status !== 0) {
    const err = (r.stderr || '').split('\n').filter((l) => l.trim()).slice(-3);
    for (const l of err) console.log('   ' + l);
  }
  return r.status === 0;
}

/** 자마다 몇 초 걸렸나. 한 판이 길어지면 **어디가 긴지부터** 알아야 줄인다. */
const timings = [];

/** 오래 걸린 자 다섯을 적는다. */
function showTimes() {
  const all = timings.reduce((acc, [, t]) => acc + t, 0);
  const top = [...timings].sort((x, y) => y[1] - x[1]).slice(0, 5);
  console.log(`
한 판 ${all.toFixed(0)}초. 오래 걸린 자: `
    + top.map(([l, t]) => `${l} ${t.toFixed(0)}초`).join(', '));
}

const results = [];
if (!only) {
  results.push(['굽기', step('지도를 굽는다', 'build-memo-atlas.mjs')]);
}
results.push(['뜻', step('뜻을 제대로 재나', 'audit-atlas-meaning.mjs')]);
results.push(['정직도', step('가까이 보이면 정말 가까운가', 'audit-atlas-trust.mjs')]);
results.push(['출신 쏠림', step('뜻이 아니라 출신으로 갈리나', 'audit-atlas-lane-bias.mjs')]);
results.push(['신선도', step('지도가 옛것이 됐나', 'audit-memo-atlas-fresh.mjs')]);
results.push(['비공개 출신', step('비공개에서 나온 것이 담겼나', 'audit-private-origin.mjs')]);
/* 자가 초록인 것과 자가 **일을 하는 것**은 다르다. 지도를 일부러 망가뜨려
   넣고 빨개지는지 본다. 이걸 손으로 일곱 번 했었다(2026-08-21). */
results.push(['견주기', step('두 덩어리를 견주면 정말 다른 말이 나오나', 'audit-atlas-compare.mjs')]);
results.push(['덩어리 이름', step('이름이 진짜 내 글에서 나온 말인가', 'audit-atlas-names.mjs')]);
results.push(['혼자 있는 글', step('어디에도 안 붙는 글이 새 렌즈인가', 'audit-atlas-lonely.mjs')]);
results.push(['손가락', step('폰에서 손가락으로 움직이나', 'audit-atlas-touch.mjs')]);
results.push(['읽는 법', step('화면이 자기 눈금을 설명하나', 'audit-atlas-howto.mjs')]);
results.push(['불러오기', step('다른 기계에서도 볼 수 있나', 'audit-atlas-remember.mjs')]);
results.push(['자판', step('마우스로 되는 일이 자판으로도 되나', 'audit-atlas-keyboard.mjs')]);
results.push(['색', step('색약이 있어도 갈리나', 'audit-atlas-colors.mjs')]);
results.push(['그리기 값', step('밀고 당길 때 버벅이지 않나', 'audit-atlas-draw-budget.mjs')]);
results.push(['조종 입구', step('지도를 움직이는 길이 하나인가', 'audit-atlas-control.mjs')]);
results.push(['작은 지도', step('당겨도 어디쯤인지 아나', 'audit-atlas-minimap.mjs')]);
results.push(['만나는 자리', step('갈래끼리 맞닿는 자리가 살아 있나', 'audit-atlas-mix.mjs')]);
results.push(['뼈대 손잡이', step('뼈대가 손잡이가 만든 모양은 아닌가', 'audit-atlas-skeleton-stable.mjs')]);
results.push(['무리인가', step('정말 덩어리인가, 그냥 자른 자리인가', 'audit-atlas-cluster-real.mjs')]);
results.push(['밀도로 봐도', step('밀도로 재도 무리가 아닌가 (DBCV)', 'audit-atlas-dbcv.mjs')]);
results.push(['뭉친 자리', step('진짜로 뭉친 자리를 찾는 손이 성한가', 'audit-atlas-dense.mjs')]);
results.push(['이름 적합도', step('이름이 그 무리와 어울리나 (응집도)', 'audit-atlas-name-fit.mjs')]);
results.push(['선', step('선을 묶어야 하나 (겹침, 거짓 이웃)', 'audit-atlas-edges.mjs')]);
results.push(['겹치는 글', step('겹치는 글을 제대로 잡나', 'audit-atlas-twins.mjs')]);
results.push(['이 글 둘레', step('둘레가 둘레 노릇을 하나', 'audit-atlas-ego.mjs')]);
results.push(['밀도 차', step('밀도 차가 진짜 차이인가', 'audit-atlas-diff.mjs')]);
results.push(['궤적', step('궤적이 흐름인가 튀는 점인가', 'audit-atlas-trail.mjs')]);
results.push(['자리 손잡이', step('자리 잡기 손잡이도 재서 골랐나', 'audit-atlas-umap.mjs')]);
results.push(['조각', step('나누지 않고 센 조각 수가 맞나 (H0)', 'audit-atlas-h0.mjs')]);
results.push(['뼈대 신뢰도', step('마디가 자료의 것인가, 이 한 판의 것인가', 'audit-atlas-skeleton-confidence.mjs')]);
results.push(['뼈대 그림', step('그림을 자 하나로 판정하고 있지 않나', 'audit-atlas-skeleton-drawing.mjs')]);
results.push(['눈금 사다리', step('눈금을 바꿔도 사는 조각인가', 'audit-atlas-mapper-tower.mjs')]);
results.push(['낱말 침입자', step('이 이름들이 읽히나 (남의 말을 골라낼 수 있나)', 'audit-atlas-intrusion.mjs')]);
results.push(['폰 조종', step('폰으로 조종되나, 못 할 때 그렇다고 말하나', 'audit-atlas-phone.mjs')]);
results.push(['바깥 잣대', step('사람이 붙인 분류와 얼마나 맞나', 'audit-atlas-external.mjs')]);
results.push(['당기기', step('당기면 내용이 뜻을 바꾸나', 'audit-atlas-zoom.mjs')]);
results.push(['써 보는 잣대', step('새 글이 여기 속하는지 알아맞힐 수 있나', 'audit-atlas-prox.mjs')]);
results.push(['고리', step('뼈대의 고리가 자료의 것인가 (H1)', 'audit-atlas-loops.mjs')]);
results.push(['흔들어 보기', step('흔들림을 글이 아니라 그림으로 보여 주나', 'audit-atlas-hops.mjs')]);
results.push(['어긋남', step('찢김, 거짓 이웃을 둘 다 재고 그 자리에 칠하나', 'audit-atlas-warp.mjs')]);
results.push(['인기 있는 이웃', step('몇 편이 모두의 이웃 자리를 먹나 (허브)', 'audit-atlas-hub.mjs')]);
results.push(['지형', step('선을 긋지 않고 높이를 그리나 (등고선)', 'audit-atlas-terrain.mjs')]);
results.push(['이름 깜빡임', step('움직이면 이름이 사라지거나 깜빡이나', 'audit-atlas-label-flicker.mjs')]);
results.push(['갈리나 (p 값)', step('갈린다에 p 값이 붙어 있나 (dip 검정)', 'audit-atlas-dip.mjs')]);
results.push(['무엇을 남길까', step('무엇을 화면에 남길지 재서 골랐나 (관심도)', 'audit-atlas-doi.mjs')]);
results.push(['씨앗 떨림', step('이 자리가 자료의 것인가 난수의 것인가', 'audit-atlas-wobble.mjs')]);
results.push(['초기값', step('자리를 물려주는 초기값을 재서 골랐나', 'audit-atlas-init.mjs')]);
results.push(['몇 차원인가', step('이 무더기가 애초에 2차원에 담기나', 'audit-atlas-idim.mjs')]);
results.push(['나무 같은가', step('굽은 2차원으로 도망갈 수 있나', 'audit-atlas-delta.mjs')]);
results.push(['자리 정렬', step('행렬이 나은 그릇인가 (자리 대신 순서)', 'audit-atlas-seriation.mjs')]);
results.push(['남에게 주면', step('이 파일을 남에게 주면 무엇이 드러나나', 'audit-atlas-leak.mjs')]);
results.push(['남 줄 판', step('남에게 줘도 되는 판을 만들 수 있나', 'audit-atlas-share.mjs')]);
results.push(['새 관심사', step('새로 생긴 관심사가 있나 (시간 축)', 'audit-atlas-novelty.mjs')]);
results.push(['이어야 할 둘', step('이어야 하는데 안 이은 쌍을 찾을 수 있나', 'audit-atlas-suggest.mjs')]);
results.push(['쓰이는가', step('다시 손댈 글을 미리 짚나 (일깨움)', 'audit-atlas-revisit.mjs')]);
results.push(['지도가 보태나', step('일깨움에 필요한 건 지도인가 편집 이력인가', 'audit-atlas-taskdoi.mjs')]);
results.push(['잣대 중복', step('우리가 적는 수 아홉 개는 사실 몇 개인가', 'audit-atlas-zoo.mjs')]);
results.push(['채널 예산', step('색, 모양이 감당할 가짓수를 넘었나', 'audit-atlas-channels.mjs')]);
results.push(['접근성 셋', step('글자 크기, 글에서 글로, 사용자 글자 존중', 'audit-atlas-a11y.mjs')]);
results.push(['진짜 셸', step('진짜 셸에서 지도가 뜨나 (가짜 없이)', 'smoke-atlas-shell.mjs')]);
results.push(['믿음 표시', step('못 믿는다 표시가 맞나', 'audit-atlas-honesty.mjs')]);
results.push(['닮은 글', step('닮은 글이 정말 닮았나', 'audit-atlas-near.mjs')]);
results.push(['찾기', step('쳐서 찾고 건너갈 수 있나', 'audit-atlas-find.mjs')]);
results.push(['당길 때 이름', step('당기면 여기가 어디인지 아나', 'audit-atlas-zoom-names.mjs')]);
results.push(['자가 물기는 하나', step('일부러 망가뜨리면 빨개지나', 'audit-atlas-gates-bite.mjs')]);

const bad = results.filter(([, ok]) => !ok);
console.log('\n─────────────────────────────');
if (bad.length) {
  console.log(`✘ 성치 않은 자 ${bad.length}개: ${bad.map(([n]) => n).join(', ')}`);
  console.log('  위에 그 자가 뭐라 했는지 적혀 있다.');
  showTimes();
} else {
  /* **수를 손으로 적지 않는다**. 스물셋이라 박아 뒀는데 자를 하나 더 달아도
     그대로 스물셋이라 했다. 이 세션에서만 값 박기로 네 번 데였다(흔들림 폭, 얇은 글, 
     뼈대 손잡이, 이 줄). 세어서 말한다. */
  console.log(`✓ 자 ${results.length}개 다 통과. 지도가 지금 글을 정직하게 담고 있다`);
  showTimes();
}

if (!only) {
  console.log('\n보려면:');
  console.log('  cd apps/karmolab && npm run dev');
  console.log('  → http://127.0.0.1:8813/apps/karmolab/index.html 에서 내 글 지형도');
  console.log('\n링크만 저장된 글의 본문을 채우려면(사람이 시킬 때만 돈다):');
  console.log('  npm run unfurl:links');
}
process.exit(bad.length ? 1 : 0);
