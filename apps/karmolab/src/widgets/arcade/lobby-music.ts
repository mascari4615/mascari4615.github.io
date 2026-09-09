import { t } from '../../lib/i18n';

/** 로비 전용 임시 신스. 위젯 종료 시 오디오와 예약 작업 회수 */
export function mountLobbyMusic(home: HTMLElement, signal: AbortSignal): void {
  const button = document.createElement('button');
  button.className = 'ac-lobby-music';
  button.setAttribute('aria-label', t('arcade.btn.sound'));
  home.querySelector('.ac-hometop')!.prepend(button);
  let enabled = true;
  let context: AudioContext | undefined;
  let output: GainNode | undefined;
  let timer: number | undefined;
  let next = 0;
  let step = 0;
  const voices = new Set<OscillatorNode>();
  const visible = (): boolean => !document.hidden && home.getClientRects().length > 0;
  const label = (): void => { button.textContent = enabled ? '♪ ON' : '♪ OFF'; button.setAttribute('aria-pressed', String(enabled)); };
  function stop(): void {
    window.clearInterval(timer); timer = undefined;
    voices.forEach(voice => { try { voice.stop(); } catch { /* already stopped */ } });
    voices.clear();
    if (context?.state === 'running') void context.suspend();
  }
  function tone(midi: number, time: number, length: number, level: number): void {
    if (!context || !output) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(level, time + .1);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + length);
    oscillator.connect(envelope); envelope.connect(output);
    voices.add(oscillator); oscillator.start(time); oscillator.stop(time + length);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
  }
  function schedule(): void {
    if (!context || !visible() || !enabled) { stop(); return; }
    const chords = [[48, 55, 59, 62], [45, 52, 55, 59], [41, 48, 52, 55], [43, 50, 57, 62]];
    while (next < context.currentTime + .15) {
      const chord = chords[Math.floor(step / 8) % chords.length]!;
      if (step % 8 === 0) chord.forEach(n => tone(n, next, 5, .025));
      if (step % 2 === 0) tone(chord[1 + Math.floor(step / 2) % 3]! + 12, next, 1.5, .02);
      step++; next += .75;
    }
  }
  async function play(): Promise<void> {
    if (signal.aborted || !enabled || !visible()) return;
    try {
      if (!context) { context = new AudioContext(); output = context.createGain(); output.gain.value = .22; output.connect(context.destination); }
      await context.resume();
      if (signal.aborted || !enabled || !visible()) return;
      if (timer === undefined) { next = context.currentTime + .1; schedule(); timer = window.setInterval(schedule, 100); }
    } catch { button.textContent = '♪'; }
  }
  button.addEventListener('click', () => { enabled = !enabled; label(); if (enabled) void play(); else stop(); }, { signal });
  document.addEventListener('pointerdown', () => { void play(); }, { signal });
  document.addEventListener('keydown', () => { void play(); }, { signal });
  document.addEventListener('visibilitychange', () => { if (visible()) void play(); else stop(); }, { signal });
  const observer = new MutationObserver(() => { if (visible()) { if (context) void play(); } else stop(); });
  observer.observe(home, { attributes: true, attributeFilter: ['style'] });
  if (home.parentElement) observer.observe(home.parentElement, { attributes: true, attributeFilter: ['style'] });
  signal.addEventListener('abort', () => { observer.disconnect(); stop(); if (context && context.state !== 'closed') void context.close(); }, { once: true });
  label();
}
