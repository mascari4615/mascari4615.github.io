/**
 * KarmoMeaning — **글의 뜻을 숫자로.** 이 기계에서 돈다 (열쇠도 돈도 하루치도 없다).
 *
 * 왜 뽑아 나왔나: 이 코드는 지형도 굽기 스크립트 안에 갇혀 있었다. 뜻을 재는 일은
 * 지도만의 일이 아니다 — 북마크 분류·글 추천·비슷한 것 찾기가 전부 같은 것을 부른다.
 *
 * ⚠ **모델은 다국어여야 한다.** 영어 전용 모델은 한국어에서 뜻을 전혀 못 갈랐다(실측):
 * 완전 무관한 쌍 0.594 가 같은 뜻 쌍 0.592 보다 높았다 — 글자를 보고 있었던 것이다.
 * 지금 모델로 재면 순서가 바로 선다: 같은 뜻 0.556 > 낱말만 겹침 0.347 > 완전 무관 0.338.
 *
 * ⚠ **E5 계열로 갈아탈 때는 앞말(`passage:`)을 반드시 붙여라** — 안 붙이면 순서가 뒤집힌다.
 * 2026-08 에 e5-small 로 갈아타려다 되돌렸다: 우리 자 넷 중 둘만 좋아져서(닮은 글 15.1→63.7배,
 * 뜻 순서 바로 섬 / 정직도 0.886→0.735, 갈래 만나는 자리 844→680) 사전 문턱 「넷 중 셋」을 못 넘었다.
 */

export const LOCAL_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const LOCAL_CHUNK = 900;        // 글자 기준. 토막 하나가 모델 한 입.
export const LOCAL_MAX_CHUNKS = 4;     // 앞 네 토막이면 그 글의 정체는 잡힌다.

/** 작은 모델은 긴 글을 한 번에 못 삼킨다 — 앞에서부터 토막 낸다. */
export function chunk(text, size = LOCAL_CHUNK, max = LOCAL_MAX_CHUNKS) {
  const out = [];
  for (let i = 0; i < text.length && out.length < max; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [text];
}

let extractor = null;
let extractorModel = null;

/**
 * 모델은 한 번만 올린다 (처음 한 번은 내려받는다).
 *
 * ★ **재는 연장은 부른 쪽이 건넨다** (`loadRunner`). 두 까닭이 있다:
 *  ① 이 꾸러미는 `file:` 링크(윈도에선 Junction)로 붙는데, 링크 **너머**에서는 부른 쪽의
 *     `node_modules` 가 안 보인다 — 안에서 곧장 부르면 「없다」로 죽는다(실측).
 *  ② 벤더를 이름에 안 넣기로 했으면 **의존도 안 넣는 것**이 맞다. 연장이 바뀌어도 여기는 그대로다.
 * 안 건네주면 스스로 찾아보되(같은 자리에 설치된 경우), 못 찾으면 무엇이 없는지 말하고 죽는다.
 */
export async function getExtractor(model = LOCAL_MODEL, onLoad, loadRunner) {
  if (extractor && extractorModel === model) return extractor;
  let runner;
  try {
    runner = loadRunner ? await loadRunner() : await import('@huggingface/transformers');
  } catch (e) {
    throw new Error('뜻 재는 연장을 못 찾았다 — 부른 쪽에서 `loadRunner: () => import("@huggingface/transformers")`'
      + ` 를 건네라 (원래 오류: ${e.message})`);
  }
  const pipeline = runner.pipeline || runner.default?.pipeline;
  if (!pipeline) throw new Error('건네받은 연장에 `pipeline` 이 없다 — transformers 판을 확인해라');
  if (onLoad) onLoad(model);
  extractor = await pipeline('feature-extraction', model);
  extractorModel = model;
  return extractor;
}

/**
 * 토막마다 재고 **평균 낸 뒤 길이를 1로** 맞춘다 — 각도만 남긴다(코사인 = 내적).
 * 소수점 여섯 자리로 자른다: 곳간 파일이 세 배 작아지고, 이 자리에서 뜻이 달라지지 않는다.
 */
export async function embedTexts(texts, { model = LOCAL_MODEL, onLoad, loadRunner } = {}) {
  const ex = await getExtractor(model, onLoad, loadRunner);
  const out = [];
  for (const text of texts) {
    const parts = chunk(text);
    const res = await ex(parts, { pooling: 'mean', normalize: true });
    const rows = res.tolist();
    const dim = rows[0].length;
    const acc = new Array(dim).fill(0);
    for (const r of rows) for (let i = 0; i < dim; i += 1) acc[i] += r[i];
    let norm = 0;
    for (let i = 0; i < dim; i += 1) { acc[i] /= rows.length; norm += acc[i] * acc[i]; }
    norm = Math.sqrt(norm) || 1;
    out.push(acc.map((v) => Number((v / norm).toFixed(6))));
  }
  return out;
}

/**
 * 여러 글을 재되 **바뀐 것만** 다시 잰다.
 *
 * 곳간 열쇠에 **모델 이름을 넣는다** — 안 넣으면 모델을 갈아도 옛 벡터를 그대로 재사용해
 * 아무것도 안 바뀐다(그리고 아무도 모른다). 같은 이유로 부른 쪽에 `tier` 를 돌려주어
 * 산출물이 **누가 그렸는지**를 들고 다니게 한다.
 *
 * `items` = `[{ id, hash, text }]` · `cache` = 열쇠→벡터 (부른 쪽이 소유·저장)
 */
export async function embedAll(items, {
  model = LOCAL_MODEL,
  cache = {},
  batch = 16,
  onLoad,
  onProgress,
  onFlush,
  loadRunner,
} = {}) {
  const tier = `local:${model.split('/').pop()}`;
  const keyOf = (d) => `${tier}:${d.hash}`;
  const todo = items.filter((d) => !cache[keyOf(d)]);
  const vectorsOf = () => items.map((d) => cache[keyOf(d)] || null);
  if (!todo.length) return { vectors: vectorsOf(), tier, todo: 0 };

  for (let i = 0; i < todo.length; i += batch) {
    const slice = todo.slice(i, i + batch);
    const vecs = await embedTexts(slice.map((d) => d.text), { model, onLoad, loadRunner });
    slice.forEach((d, j) => { cache[keyOf(d)] = vecs[j]; });
    if ((i / batch) % 8 === 0) {
      if (onProgress) onProgress(Math.min(i + batch, todo.length), todo.length);
      if (onFlush) onFlush(cache);
    }
  }
  if (onFlush) onFlush(cache);
  return { vectors: vectorsOf(), tier, todo: todo.length };
}
