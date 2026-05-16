/**
 * 알람 위젯 — TASK-KL-064 (Free Alarm Clock 레퍼런스).
 *
 * 설정/관리 UI (목록 CRUD · 시각 · 반복요일 · 라벨 · 사운드 · 볼륨 · 스누즈 ·
 * OS 강제기상 · autostart). 발화는 Rust 상주 스케줄러가 별 풀스크린 창
 * (#alarm-fire, alarm-fire.ts)으로 처리 — 본 위젯 탭이 닫혀 있어도 울린다.
 *
 * 데스크톱(Tauri) 전용. 웹에서는 안내만.
 */
import { invoke as tauriInvoke } from '../tauri-bridge';

(function (): void {
  'use strict';

  type Alarm = {
    id: string;
    label: string;
    hour: number;
    minute: number;
    enabled: boolean;
    repeat: number[]; // 0=월 .. 6=일 (chrono num_days_from_monday)
    sound_path: string | null;
    volume: number;
    snooze_minutes: number;
    force_wake: boolean;
  };

  const DOW = ['월', '화', '수', '목', '금', '토', '일'];

  function newId(): string {
    return 'al-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function blankAlarm(): Alarm {
    return {
      id: newId(),
      label: '',
      hour: 7,
      minute: 0,
      enabled: true,
      repeat: [],
      sound_path: null,
      volume: 100,
      snooze_minutes: 9,
      force_wake: true
    };
  }

  function fmtTime(h: number, m: number): string {
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function fmtRepeat(repeat: number[]): string {
    if (repeat.length === 0) return '1회성';
    if (repeat.length === 7) return '매일';
    return [...repeat].sort((a, b) => a - b).map((d) => DOW[d]).join('·');
  }

  function build(container: HTMLElement): void {
    Mdd.injectCSS(
      'kl-alarm',
      `
      .kl-alarm-root { max-width: 720px; }
      .kl-alarm-intro { font-size: var(--font-size-sm); color: var(--text-tertiary); margin: 0 0 16px; line-height: 1.5; }
      .kl-alarm-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
      .kl-alarm-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); }
      .kl-alarm-item[data-off="1"] { opacity: 0.55; }
      .kl-alarm-time { font-size: 26px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; min-width: 84px; }
      .kl-alarm-meta { flex: 1; min-width: 0; }
      .kl-alarm-label { font-size: var(--font-size-sm); color: var(--text-primary); font-weight: 600; }
      .kl-alarm-sub { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: 2px; }
      .kl-alarm-toggle { position: relative; width: 40px; height: 22px; border-radius: 11px; border: none; background: var(--bg-quaternary, var(--bg-tertiary)); cursor: pointer; flex: none; }
      .kl-alarm-toggle[data-on="1"] { background: var(--accent, #4a9); }
      .kl-alarm-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .15s; }
      .kl-alarm-toggle[data-on="1"]::after { transform: translateX(18px); }
      .kl-alarm-btns { display: flex; gap: 4px; flex: none; }
      .kl-alarm-mini { padding: 4px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-secondary); font-size: var(--font-size-xs); cursor: pointer; }
      .kl-alarm-mini:hover { border-color: var(--accent); color: var(--text-primary); }
      .kl-alarm-form { padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); margin-bottom: 14px; display: none; }
      .kl-alarm-form[data-open="1"] { display: block; }
      .kl-alarm-grid { display: grid; grid-template-columns: 120px 1fr; gap: 10px 12px; align-items: center; }
      .kl-alarm-fl { font-size: var(--font-size-sm); color: var(--text-secondary); font-weight: 600; }
      .kl-alarm-in, .kl-alarm-sel { padding: 5px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-sm); font-family: inherit; }
      .kl-alarm-time-in { width: 64px; text-align: center; font-variant-numeric: tabular-nums; }
      .kl-alarm-days { display: flex; gap: 4px; flex-wrap: wrap; }
      .kl-alarm-day { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); font-size: var(--font-size-xs); cursor: pointer; }
      .kl-alarm-day[data-sel="1"] { background: var(--accent, #4a9); color: #fff; border-color: var(--accent, #4a9); }
      .kl-alarm-chk { display: inline-flex; align-items: center; gap: 6px; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer; }
      .kl-alarm-row-inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .kl-alarm-actions { display: flex; justify-content: space-between; gap: 8px; margin-top: 14px; }
      .kl-alarm-btn { padding: 6px 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary); font-size: var(--font-size-sm); font-weight: 600; cursor: pointer; }
      .kl-alarm-btn-primary { background: var(--accent, var(--bg-tertiary)); color: var(--accent-fg, #fff); border-color: var(--accent, var(--border)); }
      .kl-alarm-btn-danger { color: var(--error, #c55); border-color: var(--error-subtle, var(--border)); }
      .kl-alarm-add { padding: 8px 16px; border: 1px dashed var(--border); border-radius: var(--radius-md); background: transparent; color: var(--text-secondary); font-size: var(--font-size-sm); cursor: pointer; width: 100%; }
      .kl-alarm-add:hover { border-color: var(--accent); color: var(--text-primary); }
      .kl-alarm-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); }
      .kl-alarm-log { margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--bg-tertiary); border: 1px solid var(--border); font-size: var(--font-size-xs); color: var(--text-secondary); white-space: pre-wrap; }
      .kl-alarm-log-err { border-color: var(--error-subtle); color: var(--error); }
      .kl-alarm-empty { padding: 24px; text-align: center; color: var(--text-tertiary); font-size: var(--font-size-sm); }
      `
    );

    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'kl-alarm-root';
    root.innerHTML =
      '<p class="kl-alarm-intro">설정한 시각에 KarmoLab이 (트레이 최소화·앱 닫힘 무관) 강제로 깨웁니다. ' +
      'OS 강제기상 = 절전에서 PC 깨우기 + 모니터 ON + 볼륨 강제·음소거 무시.</p>';

    const list = document.createElement('div');
    list.className = 'kl-alarm-list';
    root.appendChild(list);

    const form = document.createElement('div');
    form.className = 'kl-alarm-form';
    root.appendChild(form);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'kl-alarm-add';
    addBtn.textContent = '+ 알람 추가';
    root.appendChild(addBtn);

    const bottom = document.createElement('div');
    bottom.className = 'kl-alarm-bottom';
    const autoLabel = document.createElement('label');
    autoLabel.className = 'kl-alarm-chk';
    const autoChk = document.createElement('input');
    autoChk.type = 'checkbox';
    autoLabel.appendChild(autoChk);
    autoLabel.appendChild(
      document.createTextNode(' Windows 시작 시 자동 실행 (재부팅 후 알람 보장)')
    );
    bottom.appendChild(autoLabel);
    root.appendChild(bottom);

    const log = document.createElement('div');
    log.className = 'kl-alarm-log';
    log.style.display = 'none';
    root.appendChild(log);
    container.appendChild(root);

    function setLog(text: string, isErr: boolean): void {
      log.style.display = 'block';
      log.className = 'kl-alarm-log' + (isErr ? ' kl-alarm-log-err' : '');
      log.textContent = text;
    }

    const isApp = typeof Toolbox.isDesktopApp === 'function' && Toolbox.isDesktopApp();
    if (!isApp) {
      list.innerHTML =
        '<div class="kl-alarm-empty">웹 브라우저에서는 사용할 수 없습니다. KarmoLab Tauri 앱으로 열어 주세요.</div>';
      addBtn.disabled = true;
      autoChk.disabled = true;
      return;
    }

    let alarms: Alarm[] = [];

    function renderList(): void {
      list.innerHTML = '';
      if (alarms.length === 0) {
        list.innerHTML = '<div class="kl-alarm-empty">알람이 없습니다. 아래에서 추가하세요.</div>';
        return;
      }
      for (const a of alarms) {
        const item = document.createElement('div');
        item.className = 'kl-alarm-item';
        item.dataset.off = a.enabled ? '0' : '1';

        const time = document.createElement('div');
        time.className = 'kl-alarm-time';
        time.textContent = fmtTime(a.hour, a.minute);
        item.appendChild(time);

        const meta = document.createElement('div');
        meta.className = 'kl-alarm-meta';
        const lbl = document.createElement('div');
        lbl.className = 'kl-alarm-label';
        lbl.textContent = a.label || '(라벨 없음)';
        const sub = document.createElement('div');
        sub.className = 'kl-alarm-sub';
        const bits = [fmtRepeat(a.repeat)];
        if (a.force_wake) bits.push('강제기상');
        if (a.snooze_minutes > 0) bits.push('스누즈 ' + a.snooze_minutes + '분');
        bits.push(a.sound_path ? '커스텀음' : '기본음');
        sub.textContent = bits.join(' · ');
        meta.appendChild(lbl);
        meta.appendChild(sub);
        item.appendChild(meta);

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'kl-alarm-toggle';
        toggle.dataset.on = a.enabled ? '1' : '0';
        toggle.title = a.enabled ? '켜짐' : '꺼짐';
        toggle.addEventListener('click', () => {
          void tauriInvoke('alarm_set_enabled', { id: a.id, enabled: !a.enabled })
            .then(reload)
            .catch((e: unknown) => fail('on/off 실패', e));
        });
        item.appendChild(toggle);

        const btns = document.createElement('div');
        btns.className = 'kl-alarm-btns';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'kl-alarm-mini';
        edit.textContent = '편집';
        edit.addEventListener('click', () => openForm(a));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'kl-alarm-mini';
        del.textContent = '삭제';
        del.addEventListener('click', () => {
          void tauriInvoke('alarm_remove', { id: a.id })
            .then(reload)
            .catch((e: unknown) => fail('삭제 실패', e));
        });
        btns.appendChild(edit);
        btns.appendChild(del);
        item.appendChild(btns);

        list.appendChild(item);
      }
    }

    function openForm(src: Alarm): void {
      const a: Alarm = { ...src, repeat: [...src.repeat] };
      form.dataset.open = '1';
      form.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'kl-alarm-grid';

      function addRow(labelText: string, control: HTMLElement): void {
        const fl = document.createElement('div');
        fl.className = 'kl-alarm-fl';
        fl.textContent = labelText;
        grid.appendChild(fl);
        grid.appendChild(control);
      }

      // 시각
      const timeWrap = document.createElement('div');
      timeWrap.className = 'kl-alarm-row-inline';
      const hIn = document.createElement('input');
      hIn.type = 'number';
      hIn.className = 'kl-alarm-in kl-alarm-time-in';
      hIn.min = '0';
      hIn.max = '23';
      hIn.value = String(a.hour);
      const mIn = document.createElement('input');
      mIn.type = 'number';
      mIn.className = 'kl-alarm-in kl-alarm-time-in';
      mIn.min = '0';
      mIn.max = '59';
      mIn.value = String(a.minute);
      timeWrap.appendChild(hIn);
      timeWrap.appendChild(document.createTextNode(':'));
      timeWrap.appendChild(mIn);
      addRow('시각', timeWrap);

      // 라벨
      const labelIn = document.createElement('input');
      labelIn.type = 'text';
      labelIn.className = 'kl-alarm-in';
      labelIn.style.width = '100%';
      labelIn.placeholder = '예: 기상 / 약 먹기';
      labelIn.value = a.label;
      addRow('라벨', labelIn);

      // 반복 요일
      const days = document.createElement('div');
      days.className = 'kl-alarm-days';
      const dayBtns: HTMLButtonElement[] = [];
      for (let d = 0; d < 7; d++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'kl-alarm-day';
        b.textContent = DOW[d];
        b.dataset.sel = a.repeat.includes(d) ? '1' : '0';
        b.addEventListener('click', () => {
          b.dataset.sel = b.dataset.sel === '1' ? '0' : '1';
        });
        dayBtns.push(b);
        days.appendChild(b);
      }
      addRow('반복 (없으면 1회성)', days);

      // 사운드 경로 (.wav, 비우면 기본음)
      const soundWrap = document.createElement('div');
      soundWrap.className = 'kl-alarm-row-inline';
      const soundIn = document.createElement('input');
      soundIn.type = 'text';
      soundIn.className = 'kl-alarm-in';
      soundIn.style.flex = '1';
      soundIn.placeholder = 'C:\\...\\wake.wav (비우면 기본음)';
      soundIn.spellcheck = false;
      soundIn.value = a.sound_path ?? '';
      const browse = document.createElement('button');
      browse.type = 'button';
      browse.className = 'kl-alarm-mini';
      browse.textContent = '찾아보기';
      browse.addEventListener('click', () => {
        const dlg = (window as unknown as { __TAURI__?: { dialog?: { open?: unknown } } })
          .__TAURI__?.dialog;
        const openFn =
          dlg && typeof dlg.open === 'function'
            ? (dlg.open as (o: unknown) => Promise<unknown>)
            : null;
        if (!openFn) {
          fail('파일 선택 불가', new Error('Tauri dialog 없음'));
          return;
        }
        void openFn({
          multiple: false,
          directory: false,
          filters: [{ name: 'WAV 사운드', extensions: ['wav'] }]
        }).then((sel) => {
          if (typeof sel === 'string' && sel.length > 0) soundIn.value = sel;
        });
      });
      soundWrap.appendChild(soundIn);
      soundWrap.appendChild(browse);
      addRow('사운드 (.wav)', soundWrap);

      // 볼륨
      const volWrap = document.createElement('div');
      volWrap.className = 'kl-alarm-row-inline';
      const volIn = document.createElement('input');
      volIn.type = 'range';
      volIn.min = '0';
      volIn.max = '100';
      volIn.value = String(a.volume);
      const volVal = document.createElement('span');
      volVal.style.minWidth = '40px';
      volVal.textContent = a.volume + '%';
      volIn.addEventListener('input', () => {
        volVal.textContent = volIn.value + '%';
      });
      volWrap.appendChild(volIn);
      volWrap.appendChild(volVal);
      addRow('볼륨', volWrap);

      // 스누즈 분
      const snzIn = document.createElement('input');
      snzIn.type = 'number';
      snzIn.className = 'kl-alarm-in kl-alarm-time-in';
      snzIn.min = '0';
      snzIn.max = '60';
      snzIn.value = String(a.snooze_minutes);
      addRow('스누즈 (분, 0=없음)', snzIn);

      // OS 강제기상
      const fwLabel = document.createElement('label');
      fwLabel.className = 'kl-alarm-chk';
      const fwChk = document.createElement('input');
      fwChk.type = 'checkbox';
      fwChk.checked = a.force_wake;
      fwLabel.appendChild(fwChk);
      fwLabel.appendChild(
        document.createTextNode(' 절전 깨우기 + 모니터 ON + 볼륨 강제·음소거 무시')
      );
      addRow('OS 강제기상', fwLabel);

      form.appendChild(grid);

      const actions = document.createElement('div');
      actions.className = 'kl-alarm-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'kl-alarm-btn';
      cancel.textContent = '취소';
      cancel.addEventListener('click', () => {
        form.dataset.open = '0';
        form.innerHTML = '';
      });
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'kl-alarm-btn kl-alarm-btn-primary';
      save.textContent = '저장';
      save.addEventListener('click', () => {
        const hour = Math.max(0, Math.min(23, parseInt(hIn.value, 10) || 0));
        const minute = Math.max(0, Math.min(59, parseInt(mIn.value, 10) || 0));
        const repeat: number[] = [];
        dayBtns.forEach((b, d) => {
          if (b.dataset.sel === '1') repeat.push(d);
        });
        const out: Alarm = {
          id: a.id,
          label: labelIn.value.trim(),
          hour,
          minute,
          enabled: src.enabled,
          repeat,
          sound_path: soundIn.value.trim() || null,
          volume: Math.max(0, Math.min(100, parseInt(volIn.value, 10) || 100)),
          snooze_minutes: Math.max(0, Math.min(60, parseInt(snzIn.value, 10) || 0)),
          force_wake: fwChk.checked
        };
        void tauriInvoke('alarm_upsert', { alarm: out })
          .then(() => {
            form.dataset.open = '0';
            form.innerHTML = '';
            return reload();
          })
          .catch((e: unknown) => fail('저장 실패', e));
      });
      actions.appendChild(cancel);
      actions.appendChild(save);
      form.appendChild(actions);
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function fail(msg: string, e: unknown): void {
      const m = e instanceof Error ? e.message : String(e);
      setLog(msg + ': ' + m, true);
      Toolbox.showToast?.('알람 ' + msg, 'error', e);
    }

    function reload(): Promise<void> {
      return tauriInvoke<Alarm[]>('alarm_list')
        .then((res) => {
          alarms = Array.isArray(res) ? res : [];
          renderList();
        })
        .catch((e: unknown) => fail('목록 로드 실패', e));
    }

    addBtn.addEventListener('click', () => openForm(blankAlarm()));

    autoChk.addEventListener('change', () => {
      void tauriInvoke('alarm_set_autostart', { enabled: autoChk.checked })
        .then(() => setLog('autostart ' + (autoChk.checked ? '켜짐' : '꺼짐'), false))
        .catch((e: unknown) => {
          autoChk.checked = !autoChk.checked;
          fail('autostart 변경 실패', e);
        });
    });

    void tauriInvoke<boolean>('alarm_get_autostart')
      .then((v) => {
        autoChk.checked = v === true;
      })
      .catch(() => {
        /* 기본 표시 유지 */
      });
    void reload();
  }

  Toolbox.register({
    id: 'alarm',
    title: '알람',
    category: 'desktop',
    desc: '강제 기상 데스크톱 알람 (Free Alarm Clock 레퍼런스, TASK-KL-064) — 상주 스케줄러 + OS 강제기상 + autostart',
    layout: 'form',
    icon: '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 9v4l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 3 2 6M19 3l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [{ id: 'alarm-main', label: '알람', build }]
  });
})();
