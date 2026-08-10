/**
 * 위젯 하나를 **진짜 페이지처럼** 브라우저에 올린다 (화면 검사 공용 받침)
 *
 * 왜 있나 — 2026-08-10 에 같은 사고를 두 번 냈다. 다른 슬롯이 위젯을 다국어로 옮기자
 * 내가 쓴 화면 검사 셋이 한꺼번에 빨개졌고, **로컬은 초록이라 배포에서야 보였다**. 사유는 늘 같다:
 *
 *   ① 말 묶음을 안 박았다 — 진짜 페이지는 `window.__KARMO_I18N` 에 미리 박아 두고 시작한다.
 *      안 박으면 위젯이 받으러 갔다가 못 받아 **영영 안 그려지거나** 열쇠(`dailycho.score`)를 뱉는다.
 *      그건 하네스가 만든 상태지 제품의 상태가 아니다 — 검사가 제품을 헐뜯게 된다.
 *   ② 그려지기 전에 읽었다 — `build()` 는 바로 돌아오고 화면은 말 묶음을 받은 뒤에 채워진다.
 *   ③ 「보일 때까지」로 기다렸다 — 파일 고르는 칸은 `hidden` 이라 영영 안 보인다(`attached` 로).
 *
 * 세 번째 검사부터는 이걸 각자 다시 짜지 마라. 여기 한 곳만 고치면 전부 따라온다.
 *
 * 쓰는 법:
 *   const host = await mountWidget(page, {
 *     appRoot, id: 'mesh3d', namespaces: ['mesh3d'], waitFor: '#m3File'
 *   });
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param page          playwright 페이지 (이미 아무 주소나 열려 있어야 한다)
 * @param appRoot       apps/karmolab 절대 경로
 * @param id            위젯 id (`Toolbox.register` 에 적힌 것)
 * @param bundle        번들 경로. 없으면 `js/widgets/tools/<id>.js`
 * @param namespaces    미리 박을 말 묶음. 없으면 `[id]`
 * @param waitFor       이게 붙을 때까지 기다린다. 없으면 안 기다린다
 * @param extraToolbox  Toolbox 스텁에 더 얹을 것 (예: onDispose 붙잡기)
 * @returns             호스트 div 의 id (`#<id>Host`), 못 그렸으면 null
 */
export async function mountWidget(page, opts) {
  const { appRoot, id, namespaces = [id], waitFor = null, extraToolbox = null } = opts;
  const bundle = opts.bundle ?? `js/widgets/tools/${id}.js`;

  const catalogs = {};
  for (const ns of namespaces) {
    const at = path.join(appRoot, `i18n/ko/${ns}.json`);
    /* 말 묶음이 없는 위젯도 있다(아직 안 옮긴 것). 없으면 없는 대로 — 그건 실패가 아니다. */
    if (fs.existsSync(at)) catalogs[ns] = JSON.parse(fs.readFileSync(at, 'utf8'));
  }

  await page.evaluate(
    (arg) => {
      window.__KARMO_LOCALE = 'ko';
      window.__KARMO_I18N = { ko: arg.cat };
      window.__reg = window.__reg || {};
      window.__dispose = window.__dispose || [];
      window.Toolbox = {
        register: (t) => {
          window.__reg[t.id] = t;
        },
        trackUse() {},
        copyText() {},
        onDispose: (fn) => window.__dispose.push(fn),
        getTools: () => Object.values(window.__reg),
        isDesktopApp: () => false,
        mountTool() {
          return true;
        },
        ...(arg.extra ?? {})
      };
    },
    { cat: catalogs, extra: extraToolbox }
  );

  await page.addScriptTag({ content: fs.readFileSync(path.join(appRoot, bundle), 'utf8') });

  const hostId = `${id}Host`;
  const ok = await page.evaluate(
    (arg) => {
      const tool = window.__reg[arg.id];
      if (!tool) return false;
      const host = document.createElement('div');
      host.id = arg.hostId;
      host.style.width = '640px';
      document.body.appendChild(host);
      tool.tabs[0].build(host);
      return true;
    },
    { id, hostId }
  );
  if (ok === false) return null;

  if (waitFor !== null) {
    /* `attached` 로 기다린다 — 숨겨 둔 칸(파일 고르기 등)은 「보일 때까지」로는 영영 안 온다. */
    const found = await page
      .waitForSelector(`#${hostId} ${waitFor}`, { state: 'attached', timeout: 8000 })
      .catch(() => null);
    if (found === null) return null;
  }
  return `#${hostId}`;
}
