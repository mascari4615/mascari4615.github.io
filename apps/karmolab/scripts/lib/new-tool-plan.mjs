/**
 * 새 도구 하나를 세우려면 **어디에 무엇을 넣어야 하나** (TASK-KL-338).
 *
 * ## 왜 이 파일이 따로 있나
 *
 * 여기는 **아무 파일도 안 건드린다.** 「무엇을 할지」만 목록으로 돌려준다.
 * 생성기의 고질병은 한 자리를 조용히 빠뜨리는 것인데, 그게 잡히려면 **적용하기 전에 계획을
 * 볼 수 있어야** 한다. 순수 함수라 검사가 「여덟 자리가 다 들었나」를 그대로 잰다.
 *
 * ## 아홉 자리 (2026-08-20 실측 — `cleanup`·`videobg` 를 손으로 넣으며 센 것)
 *
 * 안 채우면 어떻게 되는지를 같이 적는다. 그게 이 목록이 줄어들지 않는 이유다:
 *
 * | 자리 | 안 채우면 |
 * | --- | --- |
 * | `src/widgets/tools/<id>.ts` | (본체) |
 * | `src/widgets-lazy-meta.ts` | **번들도 안 생기고 전 게이트 초록인데 앱에서 못 연다** |
 * | `data/tool-aliases.json` | 찾기창에서 안 나온다 |
 * | 작업대 그룹 | 「할 일」 카드에 안 뜬다 |
 * | `i18n/ko/<id>.json` | 열쇠 이름이 화면에 그대로 뜬다 |
 * | `i18n/en/<id>.json`·`i18n/ja/<id>.json` | `test:i18n` 빨강 |
 * | `i18n/{en,ja}/widgets.json` | 이름이 한국어로 남는다 |
 * | `i18n/{en,ja}/widgets-desc.json` | 설명이 한국어로 남는다 |
 * | `data/tools-seo.json` | **상세 페이지·주소가 안 생긴다** (사람 몫 — 자리표를 넣으면 검색엔진에 TODO 가 실린다) |
 *
 * 감사(`audit:orphan-widgets`·`audit:registry-impl`·`audit:aliases`·`test:i18n`)는 **이미 다
 * 있다** — 빠뜨리면 잡힌다. 없던 것은 채워 주는 쪽이라, 이 파일은 「못 하던 것」이 아니라
 * **왕복**을 없앤다.
 */

/** 작업대 = 도구가 얹히는 자리. 값 = 그 작업대 파일과 할 일 목록의 표식. */
export const WORKBENCHES = {
  image: { file: 'src/widgets/tools/image.ts', anchor: "t('image.part." },
  video: { file: 'src/widgets/tools/videotool.ts', anchor: "t('videotool.part." },
  pdf: { file: 'src/widgets/tools/pdf.ts', anchor: "t('pdf.part." },
  file: { file: 'src/widgets/tools/filetool.ts', anchor: "t('filetool.part." },
  dev: { file: 'src/widgets/tools/devtool.ts', anchor: "t('devtool.part." },
  text: { file: 'src/widgets/tools/text.ts', anchor: "t('text.part." }
};

/**
 * 도구 이름 규칙. 파일 이름·열쇠·주소가 전부 이걸로 만들어지므로 여기서 막는다.
 * 대문자·점·빗금이 섞이면 어떤 자리는 되고 어떤 자리는 안 되는 **반쯤 선 도구**가 된다.
 */
export function badId(id) {
  if (typeof id !== 'string' || id === '') return '이름이 비었다';
  if (!/^[a-z][a-z0-9]{1,23}$/.test(id)) return '이름은 소문자·숫자만, 2~24글자, 첫 글자는 소문자여야 한다';
  return null;
}

/** 기본 아이콘 — 넣어야 할 자리를 비워 두면 목록에서 그 도구만 빈칸이 된다. */
const ICON =
  '<rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke="currentColor" stroke-width="1.6" fill="none"/>' +
  '<path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';

