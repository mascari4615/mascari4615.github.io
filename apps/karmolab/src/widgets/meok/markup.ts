/**
 * 먹 화면의 뼈대. 문자열 한 벌.
 *
 * 왜 갈랐나: `meok.ts` 안에서 이 120 줄이 배선 코드와 뒤섞여 있었다. 여기 있는 것은 **모양뿐**,
 * 손잡이는 전부 `data-act` 와 `data-tool` 같은 표시로 넘긴다. 그래서 이 파일은 상태를 모름.
 */
import { t } from '../../lib/i18n';

const esc = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

const T = (key: string, fallback: string): string => t('meok.' + key, undefined, fallback);

/** 도구 버튼 하나. 아이콘은 글리프가 아니라 선 그림 (글꼴 따라 안 달라진다). */
const toolButton = (id: string, hotkey: string, label: string, path: string, active = false): string =>
  '<button data-tool="' + id + '"' + (active ? ' class="active"' : '') + ' title="' + esc(label + ' (' + hotkey + ')') + '">' +
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>' +
  '<small>' + esc(label) + '</small></button>';

/** 화면 한 벌. 부르는 쪽이 `container.innerHTML` 에 그대로. */
export function meokMarkup(): string {
  return     '<div class="meok">' +
    '<header class="meok-bar">' +
      '<strong class="meok-logo">먹</strong>' +
      '<input class="meok-name" data-name aria-label="' + esc(T('docName', '그림 이름')) + '">' +
      '<span class="meok-sep"></span>' +
      '<button data-act="new" title="' + esc(T('newHelp', '빈 그림을 새로 시작한다')) + '">' + esc(T('new', '새로')) + '</button>' +
      '<button data-act="new-pixel" title="' + esc(T('newPixelHelp', '격자에 붙는 픽셀 그림. 도트 애니메이션용')) + '">' + esc(T('newPixel', '픽셀')) + '</button>' +
      '<label class="meok-file">' + esc(T('open', '열기')) +
        '<input data-open type="file" accept="image/*,application/json,.json,.meok,.ditherdeck.json" hidden></label>' +
      '<button data-act="add-text" title="' + esc(T('addTextHelp', '글자를 새 레이어로 얹는다')) + '">' + esc(T('addText', '글자')) + '</button>' +
      '<button data-act="add-image" title="' + esc(T('addImageHelp', '그림 파일을 새 레이어로 얹는다')) + '">' + esc(T('addImage', '붙이기')) + '</button>' +
      '<input data-place type="file" accept="image/*" hidden>' +
      '<button data-act="undo" data-hot="Ctrl+Z">' + esc(T('undo', '되돌리기')) + '</button>' +
      '<button data-act="redo" data-hot="Ctrl+Shift+Z">' + esc(T('redo', '다시')) + '</button>' +
      '<span class="meok-sep"></span>' +
      '<button data-act="save-png">' + esc(T('savePng', 'PNG')) + '</button>' +
      '<button data-act="to-shelf" title="' + esc(T('toShelfHelp', '만든 것을 선반에 올린다 (CC0)')) + '">' + esc(T('toShelf', '선반')) + '</button>' +
      '<button data-act="save-sheet">' + esc(T('saveSheet', '시트')) + '</button>' +
      '<button data-act="save-gif" title="' + esc(T('saveGifHelp', '프레임을 움직이는 GIF 한 장으로. 초당 값이 속도가 된다')) + '">' + esc(T('saveGif', 'GIF')) + '</button>' +
      '<button data-act="save-apng" title="' + esc(T('saveApngHelp', '움직이는 PNG. 반투명 가장자리가 살아 있다. 디스코드 스티커가 이 형식')) + '">' + esc(T('saveApng', 'APNG')) + '</button>' +
      '<button data-act="save-meok" title="' + esc(T('saveMeokHelp', '레이어, 프레임까지 그대로 담은 파일')) + '">' + esc(T('saveMeok', '.meok')) + '</button>' +
      '<button data-act="save-project">' + esc(T('saveProject', '프로젝트')) + '</button>' +
      '<span class="meok-status" data-status></span>' +
      '<button data-act="fullscreen" class="meok-full" title="' + esc(T('fullscreenHelp', '창을 화면 전체로. 다시 누르면 돌아온다')) + '">⛶</button>' +
    '</header>' +
    '<div class="meok-body">' +
      '<aside class="meok-tools">' +
        toolButton('brush', 'B', T('toolBrush', '붓'), '<path d="M4 20c2.5.4 4.6-.6 5.4-2.6.5-1.3 0-2.6-1-3.3-1.2-.8-2.8-.5-3.5.8C4 16.4 4.2 18.3 4 20z"/><path d="M10.5 14.8 19.2 5.4a1.7 1.7 0 0 0-2.4-2.4L7.3 11.6"/>', true) +
        toolButton('eraser', 'E', T('toolEraser', '지우개'), '<path d="m5.5 15.5 6-6a2 2 0 0 1 2.8 0l3.7 3.7a2 2 0 0 1 0 2.8l-4 4H8l-2.5-2.5a2 2 0 0 1 0-2z"/><path d="M9.5 20h10"/>') +
        toolButton('fill', 'F', T('toolFill', '채우기'), '<path d="m10 3 8.2 8.2a1.4 1.4 0 0 1 0 2L12 19.4a1.4 1.4 0 0 1-2 0l-6.2-6.2a1.4 1.4 0 0 1 0-2L10 5"/><path d="M20.5 15.5c1 1.4 1.5 2.4 1.5 3a1.5 1.5 0 1 1-3 0c0-.6.5-1.6 1.5-3z" fill="currentColor"/>') +
        toolButton('pick', 'I', T('toolPick', '스포이드'), '<path d="m13.5 7.5 3 3M4 20l1-3.2 8-8 2.2 2.2-8 8z"/><path d="M15 4.6a2 2 0 0 1 2.8 0l1.6 1.6a2 2 0 0 1 0 2.8l-1.5 1.5-4.4-4.4z"/>') +
        toolButton('marquee', 'M', T('toolMarquee', '사각 선택'), '<rect x="3.5" y="5.5" width="17" height="13" rx="1" stroke-dasharray="3 2.5"/>') +
        toolButton('lasso', 'L', T('toolLasso', '올가미'), '<path d="M12 4.5c4.4 0 8 2.5 8 5.6 0 3-3.6 5.5-8 5.5-1.3 0-2.6-.2-3.7-.6-1.4 1.2-1.6 2.6-1 4.5-2-1.3-2.6-3.4-1.6-5.5C4.4 13 4 11.6 4 10.1c0-3.1 3.6-5.6 8-5.6z"/>') +
        toolButton('wand', 'W', T('toolWand', '마술봉'), '<path d="m4 20 9.5-9.5M15 4l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9zM19.5 12.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>') +
        toolButton('pan', 'Space', T('toolPan', '이동'), '<path d="M12 3v18M3 12h18M12 3 9.5 5.8M12 3l2.5 2.8M12 21l-2.5-2.8M12 21l2.5-2.8M3 12l2.8-2.5M3 12l2.8 2.5M21 12l-2.8-2.5M21 12l-2.8 2.5"/>') +
        '<hr>' +
        '<input data-color type="color" value="#18202c" aria-label="' + esc(T('color', '색')) + '">' +
        '<div class="meok-palette" data-palette></div>' +
        '<button data-act="pick-palette" class="meok-mini">' + esc(T('paletteFromArt', '그림에서 색 뽑기')) + '</button>' +
        '<hr>' +
        '<div class="meok-presets" data-presets></div>' +
        '<button data-act="brush-save" class="meok-mini">' + esc(T('brushSave', '이 붓 담기')) + '</button>' +
      '</aside>' +
      '<section class="meok-stage">' +
        '<div class="meok-brush">' +
          '<label>' + esc(T('size', '굵기')) + '<input data-brush="size" type="range" min="1" max="200" step="1"><b data-out="size"></b></label>' +
          '<label>' + esc(T('hardness', '단단함')) + '<input data-brush="hardness" type="range" min="0" max="1" step="0.01"><b data-out="hardness"></b></label>' +
          '<label>' + esc(T('opacity', '짙기')) + '<input data-brush="opacity" type="range" min="0" max="1" step="0.01"><b data-out="opacity"></b></label>' +
          '<label>' + esc(T('flow', '흐름')) + '<input data-brush="flow" type="range" min="0.02" max="1" step="0.01"><b data-out="flow"></b></label>' +
          '<label>' + esc(T('smoothing', '손떨림')) + '<input data-brush="smoothing" type="range" min="0" max="0.95" step="0.01"><b data-out="smoothing"></b></label>' +
          '<span class="meok-selbar">' +
            '<button data-act="deselect" data-needs-selection class="meok-mini" title="Ctrl+D">' + esc(T('deselect', '선택 풀기')) + '</button>' +
            '<button data-act="feather-selection" data-needs-selection class="meok-mini">' + esc(T('featherEdge', '가장자리 부드럽게')) + '</button>' +
            '<button data-act="clear-selection" data-needs-selection class="meok-mini" title="Delete">' + esc(T('clearSelection', '고른 자리 지우기')) + '</button>' +
          '</span>' +
          '<span class="meok-zoom" data-zoom></span>' +
          '<button data-act="fit" class="meok-mini">' + esc(T('fit', '맞춤')) + '</button>' +
        '</div>' +
        '<div class="meok-canvas" data-canvas-wrap><canvas data-canvas></canvas></div>' +
        '<div class="meok-timeline">' +
          '<button data-act="play">▶</button>' +
          '<label>' + esc(T('fps', '초당')) + '<input data-fps type="number" min="1" max="60" value="12"></label>' +
          '<label class="meok-onion"><input data-onion type="checkbox"> ' + esc(T('onion', '어니언스킨')) + '</label>' +
          '<div class="meok-frames" data-frames></div>' +
          '<button data-act="add-frame" title="' + esc(T('addFrameHelp', '지금 프레임을 복사해 뒤에 끼운다')) + '">＋</button>' +
          '<button data-act="del-frame">－</button>' +
        '</div>' +
      '</section>' +
      '<aside class="meok-layers">' +
        '<div class="meok-layer-head">' +
          '<b>' + esc(T('layers', '레이어')) + '</b>' +
          '<button data-act="add-layer" title="' + esc(T('addLayerHelp', '위에 새 레이어')) + '">＋</button>' +
          '<button data-act="merge-layer" title="' + esc(T('mergeHelp', '아래 레이어에 눌러 붙인다')) + '">⇩</button>' +
          '<button data-act="del-layer">🗑</button>' +
        '</div>' +
        '<div class="meok-layer-props">' +
          '<label>' + esc(T('layerOpacity', '불투명도')) + '<input data-layer="opacity" type="range" min="0" max="1" step="0.01"></label>' +
          '<label>' + esc(T('blend', '섞기')) + '<select data-layer="blend"></select></label>' +
          '<label class="meok-check"><input data-layer="clip" type="checkbox"> ' + esc(T('clip', '아래에 끼우기')) + '</label>' +
          '<div class="meok-fix-row">' +
            '<button data-act="mask-from-selection" data-needs-selection title="' + esc(T('maskFromSelectionHelp', '고른 자리만 보이게 가림막을 만든다. 그림은 안 지운다')) + '">' + esc(T('maskFromSelection', '가림막')) + '</button>' +
            '<button data-act="mask-invert" data-needs-mask title="' + esc(T('maskInvertHelp', '보이는 자리와 가린 자리를 맞바꾼다')) + '">' + esc(T('maskInvert', '뒤집기')) + '</button>' +
            '<button data-act="mask-apply" data-needs-mask title="' + esc(T('maskApplyHelp', '가림막대로 그림을 실제로 지운다')) + '">' + esc(T('maskApply', '굳히기')) + '</button>' +
            '<button data-act="mask-clear" data-needs-mask>' + esc(T('maskClear', '없애기')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="meok-layer-list" data-layers></div>' +
        '<details class="meok-fix"><summary>' + esc(T('fix', '고치기')) + '</summary>' +
          '<div class="meok-fix-row">' +
            '<button data-act="crop-selection" data-needs-selection title="' + esc(T('cropToSelection', '고른 자리로 자르기')) + '">' + esc(T('cropShort', '고른 자리')) + '</button>' +
            '<button data-act="trim" title="' + esc(T('trim', '여백 자르기')) + '">' + esc(T('trimShort', '여백')) + '</button>' +
            '<button data-act="resize">' + esc(T('resizeDoc', '크기...')) + '</button>' +
          '</div>' +
          '<div class="meok-fix-row">' +
            '<button data-act="rot-left" title="' + esc(T('rotLeft', '왼쪽으로 90도')) + '">↺</button>' +
            '<button data-act="rot-right" title="' + esc(T('rotRight', '오른쪽으로 90도')) + '">↻</button>' +
            '<button data-act="flip-x" title="' + esc(T('flipX', '좌우 뒤집기')) + '">⇋</button>' +
            '<button data-act="flip-y" title="' + esc(T('flipY', '상하 뒤집기')) + '">⇅</button>' +
            '<button data-act="rotate-free" title="' + esc(T('rotateFreeHelp', '원하는 각도로 기울여 돌린다')) + '">∠</button>' +
          '</div>' +
          '<label>' + esc(T('brightness', '밝기')) + '<input data-adjust="brightness" type="range" min="-1" max="1" step="0.01" value="0"></label>' +
          '<label>' + esc(T('contrast', '대비')) + '<input data-adjust="contrast" type="range" min="-0.9" max="0.9" step="0.01" value="0"></label>' +
          '<label>' + esc(T('saturation', '채도')) + '<input data-adjust="saturation" type="range" min="-1" max="1" step="0.01" value="0"></label>' +
          '<label>' + esc(T('hue', '색조')) + '<input data-adjust="hue" type="range" min="-180" max="180" step="1" value="0"></label>' +
          '<div class="meok-fix-row">' +
            '<button data-act="adjust-apply">' + esc(T('applyAdjust', '보정 굳히기')) + '</button>' +
            '<button data-act="adjust-reset">' + esc(T('resetAdjust', '되돌리기')) + '</button>' +
          '</div>' +
          '<div class="meok-fix-row">' +
            '<button data-act="rembg" title="' + esc(T('rembgHelp', '이 레이어에서 배경을 지운다. 기기 안에서 계산한다(처음 한 번은 모델을 받느라 느리다)')) + '">' + esc(T('rembg', '배경 지우기')) + '</button>' +
          '</div>' +
          '<div class="meok-filters" data-filters></div>' +
        '</details>' +
        '<details class="meok-emote"><summary>' + esc(T('emote', '이모트')) + '</summary>' +
          '<div class="meok-emote-picks" data-emote-picks></div>' +
          '<div class="meok-emote-shots" data-emote-shots></div>' +
          '<p class="meok-emote-note" data-emote-note></p>' +
          '<div class="meok-fix-row">' +
            '<button data-act="emote-save">' + esc(T('emoteSave', '한 벌 뽑기')) + '</button>' +
          '</div>' +
        '</details>' +
      '</aside>' +
    '</div></div>'
}
