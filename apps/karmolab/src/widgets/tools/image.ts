/**
 * 이미지 — **사진 하나, 할 일은 골라서** (TASK-KL-088 → TASK-KL-261 에서 PDF 와 같은 화면으로)
 *
 * 전에는 여기도 탭이었다(편집·먹·글자 카드·크기·가리개·아스키·AI·보관함). PDF 에서 겪은 것과
 * 같은 두 가지가 나빴다: **탭을 옮기면 사진을 다시 올려야** 했고, 무엇이 있는지 보려면 탭을
 * 다 읽어야 했다. 그래서 순서를 뒤집는다 — **손에 든 사진이 먼저, 할 일은 그다음.**
 *
 * 껍데기는 `shared/material-shell` 하나를 PDF 와 **같이** 쓴다. 이 파일에 남은 것은
 * 「이미지다움」뿐이다: 무엇을 받나 · 왼쪽에 무엇을 그리나 · 할 일 목록.
 *
 * 왼쪽에 그리는 것 = **사진 그 자체와 치수**. 이미지 작업의 판단 기준은 늘 「지금 몇 픽셀인가,
 * 얼마나 무거운가」다 — 크기를 줄일지, 형식을 바꿀지가 거기서 갈린다(Squoosh 도 화면 아래에
 * 늘 이 숫자를 붙여 둔다). 눌러서 크게 본다.
 */
import { loadImage } from './shared/image';
import { fileSize } from './shared/media';
import { materialShell, type MaterialGroup } from './shared/material-shell';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /** 할 일 — 갈래별로 묶어 격자에 놓는다. 새 도구는 여기 한 줄. */
  const GROUPS = (): MaterialGroup[] => [
    {
      label: t('image.group.size', undefined, '크기·모양'),
      jobs: [
        ['imgresize', t('image.part.imgresize', undefined, '크기 맞추기')],
        ['imgmerge', t('image.part.imgmerge', undefined, '여러 장 합치기')],
        ['favicon', t('image.part.favicon', undefined, '파비콘 만들기')]
      ]
    },
    {
      label: t('image.group.convert', undefined, '바꾸기'),
      jobs: [
        ['imageedit', t('image.part.imgbatch', undefined, '편집 · 형식 변환')],
        ['img2pdf', t('image.part.img2pdf', undefined, '이미지 → PDF')],
        ['asciiart', t('image.part.asciiart', undefined, '아스키 아트')]
      ]
    },
    {
      label: t('image.group.hide', undefined, '가리기·지우기'),
      jobs: [
        ['redact', t('image.part.redact', undefined, '가리개')],
        ['exifclean', t('image.part.exifclean', undefined, '촬영 정보 지우기')]
      ]
    },
    {
      label: t('image.group.look', undefined, '살펴보기'),
      jobs: [
        ['palette', t('image.part.palette', undefined, '색 뽑기')],
        ['comparepic', t('image.part.comparepic', undefined, '두 장 비교')],
        ['qrread', t('image.part.qrread', undefined, 'QR 읽기')]
      ]
    },
    {
      label: t('image.group.make', undefined, '만들기'),
      jobs: [
        ['text2img', t('image.part.text2img', undefined, '글자 카드')],
        ['meok', t('image.part.meok', undefined, '먹')],
        ['imagegen', t('image.part.aigen', undefined, 'AI 생성')],
        ['imagelib', t('image.part.store', undefined, '보관함')]
      ]
    }
  ];

  /** 사진을 안 들고 와도 되는 할 일 — 없는 데서 이미지를 **만드는** 쪽. */
  const NO_IMAGE_NEEDED = new Set(['text2img', 'meok', 'imagegen', 'imagelib']);

  Toolbox.register({
    id: 'image',
    title: t('widgets.image.title', undefined, '이미지'),
    category: 'tool',
    desc: t(
      'widgets-desc.image.desc',
      undefined,
      '편집·형식 변환, 아스키 아트, AI 생성과 보관함을 한 곳에서'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8.5" cy="9" r="1.6" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 17l4.5-4.5 3 3L15 12l5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('image.tab', undefined, '이미지'),
        build: function (container: HTMLElement): void {
          void loadNamespace('image').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    injectStyles();
    materialShell(container, {
      accept: 'image/*',
      groups: GROUPS,
      noInputNeeded: NO_IMAGE_NEEDED,
      accepts: /^image\//i,
      drop: {
        title: t('image.drop.title', undefined, '사진을 여기에 놓거나 눌러서 고르세요'),
        hint: t('image.drop.hint', undefined, '사진은 이 브라우저를 벗어나지 않습니다')
      },
      labels: {
        change: t('image.btn.change', undefined, '바꾸기'),
        back: t('image.btn.back', undefined, '할 일 고르기'),
        chain: t('image.btn.chain', undefined, '이 결과로 이어서'),
        fail: t('image.preview.fail', undefined, '이 그림은 미리 못 봅니다')
      },
      preview: drawShot
    });
  }

  /** 왼쪽 칸 = 사진 한 장 + 치수. **이 함수만 이미지를 안다.** */
  async function drawShot(file: File, box: HTMLElement, alive: () => boolean): Promise<string> {
    const img = await loadImage(file);
    if (!alive()) return '';
    const frame = document.createElement('button');
    frame.type = 'button';
    frame.className = 'im-shot';
    frame.id = 'imShot';
    img.className = 'im-shot-img';
    frame.appendChild(img);
    frame.onclick = (): void => zoom(file.name, img.src);
    box.appendChild(frame);
    return t(
      'image.meta',
      { w: img.naturalWidth, h: img.naturalHeight, size: fileSize(file.size) },
      `${img.naturalWidth}×${img.naturalHeight} · ${fileSize(file.size)}`
    );
  }

  /** 눌러서 크게 — 작게만 보면 「이 사진이 맞나」를 확인할 수가 없다. */
  function zoom(name: string, src: string): void {
    const back = document.createElement('div');
    back.className = 'im-zoom';
    back.id = 'imZoom';
    const inner = document.createElement('div');
    inner.className = 'im-zoom-inner';
    const tag = document.createElement('span');
    tag.className = 'im-zoom-tag';
    tag.textContent = name;
    const big = document.createElement('img');
    big.src = src;
    inner.appendChild(tag);
    inner.appendChild(big);
    back.appendChild(inner);
    back.onclick = (): void => back.remove();
    document.body.appendChild(back);
  }

  let styled = false;
  function injectStyles(): void {
    if (styled) return;
    styled = true;
    const el = document.createElement('style');
    el.textContent = `
.im-shot{appearance:none;padding:6px;width:100%;cursor:zoom-in;line-height:0;
  border:1px solid rgba(128,128,128,.28);border-radius:10px;background:
  repeating-conic-gradient(rgba(128,128,128,.14) 0% 25%, transparent 0% 50%) 50%/16px 16px;}
.im-shot:hover{border-color:rgba(128,160,255,.7);}
.im-shot-img{width:100%;height:auto;max-height:56vh;object-fit:contain;}
.im-zoom{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.8);cursor:zoom-out;
  display:flex;align-items:center;justify-content:center;padding:16px;}
.im-zoom-inner{position:relative;max-width:100%;}
.im-zoom-inner img{max-width:100%;max-height:84vh;height:auto;}
.im-zoom-tag{position:absolute;left:0;top:-22px;font-size:12px;color:#fff;opacity:.8;}
`;
    document.head.appendChild(el);
  }
})();