function widgetSource({ id, title, desc, tab, layout }) {
  const cap = id.slice(0, 2);
  return `/**
 * ${title} (TASK-KL-NNN)
 *
 * TODO: **무엇을 하는 도구인지, 그리고 무엇을 안 하는지** 여기에 적어라.
 * 이 저장소의 규율이다 — 「되는 줄 알았는데 안 되는」 게 제일 나쁘다.
 */
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  Toolbox.register({
    id: '${id}',
    title: t('widgets.${id}.title', undefined, '${title}'),
    category: 'tool',
    desc: t('widgets-desc.${id}.desc', undefined, '${desc}'),
    layout: '${layout}',
    icon: '${ICON}',
    tabs: [
      {
        id: 'app',
        label: t('${id}.tab', undefined, '${tab}'),
        build: function (container: HTMLElement): void {
          void loadNamespace('${id}').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('${id}.mdd') });
    container.innerHTML = \`
      <div class="field-group">
        <label class="field-label" for="${cap}Input">\${esc(t('${id}.label.input'))}</label>
        <input type="text" id="${cap}Input" name="input" aria-label="\${esc(t('${id}.label.input'))}">
      </div>
      <div style="display:flex; gap:10px; margin:10px 0; flex-wrap:wrap;">
        <button class="btn btn-primary" id="${cap}Run">\${esc(t('${id}.btn.run'))}</button>
      </div>
      <div class="tool-status" id="${cap}Status">\${esc(t('${id}.status.idle'))}</div>
      <p class="tool-hint tool-note">\${esc(t('${id}.note.limits'))}</p>
    \`;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#${cap}Status');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    $<HTMLButtonElement>('#${cap}Run').onclick = (): void => {
      const value = $<HTMLInputElement>('#${cap}Input').value.trim();
      if (value === '') {
        status.textContent = t('${id}.status.empty');
        return;
      }
      // TODO: 셈은 \`src/core/${id}.ts\` 나 \`src/lib/\` 로 빼라 — 화면에서 셈하면 검사를 못 한다.
      status.textContent = t('${id}.status.done');
    };
  }
})();
`;
}

function lazyMetaEntry({ id, title, desc, layout }) {
  return `  /* ${title} */
  {
    id: '${id}',
    get title() { return t('widgets.${id}.title', undefined, "${title}"); },
    category: 'tool',
    get desc() { return t('widgets-desc.${id}.desc', undefined, "${desc}"); },
    layout: '${layout}',
    icon: '${ICON}',
    lazyScriptPaths: ['tools/${id}']
  }`;
}

function koStrings({ id, title, tab }) {
  return {
    [`${id}.mdd`]: `${title} — 한 줄로 무엇을 해 주는지 적어라.`,
    [`${id}.tab`]: tab,
    [`${id}.label.input`]: '무엇을 넣나',
    [`${id}.btn.run`]: '실행',
    [`${id}.status.idle`]: '값을 넣으세요',
    [`${id}.status.empty`]: '넣은 값이 없습니다',
    [`${id}.status.done`]: '됐습니다',
    [`${id}.note.limits`]: 'TODO: 이 도구가 **안 하는 것**을 여기에 적어라.'
  };
}

/**
 * 옮기기 전 자리표.
 *
 * ★ 표식(`[EN]`)을 **일부러 남긴다.** `test:i18n` 은 *열쇠가 있나*만 세지 *뜻이 있나*를
 * 안 센다 — 자리표를 채운 순간 「100%」 로 초록이 된다(2026-08-20 실측). 그러면 자리표가
 * 그대로 배포되어 영어 화면에 「[EN] 실행」 이 뜬다. 그래서 기계가 볼 수 있는 표식을 두고
 * `audit:i18n-stub` 이 센다. 생성 직후에는 빨갛다 — 그 도구는 아직 안 끝난 것이므로 맞다.
 */
function stubStrings(ko, mark) {
  const out = {};
  for (const [k, v] of Object.entries(ko)) out[k] = `${mark} ${v}`;
  return out;
}

/**
 * 세울 자리 전부. **파일을 안 건드린다** — 무엇을 할지만 돌려준다.
 *
 * @returns Array<{ path, kind:'create'|'insert-before'|'json-merge'|'insert-after', why, ... }>
 */
