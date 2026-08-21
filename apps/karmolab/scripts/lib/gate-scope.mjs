/**
 * 「이 검사는 무엇을 딛는가」 — 바뀐 파일로 검사를 고르는 자리 (TASK-KL-331).
 *
 * 왜: 이 앱의 묶음은 157개짜리 통짜다. 한 줄만 고쳐도 전부 돈다(5~7분). 2026-08-19 에
 * 한 세션이 같은 판을 **다섯 번** 돌렸다 — 그중 셋은 뒷수습이었고, 사람은 그동안
 * 「왜 이리 오래 걸려」만 물었다. 기다린 시간이 만든 시간을 넘기면 게이트를 안 믿게 된다.
 *
 * ## 안전 기본값 — 발판을 안 적은 검사는 **언제나 돈다**
 *
 * 「무엇을 딛는지」를 157개에 다 적어야 시작할 수 있는 설계였다면 영영 시작 못 한다.
 * 그래서 반대로 뒀다: `볼것` 이 적힌 검사만 건너뛸 수 있고, 안 적힌 것은 그냥 돈다.
 * 처음부터 옳고(빠지는 검사 0), 적을수록 빨라진다.
 *
 * 이건 **개발 중**만 쓰는 길이다. push·CI 는 통짜 그대로다 — 「내 자리에선 초록」이
 * 배포를 빨갛게 만드는 종류의 사고를 여기서 만들지 않는다.
 */

/** 목록 한 줄을 { name, watch } 로 편다. 문자열이면 「언제나 돈다」다. */
export function parseEntry(entry) {
  if (typeof entry === 'string') return { name: entry, watch: null };
  const name = entry?.name ?? entry?.name;
  if (typeof name !== 'string' || name === '') return null;
  const watch = entry.볼것 ?? entry.watch ?? null;
  return { name, watch: Array.isArray(watch) && watch.length > 0 ? watch : null };
}

/**
 * glob 하나를 정규식으로. 쓰는 것은 세 가지뿐이다 — `**`, `*`, 나머지는 글자 그대로.
 *
 * 라이브러리를 안 들이는 이유: 이 자리가 틀리면 **검사가 조용히 안 돈다.** 조용한 것은
 * 이 저장소에서 제일 비싼 고장이라, 읽어서 확인되는 크기로 둔다.
 */
function globToRegExp(glob) {
  const special = /[.+^${}()|[\]\\]/g;
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` 는 「없어도 되는 여러 층」, `**` 만이면 아무 것이나
        if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2; } else { out += '.*'; i += 1; }
      } else {
        out += '[^/]*';
      }
      continue;
    }
    out += c.replace(special, '\\$&');
  }
  return new RegExp('^' + out + '$');
}

/** 바뀐 파일 하나라도 이 glob 들에 걸리나. */
export function matches(watch, changed) {
  const rules = watch.map(globToRegExp);
  return changed.some((f) => rules.some((re) => re.test(f)));
}

/**
 * 돌릴 검사를 고른다.
 *
 * ★ **발판이 안 적혀 있으면 알아내 본다** (TASK-KAR-231). 손으로 적는 설계는 실측으로
 * 실패했다 — 하루 뒤 11/160 만 적혀 있었고 `--changed` 는 160/160 을 고르는 no-op 이었다.
 * 알아내는 규칙은 `gate-derive.mjs` 에 있고, **아무 것도 못 알아내면 여전히 돈다.**
 *
 * @param entries 목록 원본 (문자열 또는 {name, 볼것})
 * @param changed 앱 뿌리 기준 상대 경로들. `null` 이면 고르지 않는다(전부 돈다).
 * @param derive  발판을 알아내는 함수. 안 주면 안 알아낸다(옛 동작 그대로 — 시험용).
 * @returns { run: string[], skipped: string[], derived: number }
 */
export function pick(entries, changed, derive = null) {
  const parsed = entries.map(parseEntry).filter((e) => e !== null);
  if (changed === null) return { run: parsed.map((e) => e.name), skipped: [], derived: 0 };

  const run = [];
  const skipped = [];
  let derived = 0;
  for (const e of parsed) {
    let watch = e.watch;
    if (watch === null && derive !== null) {
      watch = derive(e.name);
      if (watch !== null) derived += 1;
    }
    // 끝내 발판을 모르는 검사 = 무엇에 걸리는지 모른다 = 돈다.
    if (watch === null || matches(watch, changed)) run.push(e.name);
    else skipped.push(e.name);
  }
  return { run, skipped, derived };
}
