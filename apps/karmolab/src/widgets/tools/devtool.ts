/**
 * 데이터·코드 — **붙여넣으면 무엇인지 알아본다** (TASK-KL-088 → TASK-KL-263)
 *
 * 전에는 탭 열둘이었다(JSON·JWT·정규식·해시·UUID·크론·URL·암호화·Base64·CSV·표·타입).
 * PDF·이미지·글과 같은 문제 — 탭을 옮기면 다시 붙여넣어야 했고, 무엇이 있는지 다 읽어야 했다.
 *
 * 여기엔 **하나 더** 있다. JSON Crack 은 붙여넣기만 하면 JSON·CSV·YAML 을 알아서 가르고,
 * JSON Hero 는 값 하나까지 보고 「이건 URL·날짜·색」이라고 말해 준다. 사람은 자기가 든 것이
 * 뭔지 **이미 안다** — 열둘을 다 읽게 할 이유가 없다. 그래서 붙여넣는 순간 갈래를 짚고
 * (`shared/sniff`), 그 갈래의 할 일을 앞에 띄운다. 짚는 것뿐이라 나머지도 그대로 눌린다.
 */
import { materialShell, type MaterialGroup } from './shared/material-shell';
import { DEVTOOL_OPERATIONS } from './devtool-operations';
import { mountTextOperation } from './shared/text-operation';
import { readInvocation } from '../../lib/tool-url';
import { spec as sqlfmtSpec } from '../../core/sqlfmt';
import { spec as xmlfmtSpec } from '../../core/xmlfmt';
import { spec as configconvSpec } from '../../core/configconv';
import { spec as prettyallSpec } from '../../core/prettyall';
import { spec as json2tsSpec } from '../../core/json2ts';
import { spec as jqplaySpec } from '../../core/jqplay';