export function planTool(opts) {
  const id = opts.id;
  const bad = badId(id);
  if (bad !== null) throw new Error(`${bad} (받은 것: ${JSON.stringify(id)})`);

  const title = opts.title ?? id;
  const desc = opts.desc ?? `${title} — TODO: 한 줄 설명. 무엇이 브라우저를 안 벗어나는지도 적어라.`;
  const tab = opts.tab ?? title;
  const layout = opts.layout ?? 'form';
  const ko = koStrings({ id, title, tab });

  const steps = [
    {
      path: `src/widgets/tools/${id}.ts`,
      kind: 'create',
      why: '도구 본체',
      content: widgetSource({ id, title, desc, tab, layout })
    },
    {
      path: 'src/widgets-lazy-meta.ts',
      kind: 'insert-before',
      find: '] as KarmoLabLazyWidgetStub[];',
      text: lazyMetaEntry({ id, title, desc, layout }),
      joinWith: ',\n\n',
      why: '명부 — 여기 없으면 번들도 안 생기고 전 게이트 초록인데 앱에서 못 연다'
    },
    {
      path: 'data/tool-aliases.json',
      kind: 'json-merge',
      value: { [id]: `TODO 검색어 ${id}` },
      why: '찾기창 검색어'
    },
    {
      path: `i18n/ko/${id}.json`,
      kind: 'create',
      content: JSON.stringify(ko, null, 2) + '\n',
      why: '말 묶음 (원본)'
    },
    {
      path: `i18n/en/${id}.json`,
      kind: 'create',
      content: JSON.stringify(stubStrings(ko, '[EN]'), null, 2) + '\n',
      why: '말 묶음 (영어 — 자리표. 옮기기 전엔 audit:i18n-stub 이 빨갛다)'
    },
    {
      path: `i18n/ja/${id}.json`,
      kind: 'create',
      content: JSON.stringify(stubStrings(ko, '[JA]'), null, 2) + '\n',
      why: '말 묶음 (일본어 — 자리표)'
    },
    {
      path: 'i18n/en/widgets.json',
      kind: 'json-merge',
      value: { [`widgets.${id}.title`]: `[EN] ${title}` },
      why: '이름 (영어)'
    },
    {
      path: 'i18n/ja/widgets.json',
      kind: 'json-merge',
      value: { [`widgets.${id}.title`]: `[JA] ${title}` },
      why: '이름 (일본어)'
    },
    {
      path: 'i18n/en/widgets-desc.json',
      kind: 'json-merge',
      value: { [`widgets-desc.${id}.desc`]: `[EN] ${desc}` },
      why: '설명 (영어)'
    },
    {
      path: 'i18n/ja/widgets-desc.json',
      kind: 'json-merge',
      value: { [`widgets-desc.${id}.desc`]: `[JA] ${desc}` },
      why: '설명 (일본어)'
    }
  ];

  /* 작업대는 **고른 사람만** 얹는다 — 어느 작업대인지 모르는 채로 아무 데나 꽂으면
     엉뚱한 카드가 생기고, 그건 빠진 것보다 고치기 번거롭다. */
  if (opts.work !== undefined && opts.work !== '') {
    const bench = WORKBENCHES[opts.work];
    if (bench === undefined) {
      throw new Error(`모르는 작업대: ${opts.work} (아는 것: ${Object.keys(WORKBENCHES).join(' · ')})`);
    }
    steps.push({
      path: bench.file,
      kind: 'insert-after-last',
      find: bench.anchor,
      text: `        ['${id}', t('${opts.work}.part.${id}', undefined, '${title}')]`,
      why: `작업대 「${opts.work}」 의 할 일 카드`
    });
  }

  return steps;
}

/** 사람이 이어서 해야 하는 것. 생성기가 **대신 정할 수 없는** 것만 남긴다. */
export function leftovers(id) {
  return [
    `도구 알맹이를 쓴다 — 셈은 src/core/${id}.ts 나 src/lib/ 로 빼라(화면에서 셈하면 검사를 못 한다)`,
    `i18n/en·ja 의 [EN]·[JA] 자리표를 실제 번역으로 바꾼다 (npm run audit:i18n-stub 이 남은 것을 센다 — test:i18n 은 못 잡는다)`,
    `data/tool-aliases.json 의 「TODO 검색어」를 진짜 검색어로 바꾼다`,
    `data/tools-seo.json 에 설명·lead·howto·faq 를 적는다 — 안 적으면 상세 페이지·주소가 안 생긴다 (audit:data 가 빨갛다)`,
    `검사를 붙였으면 package.json 과 data/gate-list.json 에 이름을 넣는다`,
    `화면을 띄워 보는 스모크에 카드 수가 박혀 있으면 그 숫자를 올린다 (예: smoke:vidshell)`
  ];
}
