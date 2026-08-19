/**
 * Node 판이 쓸 만한지 본다 (TASK-KAR-227).
 *
 * 왜 따로 파일이냐: 이 검사를 `start.cmd` 안에서 `for /f ... ('node -p "…"')` 로 했더니
 * cmd 가 따옴표를 삼켜 「'.'은(는) 내부 또는 외부 명령이 아닙니다」로 죽었다(실측).
 * 배치 파일의 따옴표 규칙은 사람이 외울 것이 못 된다 — 판단은 Node 에게 맡기고,
 * 배치는 「부르고 결과만 본다」로 좁힌다.
 */
const NEED = 20;
const major = Number(process.versions.node.split('.')[0]);

if (Number.isNaN(major) || major < NEED) {
  console.error('');
  console.error(`  Node 가 너무 옛 판이다 (지금 v${process.versions.node}, ${NEED} 이상이 필요).`);
  console.error('  https://nodejs.org 에서 LTS 를 깔아라.');
  console.error('');
  process.exit(1);
}
