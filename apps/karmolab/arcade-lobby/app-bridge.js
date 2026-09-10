// 승인 시안의 화면과 연출 유지, 게임 설정 진입만 호스트 연결.
let gameSelectFrame;
const gameIds = ['gomoku','yacht','solitaire','reversi','four','checkers','blackjack','snake','pong','airhockey'];
function openGameSelection() {
    if (!gameSelectFrame) {
      gameSelectFrame = document.createElement('iframe');
      gameSelectFrame.title = '게임 선택';
      gameSelectFrame.src = '/apps/karmolab/arcade-lobby/game-select.html';
      gameSelectFrame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:200;background:#171320';
      document.body.append(gameSelectFrame);
    }
}
function closeGameSelection() {
  gameSelectFrame?.remove();
  gameSelectFrame = undefined;
}
function enterSelectedGame() {
    parent.postMessage({type:'arcade-lobby-enter',game:gameIds[s.game]},location.origin);
}
addEventListener('message', event => {
  if (event.origin === location.origin && gameSelectFrame && event.source === gameSelectFrame.contentWindow) {
    if (event.data?.type === 'arcade-select-back') show('lobby');
    if (event.data?.type === 'arcade-select-enter' && gameIds.includes(event.data.game)) {
      s.game = gameIds.indexOf(event.data.game);
      const mode = event.data.mode === 'solo' || event.data.mode === 'multi' ? event.data.mode : undefined;
      parent.postMessage({type:'arcade-lobby-enter',game:event.data.game,mode},location.origin);
    }
    return;
  }
  if (event.origin !== location.origin || event.source !== parent) return;
  if (event.data?.type === 'arcade-lobby-context') {
    const index = gameIds.indexOf(event.data.recent);
    if (index >= 0) { s.game = index; s.played = true; }
    show('lobby');
  }
  if (event.data?.type === 'arcade-lobby-unavailable') {
    if (gameSelectFrame) gameSelectFrame.contentWindow.postMessage({type:'arcade-select-unavailable'},location.origin);
    else notice('준비 중인 게임','이 종목은 아직 공개되지 않았어요. 현재 공개된 게임은 오목입니다.');
  }
});
