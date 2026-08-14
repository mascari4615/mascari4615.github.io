/**
 * 글 읽어 주기 (TASK-KL-316 / 32)
 *
 * 「글」 작업대의 **내보내기** 칸. 자르기·시간 어림은 `core/tts`.
 *
 * ⚠ **파일로 저장은 못 한다.** 브라우저의 읽어 주기(`speechSynthesis`)는 소리를 스피커로 보낼 뿐,
 * 그 소리를 우리에게 **주지 않는다**(오디오 스트림이 없다). 「mp3 저장」 버튼을 만들어 놓고
 * 안 되는 것보다, 안 된다고 적고 되는 길(화면 녹화·시스템 녹음)을 알려 주는 게 낫다.
 *
 * 긴 글은 문장으로 잘라 하나씩 넘긴다 — 통째로 넘기면 크롬이 중간에 멎는다.
 */
import { asClock, guessLanguage, seconds, split } from '../../core/tts';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'tts',
    title: t('widgets.tts.title', undefined, '글 읽어 주기'),
    category: 'tool',
    desc: t(
      'widgets-desc.tts.desc',
      undefined,
      '적은 글을 소리 내어 읽어 줍니다. 문장마다 따라가며 보여 주고, 목소리·속도를 고를 수 있습니다'
    ),
    layout: 'wide',
    icon: '<path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M16.5 9.5a4 4 0 0 1 0 5M19 7a7.5 7.5 0 0 1 0 10" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('tts.tab', undefined, '읽어 주기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('tts').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('tts.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="ttText">${esc(t('tts.label.text'))}</label>
        <textarea id="ttText" name="text" aria-label="${esc(t('tts.label.text'))}" class="mono-input" style="min-height:160px;"></textarea>
      </div>
      <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <label class="field-label" for="ttVoice">${esc(t('tts.label.voice'))}</label>
          <select id="ttVoice" name="voice" aria-label="${esc(t('tts.label.voice'))}"></select>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('tts.label.rate'))} <span id="ttRateVal" class="range-value">1.0×</span></div>
          <input type="range" id="ttRate" name="rate" aria-label="${esc(t('tts.label.rate'))}" min="0.5" max="2" step="0.1" value="1" style="width:180px;">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('tts.label.pitch'))} <span id="ttPitchVal" class="range-value">1.0</span></div>
          <input type="range" id="ttPitch" name="pitch" aria-label="${esc(t('tts.label.pitch'))}" min="0.5" max="1.8" step="0.1" value="1" style="width:140px;">
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        <button class="btn btn-primary" id="ttPlay">${esc(t('tts.btn.play'))}</button>
        <button class="btn btn-ghost" id="ttPause">${esc(t('tts.btn.pause'))}</button>
        <button class="btn btn-ghost" id="ttStop">${esc(t('tts.btn.stop'))}</button>
      </div>
      <div id="ttLines" class="tool-list" style="max-height:260px; overflow:auto;"></div>
      <div class="tool-status" id="ttStatus">${esc(t('tts.status.idle'))}</div>
      <p style="font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('tts.note.noSave'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const textBox = $<HTMLTextAreaElement>('#ttText');
    const status = $<HTMLElement>('#ttStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let sentences: string[] = [];
    let at = -1;

    function fillVoices(): void {
      const voices = speechSynthesis.getVoices();
      const language = guessLanguage(textBox.value);
      /* 글에 맞는 목소리를 앞에 둔다 — 한글을 영어 목소리로 읽으면 알아들을 수 없다. */
      const sorted = [...voices].sort((a, b) => Number(b.lang.startsWith(language)) - Number(a.lang.startsWith(language)));
      $<HTMLSelectElement>('#ttVoice').innerHTML = sorted
        .map((v, i) => '<option value="' + i + '">' + esc(v.name + '  (' + v.lang + ')') + '</option>')
        .join('');
      (($<HTMLSelectElement>('#ttVoice') as unknown) as { _voices?: SpeechSynthesisVoice[] })._voices = sorted;
      if (voices.length === 0) status.textContent = t('tts.status.noVoice');
    }

    function paint(): void {
      $<HTMLElement>('#ttLines').innerHTML = sentences
        .map(
          (s, i) =>
            '<div class="tool-list-row" style="background:' + (i === at ? 'rgba(70,140,255,.14)' : 'transparent') + '">' +
            '<span class="tool-list-key">' + (i + 1) + '</span><span class="tool-list-val">' + esc(s) + '</span></div>'
        )
        .join('');
    }

    function refresh(): void {
      sentences = split(textBox.value);
      const rate = Number($<HTMLInputElement>('#ttRate').value);
      $<HTMLElement>('#ttRateVal').textContent = rate.toFixed(1) + '×';
      $<HTMLElement>('#ttPitchVal').textContent = Number($<HTMLInputElement>('#ttPitch').value).toFixed(1);
      const clock = asClock(seconds(textBox.value, rate));
      paint();
      status.textContent =
        sentences.length === 0
          ? t('tts.status.idle')
          : t('tts.status.ready', { n: sentences.length, m: clock.minutes, s: clock.seconds });
    }

    function speakFrom(index: number): void {
      if (index >= sentences.length) {
        at = -1;
        paint();
        status.textContent = t('tts.status.done');
        return;
      }
      at = index;
      paint();
      const utter = new SpeechSynthesisUtterance(sentences[index]);
      const picked = (($<HTMLSelectElement>('#ttVoice') as unknown) as { _voices?: SpeechSynthesisVoice[] })._voices;
      const voice = picked?.[Number($<HTMLSelectElement>('#ttVoice').value)];
      if (voice !== undefined) {
        utter.voice = voice;
        utter.lang = voice.lang;
      }
      utter.rate = Number($<HTMLInputElement>('#ttRate').value);
      utter.pitch = Number($<HTMLInputElement>('#ttPitch').value);
      /* 한 문장이 끝나면 다음 문장 — 통째로 넘기면 중간에 멎는다(크롬의 오래된 버릇). */
      utter.onend = (): void => speakFrom(index + 1);
      utter.onerror = (): void => {
        status.textContent = t('tts.status.failed');
      };
      speechSynthesis.speak(utter);
      status.textContent = t('tts.status.speaking', { i: index + 1, n: sentences.length });
    }

    textBox.addEventListener('input', refresh);
    container.querySelectorAll('input[type="range"]').forEach((el) => el.addEventListener('input', refresh));
    $<HTMLButtonElement>('#ttPlay').onclick = (): void => {
      refresh();
      if (sentences.length === 0) return;
      speechSynthesis.cancel();
      speakFrom(0);
    };
    $<HTMLButtonElement>('#ttPause').onclick = (): void => {
      if (speechSynthesis.paused) {
        speechSynthesis.resume();
        status.textContent = t('tts.status.resumed');
        return;
      }
      speechSynthesis.pause();
      status.textContent = t('tts.status.paused');
    };
    $<HTMLButtonElement>('#ttStop').onclick = (): void => {
      speechSynthesis.cancel();
      at = -1;
      paint();
      status.textContent = t('tts.status.stopped');
    };

    speechSynthesis.addEventListener('voiceschanged', fillVoices);
    fillVoices();
    refresh();
    Toolbox.onDispose?.(() => speechSynthesis.cancel());
  }
})();
