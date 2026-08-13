/**
 * 영상 — **한 편, 할 일은 골라서** (TASK-KL-088 → TASK-KL-268)
 *
 * 영상은 파일이 크고 사적인 경우가 많아 남의 서버에 올리는 것이 특히 꺼려진다.
 * 여기서는 브라우저 안에서 끝난다 — 그 점은 그대로다. 바뀐 건 **순서**다.
 *
 * 전에는 할 일 일곱이 탭이었고, 탭을 옮기면 **영상을 다시 올려야** 했다. 영상은 파일이 커서
 * 이 되풀이가 다른 재료보다 훨씬 아프다(200MB 를 두 번 고르는 일). 그래서 PDF·이미지와 같은
 * 껍데기(`shared/material-shell`)로 옮겼다 — 한 번 올리면 할 일을 옮겨도 따라간다.
 *
 * 왼쪽 칸은 **필름 스트립**이다. Clideo·Kapwing 의 타임라인이 하는 일을 우리 식으로 줄인 것 —
 * 첫 장면 하나만 보여 주면 「이 영상이 맞나」밖에 못 판단한다. 어디를 자를지, 어디서 GIF 를
 * 만들지는 **흐름이 보일 때** 정해진다. 눌러 보면 그 자리부터 재생한다.
 */
import { materialShell, type MaterialGroup } from './shared/material-shell';
import { loadVideo, metaOf, filmstrip } from './shared/video';
import { fileSize, mmss } from './shared/media';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const GROUPS = (): MaterialGroup[] => [
    {
      label: t('videotool.group.cut', undefined, '자르기·줄이기'),
      jobs: [
        ['videotrim', t('videotool.part.videotrim', undefined, '구간 자르기')],
        ['videocompress', t('videotool.part.videocompress', undefined, '용량 줄이기')],
        ['videorotate', t('videotool.part.videorotate', undefined, '돌리기')]
      ]
    },
    {
      label: t('videotool.group.out', undefined, '뽑아내기'),
      jobs: [
        ['video2gif', t('videotool.part.video2gif', undefined, 'GIF 만들기')],
        ['video2img', t('videotool.part.video2img', undefined, '사진 뽑기')],
        ['video2audio', t('videotool.part.video2audio', undefined, '소리 추출')],
        ['subtitle', t('videotool.part.subtitle', undefined, '자막')]
      ]
    },
    {
      label: t('videotool.group.make', undefined, '만들기'),
      jobs: [['screenrec', t('videotool.part.screenrec', undefined, '화면 녹화')]]
    }
  ];

  /** 영상을 안 들고 와도 되는 할 일 — 없는 데서 영상을 **만드는** 쪽. */
  const NO_VIDEO_NEEDED = new Set(['screenrec']);

  /** 필름 스트립 장수. 늘리면 예뻐지지만 큰 영상에서 오래 걸린다(한 장마다 되감아 그린다). */
  const FRAMES = 8;

  Toolbox.register({
    id: 'videotool',
    title: t('widgets.videotool.title', undefined, '영상 도구'),
    category: 'tool',
    desc: t(
      'widgets-desc.videotool.desc',
      undefined,
      '영상을 GIF 로 만들고, 구간을 자르고, 소리를 뽑고, 화면을 녹화합니다. 영상이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>',
    tabs: [
      {
        id: 'app',
        label: t('videotool.tab', undefined, '영상'),
        build: function (container: HTMLElement): void {
          void loadNamespace('videotool').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    injectStyles();
    materialShell(container, {
      id: 'videotool',
      accept: 'video/*',
      groups: GROUPS,
      noInputNeeded: NO_VIDEO_NEEDED,
      accepts: /^video\//i,
      drop: {
        title: t('videotool.drop.title', undefined, '영상을 여기에 놓거나 눌러서 고르세요'),
        hint: t('videotool.drop.hint', undefined, '영상이 이 브라우저를 벗어나지 않습니다')
      },
      labels: {
        change: t('videotool.btn.change', undefined, '바꾸기'),
        recent: t('videotool.btn.recent', undefined, '방금 하던 것'),
        back: t('videotool.btn.back', undefined, '할 일 고르기'),
        chain: t('videotool.btn.chain', undefined, '이 결과로 이어서'),
        fail: t('videotool.preview.fail', undefined, '이 영상은 미리 못 봅니다')
      },
      preview: drawStrip
    });
  }

  /** 왼쪽 칸 = 재생기 + 필름 스트립. **이 함수만 영상을 안다.** */
  async function drawStrip(file: File, box: HTMLElement, alive: () => boolean): Promise<string> {
    const probe = await loadVideo(file);
    if (!alive()) return '';
    const m = metaOf(probe);

    /* 보는 용 재생기는 따로 둔다 — 스트립을 뽑는 쪽은 계속 되감기므로 같이 쓰면 화면이 튄다 */
    const player = document.createElement('video');
    player.className = 'vd-player';
    player.id = 'vdPlayer';
    player.controls = true;
    player.preload = 'metadata';
    player.src = URL.createObjectURL(file);
    box.appendChild(player);

    const strip = document.createElement('div');
    strip.className = 'vd-strip';
    strip.id = 'vdStrip';
    box.appendChild(strip);

    /* 한 장씩 **나오는 대로** 붙인다 — 여덟 장을 다 뽑고 붙이면 그동안 빈 칸만 보인다 */
    void filmstrip(probe, FRAMES, 220, (i, canvas, at) => {
      if (!alive()) return;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'vd-frame';
      cell.dataset.at = at.toFixed(2);
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      cell.appendChild(canvas);
      const tag = document.createElement('span');
      tag.textContent = mmss(at);
      cell.appendChild(tag);
      /* 눌러서 그 자리부터 — 스트립은 보는 것만이 아니라 **옮겨 가는 자리**다 */
      cell.onclick = (): void => {
        player.currentTime = at;
        void player.play();
      };
      strip.appendChild(cell);
    });

    return t(
      'videotool.meta',
      { time: mmss(m.duration), w: m.width, h: m.height, size: fileSize(file.size) },
      `${mmss(m.duration)} · ${m.width}×${m.height} · ${fileSize(file.size)}`
    );
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const el = document.createElement('style');
    el.textContent = `
.vd-player{width:100%;max-height:38vh;border-radius:10px;background:#000;display:block;margin-bottom:8px;}
.vd-strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px;}
.vd-frame{position:relative;appearance:none;padding:0;cursor:pointer;background:#000;line-height:0;
  border:1px solid rgba(128,128,128,.3);border-radius:6px;overflow:hidden;}
.vd-frame:hover{border-color:rgba(128,160,255,.75);box-shadow:0 0 0 2px rgba(128,160,255,.25);}
.vd-frame span{position:absolute;right:3px;bottom:3px;font-size:10px;line-height:1;padding:2px 4px;
  border-radius:4px;background:rgba(0,0,0,.65);color:#fff;}
`;
    document.head.appendChild(el);
  }
})();
