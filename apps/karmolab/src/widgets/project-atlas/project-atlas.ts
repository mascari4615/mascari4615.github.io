import { AtlasMode, LESSONS, Lesson, TROUBLESHOOT } from './content';
import { injectAtlasStyles } from './styles';

(function (): void {
  const PROGRESS_KEY = 'karmolab.atlas.course.v4';
  let mode: AtlasMode = 'learn';
  const requestedLesson = new URLSearchParams(location.search).get('atlasLesson');
  let lessonIndex = Math.max(0, LESSONS.findIndex((item) => item.id === requestedLesson));
  let completed = readCompleted();
  let quizChoice: number | null = null;
  let layoutKind: 'flex' | 'grid' = 'grid';
  let layoutGap = 16;
  let eventCount = 0;
  const PROJECT_STARTER = `<!doctype html>
<meta charset="utf-8">
<style>
  body { font: 18px system-ui; padding: 24px; text-align: center; }
  button { padding: 10px 16px; margin: 4px; }
  output { display: block; margin: 18px; font-size: 40px; }
</style>
<h1>My Counter</h1>
<output>0</output>
<button data-delta="-1">-1</button>
<button data-delta="1">+1</button>
<script>
  let count = 0;
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delta]');
    if (!button) return;
    count += Number(button.dataset.delta);
    document.querySelector('output').textContent = count;
  });
<\/script>`;
  let projectCode = PROJECT_STARTER;

  function esc(value: string): string { return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function readCompleted(): Set<string> { try { const value=JSON.parse(localStorage.getItem(PROGRESS_KEY)||'[]'); if(Array.isArray(value)) return new Set(value.filter((item):item is string=>typeof item==='string')); } catch {} return new Set(); }
  function saveCompleted(): void { try { localStorage.setItem(PROGRESS_KEY,JSON.stringify([...completed])); } catch {} }
  function lesson(): Lesson { return LESSONS[lessonIndex] || LESSONS[0]; }
  function updateLessonUrl(): void {
    const url = new URL(location.href);
    url.searchParams.set('atlasLesson', lesson().id);
    history.replaceState(history.state, '', url);
  }
  function rerender(container: HTMLElement): void {
    const scrollTop = window.scrollY;
    render(container);
    requestAnimationFrame(() => window.scrollTo({ top: scrollTop }));
  }

  const RESOURCE_BY_LESSON: Record<string, Array<[string,string]>> = {
    orientation:[['MDN · 환경 구성','https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Environment_setup']],
    browser:[['MDN · Web 작동 방식','https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Web_standards/How_the_web_works']],
    layout:[['MDN · CSS layout','https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout']],
    events:[['MDN · Events','https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Events']],
    architecture:[['KarmoLab 위젯 가이드','/apps/karmolab/src/widgets/README.md']],
    boundaries:[['MDN · Fetch API','https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API']],
    debugging:[['MDN · What went wrong?','https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/What_went_wrong']],
    project:[['Microsoft Learn · Web 개발 시작','https://learn.microsoft.com/en-us/training/modules/get-started-with-web-development/']],
  };

  function topbarHtml(): string {
    const percent=Math.round(completed.size/LESSONS.length*100);
    return `<header class="pa-topbar"><div><p class="pa-kicker">Project Atlas · Learning path</p><h1>KarmoLab을 읽고, 고치고, 설명하기</h1><p>완전 초보에서 작은 위젯을 직접 만드는 데까지 이어지는 8개 단원입니다.</p></div><div class="pa-mode-tabs"><button class="${mode==='learn'?'is-active':''}" data-pa-mode="learn">학습 과정</button><button class="${mode==='reference'?'is-active':''}" data-pa-mode="reference">Reference</button></div><div class="pa-course-progress"><span>${completed.size}/${LESSONS.length} 단원</span><b>${percent}%</b><i><em style="width:${percent}%"></em></i></div></header>`;
  }

  function curriculumHtml(): string {
    let previous='';
    return `<aside class="pa-curriculum"><div class="pa-rail-title"><b>학습 과정</b><span>Beginner → Builder</span></div>${LESSONS.map((item,index)=>{
      const module=item.module!==previous?`<p>${esc(item.module)}</p>`:''; previous=item.module;
      return `${module}<button class="${index===lessonIndex?'is-current':''} ${completed.has(item.id)?'is-done':''}" data-pa-lesson="${index}"><span>${completed.has(item.id)?'✓':item.number}</span><div><b>${esc(item.title)}</b><small>${item.minutes}분 · ${esc(item.summary)}</small></div></button>`;
    }).join('')}</aside>`;
  }

  function labHtml(item: Lesson): string {
    if(item.lab==='dom') return `<section class="pa-lab"><div class="pa-lab-head"><span>Interactive lab</span><b>DOM 구조 탐색기</b></div><div class="pa-dom-tree"><button data-pa-dom="parent">section.parent</button><div><button data-pa-dom="title">h2.title</button><button data-pa-dom="button">button.action</button></div></div><div class="pa-dom-preview" data-pa-dom-preview><h2>Atlas 카드</h2><button>열기</button></div><p data-pa-lab-result>노드를 누르면 같은 요소가 미리보기에서 강조됩니다.</p></section>`;
    if(item.lab==='layout') return `<section class="pa-lab"><div class="pa-lab-head"><span>Interactive lab</span><b>같은 HTML, 다른 부모 CSS</b></div><div class="pa-lab-controls"><button class="${layoutKind==='flex'?'is-active':''}" data-pa-layout="flex">flex</button><button class="${layoutKind==='grid'?'is-active':''}" data-pa-layout="grid">grid</button><label>gap <input type="range" min="0" max="32" value="${layoutGap}" data-pa-gap><output>${layoutGap}px</output></label></div><div class="pa-layout-preview is-${layoutKind}" style="gap:${layoutGap}px">${['HTML','CSS','TypeScript'].map(x=>`<div>${x}</div>`).join('')}</div><pre><code>display: ${layoutKind};\ngap: ${layoutGap}px;</code></pre></section>`;
    if(item.lab==='event') return `<section class="pa-lab"><div class="pa-lab-head"><span>Interactive lab</span><b>event → state → render</b></div><div class="pa-event-flow"><button data-pa-delta="-1">−1</button><output>${eventCount}</output><button data-pa-delta="1">+1</button></div><div class="pa-runtime-trace"><span>click</span><i>→</i><span>dataset.delta</span><i>→</i><span>count = ${eventCount}</span><i>→</i><span>render</span></div></section>`;
    if(item.lab==='architecture') return `<section class="pa-lab pa-architecture"><div class="pa-lab-head"><span>Runtime map</span><b>하나를 눌러 책임과 파일을 확인하세요</b></div><div class="pa-arch-flow">${[['meta','주소록'],['loader','불러오기'],['register','등록'],['build','화면 생성'],['dispose','정리']].map(([id,label],i)=>`${i?'<i>→</i>':''}<button data-pa-arch="${id}">${label}</button>`).join('')}</div><p data-pa-arch-note>화면 이름에서 시작해 왼쪽부터 따라갑니다.</p></section>`;
    if(item.lab==='debug') return `<section class="pa-lab"><div class="pa-lab-head"><span>Diagnostic lab</span><b>증상을 누르면 첫 관측 도구가 나옵니다</b></div><div class="pa-debug-grid">${[['화면이 안 뜸','Network → bundle 요청'],['버튼 무반응','Console → data-* → listener'],['간격이 이상함','Elements → 부모 computed style'],['목록이 비었음','Network → response JSON']].map(([a,b])=>`<button data-pa-debug="${esc(b)}"><b>${a}</b><span>${b}</span></button>`).join('')}</div><p data-pa-debug-result>무작정 파일을 고치기 전에 증상을 관측 도구와 연결하세요.</p></section>`;
    if(item.lab==='project') return `<section class="pa-lab pa-project-board"><div class="pa-lab-head"><span>Capstone · 직접 수정하기</span><b>My Counter 미니 작업대</b></div><div class="pa-project-intro"><p>왼쪽 코드는 완성된 최소 예제입니다. 제목, 색상, 버튼 문구를 먼저 바꾸고 실행하세요. 익숙해지면 버튼을 하나 더 추가해 보세요.</p><ol><li>코드를 한 군데 바꾼다.</li><li><b>실행</b>을 눌러 결과를 본다.</li><li>± 버튼이 여전히 동작하는지 확인한다.</li></ol></div><div class="pa-project-workbench"><div class="pa-project-editor"><div><b>index.html</b><span>HTML · CSS · JavaScript가 한 파일에 있습니다</span></div><textarea data-pa-project-code aria-label="카운터 실습 코드" spellcheck="false">${esc(projectCode)}</textarea><div class="pa-project-actions"><button data-pa-project-reset>처음 코드로</button><button class="is-primary" data-pa-project-run>실행</button></div></div><div class="pa-project-result"><div><b>미리보기</b><span data-pa-project-status>코드를 바꾼 뒤 실행하세요</span></div><iframe data-pa-project-preview title="카운터 실습 미리보기" sandbox="allow-scripts"></iframe></div></div><div class="pa-project-checks"><b>완성 조건</b><span data-pa-project-check="output">○ 숫자 출력</span><span data-pa-project-check="buttons">○ 두 방향 버튼</span><span data-pa-project-check="event">○ 클릭 이벤트</span></div><details class="pa-project-help"><summary>무엇을 바꿔야 할지 모르겠어요</summary><p><code>&lt;h1&gt;My Counter&lt;/h1&gt;</code>의 글자를 바꾸거나, <code>body</code> 안에 <code>background: lavender;</code>를 추가해 보세요. 오류가 나면 처음 코드로 돌아갈 수 있습니다.</p></details></section>`;
    return `<section class="pa-lab pa-command-lab"><div class="pa-lab-head"><span>Setup checkpoint</span><b>세 창의 역할</b></div><div class="pa-window-map"><article><b>VS Code</b><span>원본 파일 수정</span></article><i>→</i><article><b>터미널</b><span>dev · typecheck · build</span></article><i>→</i><article><b>브라우저</b><span>화면 · Console · Network</span></article></div></section>`;
  }

  function quizHtml(item: Lesson): string {
    const answered=quizChoice!==null;
    return `<section class="pa-quiz"><p class="pa-kicker">Knowledge check</p><h3>${esc(item.question)}</h3><div>${item.choices.map((choice,index)=>`<button class="${answered&&index===item.answer?'is-correct':''} ${answered&&index===quizChoice&&index!==item.answer?'is-wrong':''}" data-pa-answer="${index}" ${answered?'disabled':''}><span>${String.fromCharCode(65+index)}</span>${esc(choice)}</button>`).join('')}</div>${answered?`<p class="pa-answer-note"><b>${quizChoice===item.answer?'정답입니다':'다시 짚어볼 부분입니다'}</b>${esc(item.answerNote)} <button data-pa-retry>다시 풀기</button></p>`:''}</section>`;
  }

  function lessonHtml(): string {
    const item=lesson();
    const resources=RESOURCE_BY_LESSON[item.id]||[];
    return `<div class="pa-learn-layout">${curriculumHtml()}<main class="pa-lesson"><div class="pa-lesson-heading"><div><p class="pa-kicker">${esc(item.module)} · ${item.number}</p><h2>${esc(item.title)}</h2><p>${esc(item.summary)}</p></div><span>${item.minutes}분</span></div><section class="pa-objectives"><b>이 단원을 마치면</b>${item.objectives.map(x=>`<span>✓ ${esc(x)}</span>`).join('')}</section><section class="pa-explain-grid">${item.explain.map((block,index)=>`<article><span>${index+1}</span><div><h3>${esc(block.title)}</h3><p>${esc(block.body)}</p></div></article>`).join('')}</section>${item.code?`<section class="pa-code-panel"><div><span>실제 KarmoLab 코드 감각</span><button data-pa-copy="${esc(item.code)}">복사</button></div><pre><code>${esc(item.code)}</code></pre></section>`:''}${labHtml(item)}${quizHtml(item)}<div class="pa-lesson-nav"><button data-pa-prev ${lessonIndex===0?'disabled':''}>← 이전 단원</button><button class="pa-complete ${completed.has(item.id)?'is-complete':''}" data-pa-complete>${completed.has(item.id)?'✓ 학습 기록됨':'이 단원 학습 기록'}</button><button data-pa-next ${lessonIndex===LESSONS.length-1?'disabled':''}>다음 단원 →</button></div></main><aside class="pa-context"><section><p class="pa-kicker">이번 목표</p>${item.objectives.map(x=>`<span>${esc(x)}</span>`).join('')}</section><section><p class="pa-kicker">관련 파일</p>${item.files.map(x=>`<code>${esc(x)}</code>`).join('')}</section><section><p class="pa-kicker">공식 자료</p>${resources.map(([label,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join('')}</section><section><p class="pa-kicker">막혔다면</p><button data-pa-mode="reference">실패 복구 사전 열기 →</button></section></aside></div>`;
  }

  function referenceHtml(): string {
    return `<main class="pa-reference"><aside><p class="pa-kicker">Reference</p><h2>증상에서 파일로</h2><p>과정을 순서대로 읽는 곳이 아닙니다. 지금 막힌 증상을 찾아 필요한 층만 확인하세요.</p><button data-pa-mode="learn">← 학습 과정으로</button></aside><div><section class="pa-ref-block"><p class="pa-kicker">Runtime</p><h3>화면 이름에서 실행까지</h3><div class="pa-ref-flow"><span>메뉴 이름</span><i>→</i><span>widgets-lazy-meta</span><i>→</i><span>lazy loader</span><i>→</i><span>Toolbox.register</span><i>→</i><span>build(container)</span><i>→</i><span>DOM</span></div></section><section class="pa-ref-block"><p class="pa-kicker">Troubleshooting</p><h3>실패 복구 사전</h3><div class="pa-trouble-list">${TROUBLESHOOT.map(([a,b])=>`<details><summary>${esc(a)}</summary><p>${esc(b)}</p></details>`).join('')}</div></section><section class="pa-ref-block"><p class="pa-kicker">Workspace</p><h3>네 영역</h3><div class="pa-workspace-grid"><article><b>KarmoLab</b><code>Mascari4615.github.io/apps/karmolab/</code><span>웹 shell과 위젯</span></article><article><b>봇·packages</b><code>apps/discord-bots/ · packages/</code><span>봇과 공용 코드</span></article><article><b>memo</b><code>memo/</code><span>규칙·TASK·설계 정본</span></article><article><b>WM</b><code>WitchMendokusai/</code><span>Unity 게임 본체</span></article></div></section></div></main>`;
  }

  function updateProjectPreview(container: HTMLElement): void {
    const frame=container.querySelector<HTMLIFrameElement>('[data-pa-project-preview]');
    if(frame) frame.srcdoc=projectCode;
    const checks={output:/<output\b/i.test(projectCode),buttons:(projectCode.match(/data-delta=/g)||[]).length>=2,event:/addEventListener\s*\(/.test(projectCode)};
    Object.entries(checks).forEach(([key,ok])=>{const node=container.querySelector<HTMLElement>(`[data-pa-project-check="${key}"]`);if(node){node.classList.toggle('is-done',ok);node.textContent=`${ok?'✓':'○'} ${node.textContent?.replace(/^[✓○]\s*/,'')||''}`;}});
    const status=container.querySelector<HTMLElement>('[data-pa-project-status]');
    if(status) status.textContent=Object.values(checks).every(Boolean)?'핵심 구조 3가지를 모두 찾았습니다':'빠진 구조가 있습니다. 아래 완성 조건을 확인하세요';
  }
  function render(container: HTMLElement): void { container.innerHTML=`<div class="pa-root">${topbarHtml()}${mode==='learn'?lessonHtml():referenceHtml()}</div>`; updateProjectPreview(container); }

  function wire(container: HTMLElement, controller: AbortController): void {
    container.addEventListener('click',(event:Event)=>{
      const target=event.target as HTMLElement;
      const modeValue=target.closest<HTMLElement>('[data-pa-mode]')?.dataset.paMode as AtlasMode|undefined; if(modeValue){mode=modeValue;render(container);return;}
      const lessonValue=target.closest<HTMLElement>('[data-pa-lesson]')?.dataset.paLesson; if(lessonValue!==undefined){lessonIndex=Number(lessonValue);quizChoice=null;updateLessonUrl();rerender(container);return;}
      if(target.closest('[data-pa-prev]')&&lessonIndex>0){lessonIndex--;quizChoice=null;updateLessonUrl();rerender(container);return;}
      if(target.closest('[data-pa-next]')&&lessonIndex<LESSONS.length-1){lessonIndex++;quizChoice=null;updateLessonUrl();rerender(container);return;}
      if(target.closest('[data-pa-complete]')){const id=lesson().id;completed.has(id)?completed.delete(id):completed.add(id);saveCompleted();render(container);return;}
      const answer=target.closest<HTMLElement>('[data-pa-answer]')?.dataset.paAnswer;if(answer!==undefined){quizChoice=Number(answer);render(container);return;}
      if(target.closest('[data-pa-retry]')){quizChoice=null;rerender(container);return;}
      const copy=target.closest<HTMLElement>('[data-pa-copy]')?.dataset.paCopy;if(copy)void navigator.clipboard.writeText(copy).then(()=>Toolbox.showToast?.('복사했습니다.','success',undefined),()=>Toolbox.showToast?.('직접 선택해 주세요.','warning',undefined));
      const dom=target.closest<HTMLElement>('[data-pa-dom]')?.dataset.paDom;if(dom){container.querySelectorAll('.pa-dom-preview *').forEach(x=>x.classList.remove('is-highlight'));const selector=dom==='parent'?'.pa-dom-preview':dom==='title'?'.pa-dom-preview h2':'.pa-dom-preview button';container.querySelector(selector)?.classList.add('is-highlight');const out=container.querySelector('[data-pa-lab-result]');if(out)out.textContent=`${dom} 노드와 미리보기 요소가 연결됐습니다.`;return;}
      const layout=target.closest<HTMLElement>('[data-pa-layout]')?.dataset.paLayout as 'flex'|'grid'|undefined;if(layout){layoutKind=layout;render(container);return;}
      const delta=target.closest<HTMLElement>('[data-pa-delta]')?.dataset.paDelta;if(delta){eventCount+=Number(delta);render(container);return;}
      const arch=target.closest<HTMLElement>('[data-pa-arch]')?.dataset.paArch;if(arch){const notes:Record<string,string>={meta:'widgets-lazy-meta.ts — id, 제목, layout, bundle 경로',loader:'widgets-loader.ts — 필요한 script만 불러옴',register:'Toolbox.register — bundle이 위젯 정의를 shell에 전달',build:'build(container) — 탭을 열 때 실제 DOM 생성',dispose:'Toolbox.onDispose — timer와 listener 정리'};const out=container.querySelector('[data-pa-arch-note]');if(out)out.textContent=notes[arch];return;}
      const debug=target.closest<HTMLElement>('[data-pa-debug]')?.dataset.paDebug;if(debug){const out=container.querySelector('[data-pa-debug-result]');if(out)out.textContent=`첫 관측: ${debug}`;return;}
      if(target.closest('[data-pa-project-run]')){const editor=container.querySelector<HTMLTextAreaElement>('[data-pa-project-code]');if(editor)projectCode=editor.value;updateProjectPreview(container);return;}
      if(target.closest('[data-pa-project-reset]')){projectCode=PROJECT_STARTER;rerender(container);return;}
    },{signal:controller.signal});
    container.addEventListener('input',(event:Event)=>{const range=(event.target as HTMLElement).closest<HTMLInputElement>('[data-pa-gap]');if(range){layoutGap=Number(range.value);render(container);return;}const editor=(event.target as HTMLElement).closest<HTMLTextAreaElement>('[data-pa-project-code]');if(editor){projectCode=editor.value;const status=container.querySelector<HTMLElement>('[data-pa-project-status]');if(status)status.textContent='변경됨 · 실행을 눌러 반영하세요';}},{signal:controller.signal});
  }

  Toolbox.register({...Toolbox.getLazyWidgetPublicMeta!('project-atlas'),tabs:[{id:'project-atlas-main',label:'Atlas',build(container:HTMLElement):void{injectAtlasStyles();container.classList.add('project-atlas');const controller=new AbortController();Toolbox.onDispose?.(()=>controller.abort());render(container);wire(container,controller);}}]});
})();
