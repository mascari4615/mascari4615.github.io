// 승인 시안의 배치 유지, 검토 도구 제외 및 실제 게임 설정 연결.
const integrationStyle = document.createElement('style');
integrationStyle.textContent = '.review{display:none}.surround{height:100%;padding:0}.viewport{box-shadow:none}';
document.head.append(integrationStyle);
const renderDesign = render;
function enterGame(mode) {
  parent.postMessage({type:'arcade-select-enter',game:games[selected][1],mode},location.origin);
}
render = function() {
  renderDesign();
  document.querySelector('#hint').textContent = selected === null ? '마음 가는 한 판, 천천히 골라요.' : '난이도와 플레이 방식은 다음 화면에서 선택해요.';
  for (const id of ['solo','multi']) {
    const original = body.querySelector('#' + id);
    if (!original) continue;
    const action = original.cloneNode(true);
    original.replaceWith(action);
    action.addEventListener('click',()=>enterGame(id));
  }
};
document.querySelector('#back').onclick = () => {
  if (selected !== null) { selected = null; room = false; render(); }
  else parent.postMessage({type:'arcade-select-back'},location.origin);
};
addEventListener('message',event => {
  if (event.origin !== location.origin || event.source !== parent) return;
  if (event.data?.type === 'arcade-select-unavailable') document.querySelector('#hint').textContent = '아직 준비 중인 게임이에요. 현재 공개된 게임은 오목입니다.';
});
render();
