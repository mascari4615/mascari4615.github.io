/**
 * page 표면 — 벤더 세션을 한 단 위에서 보는 방.
 * 말·SSE 는 face.html 이 그대로 가진다. 여기는 레인·설정만.
 */
export async function mountDesk() {
  const lanesEl = document.getElementById('lanes');
  const bar = document.getElementById('bar');
  const barWho = document.getElementById('barWho');
  const barSub = document.getElementById('barSub');
  const setBtn = document.getElementById('setBtn');
  const set = document.getElementById('set');
  const setWho = document.getElementById('setWho');
  const setBrain = document.getElementById('setBrain');
  const setTools = document.getElementById('setTools');
  const setWork = document.getElementById('setWork');
  const setNote = document.getElementById('setNote');
  const setKnown = document.getElementById('setKnown');
  const peek = document.getElementById('peek');
  const text = document.getElementById('text');
  if (lanesEl === null || bar === null) return;

  lanesEl.hidden = false;
  bar.hidden = false;

  let desk = null;
  let looking = 'work';

  async function load() {
    try {
      desk = await (await fetch('/desk')).json();
    } catch {
      desk = { brain: '?', tools: '?', workDir: '', character: null, lanes: [] };
    }
    draw();
  }

  function draw() {
    const raw = Array.isArray(desk?.lanes) ? desk.lanes : [];
    const seen = new Set();
    const lanes = [];
    for (const lane of raw) {
      if (seen.has(lane.id)) continue;
      seen.add(lane.id);
      lanes.push(lane);
    }
    lanesEl.replaceChildren();
    for (const lane of lanes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lane' + (lane.id === looking ? ' on' : '') + (lane.here ? ' here' : '');
      btn.title = `${lane.title}\n${lane.detail}`;
      btn.dataset.id = lane.id;
      const mark = document.createElement('i');
      mark.textContent = lane.kind === 'room' ? (lane.id === 'work' ? '일' : '말') : lane.vendor === 'grok' ? 'G' : 'C';
      const name = document.createElement('span');
      name.textContent = lane.here ? '여기' : lane.title;
      btn.append(mark, name);
      btn.addEventListener('click', () => look(lane));
      lanesEl.append(btn);
    }

    if (desk?.room && (looking === 'work' || looking === 'talk' || looking === 'room')) looking = desk.room;
    const current = lanes.find((l) => l.id === looking) ?? lanes[0];
    if (current) {
      barWho.textContent = current.kind === 'room' ? current.title : current.title;
      barSub.textContent = current.kind === 'room'
        ? `${desk.character || '동반자'} · ${current.id === 'work' ? '코딩 CLI' : '곁에'} · ${desk.brain}`
        : current.here
          ? `${current.detail} · 지금 이 창`
          : `${current.detail} · 내려다보기`;
    }

    if (setBrain) setBrain.textContent = String(desk.brain ?? '');
    if (setTools) setTools.textContent = desk.tools === 'work' ? '일함 (손 있음)' : '말만';
    if (setWork) {
      setWork.textContent = String(desk.workDir ?? '');
      setWork.title = String(desk.workDir ?? '');
    }
    if (setNote) {
      setNote.textContent = current?.kind === 'room'
        ? (current.id === 'work'
          ? '일 방. 코딩 CLI 가 손을 쓴다. 벤더 세션 목록을 대신하지 않는다.'
          : '말 방. 손은 꺼 둔다. 곁에 있는 자리.')
        : '이 세션에 글을 넣지 않는다. 말은 일/말 방에서 한다.';
    }
    if (setTools) {
      setTools.textContent = current?.id === 'talk' || desk.tools === 'talk' ? '말만 (손 없음)' : '일함 (손 있음)';
    }
    if (text) {
      const inRoom = current?.kind === 'room';
      text.placeholder = inRoom
        ? (current.id === 'work' ? '이 일에 말하기…' : '곁에서 말하기…')
        : '내려다보는 중 · 일/말 방을 눌러';
      text.disabled = !inRoom;
    }
    if (peek) {
      peek.hidden = current?.kind === 'room';
      peek.textContent = current && current.kind !== 'room'
        ? (current.here
          ? '지금 이 Grok 창이다. 말은 일/말 방으로 오고, 이 세션 자체에는 끼지 않는다.'
          : `${current.title} 의 Grok 세션을 내려다보는 중. 대화는 벤더 앱 안에 있다.`)
        : '';
    }
  }

  async function look(lane) {
    if (lane.kind === 'room') {
      await fetch('/room?id=' + encodeURIComponent(lane.id), { method: 'POST' });
      await load();
      if (typeof window.replaceHistory === 'function') await window.replaceHistory();
    } else {
      looking = lane.id;
      draw();
    }
    document.getElementById('text')?.focus();
  }

  setBtn?.addEventListener('click', () => {
    const open = document.body.classList.toggle('set-open');
    if (set) set.hidden = !open;
    setBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  setKnown?.addEventListener('click', () => {
    document.getElementById('knownBtn')?.click();
  });

  try {
    const { list, current } = await (await fetch('/characters')).json();
    if (setWho) {
      setWho.innerHTML = '';
      for (const name of list ?? []) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === current) opt.selected = true;
        setWho.append(opt);
      }
      setWho.addEventListener('change', async () => {
        await fetch('/characters/switch?name=' + encodeURIComponent(setWho.value), { method: 'POST' });
        const who = document.getElementById('whoPick');
        if (who) who.value = setWho.value;
        await load();
      });
    }
  } catch {
    /* 인격 목록이 없어도 방은 말한다 */
  }

  await load();
}
