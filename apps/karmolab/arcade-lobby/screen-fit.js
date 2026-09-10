// 실제 요소를 유지하는 책장식 페이지 전환. 입력과 선택 상태 보존.
const screenPageObservers = new Set();
function disposeScreenPages() {
  for (const observer of screenPageObservers) observer.disconnect();
  screenPageObservers.clear();
}
function paginateScreen(target, keep) {
  if (!target || target.querySelector(':scope > .screen-pages')) return;
  const viewport = document.createElement('div');
  viewport.className = 'screen-pages';
  const flow = document.createElement('div');
  flow.className = 'screen-pages-flow';
  for (const child of [...target.children]) if (!keep || !child.matches(keep)) flow.append(child);
  viewport.append(flow);
  const nav = document.createElement('nav');
  nav.className = 'screen-pager';
  nav.setAttribute('aria-label','화면 페이지');
  nav.innerHTML = '<button aria-label="이전 화면 페이지">←</button><output aria-live="polite"></output><button aria-label="다음 화면 페이지">→</button>';
  target.append(viewport,nav);
  let index = 0;
  const buttons = nav.querySelectorAll('button');
  function fit() {
    if (!target.isConnected) { observer.disconnect(); screenPageObservers.delete(observer); return; }
    const width = viewport.clientWidth;
    if (!width) return;
    flow.style.setProperty('--page-width',width+'px');
    const pages = Math.max(1,Math.round((flow.scrollWidth+24)/(width+24)));
    index = Math.max(0,Math.min(index,pages-1));
    flow.style.transform = `translateX(${-index*(width+24)}px)`;
    nav.querySelector('output').textContent = `${index+1} / ${pages}`;
    buttons[0].disabled = index===0;
    buttons[1].disabled = index===pages-1;
  }
  buttons.forEach((button,i)=>button.onclick=()=>{index+=i?1:-1;fit()});
  flow.addEventListener('focusin',event=>{
    const rect=event.target.getBoundingClientRect(),bounds=viewport.getBoundingClientRect();
    if(rect.left<bounds.left||rect.right>bounds.right){index+=Math.round((rect.left-bounds.left)/(viewport.clientWidth+24));fit()}
  });
  const observer = new ResizeObserver(fit);
  screenPageObservers.add(observer);
  observer.observe(viewport);
  flow.querySelectorAll('img').forEach(img=>img.addEventListener('load',fit,{once:true}));
  requestAnimationFrame(fit);
}
const screenFitBackground = renderBackground;
renderBackground = function() { disposeScreenPages(); screenFitBackground(); paginateScreen(document.querySelector('#screen>.page'),'.page-head'); };
