/**
 * 소리 — **한 파일, 할 일은 골라서** (TASK-KL-088 → TASK-KL-269)
 *
 * 녹음 → 자르기 → 크기 맞추기 → 잇기 는 대개 **이어서** 하는 일이다. 그런데 탭으로 갈라져
 * 있어서 한 단계 넘어갈 때마다 파일을 다시 올려야 했다 — 이어서 하는 일에서 제일 나쁜 모양이다.
 *
 * 그래서 다른 재료와 같은 껍데기(`shared/material-shell`)로 옮겼다. 한 번 올리면 따라가고,
 * 도구가 결과를 내놓으면 **그 결과를 손에 든 파일로 갈아 끼운다**(자르고 → 그 결과를 다듬고).
 * 소리는 그 이어붙이기가 가장 자연스러운 재료다.
 *
 * 왼쪽 칸은 **파형**이다(AudioMass·TwistedWave 가 보여 주는 그 그림). 소리는 눈에 안 보이는
 * 재료라, 파형이 없으면 「어디가 말하는 데고 어디가 빈 데인지」를 **들어 봐야만** 안다.
 * 봉우리를 보면 자를 자리가 한눈에 보인다.
 */
import { materialShell, type MaterialGroup } from './shared/material-shell';
import { attachMedia, drawWave, fileSize, loadAudioInfo, mmss, peaks } from './shared/media';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const GROUPS = (): MaterialGroup[] => [
    {
      label: t('sound.group.edit', undefined, '다듬기'),
      jobs: [
        ['audiocut', t('sound.part.audiocut', undefined, '자르기')],
        ['audiofade', t('sound.part.audiofade', undefined, '페이드')],
        ['audiolevel', t('sound.part.audiolevel', undefined, '크기 맞추기')],
        ['audiospeed', t('sound.part.audiospeed', undefined, '속도')]
      ]
    },
    {
      label: t('sound.group.join', undefined, '붙이기·바꾸기'),
      jobs: [
        ['audiojoin', t('sound.part.audiojoin', undefined, '잇기')],
        ['video2audio', t('sound.part.video2audio', undefined, '영상에서 소리 뽑기')]
      ]
    },
    {
      label: t('sound.group.make', undefined, '만들기'),
      jobs: [
        ['voicerec', t('sound.part.voicerec', undefined, '녹음')],
        ['soundscape', t('sound.part.soundscape', undefined, '환경음')],
        ['morse', t('sound.part.morse', undefined, '모스 부호')]
      ]
    }
  ];

  /** 소리를 안 들고 와도 되는 할 일 — 없는 데서 소리를 **만드는** 쪽. */
  const NO_SOUND_NEEDED = new Set(['voicerec', 'soundscape', 'morse']);

  Toolbox.register({
    id: 'sound',
    title: t('widgets.sound.title', undefined, '소리 도구'),
    category: 'tool',
    desc: t(
      'widgets-desc.sound.desc',
      undefined,
      '녹음하고 자르고 크기를 맞추고 잇습니다. MP3·WAV 로 저장하며 파일이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<path d="M4 12h2l2-5 3 12 3-16 3 14 2-5h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('sound.tab', undefined, '소리'),
        build: function (container: HTMLElement): void {
          void loadNamespace('sound').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    injectStyles();
    materialShell(container, {
      id: 'sound',
      accept: 'audio/*',
      multiple: true,
      groups: GROUPS,
      noInputNeeded: NO_SOUND_NEEDED,
      accepts: /^audio\//i,
      drop: {
        title: t('sound.drop.title', undefined, '소리 파일을 여기에 놓거나 눌러서 고르세요'),
        hint: t('sound.drop.hint', undefined, '파일이 이 브라우저를 벗어나지 않습니다')
      },
      labels: {
        change: t('sound.btn.change', undefined, '바꾸기'),
        recent: t('sound.btn.recent', undefined, '방금 하던 것'),
        back: t('sound.btn.back', undefined, '할 일 고르기'),
        chain: t('sound.btn.chain', undefined, '이 결과로 이어서'),
        more: t('sound.more', undefined, '{name} 외 {n}개'),
        fail: t('sound.preview.fail', undefined, '이 소리는 미리 못 봅니다')
      },
      preview: drawWaveform
    });
  }

  /** 왼쪽 칸 = 파형 + 재생기. **이 함수만 소리를 안다.** */
  async function drawWaveform(file: File, box: HTMLElement, alive: () => boolean): Promise<string> {
    const player = document.createElement('audio');
    player.className = 'sd-player';
    player.id = 'sdPlayer';
    player.controls = true;
    attachMedia(player, file); // 공용 — 앞 주소를 거두고 물린다
    box.appendChild(player);

    const wrap = document.createElement('div');
    wrap.className = 'sd-wave-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'sd-wave';
    canvas.id = 'sdWave';
    canvas.width = 480;
    canvas.height = 120;
    wrap.appendChild(canvas);
    /* 지금 듣고 있는 자리를 파형 위에 세운다 — 소리와 그림이 따로 놀면 파형이 장식이 된다 */
    const cursor = document.createElement('div');
    cursor.className = 'sd-cursor';
    cursor.id = 'sdCursor';
    wrap.appendChild(cursor);
    box.appendChild(wrap);

    const { buffer, rate } = await loadAudioInfo(file);
    if (!alive()) return '';
    drawWave(canvas, peaks(buffer, 240));

    player.ontimeupdate = (): void => {
      const p = buffer.duration ? player.currentTime / buffer.duration : 0;
      cursor.style.left = `${Math.min(100, p * 100)}%`;
    };
    /* 파형을 눌러 그 자리로 — 파형은 보는 것만이 아니라 **옮겨 가는 자리**다 */
    canvas.onclick = (e): void => {
      const rect = canvas.getBoundingClientRect();
      player.currentTime = ((e.clientX - rect.left) / rect.width) * buffer.duration;
      void player.play();
    };

    /* **자판으로도 옮겨 간다** (TASK-KL-294). 파형을 누르는 건 마우스가 있어야 하는 조작이라,
     * 그것만 두면 「여기서부터 들어 보기」가 막힌다. 화살표 5초 · Home/End · 스페이스로 듣고 멈추기.
     * (재생기 자체에도 자판 길이 있지만, 파형에 초점이 갔을 때 아무 반응이 없으면 막힌 것처럼 느낀다.) */
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute('aria-label', t('sound.wave.aria', undefined, '소리 그림 — 화살표로 옮겨 가고 스페이스로 듣습니다'));
    canvas.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowLeft') {
        e.preventDefault();
        player.currentTime = Math.min(buffer.duration, Math.max(0, player.currentTime + (k === 'ArrowRight' ? 5 : -5)));
      } else if (k === 'Home' || k === 'End') {
        e.preventDefault();
        player.currentTime = k === 'Home' ? 0 : Math.max(0, buffer.duration - 0.1);
      } else if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        if (player.paused) void player.play();
        else player.pause();
      }
    });

    /* 재생 장치의 값이 아니라 **파일의** 값이다 — 그래야 컴퓨터마다 다른 수가 안 적힌다 */
    const kHz = Math.round(rate / 100) / 10;
    return t(
      'sound.meta',
      {
        time: mmss(buffer.duration),
        ch: buffer.numberOfChannels,
        khz: kHz,
        size: fileSize(file.size)
      },
      `${mmss(buffer.duration)} · ${buffer.numberOfChannels === 1 ? '모노' : '스테레오'} · ${kHz}kHz · ${fileSize(file.size)}`
    );
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const el = document.createElement('style');
    el.textContent = `
.sd-player{width:100%;display:block;margin-bottom:10px;}
.sd-wave-wrap{position:relative;border:1px solid rgba(128,128,128,.22);border-radius:10px;
  background:rgba(128,128,128,.06);overflow:hidden;}
.sd-wave{display:block;width:100%;height:120px;cursor:pointer;}
.sd-cursor{position:absolute;top:0;bottom:0;left:0;width:2px;background:rgba(255,120,120,.9);
  pointer-events:none;transition:left .1s linear;}
`;
    document.head.appendChild(el);
  }
})();