/** 조작 id → 주소 계약. 조작을 옮길 때마다 여기 한 줄. */
const SPEC_BY_ID = {
  sqlfmt: sqlfmtSpec,
  xmlfmt: xmlfmtSpec,
  configconv: configconvSpec,
  prettyall: prettyallSpec,
  json2ts: json2tsSpec,
  jqplay: jqplaySpec
} as Record<string, Parameters<typeof readInvocation>[0]>;
import { sniff, type DataKind } from './shared/sniff';
import { flatten, tally, deepest } from './shared/json-tree';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const GROUPS = (): MaterialGroup[] => [
    {
      label: t('devtool.group.shape', undefined, '모양 잡기'),
      jobs: [
        ['jsonfmt', 'JSON'],
        ['json2ts', t('devtool.part.json2ts', undefined, 'JSON → 타입')],
        ['csvjson', 'CSV ↔ JSON'],
        ['tableconv', t('devtool.part.tableconv', undefined, '표 바꾸기')],
        ['curlkit', t('devtool.part.curlkit', undefined, 'curl 옮기기')],
        ['configconv', t('devtool.part.configconv', undefined, '설정 옮기기')],
        ['sqlfmt', t('devtool.part.sqlfmt', undefined, 'SQL 다듬기')],
        ['prettyall', t('devtool.part.prettyall', undefined, 'CSS·HTML 정리')],
        ['xmlfmt', t('devtool.part.xmlfmt', undefined, 'XML 다루기')]
      ]
    },
    {
      label: t('devtool.group.open', undefined, '뜯어보기'),
      jobs: [
        ['jwt', 'JWT'],
        ['base64', 'Base64'],
        ['urlparse', 'URL'],
        ['cron', t('devtool.part.cron', undefined, '크론')],
        ['protobuf', t('devtool.part.protobuf', undefined, 'protobuf')],
        ['sshkey', t('devtool.part.sshkey', undefined, 'SSH 열쇠')]
      ]
    },
    {
      label: t('devtool.group.make', undefined, '만들기'),
      jobs: [
        ['hashgen', t('devtool.part.hashgen', undefined, '해시')],
        ['uuidgen', 'UUID'],
        ['crypto', t('devtool.part.crypto', undefined, '암호화')],
        ['radix', t('devtool.part.radix', undefined, '진법')],
        ['mockdata', t('devtool.part.mockdata', undefined, '가짜 데이터')],
        ['mermaidlite', t('devtool.part.mermaidlite', undefined, '그림 그리기')],
        ['csp', t('devtool.part.csp', undefined, '보안 헤더')]
      ]
    },
    {
      label: t('devtool.group.check', undefined, '살펴보기'),
      jobs: [
        ['regextest', t('devtool.part.regextest', undefined, '정규식')],
        ['diff', t('devtool.part.diff', undefined, '견주기')],
        ['jqplay', t('devtool.part.jqplay', undefined, 'jq 물어보기')],
        ['erd', t('devtool.part.erd', undefined, '표 관계')],
        ['semver', t('devtool.part.semver', undefined, '버전 범위')],
        ['nettool', t('devtool.part.nettool', undefined, '대역·포트')],
        ['apitest', t('devtool.part.apitest', undefined, 'API 눌러 보기')],
        ['codeshot', t('devtool.part.codeshot', undefined, '코드 사진')],
        ['epoch', t('devtool.part.epoch', undefined, '유닉스 시각')],
        ['colorconv', t('devtool.part.colorconv', undefined, '색 변환')]
      ]
    }
  ];

  /** 들고 온 것이 없어도 되는 할 일 — 없는 데서 **만드는** 쪽. */
  const NO_INPUT_NEEDED = new Set(['uuidgen', 'crypto', 'cron', 'colorconv', 'mockdata', 'mermaidlite', 'csp']);

  /** 갈래마다 앞에 띄울 할 일. 첫 번째가 「가장 맞는 것」이다. */
  const FOR: Record<DataKind, string[]> = {
    json: ['jsonfmt', 'json2ts', 'csvjson'],
    jwt: ['jwt'],
    base64: ['base64'],
    url: ['urlparse'],
    csv: ['csvjson', 'tableconv'],
    hex: ['hashgen', 'radix'],
    epoch: ['epoch'],
    uuid: ['uuidgen'],
    cron: ['cron'],
    text: []
  };

  Toolbox.register({
    id: 'devtool',
    title: t('widgets.devtool.title', undefined, '개발 도구'),
    category: 'tool',
    desc: t(
      'widgets-desc.devtool.desc',
      undefined,
      'JSON 포맷·JWT 디코드·정규식 테스트·해시·UUID·크론·URL·암호화를 한 곳에서'
    ),
    layout: 'wide',
    icon: '<path d="M9 6 3 12l6 6M15 6l6 6-6 6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('devtool.tab', undefined, '데이터'),
        build: function (container: HTMLElement): void {
          void loadNamespace('devtool').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    injectStyles();
    materialShell(container, {
      id: 'devtool',
      intake: 'text',
      accept: 'text/*,.json,.csv,.txt',
      groups: GROUPS,
      noInputNeeded: NO_INPUT_NEEDED,
      accepts: /^(text|application\/json)/i,
      drop: {
        title: t('devtool.drop.title', undefined, 'JSON·JWT·Base64·표… 아무거나 붙여넣으세요'),
        hint: t('devtool.drop.hint', undefined, '무엇인지 알아보고 맞는 할 일을 짚어 드립니다')
      },
      labels: {
        change: t('devtool.btn.change', undefined, '다시 붙여넣기'),
        recent: t('devtool.btn.recent', undefined, '방금 하던 것'),
        back: t('devtool.btn.back', undefined, '할 일 고르기'),
        chain: t('devtool.btn.chain', undefined, '이 결과로 이어서'),
        fail: t('devtool.preview.fail', undefined, '이건 미리 못 봅니다'),
        pasted: t('devtool.pasted', undefined, '붙여넣은 것')
      },
      preview: drawWhat,
      /* 선언형 조작 — 글 작업대와 같은 길 (TASK-KL-257). 없으면 기존 도구 등록으로 떨어진다.
         주소 호출(`?op=...`)은 여기서 읽어 조작에 넘긴다 — 합치면서 링크를 잃지 않는다. */
      mountOperation: (id, host, input): boolean => {
        const operation = DEVTOOL_OPERATIONS.find((candidate) => candidate.id === id);
        if (!operation) return false;
        const call = readInvocation(SPEC_BY_ID[id]);
        mountTextOperation(host, operation, input, call && call.error === undefined ? call : null);
        return true;
      },
      suggest: async (file) => {
        const s = sniff(await file.text());
        const ids = FOR[s.kind] || [];
        return {
          ids,
          why: ids.length
            ? t('devtool.tip', { what: s.why }, `${s.why} 같습니다 — 초록으로 짚은 것이 맞을 거예요`)
            : ''
        };
      }
    });
  }

  /** 왼쪽 칸 = 「무엇인가」 한 줄 + 앞머리. **이 함수만 데이터를 안다.** */
  async function drawWhat(file: File, box: HTMLElement, alive: () => boolean): Promise<string> {
    const v = await file.text();
    if (!alive()) return '';
    const s = sniff(v);

    const badge = document.createElement('div');
    badge.className = 'dv-what';
    badge.id = 'dvWhat';
    badge.dataset.kind = s.kind;
    badge.textContent = s.why || t('devtool.what.plain', undefined, '그냥 글');
    if (s.detail) {
      const d = document.createElement('span');
      d.textContent = s.detail;
      badge.appendChild(d);
    }
    box.appendChild(badge);

    /* JSON 이면 **글자 대신 구조**를 보여 준다 (TASK-KL-286 — JSON Crack·JSON Hero).
     * 사람이 JSON 을 여는 이유의 태반은 「여기 뭐가 들어 있나」이지 글자를 읽고 싶어서가 아니다. */
    if (s.kind === 'json') {
      try {
        const tree = drawTree(JSON.parse(v));
        box.appendChild(tree);
        const chars0 = [...v].length;
        return t('devtool.meta', { what: s.why, chars: chars0 }, `${s.why} · ${chars0.toLocaleString()}자`);
      } catch {
        /* 깨진 JSON 은 못 편다 — 그럴 때가 「보기 좋게」 가 가장 필요한 순간이라 글자로 보여 준다 */
      }
    }

    const head = document.createElement('pre');
    head.className = 'dv-head';
    head.id = 'dvHead';
    head.textContent = v.slice(0, 1600);
    box.appendChild(head);

    const chars = [...v].length;
    return t('devtool.meta', { what: s.why || '글', chars }, `${s.why || '글'} · ${chars.toLocaleString()}자`);
  }

  /**
   * 나무를 그린다. 펴는 일은 `shared/json-tree` 가 하고, 여기서는 **접기와 색**만 맡는다.
   *
   * 두 겹까지는 펴 놓는다 — 다 접어 두면 「뭐가 들었나」를 알려고 또 눌러야 하고,
   * 다 펴 두면 큰 문서에서 화면이 글자 바다가 된다.
   */
  function drawTree(value: unknown): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'dv-tree';
    wrap.id = 'dvTree';
    const { rows, cut } = flatten(value, 600);

    const sum = document.createElement('div');
    sum.className = 'dv-sum';
    sum.id = 'dvSum';
    const n = tally(rows);
    sum.textContent = t(
      'devtool.tree.sum',
      { rows: rows.length, deep: deepest(rows) },
      `${rows.length}줄 · 가장 깊은 곳 ${deepest(rows)}겹 · 물체 ${n.object} · 목록 ${n.array} · 글 ${n.string} · 수 ${n.number}`
    );
    wrap.appendChild(sum);

    /** 접힌 가지들의 길 — 이 길로 시작하는 줄은 안 그린다 */
    const ROOT = '\0root';
    const idOf = (r: { path: string; depth: number }): string => (r.path === '' ? ROOT : r.path);
    const folded = new Set<string>(rows.filter((r) => r.branch && r.depth>= 2).map((r) => idOf(r)));

    const list = document.createElement('div');
    list.className = 'dv-rows';
    wrap.appendChild(list);

    const paint = (): void => {
      list.textContent = '';
      /* 접힘은 **줄 순서**로 판정한다 (2026-08-13 고침). 처음엔 길의 앞글자로 봤는데 두 군데서 틀렸다:
       *   ① 뿌리는 길이 빈 문자열이라 접어도 아무 일이 없었다
       *   ② 열쇠 `a` 를 접으면 `ab` 까지 같이 숨었다(앞글자가 같으니까)
       * 줄은 위에서 아래로 깊이 순이므로, 접힌 줄 다음부터 **깊이가 그 줄 이하가 될 때까지**가 자식이다. */
      let skipUntil = -1;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (skipUntil>= 0) {
          if (r.depth> skipUntil) continue;
          skipUntil = -1;
        }
        if (r.branch && folded.has(idOf(r))) skipUntil = r.depth;
        const line = document.createElement('div');
        line.className = 'dv-row';
        line.dataset.path = r.path;
        line.style.paddingLeft = `${r.depth * 12}px`;
        const twist = document.createElement('span');
        twist.className = 'dv-twist';
        twist.textContent = r.branch ? (folded.has(idOf(r)) ? '▸' : '▾') : '·';
        const key = document.createElement('span');
        key.className = 'dv-key';
        key.textContent = r.key || t('devtool.tree.root', undefined, '뿌리');
        const val = document.createElement('span');
        val.className = `dv-val dv-${r.kind}`;
        val.textContent = r.preview;
        line.appendChild(twist);
        line.appendChild(key);
        line.appendChild(val);
        if (r.branch) {
          line.onclick = (): void => {
            if (folded.has(idOf(r))) folded.delete(idOf(r));
            else folded.add(idOf(r));
            paint();
          };
        } else {
          /* 잎은 눌러서 **길을 복사**한다 — 「이 값 어떻게 꺼내지」가 그다음 질문이다 */
          line.title = r.path;
          line.onclick = (): void => {
            void Toolbox.copyText?.(r.path, { message: t('devtool.tree.copied', { path: r.path }, `길 복사: ${r.path}`) });
          };
        }
        list.appendChild(line);
      }
      if (cut) {
        const more = document.createElement('div');
        more.className = 'dv-cut';
        more.textContent = t('devtool.tree.cut', undefined, '너무 커서 여기까지만 폈습니다');
        list.appendChild(more);
      }
    };
    paint();
    return wrap;
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const el = document.createElement('style');
    el.textContent = `
.dv-what{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;margin-bottom:10px;
  padding:8px 12px;border-radius:10px;border:1px solid rgba(128,160,255,.45);background:rgba(128,160,255,.1);}
.dv-what[data-kind="text"]{border-color:rgba(128,128,128,.3);background:rgba(128,128,128,.07);font-weight:500;}
.dv-what span{font-weight:400;font-size:12px;opacity:.7;margin-left:auto;}
.dv-tree{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;}
.dv-sum{font-size:11px;opacity:.65;margin-bottom:6px;}
.dv-rows{max-height:46vh;overflow:auto;border:1px solid rgba(128,128,128,.22);border-radius:10px;
  background:rgba(128,128,128,.05);padding:6px 4px;}
.dv-row{display:flex;gap:6px;align-items:baseline;padding:1px 6px;border-radius:5px;cursor:pointer;white-space:nowrap;}
.dv-row:hover{background:rgba(128,160,255,.14);}
.dv-twist{width:10px;opacity:.55;flex:none;}
.dv-key{opacity:.8;}
.dv-val{overflow:hidden;text-overflow:ellipsis;}
.dv-string{color:#4f9a5a;}
.dv-number{color:#3f7fd0;}
.dv-boolean{color:#a06bd0;}
.dv-null{opacity:.5;}
.dv-object,.dv-array{opacity:.6;}
.dv-cut{font-size:11px;opacity:.6;padding:4px 8px;}
.dv-head{margin:0;max-height:44vh;overflow:auto;white-space:pre-wrap;word-break:break-all;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;
  padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,.22);background:rgba(128,128,128,.05);}
`;
    document.head.appendChild(el);
  }
})();
