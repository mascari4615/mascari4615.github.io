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
        ['idphoto', t('image.part.idphoto', undefined, '증명사진')],
        ['docscan', t('image.part.docscan', undefined, '서류 스캔')],
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
        ['bgremove', t('image.part.bgremove', undefined, '배경 지우기')],
        ['redact', t('image.part.redact', undefined, '가리개')],
        ['exifclean', t('image.part.exifclean', undefined, '촬영 정보 지우기')]
      ]
    },
    {
      label: t('image.group.look', undefined, '살펴보기'),
      jobs: [
        ['palette', t('image.part.palette', undefined, '색 뽑기')],
        ['comparepic', t('image.part.comparepic', undefined, '두 장 비교')],
        ['ocr', t('image.part.ocr', undefined, '글자 읽기')],
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
      id: 'image',
      accept: 'image/*',
      multiple: true,
      groups: GROUPS,
      noInputNeeded: NO_IMAGE_NEEDED,
      accepts: /^image\//i,
      drop: {
        title: t('image.drop.title', undefined, '사진을 여기에 놓거나 눌러서 고르세요'),
        hint: t('image.drop.hint', undefined, '사진은 이 브라우저를 벗어나지 않습니다')
      },
      labels: {
        change: t('image.btn.change', undefined, '바꾸기'),
        recent: t('image.btn.recent', undefined, '방금 하던 것'),
        back: t('image.btn.back', undefined, '할 일 고르기'),
        chain: t('image.btn.chain', undefined, '이 결과로 이어서'),
        more: t('image.more', undefined, '{name} 외 {n}개'),
        fail: t('image.preview.fail', undefined, '이 그림은 미리 못 봅니다')
      },
      preview: drawShot
    });

    /* 결과가 나오면 **전/후로 바꿔 보여 준다** (TASK-KL-285).
     * 껍데기는 그때 「이 결과로 이어서」 줄을 세운다 — 그 옆에서 눈으로 재고 결정하게 한다. */
    const onResult = (e: Event): void => {
      const d = (e as CustomEvent).detail as { type?: string } | undefined;
      if (!d || !/^image\//i.test(d.type || '') || !held) return;
      const item = Toolbox.peekResult?.();
      if (!item || !item.blob) return;
      const box = container.querySelector<HTMLElement>('#pfPreview');
      if (!box) return;
      compare(box, { url: held.url, size: held.file.size }, { url: URL.createObjectURL(item.blob), size: item.blob.size });
    };
    window.addEventListener('karmolab-result', onResult);
    Toolbox.onDispose?.(() => window.removeEventListener('karmolab-result', onResult));
  }

  /** 지금 손에 든 사진 — 결과가 나오면 이것과 견준다 */
  let held: { file: File; url: string } | null = null;

  /** 왼쪽 칸 = 사진 한 장 + 치수. **이 함수만 이미지를 안다.** */
  async function drawShot(file: File, box: HTMLElement, alive: () => boolean): Promise<string> {
    const img = await loadImage(file);
    if (!alive()) return '';
    held = { file, url: img.src };
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

  /**
   * **전/후 손잡이** (TASK-KL-285 — Squoosh 를 보고).
   *
   * Squoosh 의 값어치는 압축 자체가 아니라 **「이만큼 줄였는데 눈에 보이나」를 그 자리에서 판단**하게
   * 해 주는 데 있다. 가운데 손잡이를 끌어 원본과 결과를 겹쳐 본다. 숫자(용량)도 같이 붙인다 —
   * 「30% 줄었다」와 「눈에 안 보인다」가 **같은 화면에** 있어야 결정이 선다.
   *
   * 결과가 나온 순간에만 뜬다. 우리 껍데기는 그때 「이 결과로 이어서」 줄을 세우는데,
   * 그 옆에서 **정말 이어받아도 되는지**를 눈으로 재게 해 준다.
   */
  function compare(box: HTMLElement, before: { url: string; size: number }, after: { url: string; size: number }): void {
    box.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'im-cmp';
    wrap.id = 'imCmp';

    const a = document.createElement('img');
    a.src = before.url;
    a.className = 'im-cmp-a';
    const bWrap = document.createElement('div');
    bWrap.className = 'im-cmp-clip';
    bWrap.id = 'imCmpClip';
    const b = document.createElement('img');
    b.src = after.url;
    b.className = 'im-cmp-b';
    bWrap.appendChild(b);

    const bar = document.createElement('div');
    bar.className = 'im-cmp-bar';
    bar.id = 'imCmpBar';

    const tagA = document.createElement('span');
    tagA.className = 'im-cmp-tag im-cmp-tag-a';
    tagA.textContent = t('image.cmp.before', { size: fileSize(before.size) }, `전 ${fileSize(before.size)}`);
    const tagB = document.createElement('span');
    tagB.className = 'im-cmp-tag im-cmp-tag-b';
    const cut = before.size > 0 ? Math.round((1 - after.size / before.size) * 100) : 0;
    tagB.textContent =
      t('image.cmp.after', { size: fileSize(after.size) }, `후 ${fileSize(after.size)}`) +
      (cut > 0 ? ` (−${cut}%)` : cut < 0 ? ` (+${-cut}%)` : '');

    wrap.appendChild(a);
    wrap.appendChild(bWrap);
    wrap.appendChild(bar);
    wrap.appendChild(tagA);
    wrap.appendChild(tagB);
    box.appendChild(wrap);

    /* 손잡이는 **끌지 않아도 움직인다** — 위에 손가락을 얹고 지나가기만 해도 따라온다.
     * 「끌어야 한다」를 모르는 사람이 절반이라, 지나가다 우연히 알게 되는 편이 낫다. */
    const put = (clientX: number): void => {
      const r = wrap.getBoundingClientRect();
      wrap.style.setProperty('--cw', `${r.width}px`);
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      bWrap.style.width = `${p * 100}%`;
      bar.style.left = `${p * 100}%`;
      wrap.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    };
    wrap.addEventListener('pointermove', (e) => put(e.clientX));
    wrap.addEventListener('pointerdown', (e) => put(e.clientX));

    /* **자판으로도 민다** (TASK-KL-294). 손잡이를 끌거나 위에 손가락을 얹는 건 마우스·터치가
     * 있어야 하는 조작이다 — 그것만 두면 「얼마나 달라졌나」를 볼 길이 통째로 막힌다.
     * 화살표로 5%씩, Home/End 로 끝까지. 슬라이더라고 밝혀 두면 낭독기가 값도 읽어 준다. */
    let pos = 50;
    const setPct = (p: number): void => {
      pos = Math.min(100, Math.max(0, p));
      bWrap.style.width = `${pos}%`;
      bar.style.left = `${pos}%`;
      wrap.setAttribute('aria-valuenow', String(Math.round(pos)));
    };
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'slider');
    wrap.setAttribute('aria-valuemin', '0');
    wrap.setAttribute('aria-valuemax', '100');
    wrap.setAttribute('aria-label', t('image.cmp.aria', undefined, '전/후 견주기 — 화살표로 밀어 보세요'));
    wrap.addEventListener('keydown', (e) => {
      const k = e.key;
      const step = k === 'ArrowRight' ? 5 : k === 'ArrowLeft' ? -5 : 0;
      if (step) {
        e.preventDefault();
        setPct(pos + step);
        return;
      }
      if (k === 'Home' || k === 'End') {
        e.preventDefault();
        setPct(k === 'Home' ? 0 : 100);
      }
    });
    put(wrap.getBoundingClientRect().left + wrap.getBoundingClientRect().width / 2);
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
.im-cmp{position:relative;width:100%;overflow:hidden;border-radius:10px;cursor:ew-resize;
  border:1px solid rgba(128,128,128,.28);line-height:0;background:#111;}
.im-cmp img{width:100%;height:auto;max-height:56vh;object-fit:contain;display:block;}
.im-cmp-clip{position:absolute;inset:0;width:50%;overflow:hidden;}
/* 잘리는 쪽 그림은 **바깥 칸의 너비**를 그대로 써야 두 장이 겹친다 —
   50% 칸에 넣고 width:100% 를 주면 그림이 반으로 줄어 「전/후」가 아니라 「크고 작고」가 된다. */
.im-cmp-clip img{width:var(--cw,100%);max-width:none;}
.im-cmp-b{position:absolute;left:0;top:0;}
.im-cmp-bar{position:absolute;top:0;bottom:0;left:50%;width:2px;background:#fff;box-shadow:0 0 6px rgba(0,0,0,.6);}
.im-cmp-tag{position:absolute;bottom:6px;font-size:11px;line-height:1;padding:3px 6px;border-radius:5px;
  background:rgba(0,0,0,.66);color:#fff;pointer-events:none;}
.im-cmp-tag-a{right:6px;}
.im-cmp-tag-b{left:6px;}
.im-zoom{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.8);cursor:zoom-out;
  display:flex;align-items:center;justify-content:center;padding:16px;}
.im-zoom-inner{position:relative;max-width:100%;}
.im-zoom-inner img{max-width:100%;max-height:84vh;height:auto;}
.im-zoom-tag{position:absolute;left:0;top:-22px;font-size:12px;color:#fff;opacity:.8;}
`;
    document.head.appendChild(el);
  }
})();
