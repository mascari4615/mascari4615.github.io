// Single entry point; keep approved templates independent of navigation.
function show(view) {
  view = view === 'collection' ? 'wardrobe' : view;
  if (view === 'games') { openGameSelection(); return; }
  if (view === 'room' || view === 'match') { enterSelectedGame(); return; }
  closeGameSelection();
  disposeScreenPages();
  atelierView = view;
  document.body.dataset.screen = view;
  document.body.classList.toggle('live-home', view === 'lobby');
  document.body.classList.toggle('composition-home', view === 'lobby');
  document.body.style.setProperty('--depth-x', '0px');
  document.body.style.setProperty('--depth-y', '0px');
  stats();
  paintBackground(backdrop);
  if (view === 'lobby') {
    $('screen').innerHTML = liveLobby();
    const foreground = document.querySelector('.live-foreground');
    foreground.classList.toggle('has-matched-foreground', backdrop.id === 'rain');
    foreground.querySelector('img').src = '/.local/arcade-art/lobby-a-foreground-cutout-r2.png';
  } else if (view === 'wardrobe') {
    $('screen').innerHTML = wardrobe();
  } else if (view === 'background') {
    draft = {...backdrop};
    renderBackground();
  } else {
    renderLegacyScreen(view);
    decorate();
    if (view === 'gacha') document.querySelectorAll('.castgrid .sigil').forEach((el, i) => {
      el.style.backgroundImage = `url('${atelierSkins[i][0].src}')`;
    });
  }
  fitComposition();
  paginateScreen(document.querySelector('#screen>.page'), '.page-head');
  paginateScreen(document.querySelector('.dress-info'));
}

document.title = 'KarmoLab | 오락실';
document.querySelector('.review>span').textContent = 'UI 적용 검토 / 게임은 실제 앱 연결 / 프로필, 재화, 기원, 인연은 시안 데이터';
reset();
parent.postMessage({type:'arcade-lobby-ready'}, location.origin);
