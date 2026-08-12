/** Karmo Studio — KarmoLab 안에서 곡을 끝까지 만드는 브라우저 DAW (TASK-KL-220). */
import { KarmoStudioEngine, renderProject, type StudioAssetRuntime } from './audio-engine';
import {
  automationValueAt, clampTrackHeight, cloneClip, nextClipColor, findClip, findTrack, legatoNotes, moveTrack, newProject, newTrack, normalizeProject, projectLength, keyToPitch, putAutomationPoint, putMarker, quantizeNotes, setNoteVelocity, selectionRange, snapBeat, sortMarkers, splitClip, stepMarker, tapTempo, studioId, transposeNotes,
  TRACK_HEIGHT, type AutomationParam, type StudioClip, type StudioProject, type StudioSelection, type StudioTrack
} from './model';
import { toWav } from '../tools/shared/media';
import { addAsset, hydrateAssets, importPortable, loadProject, portableProject, saveProject } from './storage';
import { ProjectHistory } from './history';
import { KARMO_STUDIO_CSS } from './styles';
import { KARMO_STUDIO_SHELL } from './shell';
import { GestureHost } from './gesture';
import { shortcutsHtml } from './shortcuts';
import { describeInputs, parseMidiMessage } from './midi';
import { buildPianoView, initialScrollTop, PIANO_GEOMETRY } from './piano-view';
import { automationHtml, automationPickerHtml, automationValue, clipHtml, laneHint, visibleClips, waveformPath, waveformSvg, waveMissing } from './arranger-view';
import { analysePeak, applyGain, clampBuffer, exportRange, normalizeGain, stemFileName, uniqueNames, type ExportRangeMode } from './export';
import { clipMarks, dragRect, isBoxDrag, markMode, noteMarks, rectOverlaps, type ClipRef, type NoteRef } from './selection';

(function (): void {
  const esc = (value: unknown): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const icon = '<path d="M3 17V7M7 20V4M11 15V9M15 19V5M19 14V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2 12h20" stroke="currentColor" stroke-width="1" opacity=".35"/>';

  Mdd.injectCSS('karmo-studio', KARMO_STUDIO_CSS);

  Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta?.('karmo-studio') || {}), id: 'karmo-studio', title: 'Karmo Studio', category: 'lab',
    desc: '녹음부터 편곡·믹싱·WAV 출력까지 한 프로젝트에서 완성하는 브라우저 DAW', layout: 'full', icon,
    accepts: ['audio/*', 'application/json'], produces: ['audio/wav', 'application/json'],
    tabs: [{ id: 'app', label: 'Karmo Studio', build(container: HTMLElement): void { buildStudio(container); } }]
  });

  function buildStudio(container: HTMLElement): void {
    let project = loadProject() || newProject();
    let selection: StudioSelection = { type: 'clip', trackId: project.tracks[0].id, clipId: project.tracks[0].clips[0].id };
    let playhead = 0; let pxPerBeat = 72; let sideMode: 'inspector' | 'mixer' = 'inspector';let editTool:'draw'|'select'|'slice'='draw'; let assets = new Map<string, StudioAssetRuntime>();
    let raf: number | undefined; let saveTimer: number | undefined; let recording: MediaRecorder | null = null; let recordChunks: Blob[] = []; let recordStart = 0;
    let armedTrackId=''; let taps:number[]=[]; let stepMode=false; let stepOctave=4; let stepBeat=0; let stepAdded:string[]=[]; let midiOn=false; let midiLabel='MIDI 건반 연결'; let metronome=false; let countIn=false; const autoLanes=new Map<string,AutomationParam>();
    let exportOptions={range:'song' as ExportRangeMode,sampleRate:44100,mono:false,normalize:true,stems:false};
    let editorExpanded = false; let editorScrollTop = 0; let editorScrollLeft = 0; let editorClipId = ''; let pianoPxPerBeat = pxPerBeat;
    let editorReturnFocus: HTMLElement | null = null;
    /** 끌기는 언제나 한 판만 산다 — 겹치면 앞 판이 취소된다. */
    const gestures = new GestureHost(window as unknown as { addEventListener(t:string,f:(e:PointerEvent)=>void):void; removeEventListener(t:string,f:(e:PointerEvent)=>void):void });
    /** 묶음 clipboard — 상대 간격을 보존하려고 기준점(origin)을 함께 들고 있는다. */
    let clipboard:
      |{type:'clips';origin:number;items:{sourceTrackId:string;kind:StudioTrack['kind'];clip:StudioClip}[]}
      |{type:'notes';origin:number;notes:StudioClip['notes']}
      |null=null;
    const engine = new KarmoStudioEngine();
    const history = new ProjectHistory(project, normalizeProject);
    const marks = clipMarks();
    /** marks 는 arranger 에서 실제로 표시된 clip 묶음. focus(selection) 가 묶음 밖으로 나가면 그 하나로 접힌다. */
    function reconcileMarks(): void { marks.prune((ref)=>Boolean(findClip(project,ref.trackId,ref.clipId))); if(selection&&(selection.type==='clip'||selection.type==='note')){const ref={trackId:selection.trackId,clipId:selection.clipId};if(!marks.has(ref))marks.replace([ref]);}else marks.clear(); }
    function markedRefs(): ClipRef[] { reconcileMarks(); return marks.list(); }
    function markedClips(): { track: StudioTrack; clip: StudioClip }[] { return markedRefs().flatMap((ref)=>{const track=findTrack(project,ref.trackId);const clip=findClip(project,ref.trackId,ref.clipId);return track&&clip?[{track,clip}]:[];}); }
    const noteSel = noteMarks();
    /** piano roll 은 clip 하나만 그린다 — 편집 중인 clip 밖의 note 표시는 살려 둘 이유가 없다. */
    function reconcileNotes(): void { const clip=selectedClip(); noteSel.prune((ref)=>Boolean(clip&&ref.clipId===clip.id&&clip.notes.some((note)=>note.id===ref.noteId))); if(selection?.type==='note'){const ref={clipId:selection.clipId,noteId:selection.noteId};if(!noteSel.has(ref))noteSel.replace([ref]);}else noteSel.clear(); }
    function markedNotes(): { clip: StudioClip; note: StudioClip['notes'][number] }[] { reconcileNotes(); const clip=selectedClip(); if(!clip)return []; return noteSel.list().flatMap((ref)=>{const note=clip.notes.find((item)=>item.id===ref.noteId);return note?[{clip,note}]:[];}); }
    /** 도구가 손댈 음 — 고른 게 있으면 그것만, 없으면 클립 전체. */
    function noteTargets(): { clip: StudioClip; notes: StudioClip['notes'] } | null {
      const clip=selectedClip();if(!clip||clip.kind!=='midi')return null;
      const marked=markedNotes().map((item)=>item.note);
      return { clip, notes: marked.length?marked:clip.notes };
    }
    function applyNoteTool(act: string): void {
      const target=noteTargets();
      if(!target||!target.notes.length){status('Open a MIDI clip first');return;}
      const { clip, notes }=target;const scope=notes.length===clip.notes.length?'clip':`${notes.length} notes`;
      if(act==='midi'){void connectMidi();return;}
      if(act==='step'){stepMode=!stepMode;stepBeat=0;stepAdded=[];renderEditor();status(stepMode?'자판 건반 켬 — Z~M 아랫줄 · Q~I 윗줄 · ←→ 자리 이동 · Backspace 지우기':'자판 건반 끔');return;}
      if(act==='quantize'||act==='quantize-half'){
        const moved=quantizeNotes(notes,project.snap,act==='quantize'?1:0.5);
        status(moved?`Quantized ${moved} of ${scope}`:'Already on the grid');
      } else if(act==='legato'){
        const changed=legatoNotes(notes,clip.duration);
        status(changed?`Legato · ${changed} notes`:'Nothing to stretch');
      } else {
        const step=act==='up'?1:act==='down'?-1:act==='octave-up'?12:-12;
        const moved=transposeNotes(notes,step,36,84);
        status(moved?`Transposed ${scope} by ${moved > 0?'+':''}${moved}`:'Pitch range reached');
      }
      for(const note of notes)note.beat=Math.max(0,Math.min(clip.duration-note.duration,note.beat));
      saveSoon(`note-tool:${act}`);renderEditor();renderTracks();renderSide();
    }

    container.innerHTML = KARMO_STUDIO_SHELL;
    const root = container.querySelector('.ks-root') as HTMLElement;
    const $ = <T extends HTMLElement>(selector: string): T => root.querySelector(selector) as T;
    const status = (message: string): void => { $<HTMLElement>('[data-role=status]').textContent = message; };
    const saveSoon = (mergeKey = ''): void => { history.record(project,mergeKey);engine.updateProject(project);if (saveTimer !== undefined) clearTimeout(saveTimer); saveTimer = window.setTimeout(() => { try { saveProject(project); status('Saved locally'); } catch (_) { status('Local save is full — export the project'); } }, 250); };
    const restoreHistory = (direction: 'undo'|'redo'): void => { const result=direction==='undo'?history.undo(project):history.redo(project);if(!result.changed){status(direction==='undo'?'Nothing to undo':'Nothing to redo');return;}project=result.value;selection=project.tracks[0]?{type:'track',trackId:project.tracks[0].id}:null;engine.updateProject(project);if(saveTimer!==undefined)clearTimeout(saveTimer);saveTimer=window.setTimeout(()=>saveProject(project),250);renderAll();void refreshAssets();status(direction==='undo'?'Undone':'Redone'); };
    const beatText = (beat: number): string => { const bar = Math.floor(beat / project.beatsPerBar) + 1; const within = beat % project.beatsPerBar; return `${bar}.${Math.floor(within) + 1}.${String(Math.floor((within % 1) * 100)).padStart(2, '0')}`; };
    const trackWidth = (): number => Math.max(900, projectLength(project) * pxPerBeat);

    function selectedTrack(): StudioTrack | undefined { return selection ? findTrack(project, selection.trackId) : undefined; }
    function selectedClip(): StudioClip | undefined { return selection?.type === 'clip' || selection?.type === 'note' ? findClip(project, selection.trackId, selection.clipId) : undefined; }
    function copySelection(): boolean {
      if(selection?.type==='note'){
        const chosen=markedNotes();if(!chosen.length)return false;
        const notes=chosen.map((item)=>({...item.note}));
        clipboard={type:'notes',origin:Math.min(...notes.map((note)=>note.beat)),notes};
        status(notes.length>1?`${notes.length} notes copied`:'MIDI note copied');return true;
      }
      if(selection?.type==='clip'){
        const chosen=markedClips();if(!chosen.length)return false;
        const items=chosen.map((item)=>({sourceTrackId:item.track.id,kind:item.track.kind,clip:cloneClip(item.clip,item.clip.start)}));
        clipboard={type:'clips',origin:Math.min(...items.map((item)=>item.clip.start)),items};
        status(items.length>1?`${items.length} clips copied`:'Clip copied');return true;
      }
      return false;
    }
    function pasteClipboard(): boolean {
      if(!clipboard){status('Clipboard is empty');return false;}
      const at=snapBeat(playhead,project.snap);
      if(clipboard.type==='clips'){
        const selected=selectedTrack();const pasted:ClipRef[]=[];
        for(const item of clipboard.items){
          const source=findTrack(project,item.sourceTrackId);
          const target=selected?.kind===item.kind?selected:source;
          if(!target)continue;
          const copy=cloneClip(item.clip,Math.max(0,at+(item.clip.start-clipboard.origin)));
          copy.trackId=target.id;target.clips.push(copy);pasted.push({trackId:target.id,clipId:copy.id});
        }
        if(!pasted.length){status('Compatible track not found');return false;}
        marks.replace(pasted);selection={type:'clip',trackId:pasted[0].trackId,clipId:pasted[0].clipId};
        status(pasted.length>1?`Pasted ${pasted.length} clips at ${beatText(at)}`:`Pasted clip at ${beatText(at)}`);
      } else {
        const clip=selectedClip();const track=selectedTrack();
        if(!clip||clip.kind!=='midi'||!track){status('Select a MIDI clip before pasting a note');return false;}
        const base=Math.max(0,snapBeat(at-clip.start,project.snap));const pasted:NoteRef[]=[];
        for(const source of clipboard.notes){
          const beat=Math.max(0,Math.min(clip.duration-source.duration,base+(source.beat-clipboard.origin)));
          const note={...source,id:studioId('note'),beat};clip.notes.push(note);pasted.push({clipId:clip.id,noteId:note.id});
        }
        if(!pasted.length)return false;
        noteSel.replace(pasted);selection={type:'note',trackId:track.id,clipId:clip.id,noteId:pasted[0].noteId};
        status(pasted.length>1?`Pasted ${pasted.length} notes at ${beatText(clip.start+base)}`:`Pasted note at ${beatText(clip.start+base)}`);
      }
      saveSoon();renderAll();return true;
    }
    function cutSelection(): void { const kind=selection?.type; if(!copySelection())return; deleteSelection(); status(kind==='note'?(clipboard?.type==='notes'&&clipboard.notes.length>1?`${clipboard.notes.length} notes cut`:'MIDI note cut'):(clipboard?.type==='clips'&&clipboard.items.length>1?`${clipboard.items.length} clips cut`:'Clip cut')); }
    function duplicateSelection(): void { if(selection?.type==='note'){const chosen=markedNotes();const clip=selectedClip();const track=selectedTrack();if(clip&&track&&chosen.length){const begin=Math.min(...chosen.map((item)=>item.note.beat));const end=Math.max(...chosen.map((item)=>item.note.beat+item.note.duration));const shift=snapBeat(Math.max(end-begin,project.snap),project.snap);const copies=chosen.map((item)=>{const copy={...item.note,id:studioId('note'),beat:Math.max(0,Math.min(clip.duration-item.note.duration,snapBeat(item.note.beat+shift,project.snap)))};clip.notes.push(copy);return copy;});noteSel.replace(copies.map((copy)=>({clipId:clip.id,noteId:copy.id})));selection={type:'note',trackId:track.id,clipId:clip.id,noteId:copies[0].id};if(copies.length>1)status(`Duplicated ${copies.length} notes`);saveSoon();renderEditor();renderTracks();renderSide();}return;}const chosen=markedClips();if(!chosen.length)return;const span=chosen.reduce((end,item)=>Math.max(end,item.clip.start+item.clip.duration),0)-chosen.reduce((begin,item)=>Math.min(begin,item.clip.start),Infinity);const shift=snapBeat(Math.max(span,project.snap),project.snap);const copies=chosen.map((item)=>{const copy=cloneClip(item.clip,Math.max(0,snapBeat(item.clip.start+shift,project.snap)));item.track.clips.push(copy);return {trackId:item.track.id,clipId:copy.id};});marks.replace(copies);selection={type:'clip',trackId:copies[0].trackId,clipId:copies[0].clipId};if(copies.length>1)status(`Duplicated ${copies.length} clips`);saveSoon();renderAll(); }
    function addPianoNote(event: MouseEvent): boolean { if(editTool==='select')return false;const target=event.target as HTMLElement;const piano=target.closest<HTMLElement>('[data-piano]');const clip=selectedClip();const track=selectedTrack();if(!piano||!clip||clip.kind!=='midi'||!track||target.closest('.ks-note,.ks-key,.ks-piano-ruler'))return false;const rect=piano.firstElementChild!.getBoundingClientRect();const pitch=Math.max(PIANO_GEOMETRY.low,Math.min(PIANO_GEOMETRY.high,PIANO_GEOMETRY.high-Math.floor((event.clientY-rect.top-PIANO_GEOMETRY.rulerHeight)/PIANO_GEOMETRY.row)));const beat=snapBeat((event.clientX-rect.left-PIANO_GEOMETRY.keyWidth)/pianoPxPerBeat,project.snap);if(beat<0||beat>=clip.duration)return false;const existing=clip.notes.find((note)=>note.pitch===pitch&&Math.abs(note.beat-beat)<project.snap/2);if(existing){selection={type:'note',trackId:track.id,clipId:clip.id,noteId:existing.id};renderEditor();renderSide();return true;}const note={id:studioId('note'),beat,duration:Math.min(project.snap*2,clip.duration-beat),pitch,velocity:.8};clip.notes.push(note);selection={type:'note',trackId:track.id,clipId:clip.id,noteId:note.id};void engine.preview(track,pitch);saveSoon();renderEditor();renderTracks();renderSide();return true; }
    function createMidiClip(track:StudioTrack,start:number,open=false):StudioClip { const snapped=snapBeat(start,project.snap);const existing=track.clips.find((clip)=>clip.kind==='midi'&&Math.abs(clip.start-snapped)<project.snap/2);if(existing){selection={type:'clip',trackId:track.id,clipId:existing.id};renderAll();if(open)setEditorExpanded(true);return existing;}const clip:StudioClip={id:studioId('clip'),trackId:track.id,kind:'midi',name:'MIDI Clip',start:snapped,duration:project.beatsPerBar,offset:0,notes:[],gain:1,fadeIn:0,fadeOut:0,mute:false,locked:false};track.clips.push(clip);selection={type:'clip',trackId:track.id,clipId:clip.id};saveSoon();renderAll();if(open)setEditorExpanded(true);return clip; }
    function hideContextMenu(): void { const menu=$<HTMLElement>('[data-role=context]');menu.hidden=true;menu.innerHTML=''; }
    /** 내보내기 판 — 범위·표본율·채널·정규화를 정하고 결과를 숫자로 보고한다. */
    /** 단축키 도움말 — 27회차 동안 쌓인 조작을 한 장에 모았다. */
    function closeHelp(): void { $<HTMLElement>('[data-role=help]').innerHTML=''; $<HTMLElement>('[data-role=backdrop]').classList.toggle('is-open',editorExpanded); }
    function openHelp(): void { const host=$<HTMLElement>('[data-role=help]'); host.innerHTML=shortcutsHtml(esc); $<HTMLElement>('[data-role=backdrop]').classList.add('is-open'); host.querySelector<HTMLElement>('[data-help-act=close]')?.focus(); }
    function closeExport(): void { $<HTMLElement>('[data-role=export]').innerHTML=''; $<HTMLElement>('[data-role=backdrop]').classList.toggle('is-open',editorExpanded); }
    function openExport(): void {
      const host=$<HTMLElement>('[data-role=export]');
      const marked=markedClips().map((item)=>item.clip);
      host.innerHTML=`<div class="ks-export" role="dialog" aria-modal="true" aria-label="WAV 내보내기">
        <h4>EXPORT WAV</h4>
        <label>범위 <select data-export="range">
          <option value="song"${exportOptions.range==='song'?' selected':''}>곡 전체</option>
          <option value="loop"${exportOptions.range==='loop'?' selected':''}>LOOP 구간 (${beatText(project.loopStart)} → ${beatText(project.loopEnd)})</option>
          <option value="selection"${exportOptions.range==='selection'?' selected':''}>고른 클립 ${marked.length}개</option>
        </select></label>
        <label>표본율 <select data-export="sampleRate">
          ${[22050,44100,48000].map((rate)=>`<option value="${rate}"${exportOptions.sampleRate===rate?' selected':''}>${rate} Hz</option>`).join('')}
        </select></label>
        <label>채널 <select data-export="mono">
          <option value="0"${exportOptions.mono?'':' selected'}>스테레오</option>
          <option value="1"${exportOptions.mono?' selected':''}>모노</option>
        </select></label>
        <label>피크 맞추기 (-1 dBFS) <input type="checkbox" data-export="normalize"${exportOptions.normalize?' checked':''}></label>
        <label>트랙별로 따로 (ZIP) <input type="checkbox" data-export="stems"${exportOptions.stems?' checked':''}></label>
        <p class="ks-export-note" data-role="export-note">끄면 1 을 넘는 표본은 깎인다. 켜면 가장 큰 소리를 -1 dBFS 에 맞춘다.</p>
        <div class="ks-export-actions"><button class="ks-btn" data-export-act="cancel">취소</button><button class="ks-btn" data-export-act="go">내보내기</button></div>
      </div>`;
      $<HTMLElement>('[data-role=backdrop]').classList.add('is-open');
      host.querySelector<HTMLElement>('[data-export-act=go]')?.focus();
    }
    /** 트랙별로 한 벌씩 내서 ZIP 하나로 묶는다. 한 트랙만 남기고 나머지를 죽여 렌더한다. */
    async function runStemExport(range:{from:number;to:number}, note: HTMLElement | null): Promise<void> {
      const live=project.tracks.filter((track)=>track.clips.length);
      if(!live.length){status('내보낼 트랙이 없다');if(note)note.textContent='클립이 있는 트랙이 없다';return;}
      await Toolbox.ensureScript?.('vendor/jszip.min');
      const JSZipCtor=(window as unknown as {JSZip?:new()=>{file(name:string,data:Blob):void;generateAsync(options:{type:'blob'}):Promise<Blob>}}).JSZip;
      if(!JSZipCtor){status('ZIP 도구를 못 불러왔다');if(note)note.textContent='ZIP 도구를 못 불러왔다';return;}
      const zip=new JSZipCtor();
      const names=uniqueNames(live.map((track,index)=>stemFileName(track.name,index)));
      let loudest=-Infinity;
      for(let index=0;index<live.length;index++){
        const track=live[index];
        if(note)note.textContent=`${index+1}/${live.length} · ${track.name}`;
        status(`Rendering ${index+1}/${live.length} · ${track.name}`);
        /* 솔로·뮤트를 손대지 않고 **이번 렌더용 사본**만 만든다 — 사용자의 믹서 상태는 그대로 둔다. */
        const only={...project,tracks:project.tracks.map((item)=>({...item,mute:item.id!==track.id,solo:false}))};
        const rendered=await renderProject(only,assets,range.from,range.to,exportOptions.sampleRate,exportOptions.mono?1:2);
        const before=analysePeak(rendered);
        if(exportOptions.normalize)applyGain(rendered,normalizeGain(before.peak,-1));
        else clampBuffer(rendered);
        loudest=Math.max(loudest,analysePeak(rendered).dbfs);
        zip.file(names[index],toWav(rendered));
      }
      if(note)note.textContent='묶는 중…';
      const blob=await zip.generateAsync({type:'blob'});
      download(blob,`${project.name||'Karmo Studio'}-stems.zip`);
      status(`트랙 ${live.length}개 · ${(blob.size/1048576).toFixed(1)} MB · 최대 peak ${loudest.toFixed(1)} dBFS`);
      closeExport();
    }
    async function runExport(): Promise<void> {
      stop();
      const note=$<HTMLElement>('[data-role=export-note]');
      const marked=markedClips().map((item)=>({start:item.clip.start,duration:item.clip.duration}));
      const range=exportRange(exportOptions.range,{from:0,to:projectLength(project)},{from:project.loopStart,to:project.loopEnd},marked);
      status('Rendering WAV…');if(note)note.textContent='렌더 중…';
      try {
        if(exportOptions.stems){await runStemExport(range,note);return;}
        const rendered=await renderProject(project,assets,range.from,range.to,exportOptions.sampleRate,exportOptions.mono?1:2);
        const before=analysePeak(rendered);
        if(exportOptions.normalize)applyGain(rendered,normalizeGain(before.peak,-1));
        const clamped=exportOptions.normalize?0:clampBuffer(rendered);
        const after=analysePeak(rendered);
        const blob=toWav(rendered);
        const suffix=exportOptions.range==='song'?'':`-${exportOptions.range}`;
        download(blob,`${project.name||'Karmo Studio'}${suffix}.wav`);
        Toolbox.offerNext?.($('[data-role=status]'),{blob,name:`${project.name}${suffix}.wav`,from:'karmo-studio'});
        const headroom=`peak ${after.dbfs.toFixed(1)} dBFS`;
        const warn=clamped?` · 깎인 표본 ${clamped}개`:before.clipped&&exportOptions.normalize?` · 원래 ${before.clipped}개가 넘쳤는데 맞춰서 내렸다`:'';
        status(`WAV ready · ${(blob.size/1048576).toFixed(1)} MB · ${headroom}${warn}`);
        closeExport();
      } catch (error) {
        const message=(error as Error).message;
        status(`Render failed: ${message}`);
        if(note)note.textContent=`실패: ${message}`;
      }
    }
    function setEditorExpanded(next: boolean): void { const editor=$<HTMLElement>('[data-role=editor]');if(next&&!editorExpanded)editorReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;editorExpanded=next;editor.classList.toggle('is-expanded',next);editor.toggleAttribute('role',next);editor.toggleAttribute('aria-modal',next);if(next){editor.setAttribute('role','dialog');editor.setAttribute('aria-modal','true');editor.tabIndex=-1;}else{editor.removeAttribute('role');editor.removeAttribute('aria-modal');editor.removeAttribute('tabindex');} $<HTMLElement>('[data-role=backdrop]').classList.toggle('is-open',next);renderEditor();if(next)editor.focus({preventScroll:true});else editorReturnFocus?.focus({preventScroll:true}); }
    function showContextMenu(x:number,y:number,items:Array<[string,string]>):void{const menu=$<HTMLElement>('[data-role=context]');menu.innerHTML=items.map(([act,label])=>`<button type="button" role="menuitem" data-context-act="${act}">${label}</button>`).join('');menu.hidden=false;menu.style.left=`${Math.min(x,window.innerWidth-200)}px`;menu.style.top=`${Math.min(y,window.innerHeight-menu.offsetHeight-8)}px`;menu.querySelector<HTMLElement>('button')?.focus({preventScroll:true});}

    function renderAll(): void {
      const scrollElement=root.querySelector<HTMLElement>('[data-role=scroll]');const arrangerLeft=scrollElement?.scrollLeft||0;const arrangerTop=scrollElement?.scrollTop||0;
      root.style.setProperty('--ks-beat', `${pxPerBeat}px`);
      /* 눈금은 지금 스냅을 따라간다 — 셋잇단으로 바꿔도 격자와 음이 안 어긋난다. */
      root.style.setProperty('--ks-grid', `${Math.max(4, project.snap * pxPerBeat)}px`);
      root.dataset.tool=editTool;root.querySelectorAll('[data-tool]').forEach((button)=>button.classList.toggle('is-on',(button as HTMLElement).dataset.tool===editTool));
      $<HTMLInputElement>('[data-bind=project-name]').value = project.name; $<HTMLInputElement>('[data-bind=bpm]').value = String(project.bpm); $<HTMLSelectElement>('[data-bind=meter]').value = String(project.beatsPerBar); $<HTMLSelectElement>('[data-bind=snap]').value = String(project.snap); $<HTMLSelectElement>('[data-bind=swing]').value = String(project.swing);
      root.querySelector('[data-act=loop]')?.classList.toggle('is-on', project.loop);
      renderRuler(); renderTracks(); renderSide(); renderEditor(); updatePlayhead(); renderToggles();
      if(scrollElement){scrollElement.scrollLeft=arrangerLeft;scrollElement.scrollTop=arrangerTop;}
    }

    /** 켜짐 표시만 갱신 — 전체 재렌더 없이. */
    function renderToggles(): void {
      root.querySelector('[data-act=metronome]')?.classList.toggle('is-on',metronome);
      root.querySelector('[data-act=count-in]')?.classList.toggle('is-on',countIn);
      root.querySelector('[data-act=loop]')?.classList.toggle('is-on',project.loop);
    }
    function renderRuler(): void {
      const ruler = $<HTMLElement>('[data-role=ruler]'); const length = Math.ceil(projectLength(project));
      ruler.style.width = `${172 + trackWidth()}px`;
      let html = '<div class="ks-ruler-head"></div>';
      for (let beat = 0; beat <= length; beat += project.beatsPerBar) html += `<div class="ks-mark" style="left:${172 + beat * pxPerBeat}px">${beat / project.beatsPerBar + 1}</div>`;
      html += `<div class="ks-loop" data-loop style="left:${172 + project.loopStart * pxPerBeat}px;width:${(project.loopEnd - project.loopStart) * pxPerBeat}px"><b class="ks-loop-grip" data-loop-edge="start"></b><b class="ks-loop-grip is-end" data-loop-edge="end"></b></div>`;
      html += project.markers.map((marker)=>`<div class="ks-marker" data-marker="${marker.id}" style="left:${172 + marker.beat * pxPerBeat}px" title="${esc(marker.name)} · ${beatText(marker.beat)} — 끌어서 이동 · 우클릭 삭제 · 더블클릭 이름">▎${esc(marker.name)}</div>`).join('');
      ruler.innerHTML = html;
    }

    /** 오디오 클립 속 그림 — 표본 읽기만 여기서 하고 그리기는 arranger-view 가 한다. */
    function audioBody(clip: StudioClip, className = ''): string {
      const runtime = clip.assetId ? assets.get(clip.assetId) : undefined;
      const buffer = runtime?.buffer;
      if (!buffer) return waveMissing(Boolean(runtime));
      const data = buffer.getChannelData(0);
      const secondsPerBeat = 60 / project.bpm;
      const start = Math.max(0, Math.floor(clip.offset * secondsPerBeat * buffer.sampleRate));
      const end = Math.min(data.length, Math.ceil((clip.offset + clip.duration) * secondsPerBeat * buffer.sampleRate));
      return waveformSvg(waveformPath({ data, start, end }), esc(runtime?.name || clip.name), className);
    }

    function trackClipHtml(track: StudioTrack, clip: StudioClip): string {
      const selected = marks.has({ trackId: track.id, clipId: clip.id }) || ((selection?.type === 'clip' || selection?.type === 'note') && selection.clipId === clip.id);
      return clipHtml({ track, clip, pxPerBeat, selected, audioBody: () => audioBody(clip), esc });
    }

    function trackAutomationHtml(track: StudioTrack, width: number): string {
      const param = autoLanes.get(track.id);
      if (!param) return '';
      return automationHtml({
        trackId: track.id, param, points: track.automation[param],
        fallback: param === 'pan' ? track.pan : param === 'reverb' ? track.reverb : track.volume,
        pxPerBeat, width, projectBeats: Math.max(projectLength(project), 1), beatLabel: beatText
      });
    }
    /** 지금 화면에 걸리는 박 구간 — 여유 한 화면씩 더 그려 스크롤 중 빈칸을 막는다. */
    function viewBeats(): { from: number; to: number; margin: number } {
      const scrollEl = root.querySelector<HTMLElement>('[data-role=scroll]');
      if (!scrollEl || !scrollEl.clientWidth) return { from: 0, to: Number.POSITIVE_INFINITY, margin: 0 };
      const from = Math.max(0, (scrollEl.scrollLeft - 172) / pxPerBeat);
      const to = from + scrollEl.clientWidth / pxPerBeat;
      return { from, to, margin: scrollEl.clientWidth / pxPerBeat };
    }
    /** 마지막으로 그려 둔 박 구간 — 이 안에서 움직이는 스크롤은 다시 그릴 필요가 없다. */
    let paintedRange = { from: 0, to: Number.POSITIVE_INFINITY };
    /** 트랙 한 줄. 문자열이 그대로면 그 줄은 안 건드린다 — 바뀐 줄만 갈아 끼우려고 뗐다. */
    function trackRowHtml(track: StudioTrack, width: number, view: { from: number; to: number; margin: number }): string {
      return `<div class="ks-track-row${track.folded?' is-folded':''}" data-track-row="${track.id}" style="width:${172 + width}px;--ks-row:${track.folded?22:track.height}px">
        <div class="ks-track-head"><div class="ks-track-title"><span class="ks-track-grip" data-track-grip="${track.id}" title="끌어서 순서 바꾸기">⣿</span><span class="ks-track-color" style="background:${track.color}"></span><input data-track-name="${track.id}" value="${esc(track.name)}" aria-label="트랙 이름"></div>
        <div class="ks-track-actions"><button class="ks-mini${track.mute?' is-on':''}" data-track-act="mute" data-track="${track.id}">M</button><button class="ks-mini${track.solo?' is-on':''}" data-track-act="solo" data-track="${track.id}">S</button><button class="ks-mini${track.folded?' is-on':''}" data-track-act="fold" data-track="${track.id}" title="접기/펼치기">${track.folded?'▸':'▾'}</button><button class="ks-mini${autoLanes.has(track.id)?' is-on':''}" data-track-act="auto" data-track="${track.id}" title="볼륨 자동화 줄 보이기">A</button><button class="ks-mini${armedTrackId===track.id?' is-on':''}" data-track-act="arm" data-track="${track.id}" title="${track.kind==='audio'?'녹음 대상으로 지정':'오디오 트랙만 녹음 대상이 된다'}"${track.kind==='audio'?'':' disabled'}>●</button><button class="ks-mini" data-track-act="delete" data-track="${track.id}">×</button></div>
        <input type="range" min="0" max="1.2" step="0.01" value="${track.volume}" data-track-volume="${track.id}" aria-label="${esc(track.name)} 볼륨">${autoLanes.has(track.id)?automationPickerHtml(track.id,autoLanes.get(track.id) as AutomationParam):''}<b class="ks-track-resize" data-track-resize="${track.id}" title="끌어서 줄 높이"></b></div>
        <div class="ks-lane" data-lane="${track.id}" data-kind="${track.kind}" style="width:${width}px">${visibleClips(track.clips,view.from,view.to,view.margin).map((clip)=>trackClipHtml(track,clip)).join('')}${track.clips.length?'':`<span class="ks-lane-hint">${esc(laneHint(editTool,track.kind))}</span>`}</div>${trackAutomationHtml(track,width)}</div>`;
    }
    /** 지난 판에 그린 줄 — 같은 문자열이면 DOM 을 안 만진다. */
    const paintedRows = new Map<string, string>();
    function renderTracks(): void {
      reconcileMarks();
      const view = viewBeats();
      paintedRange = { from: view.from - view.margin, to: view.to + view.margin };
      const tracks = $<HTMLElement>('[data-role=tracks]'); const width = trackWidth();
      const wanted = project.tracks.map((track) => ({ id: track.id, html: trackRowHtml(track, width, view) }));
      const sameOrder = tracks.children.length === wanted.length
        && wanted.every((row, index) => (tracks.children[index] as HTMLElement).dataset.trackRow === row.id);
      if (!sameOrder) {
        tracks.innerHTML = wanted.map((row) => row.html).join('');
        paintedRows.clear();
        for (const row of wanted) paintedRows.set(row.id, row.html);
        return;
      }
      for (let index = 0; index < wanted.length; index++) {
        const row = wanted[index];
        if (paintedRows.get(row.id) === row.html) continue;
        (tracks.children[index] as HTMLElement).outerHTML = row.html;
        paintedRows.set(row.id, row.html);
      }
    }

    const field = (label: string, input: string): string => `<label class="ks-field"><span>${label}</span>${input}</label>`;
    function renderSide(): void {
      root.querySelectorAll('[data-side]').forEach((button) => button.classList.toggle('is-on', (button as HTMLElement).dataset.side === sideMode));
      const side = $<HTMLElement>('[data-role=side]');
      if (sideMode === 'mixer') {
        side.innerHTML = project.tracks.map((track) => `<section class="ks-section"><h4><span style="color:${track.color}">●</span> ${esc(track.name)}</h4>${field('VOLUME',`<input type="range" min="0" max="1.2" step="0.01" value="${track.volume}" data-mix="volume" data-track="${track.id}">`)}${field('PAN',`<input type="range" min="-1" max="1" step="0.01" value="${track.pan}" data-mix="pan" data-track="${track.id}">`)}<div class="ks-meter-row"><div class="ks-meter" data-meter="${track.id}" title="지금 나는 소리 — 흰 줄은 최근 최고치"><span></span><i></i><b></b></div><span class="ks-meter-db" data-meter-db="${track.id}">−∞</span></div><button class="ks-mini" data-meter-reset="${track.id}" title="넘침 표시 지우기">CLIP RESET</button></section>`).join('') + `<section class="ks-section"><h4>MASTER</h4>${field('VOLUME',`<input type="range" min="0" max="1" step="0.01" value="${project.masterVolume}" data-master="volume">`)}</section>`; return;
      }
      const track = selectedTrack(); const clip = selectedClip();
      if (!track) { side.innerHTML = '<div class="ks-empty">트랙이나 클립을 선택하세요.</div>'; return; }
      const noteSelection = selection?.type === 'note' ? selection : null;
      const chosenNote = noteSelection && clip ? clip.notes.find((note) => note.id === noteSelection.noteId) : undefined;
      side.innerHTML = `<section class="ks-section"><h4>PROJECT</h4>${field('LOOP START',`<input type="number" min="0" step="${project.snap}" value="${project.loopStart}" data-project-ins="loopStart">`)}${field('LOOP END',`<input type="number" min="${project.snap}" step="${project.snap}" value="${project.loopEnd}" data-project-ins="loopEnd">`)}</section><section class="ks-section"><h4>TRACK · ${track.kind.toUpperCase()}</h4>
        ${field('NAME',`<input value="${esc(track.name)}" data-ins="track-name">`)}${field('COLOR',`<input type="color" value="${track.color}" data-ins="color">`)}
        ${field('VOLUME',`<input type="range" min="0" max="1.2" step="0.01" value="${track.volume}" data-ins="volume">`)}${field('PAN',`<input type="range" min="-1" max="1" step="0.01" value="${track.pan}" data-ins="pan">`)}
        ${track.kind==='midi'?field('SYNTH',`<select data-ins="instrument">${['sine','triangle','sawtooth','square'].map((wave)=>`<option${wave===track.instrument?' selected':''}>${wave}</option>`).join('')}</select>`)+
          field('ATTACK',`<input type="range" min="0" max="1" step="0.005" value="${track.envelope.attack}" data-env="attack" title="붙는 속도">`)+
          field('DECAY',`<input type="range" min="0" max="1.5" step="0.01" value="${track.envelope.decay}" data-env="decay" title="줄어드는 속도">`)+
          field('SUSTAIN',`<input type="range" min="0" max="1" step="0.01" value="${track.envelope.sustain}" data-env="sustain" title="버티는 크기">`)+
          field('RELEASE',`<input type="range" min="0.01" max="2" step="0.01" value="${track.envelope.release}" data-env="release" title="꼬리 길이">`)+
          field('CUTOFF',`<input type="range" min="200" max="16000" step="50" value="${track.filter.cutoff}" data-filter="cutoff" title="어디부터 어둡게">`)+
          field('FILTER ENV',`<input type="range" min="0" max="5" step="0.05" value="${track.filter.envelope}" data-filter="envelope" title="칠 때 열리는 정도">`)+
          field('DETUNE',`<input type="range" min="0" max="40" step="1" value="${track.detune}" data-detune="1" title="두툼함 (0 = 한 목소리)">`):''}</section>
        <section class="ks-section"><h4>CHANNEL STRIP</h4>${field('LOW EQ',`<input type="range" min="-12" max="12" step="0.5" value="${track.eqLow}" data-ins="eqLow">`)}${field('MID EQ',`<input type="range" min="-12" max="12" step="0.5" value="${track.eqMid}" data-ins="eqMid">`)}${field('HIGH EQ',`<input type="range" min="-12" max="12" step="0.5" value="${track.eqHigh}" data-ins="eqHigh">`)}${field('COMP',`<input type="range" min="0" max="1" step="0.01" value="${track.compressor}" data-ins="compressor">`)}${field('REVERB',`<input type="range" min="0" max="0.8" step="0.01" value="${track.reverb}" data-ins="reverb">`)}</section>
        ${clip?`<section class="ks-section"><h4>CLIP</h4>${field('NAME',`<input value="${esc(clip.name)}" data-clip-ins="name">`)}${field('START',`<input type="number" min="0" step="${project.snap}" value="${clip.start}" data-clip-ins="start">`)}${field('LENGTH',`<input type="number" min="${project.snap}" step="${project.snap}" value="${clip.duration}" data-clip-ins="duration">`)}${field('GAIN',`<input type="range" min="0" max="2" step="0.01" value="${clip.gain}" data-clip-ins="gain">`)}<div style="display:flex;gap:5px;flex-wrap:wrap"><button class="ks-btn" data-act="duplicate">DUPLICATE</button><button class="ks-btn" data-act="split">SPLIT @ PLAYHEAD</button><button class="ks-btn" data-act="delete-clip">DELETE</button></div></section>`:''}
        ${chosenNote?`<section class="ks-section"><h4>MIDI NOTE · ${chosenNote.pitch}</h4>${field('PITCH',`<input type="number" min="0" max="127" value="${chosenNote.pitch}" data-note-ins="pitch">`)}${field('START',`<input type="number" min="0" max="${clip?.duration||1}" step="${project.snap}" value="${chosenNote.beat}" data-note-ins="beat">`)}${field('LENGTH',`<input type="number" min="${project.snap}" step="${project.snap}" value="${chosenNote.duration}" data-note-ins="duration">`)}${field('VELOCITY',`<input type="range" min="0.05" max="1" step="0.01" value="${chosenNote.velocity}" data-note-ins="velocity">`)}</section>`:''}`;
    }

    function renderEditor(): void {
      const editor = $<HTMLElement>('[data-role=editor]'); const previousPiano = editor.querySelector<HTMLElement>('.ks-piano');
      if (previousPiano) { editorScrollTop = previousPiano.scrollTop; editorScrollLeft = previousPiano.scrollLeft; }
      const track = selectedTrack(); const clip = selectedClip(); editor.classList.toggle('is-expanded', editorExpanded);
      editor.classList.toggle('is-empty',!track||!clip);
      if (!track || !clip) { editorExpanded=false;editor.classList.remove('is-expanded');$<HTMLElement>('[data-role=backdrop]').classList.remove('is-open');editor.innerHTML = `<div class="ks-editor-head">CLIP EDITOR</div><div class="ks-empty">클립을 선택하면 편집기가 열립니다.<br>클립을 더블클릭하면 큰 전용 편집 창으로 봅니다.</div>`; return; }
      if (clip.kind === 'audio') {
        const runtime=clip.assetId?assets.get(clip.assetId):undefined;
        editor.innerHTML=`<div class="ks-editor-head"><strong>AUDIO CLIP · ${esc(clip.name)}</strong><span>${runtime?`${runtime.duration.toFixed(2)}s · ${Math.round((runtime.buffer?.sampleRate||0)/1000)}kHz`:'원본 음원을 찾을 수 없음'}</span><span class="ks-spacer"></span><span>더블클릭: 큰 편집 창</span><button class="ks-btn" data-act="toggle-editor">${editorExpanded?'작게':'크게 열기'}</button></div><div class="ks-audio-editor"><div class="ks-audio-wave"><i class="ks-audio-zero"></i>${audioBody(clip,'ks-wave-large')}</div><div class="ks-audio-controls">${field('START',`<input type="number" min="0" step="${project.snap}" value="${clip.start}" data-clip-ins="start">`)}${field('LENGTH',`<input type="number" min="${project.snap}" step="${project.snap}" value="${clip.duration}" data-clip-ins="duration">`)}${field('FADE IN',`<input type="number" min="0" step="${project.snap}" value="${clip.fadeIn}" data-clip-ins="fadeIn">`)}${field('FADE OUT',`<input type="number" min="0" step="${project.snap}" value="${clip.fadeOut}" data-clip-ins="fadeOut">`)}</div></div>`;
        return;
      }
      reconcileNotes();
      const view = buildPianoView({
        clip, beatsPerBar: project.beatsPerBar, expanded: editorExpanded, pxPerBeat, step: stepMode, midi: midiOn, midiLabel,
        viewportWidth: window.innerWidth,
        isSelected: (noteId) => noteSel.has({ clipId: clip.id, noteId }) || (selection?.type === 'note' && selection.noteId === noteId),
        esc
      });
      pianoPxPerBeat = view.pianoPxPerBeat;
      if (editorClipId !== clip.id) { editorClipId = clip.id; editorScrollLeft = 0; editorScrollTop = initialScrollTop(clip); }
      editor.innerHTML = view.html;
      const piano=editor.querySelector<HTMLElement>('.ks-piano');if(piano){piano.scrollTop=editorScrollTop;piano.scrollLeft=editorScrollLeft;}
    }

    function updatePlayhead(): void {
      $<HTMLElement>('[data-role=playhead]').style.left = `${172 + playhead * pxPerBeat}px`;
      $<HTMLElement>('[data-role=time]').textContent = beatText(playhead);
    }
    /** 미터 — 최근 최고치는 천천히 내려오고, 넘친 적이 있으면 표시가 걸린 채로 남는다. */
    const meterHold = new Map<string, number>();
    const meterClipped = new Set<string>();
    function paintMeters(): void {
      const levels = engine.levels();
      root.querySelectorAll<HTMLElement>('[data-meter]').forEach((element)=>{
        const id=element.dataset.meter||'';
        const level=levels.get(id);
        const peak=level?level.peak:0;
        const rms=level?level.rms:0;
        const hold=Math.max(peak,(meterHold.get(id)??0)-0.02);
        meterHold.set(id,hold);
        if(peak>=0.99)meterClipped.add(id);
        element.classList.toggle('is-clipped',meterClipped.has(id));
        const bar=element.querySelector<HTMLElement>('span');const tip=element.querySelector<HTMLElement>('i');
        if(bar)bar.style.width=`${Math.min(100,rms*140)}%`;
        if(tip)tip.style.left=`${Math.min(99,hold*100)}%`;
        const label=root.querySelector<HTMLElement>(`[data-meter-db="${id}"]`);
        if(label)label.textContent=hold>0.0005?`${(20*Math.log10(hold)).toFixed(1)} dB`:'−∞';
      });
    }
    function transportLoop(): void { if (!engine.isPlaying()) { paintMeters(); return; } paintMeters(); playhead = engine.currentBeat(); updatePlayhead(); const scroll = $<HTMLElement>('[data-role=scroll]'); const x = 172 + playhead * pxPerBeat; if (x > scroll.scrollLeft + scroll.clientWidth - 80) scroll.scrollLeft = x - scroll.clientWidth * .45; raf = requestAnimationFrame(transportLoop); }
    /** MIDI 건반 — 붙이면 누르는 대로 소리가 나고, STEP 이 켜져 있으면 그대로 찍힌다. */
    let midiAccess: { inputs: { values(): Iterable<{ name?: string | null; onmidimessage: ((event: { data: Uint8Array }) => void) | null }> } } | null = null;
    async function connectMidi(): Promise<void> {
      const request=(navigator as Navigator & { requestMIDIAccess?: () => Promise<typeof midiAccess> }).requestMIDIAccess;
      if(!request){midiLabel='이 브라우저는 MIDI 를 지원 안 한다';status(midiLabel);renderEditor();return;}
      try{
        midiAccess=await request.call(navigator);
        const inputs=[...(midiAccess?.inputs.values() ?? [])];
        midiOn=inputs.length>0;
        midiLabel=describeInputs(inputs.map((input)=>input.name));
        for(const input of inputs)input.onmidimessage=(event)=>handleMidi(event.data);
        status(midiOn?`MIDI · ${midiLabel}`:'연결된 건반이 없다');
        renderEditor();
      }catch(_){midiOn=false;midiLabel='MIDI 를 못 열었다 (권한 확인)';status(midiLabel);renderEditor();}
    }
    function handleMidi(data: Uint8Array): void {
      const event=parseMidiMessage(data);
      if(event.kind!=='on')return;
      const track=selectedTrack();
      if(!track)return;
      void engine.preview(track,event.pitch,Math.max(0.05,event.velocity));
      if(!stepMode)return;
      const clip=selectedClip();
      if(!clip||clip.kind!=='midi'||stepBeat>=clip.duration)return;
      const note={id:studioId('note'),beat:stepBeat,duration:Math.min(project.snap,clip.duration-stepBeat),pitch:event.pitch,velocity:Math.max(0.05,event.velocity)};
      clip.notes.push(note);stepAdded.push(note.id);
      noteSel.replace([{clipId:clip.id,noteId:note.id}]);
      selection={type:'note',trackId:track.id,clipId:clip.id,noteId:note.id};
      stepBeat=Math.min(clip.duration,stepBeat+project.snap);
      saveSoon('step');renderEditor();renderTracks();renderSide();
    }
    /** 고른 클립 구간만 반복 재생 — 없으면 그냥 재생. 원래 loop 설정은 멈출 때 되돌린다. */
    let loopBefore: { on: boolean; from: number; to: number } | null = null;
    function playSelection(): void {
      const range = selectionRange(markedClips().map((item) => item.clip));
      if (!range) { status('클립을 고르고 눌러라'); play(); return; }
      loopBefore = { on: project.loop, from: project.loopStart, to: project.loopEnd };
      project.loop = true; project.loopStart = range.from; project.loopEnd = range.to;
      playhead = range.from; updatePlayhead(); renderRuler(); renderToggles();
      play();
      status(`선택 구간 ${beatText(range.from)} → ${beatText(range.to)} 반복`);
    }
    function play(): void { engine.setAssets(assets); engine.metronome=metronome; engine.play(project, playhead); root.querySelector('[data-act=play]')?.classList.add('is-on'); if (raf!==undefined)cancelAnimationFrame(raf); transportLoop(); }
    function stop(): void { engine.stop(); if(loopBefore){project.loop=loopBefore.on;project.loopStart=loopBefore.from;project.loopEnd=loopBefore.to;loopBefore=null;renderRuler();renderToggles();} root.querySelector('[data-act=play]')?.classList.remove('is-on'); if(raf!==undefined)cancelAnimationFrame(raf); raf=undefined; meterHold.clear(); paintMeters(); }
    engine.onEnded = () => { root.querySelector('[data-act=play]')?.classList.remove('is-on'); };

    async function refreshAssets(): Promise<void> { const AC=window.AudioContext||(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext; const context=new AC(); assets=await hydrateAssets(project,context); await context.close(); engine.setAssets(assets); }
    async function importAudio(files: File[]): Promise<void> {
      const armed = armedTrackId ? findTrack(project, armedTrackId) : undefined;
      const selectedAudioTrack = selectedTrack();
      /* 녹음 대상(●)이 있으면 그 트랙이 이긴다 — 없을 때만 고른 트랙 → 첫 오디오 트랙 순. */
      const audioTrack: StudioTrack = armed?.kind === 'audio'
        ? armed
        : selectedAudioTrack?.kind === 'audio'
        ? selectedAudioTrack
        : project.tracks.find((track) => track.kind === 'audio') || (() => { const track = newTrack('audio', project.tracks.length + 1); project.tracks.push(track); return track; })();
      const AC=window.AudioContext||(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext; const context=new AC();
      for (const file of files) { try { const bytes=await file.arrayBuffer(); const buffer=await context.decodeAudioData(bytes.slice(0)); const asset:StudioAssetRuntime={id:studioId('asset'),name:file.name,type:file.type||'audio/wav',duration:buffer.duration,buffer}; await addAsset(new Blob([bytes],{type:asset.type}),asset); assets.set(asset.id,asset); project.assets.push(asset); const duration=buffer.duration/(60/project.bpm); const clip:StudioClip={id:studioId('clip'),trackId:audioTrack.id,kind:'audio',name:file.name.replace(/\.[^.]+$/,''),start:snapBeat(playhead,project.snap),duration,offset:0,assetId:asset.id,notes:[],gain:1,fadeIn:0.02/(60/project.bpm),fadeOut:0.02/(60/project.bpm),mute:false,locked:false}; audioTrack.clips.push(clip); selection={type:'clip',trackId:audioTrack.id,clipId:clip.id}; status(`Imported ${file.name}`); } catch(error){status(`Could not decode ${file.name}`);} }
      await context.close(); saveSoon(); renderAll();
    }
    /** 카운트인 — 한 마디를 세어 준 뒤 녹음을 시작한다. 취소하면 세다가 멈춘다. */
    let countInTimer: number | undefined;
    function runCountIn(): Promise<void> {
      const bar=project.beatsPerBar;const secondsPerBeat=60/project.bpm;
      status(`Count-in · ${bar}`);
      engine.metronome=true;engine.setAssets(assets);engine.play({...project,tracks:[],loop:false},0);
      return new Promise((resolve)=>{
        let left=bar;
        countInTimer=window.setInterval(()=>{
          left--;
          if(left>0){status(`Count-in · ${left}`);return;}
          window.clearInterval(countInTimer);countInTimer=undefined;
          engine.stop();engine.metronome=metronome;
          resolve();
        },secondsPerBeat*1000);
      });
    }
    async function startRecording(): Promise<void> {
      if (recording) { recording.stop(); return; }
      if (countInTimer!==undefined) { window.clearInterval(countInTimer); countInTimer=undefined; engine.stop(); engine.metronome=metronome; status('Count-in cancelled'); return; }
      if (countIn) { root.querySelector('[data-act=record]')?.classList.add('is-recording'); await runCountIn(); }
      try { const stream=await navigator.mediaDevices.getUserMedia({audio:true}); recordChunks=[]; recording=new MediaRecorder(stream); recordStart=playhead; recording.ondataavailable=(event)=>{if(event.data.size)recordChunks.push(event.data);}; recording.onstop=()=>{const blob=new Blob(recordChunks,{type:recording?.mimeType||'audio/webm'});stream.getTracks().forEach((track)=>track.stop());recording=null;root.querySelector('[data-act=record]')?.classList.remove('is-recording');playhead=recordStart;void importAudio([new File([blob],`Recording ${new Date().toLocaleTimeString()}.webm`,{type:blob.type})]);}; recording.start(); root.querySelector('[data-act=record]')?.classList.add('is-recording'); if(!engine.isPlaying())play(); status('Recording microphone…'); } catch(_){status('Microphone permission was not granted');}
    }
    const download = (blob: Blob, name: string): void => { const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000); };

    root.addEventListener('click',(event)=>{ const raw=event.target as HTMLElement;if(raw.closest('[data-help-act]')){closeHelp();return;}if(raw.closest('[data-act=help]')){openHelp();return;}if(raw.closest('[data-act=guide-close]')){$<HTMLElement>('[data-role=guide]').hidden=true;try{localStorage.setItem(GUIDE_KEY,'1');}catch(_){/* 못 적어도 이번엔 닫힌다 */}return;}const exportAct=raw.closest<HTMLElement>('[data-export-act]')?.dataset.exportAct;if(exportAct){if(exportAct==='cancel')closeExport();else void runExport();return;}if(addPianoNote(event))return;const contextAct=raw.closest<HTMLElement>('[data-context-act]')?.dataset.contextAct;if(contextAct){hideContextMenu();if(contextAct==='open-editor')setEditorExpanded(true);else if(contextAct==='copy')copySelection();else if(contextAct==='cut')cutSelection();else if(contextAct==='duplicate')root.querySelector<HTMLElement>('[data-act=duplicate]')?.click();else if(contextAct==='duplicate-note'&&selection?.type==='note'){const noteId=selection.noteId;const clip=selectedClip();const note=clip?.notes.find((item)=>item.id===noteId);const track=selectedTrack();if(clip&&note&&track){const copy={...note,id:studioId('note'),beat:Math.min(clip.duration-note.duration,snapBeat(note.beat+project.snap,project.snap))};clip.notes.push(copy);selection={type:'note',trackId:track.id,clipId:clip.id,noteId:copy.id};saveSoon();renderEditor();renderTracks();}}else if(contextAct==='split')root.querySelector<HTMLElement>('[data-act=split]')?.click();else if(contextAct==='rename'){const chosen=markedClips();if(chosen.length){const next=prompt('클립 이름',chosen[0].clip.name);if(next!==null){const name=next.trim()||chosen[0].clip.name;for(const item of chosen)item.clip.name=name;saveSoon('clip-name');renderAll();status(chosen.length>1?`${chosen.length}개 이름 → ${name}`:`이름 → ${name}`);}}}
      else if(contextAct==='mute'){const chosen=markedClips();const focus=selectedClip()||chosen[0]?.clip;if(chosen.length&&focus){const next=!focus.mute;for(const item of chosen)item.clip.mute=next;engine.updateProject(project);saveSoon('clip-mute');renderAll();status(next?`${chosen.length}개 소리 끔`:`${chosen.length}개 소리 켬`);}}
      else if(contextAct==='lock'){const chosen=markedClips();const focus=selectedClip()||chosen[0]?.clip;if(chosen.length&&focus){const next=!focus.locked;for(const item of chosen)item.clip.locked=next;saveSoon('clip-lock');renderAll();status(next?`${chosen.length}개 잠금`:`${chosen.length}개 잠금 풀기`);}}
      else if(contextAct==='color'){const chosen=markedClips();const focus=selectedClip()||chosen[0]?.clip;if(chosen.length&&focus){const next=nextClipColor(focus.color);for(const item of chosen)item.clip.color=next;saveSoon('clip-color');renderAll();status(next?`색 ${next}`:'트랙 색으로');}}
      else if(contextAct==='delete')deleteSelection();return;}const pickEl=raw.closest<HTMLElement>('[data-auto-param]');
      if(pickEl){const track=findTrack(project,pickEl.dataset.track||'');const pick=pickEl.dataset.autoParam as AutomationParam;if(track&&pick){autoLanes.set(track.id,pick);renderTracks();status(`${track.name} · ${pick==='pan'?'팬':pick==='reverb'?'리버브':'볼륨'} 자동화`);}return;}
      const meterReset=raw.closest<HTMLElement>('[data-meter-reset]')?.dataset.meterReset;if(meterReset){meterClipped.delete(meterReset);paintMeters();status('Clip indicator cleared');return;}const noteAct=raw.closest<HTMLElement>('[data-note-act]')?.dataset.noteAct;if(noteAct){applyNoteTool(noteAct);return;}const tool=raw.closest<HTMLElement>('.ks-btn[data-tool]')?.dataset.tool;if(tool){editTool=tool as typeof editTool;renderAll();status(`${tool.toUpperCase()} tool`);return;} const target=raw.closest<HTMLElement>('[data-act],[data-side],[data-track-act]'); if(!target){hideContextMenu();return;}
      if(target.dataset.side){sideMode=target.dataset.side as typeof sideMode;renderSide();return;}
      const trackAct=target.dataset.trackAct; if(trackAct){const track=findTrack(project,target.dataset.track||'');if(!track)return;if(trackAct==='mute')track.mute=!track.mute;else if(trackAct==='solo')track.solo=!track.solo;else if(trackAct==='fold'){track.folded=!track.folded;saveSoon('fold');renderTracks();status(track.folded?`${track.name} 접음`:`${track.name} 펼침`);return;} else if(trackAct==='auto'){if(autoLanes.has(track.id))autoLanes.delete(track.id);else autoLanes.set(track.id,'volume');renderTracks();status(autoLanes.has(track.id)?`${track.name} 자동화 줄 열림`:'자동화 줄 닫힘');return;} else if(trackAct==='arm'){if(track.kind!=='audio'){status('Only audio tracks can be armed');return;}armedTrackId=armedTrackId===track.id?'':track.id;status(armedTrackId?`Armed ${track.name}`:'Disarmed');renderAll();return;}else if(trackAct==='delete'&&confirm(`Delete ${track.name}?`)){project.tracks=project.tracks.filter((item)=>item.id!==track.id);selection=null;}saveSoon();renderAll();return;}
      const act=target.dataset.act;
      if(act==='play')engine.isPlaying()?stop():play(); else if(act==='stop')stop(); else if(act==='back'){stop();playhead=0;updatePlayhead();} else if(act==='loop'){project.loop=!project.loop;saveSoon();renderAll();} else if(act==='tap'){const now=Date.now();taps=[...taps.filter((time)=>now-time<3000),now];const bpm=tapTempo(taps);if(bpm){project.bpm=bpm;saveSoon('bpm');renderAll();status(`BPM ${bpm} (${taps.length}번)`);}else status('한 번 더 두드려라');}
      else if(act==='play-selection'){playSelection();}
      else if(act==='metronome'){metronome=!metronome;engine.metronome=metronome;renderToggles();status(metronome?'Metronome on':'Metronome off');} else if(act==='count-in'){countIn=!countIn;renderToggles();status(countIn?'Count-in: one bar before recording':'Count-in off');}
      else if(act==='audio'||act==='midi'){const track=newTrack(act,project.tracks.length+1);project.tracks.push(track);selection={type:'track',trackId:track.id};saveSoon();renderAll();}
      else if(act==='import-audio')$<HTMLInputElement>('[data-file=audio]').click(); else if(act==='open')$<HTMLInputElement>('[data-file=project]').click();
      else if(act==='new'&&confirm('Start a new project? Export the current one first if you need it.')){stop();project=newProject();assets.clear();selection={type:'clip',trackId:project.tracks[0].id,clipId:project.tracks[0].clips[0].id};playhead=0;saveSoon();renderAll();}
      else if(act==='save'){void portableProject(project).then((json)=>download(new Blob([json],{type:'application/json'}),`${project.name||'Karmo Studio'}.karmo.json`));}
      else if(act==='export-wav'){openExport();}
      else if(act==='zoom-in'||act==='zoom-out'){pxPerBeat=Math.max(28,Math.min(180,pxPerBeat*(act==='zoom-in'?1.25:.8)));renderAll();}
      else if(act==='record')void startRecording(); else if(act==='duplicate')duplicateSelection();
      else if(act==='copy')copySelection();else if(act==='cut')cutSelection();else if(act==='paste')pasteClipboard();
      else if(act==='undo')restoreHistory('undo');else if(act==='redo')restoreHistory('redo');
      else if(act==='toggle-editor')setEditorExpanded(!editorExpanded);
      else if(act==='split'){const clip=selectedClip();const track=selectedTrack();if(clip&&track){const right=splitClip(clip,snapBeat(playhead,project.snap));if(right){track.clips.push(right);selection={type:'clip',trackId:track.id,clipId:right.id};saveSoon();renderAll();}else status('Place the playhead inside the selected clip');}}
      else if(act==='delete-clip'){deleteSelection();}
    });

    /* 입력칸 값은 렌더 밖에서 사람이 바꾼다 — 그러면 「지난 판 문자열」이 화면과 어긋나서
       같은 문자열을 만나도 건너뛰면 안 된다. 손이 닿은 순간 캐시를 버린다. */
    root.addEventListener('input',()=>paintedRows.clear(),true);
    root.addEventListener('input',(event)=>{const input=event.target as HTMLInputElement; if(input.dataset.bind==='project-name')project.name=input.value;else if(input.dataset.bind==='bpm')project.bpm=Math.max(30,Math.min(300,Number(input.value)||120));else if(input.dataset.bind==='meter')project.beatsPerBar=Number(input.value);else if(input.dataset.bind==='snap')project.snap=Number(input.value);else if(input.dataset.bind==='swing'){project.swing=Math.max(0,Math.min(0.6,Number(input.value)||0));engine.updateProject(project);}else if(input.dataset.projectIns){const key=input.dataset.projectIns;const value=Math.max(0,Number(input.value));if(key==='loopStart')project.loopStart=Math.min(value,project.loopEnd-project.snap);else project.loopEnd=Math.max(project.loopStart+project.snap,value);}else if(input.dataset.trackName){const track=findTrack(project,input.dataset.trackName);if(track)track.name=input.value;}else if(input.dataset.trackVolume){const track=findTrack(project,input.dataset.trackVolume);if(track)track.volume=Number(input.value);}else if(input.dataset.mix){const track=findTrack(project,input.dataset.track||'');if(track)(track as unknown as Record<string,unknown>)[input.dataset.mix]=Number(input.value);}else if(input.dataset.master)project.masterVolume=Number(input.value);else if(input.dataset.env){const track=selectedTrack();if(track)(track.envelope as unknown as Record<string,number>)[input.dataset.env]=Number(input.value);engine.updateProject(project);}
    else if(input.dataset.filter){const track=selectedTrack();if(track)(track.filter as unknown as Record<string,number>)[input.dataset.filter]=Number(input.value);engine.updateProject(project);}
    else if(input.dataset.detune){const track=selectedTrack();if(track)track.detune=Number(input.value);engine.updateProject(project);}
    else if(input.dataset.ins){const track=selectedTrack();if(track){const key=input.dataset.ins;if(key==='track-name')track.name=input.value;else if(key==='color')track.color=input.value;else if(key==='instrument')track.instrument=input.value as OscillatorType;else (track as unknown as Record<string,unknown>)[key]=Number(input.value);}}else if(input.dataset.clipIns){const clip=selectedClip();if(clip){const key=input.dataset.clipIns;if(key==='name')clip.name=input.value;else (clip as unknown as Record<string,unknown>)[key]=Math.max(key==='start'||key==='fadeIn'||key==='fadeOut'?0:0.0625,Number(input.value));}}else if(input.dataset.noteIns&&selection?.type==='note'){const noteId=selection.noteId;const clip=selectedClip();const note=clip?.notes.find((item)=>item.id===noteId);if(note){const key=input.dataset.noteIns;const value=Number(input.value);if(key==='pitch')note.pitch=Math.max(0,Math.min(127,value));else if(key==='beat')note.beat=Math.max(0,Math.min((clip?.duration||1)-note.duration,value));else if(key==='duration')note.duration=Math.max(project.snap,Math.min((clip?.duration||1)-note.beat,value));else note.velocity=Math.max(.05,Math.min(1,value));}}const historyKey=`input:${input.dataset.bind||input.dataset.projectIns||input.dataset.trackName||input.dataset.trackVolume||input.dataset.mix||input.dataset.master||input.dataset.ins||input.dataset.clipIns||input.dataset.noteIns||'field'}`;saveSoon(historyKey); if(event.type==='change')renderAll();});
    root.addEventListener('change',(event)=>{const input=event.target as HTMLInputElement;if(input.dataset.bind||input.dataset.projectIns||input.dataset.ins||input.dataset.clipIns||input.dataset.noteIns||input.dataset.mix||input.dataset.master||input.dataset.trackName)renderAll();});

    const audioInput=$<HTMLInputElement>('[data-file=audio]');audioInput.onchange=()=>{if(audioInput.files)void importAudio(Array.from(audioInput.files));audioInput.value='';};
        /** 세기 막대 높이만 제자리 갱신 — 드래그 중 전체 재렌더로 슬라이더 포커스를 잃지 않는다. */
    function paintVelocity(): void {
      const clip=selectedClip();if(!clip)return;
      for(const note of clip.notes){
        const bar=root.querySelector<HTMLElement>(`.ks-vel[data-vel="${note.id}"]`);
        if(bar){bar.style.height=`${Math.max(3,Math.round(note.velocity*50))}px`;bar.title=`velocity ${Math.round(note.velocity*127)}`;}
        const element=root.querySelector<HTMLElement>(`.ks-note[data-note="${note.id}"]`);
        if(element){element.style.height=`${Math.round(7+note.velocity*7)}px`;element.style.opacity=`${0.5+note.velocity*0.5}`;}
      }
    }
    root.addEventListener('change',(event)=>{
      const field=(event.target as HTMLElement).closest<HTMLSelectElement|HTMLInputElement>('[data-export]');
      if(!field)return;
      const key=field.dataset.export;
      if(key==='range')exportOptions.range=field.value as ExportRangeMode;
      else if(key==='sampleRate')exportOptions.sampleRate=Number(field.value);
      else if(key==='mono')exportOptions.mono=field.value==='1';
      else if(key==='normalize')exportOptions.normalize=(field as HTMLInputElement).checked;
      else if(key==='stems')exportOptions.stems=(field as HTMLInputElement).checked;
    });
    root.addEventListener('input',(event)=>{
      const input=event.target as HTMLInputElement;
      if(!('noteVelocity' in input.dataset))return;
      const target=noteTargets();if(!target)return;
      setNoteVelocity(target.notes,Number(input.value));
      saveSoon('note-velocity');paintVelocity();
    });
    /** 세기 막대를 세로로 끌어 그 음의 세기를 바꾼다. */
    root.addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const bar=(event.target as HTMLElement).closest<HTMLElement>('.ks-vel');
      const lane=(event.target as HTMLElement).closest<HTMLElement>('[data-velocity]');
      if(!bar||!lane)return;
      const clip=selectedClip();const note=clip?.notes.find((item)=>item.id===bar.dataset.vel);
      if(!clip||!note)return;
      const rect=lane.getBoundingClientRect();
      const original=note.velocity;
      const set=(clientY:number):void=>{note.velocity=Math.max(0.05,Math.min(1,(rect.bottom-clientY)/Math.max(1,rect.height)));paintVelocity();};
      set(event.clientY);
      gestures.begin({
        capture:bar,pointerId:event.pointerId,
        move:(moveEvent)=>set(moveEvent.clientY),
        commit:()=>{void engine.preview(selectedTrack()||project.tracks[0],note.pitch,note.velocity);saveSoon('note-velocity');renderEditor();},
        cancel:()=>{note.velocity=original;renderEditor();}
      });
    });
const projectInput=$<HTMLInputElement>('[data-file=project]');projectInput.onchange=()=>{const file=projectInput.files?.[0];if(!file)return;void file.text().then(importPortable).then(async(next)=>{stop();project=next;history.reset(project);await refreshAssets();selection=project.tracks[0]?{type:'track',trackId:project.tracks[0].id}:null;playhead=0;renderAll();status(`Opened ${file.name}`);}).catch((error:Error)=>status(`Open failed: ${error.message}`));projectInput.value='';};

    const scroll=$<HTMLElement>('[data-role=scroll]'); 
    /* 화면 밖 클립은 안 그리므로 스크롤로 새로 드러난 구간을 채운다. 단 **이미 그려 둔 범위
       안이면 다시 그리지 않는다** — 매 스크롤마다 갈아엎으면 요소가 계속 바뀌어 클릭조차 안 붙는다. */
    let scrollPaint: number | undefined;
    scroll.addEventListener('scroll',()=>{
      if(scrollPaint!==undefined)return;
      scrollPaint=requestAnimationFrame(()=>{
        scrollPaint=undefined;
        const view=viewBeats();
        if(view.from>=paintedRange.from&&view.to<=paintedRange.to)return;
        renderTracks();
      });
    }); scroll.addEventListener('pointerdown',(event)=>{if(event.button!==0||!event.isPrimary)return;hideContextMenu();const target=event.target as HTMLElement;const clipEl=target.closest<HTMLElement>('.ks-clip');const lane=target.closest<HTMLElement>('.ks-lane');if(!clipEl&&!lane)return;
      if(clipEl&&editTool==='slice'){const trackId=clipEl.dataset.track||'',clipId=clipEl.dataset.clip||'';const track=findTrack(project,trackId),clip=findClip(project,trackId,clipId);if(!track||!clip||!lane)return;if(clip.locked){status(`${clip.name} 잠김 — 자를 수 없다`);return;}const at=snapBeat((event.clientX-lane.getBoundingClientRect().left)/pxPerBeat,project.snap);const right=splitClip(clip,at);if(right){track.clips.push(right);selection={type:'clip',trackId,clipId:right.id};saveSoon();renderAll();status(`Split at ${beatText(at)}`);}else status('Click inside the clip to split');return;}
      if(!clipEl&&lane){
        const mode=markMode(event);
        if(editTool!=='select'&&mode==='replace'){selection={type:'track',trackId:lane.dataset.lane||''};playhead=snapBeat((event.clientX-lane.getBoundingClientRect().left)/pxPerBeat,project.snap);updatePlayhead();renderSide();return;}
        /** box selection — 빈 lane 에서 끌면 지나간 clip 을 묶는다. */
        const band=$<HTMLElement>('[data-role=band]');const startX=event.clientX,startY=event.clientY;
        const before=marks.list();let boxed=false;
        const paint=(moveEvent:PointerEvent):void=>{
          const rect=dragRect(startX,startY,moveEvent.clientX,moveEvent.clientY);
          boxed=isBoxDrag(rect);band.hidden=!boxed;if(!boxed)return;
          const surface=scroll.getBoundingClientRect();
          band.style.left=`${rect.left-surface.left+scroll.scrollLeft}px`;band.style.top=`${rect.top-surface.top+scroll.scrollTop}px`;
          band.style.width=`${rect.right-rect.left}px`;band.style.height=`${rect.bottom-rect.top}px`;
          const hit:ClipRef[]=[];
          root.querySelectorAll<HTMLElement>('.ks-clip').forEach((element)=>{const box=element.getBoundingClientRect();if(rectOverlaps(rect,{left:box.left,top:box.top,right:box.right,bottom:box.bottom}))hit.push({trackId:element.dataset.track||'',clipId:element.dataset.clip||''});});
          marks.replace(mode==='replace'?hit:[...before,...hit]);
          const keys=new Set(marks.list().map((ref)=>`${ref.trackId} ${ref.clipId}`));
          root.querySelectorAll<HTMLElement>('.ks-clip').forEach((element)=>element.classList.toggle('is-selected',keys.has(`${element.dataset.track} ${element.dataset.clip}`)));
        };
        const finish=(committed:boolean):void=>{
          band.hidden=true;
          if(!boxed){marks.replace(before);if(committed){selection={type:'track',trackId:lane.dataset.lane||''};playhead=snapBeat((startX-lane.getBoundingClientRect().left)/pxPerBeat,project.snap);updatePlayhead();renderSide();}return;}
          if(!committed){marks.replace(before);renderTracks();return;}
          const chosen=marks.list();
          selection=chosen.length?{type:'clip',trackId:chosen[0].trackId,clipId:chosen[0].clipId}:{type:'track',trackId:lane.dataset.lane||''};
          renderTracks();renderSide();renderEditor();status(chosen.length?`${chosen.length} clip${chosen.length>1?'s':''} selected`:'Selection cleared');
        };
        gestures.begin({ move:paint, commit:()=>finish(true), cancel:()=>finish(false) });
        return;
      }
      if(!clipEl)return;
      const trackId=clipEl.dataset.track||'',clipId=clipEl.dataset.clip||'';
      const track=findTrack(project,trackId);const source=findClip(project,trackId,clipId);
      if(!source||!track)return;
      const isResize=Boolean(target.closest('[data-resize]'));const isClone=event.altKey&&!isResize;
      if(source.locked&&!isClone){marks.replace([{trackId,clipId}]);selection={type:'clip',trackId,clipId};renderTracks();renderSide();status(`${source.name} 잠김 — 우클릭 메뉴에서 풀어라`);return;}
      reconcileMarks();
      if(!isClone)marks.apply({trackId,clipId},markMode(event));
      /** 이동 대상 한 묶음. resize 는 집은 clip 하나만, 그 외에는 표시된 clip 전부가 같이 간다. */
      type Mover={track:StudioTrack;clip:StudioClip;el:HTMLElement|null;start:number;duration:number};
      const elementFor=(refTrackId:string,refClipId:string):HTMLElement|null=>root.querySelector<HTMLElement>(`.ks-clip[data-track="${refTrackId}"][data-clip="${refClipId}"]`);
      const clones:{track:StudioTrack;clip:StudioClip}[]=[];
      let movers:Mover[];let anchor:Mover;
      if(isClone){
        const sources=marks.has({trackId,clipId})?markedClips():[{track,clip:source}];
        movers=sources.map((item)=>{const copy=cloneClip(item.clip,item.clip.start);item.track.clips.push(copy);clones.push({track:item.track,clip:copy});return {track:item.track,clip:copy,el:elementFor(item.track.id,item.clip.id),start:copy.start,duration:copy.duration};});
        marks.replace(clones.map((item)=>({trackId:item.track.id,clipId:item.clip.id})));
        anchor=movers.find((item)=>item.track.id===trackId)||movers[0];
        selection={type:'clip',trackId:anchor.track.id,clipId:anchor.clip.id};
        status(clones.length>1?`Alt-drag · cloned ${clones.length} clips`:'Alt-drag · clone clip');
      } else {
        selection={type:'clip',trackId,clipId};
        const chosen=isResize?[{track,clip:source}]:markedClips();
        movers=chosen.map((item)=>({track:item.track,clip:item.clip,el:elementFor(item.track.id,item.clip.id),start:item.clip.start,duration:item.clip.duration}));
        anchor=movers.find((item)=>item.clip.id===clipId)||movers[0];
      }
      if(!movers.length)return;
      const markedKeys=new Set(marks.list().map((ref)=>`${ref.trackId} ${ref.clipId}`));
      root.querySelectorAll<HTMLElement>('.ks-clip').forEach((element)=>element.classList.toggle('is-selected',markedKeys.has(`${element.dataset.track} ${element.dataset.clip}`)));
      renderSide();renderEditor();
      if(marks.size>1&&!isClone)status(`${marks.size} clips selected`);
      const startX=event.clientX,startY=event.clientY;let moved=false;
      const discardClone=()=>{for(const item of clones)item.track.clips=item.track.clips.filter((entry)=>entry.id!==item.clip.id);if(clones.length){marks.replace([{trackId,clipId}]);selection={type:'clip',trackId,clipId:source.id};}};
      /** 세로로 끌면 같은 종류의 트랙으로 옮긴다. 실제 이동은 pointerup 에 한 번만(DOM 재부모화 회피). */
      let trackShift=0;
      const laneIndex=(id:string):number=>project.tracks.findIndex((item)=>item.id===id);
      const highlightTarget=():void=>{
        root.querySelectorAll<HTMLElement>('.ks-lane').forEach((element)=>element.classList.remove('is-drop'));
        if(!trackShift)return;
        for(const item of movers){const next=project.tracks[laneIndex(item.track.id)+trackShift];if(next)root.querySelector<HTMLElement>(`.ks-lane[data-lane="${next.id}"]`)?.classList.add('is-drop');}
      };
      const move=(moveEvent:PointerEvent)=>{
        const delta=(moveEvent.clientX-startX)/pxPerBeat;
        if(Math.abs(moveEvent.clientX-startX)>2||Math.abs(moveEvent.clientY-startY)>2)moved=true;
        if(isResize)anchor.clip.duration=Math.max(project.snap,snapBeat(anchor.duration+delta,project.snap));
        else{
          const step=snapBeat(anchor.start+delta,project.snap)-anchor.start;
          for(const item of movers)item.clip.start=Math.max(0,item.start+step);
          const under=document.elementFromPoint(moveEvent.clientX,moveEvent.clientY)?.closest<HTMLElement>('.ks-lane');
          const wanted=under?laneIndex(under.dataset.lane||'')-laneIndex(anchor.track.id):0;
          const ok=wanted!==0&&movers.every((item)=>{const next=project.tracks[laneIndex(item.track.id)+wanted];return Boolean(next)&&next.kind===item.clip.kind;});
          const nextShift=ok?wanted:0;
          if(nextShift!==trackShift){trackShift=nextShift;highlightTarget();}
        }
        for(const item of movers){if(!item.el)continue;item.el.style.left=`${item.clip.start*pxPerBeat}px`;item.el.style.width=`${item.clip.duration*pxPerBeat}px`;}
      };
      const applyTrackShift=():void=>{
        if(!trackShift)return;
        const moves=movers.map((item)=>({item,target:project.tracks[laneIndex(item.track.id)+trackShift]}));
        if(moves.some((entry)=>!entry.target||entry.target.kind!==entry.item.clip.kind))return;
        for(const entry of moves){entry.item.track.clips=entry.item.track.clips.filter((clip)=>clip.id!==entry.item.clip.id);entry.item.clip.trackId=entry.target.id;entry.target.clips.push(entry.item.clip);entry.item.track=entry.target;}
        marks.replace(movers.map((item)=>({trackId:item.track.id,clipId:item.clip.id})));
        selection={type:'clip',trackId:anchor.track.id,clipId:anchor.clip.id};
        status(movers.length>1?`Moved ${movers.length} clips to another track`:'Moved clip to another track');
      };
      const up=()=>{root.querySelectorAll<HTMLElement>('.ks-lane').forEach((element)=>element.classList.remove('is-drop'));if(!moved){discardClone();renderAll();return;}const crossed=trackShift!==0;applyTrackShift();saveSoon();renderAll();if(!crossed&&movers.length>1)status(`Moved ${movers.length} clips`);};
      const cancel=()=>{for(const item of movers){item.clip.start=item.start;item.clip.duration=item.duration;}trackShift=0;root.querySelectorAll<HTMLElement>('.ks-lane').forEach((element)=>element.classList.remove('is-drop'));discardClone();renderAll();};
      if(!gestures.begin({capture:clipEl,pointerId:event.pointerId,move,commit:up,cancel:cancel})){discardClone();return;}
    });
    /** ruler 조작 — 클릭은 재생 헤드, 빈 곳 드래그는 새 loop 구간, 손잡이·구간 드래그는 이동. */
    $<HTMLElement>('[data-role=ruler]').addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const ruler=event.currentTarget as HTMLElement;
      const target=event.target as HTMLElement;
      if(target.closest('.ks-ruler-head'))return;
      event.preventDefault();hideContextMenu();
      const markerEl=target.closest<HTMLElement>('[data-marker]');
      if(markerEl){
        const marker=project.markers.find((item)=>item.id===markerEl.dataset.marker);
        if(!marker)return;
        const origin=marker.beat;let dragged=false;
        const rulerRect=():DOMRect=>ruler.getBoundingClientRect();
        gestures.begin({
          move:(moveEvent)=>{ dragged=true; marker.beat=snapBeat((moveEvent.clientX-rulerRect().left-172)/pxPerBeat,project.snap); renderRuler(); },
          commit:()=>{ if(!dragged){playhead=marker.beat;updatePlayhead();status(`${marker.name} · ${beatText(marker.beat)}`);return;} project.markers=sortMarkers(project.markers);saveSoon('marker');renderRuler();status(`${marker.name} → ${beatText(marker.beat)}`); },
          cancel:()=>{ marker.beat=origin; renderRuler(); }
        });
        return;
      }
      const beatAt=(clientX:number):number=>snapBeat((clientX-ruler.getBoundingClientRect().left-172)/pxPerBeat,project.snap);
      const edge=target.closest<HTMLElement>('[data-loop-edge]')?.dataset.loopEdge;
      const inside=Boolean(target.closest('[data-loop]'))&&!edge;
      const originStart=project.loopStart,originEnd=project.loopEnd;
      const anchorBeat=beatAt(event.clientX);
      let moved=false;
      const move=(moveEvent:PointerEvent):void=>{
        const beat=beatAt(moveEvent.clientX);
        if(Math.abs(moveEvent.clientX-event.clientX)>2)moved=true;
        if(edge==='start')project.loopStart=Math.max(0,Math.min(beat,project.loopEnd-project.snap));
        else if(edge==='end')project.loopEnd=Math.max(project.loopStart+project.snap,beat);
        else if(inside){const shift=beat-anchorBeat;project.loopStart=Math.max(0,originStart+shift);project.loopEnd=project.loopStart+(originEnd-originStart);}
        else if(moved){project.loopStart=Math.min(anchorBeat,beat);project.loopEnd=Math.max(anchorBeat+project.snap,Math.max(anchorBeat,beat));}
        else return;
        renderRuler();renderSide();
      };
      const up=():void=>{
        if(!moved&&!edge&&!inside){playhead=anchorBeat;updatePlayhead();status(`Playhead ${beatText(playhead)}`);return;}
        if(!moved){renderRuler();return;}
        project.loop=true;saveSoon('loop-range');renderRuler();renderSide();
        status(`Loop ${beatText(project.loopStart)} → ${beatText(project.loopEnd)}`);
      };
      const abort=():void=>{project.loopStart=originStart;project.loopEnd=originEnd;renderRuler();renderSide();};
      gestures.begin({ move, commit:up, cancel:abort });
    });
    /** 눈금자 더블클릭 = 이름표 추가. 이름표 위 더블클릭 = 이름 바꾸기. */
    $<HTMLElement>('[data-role=ruler]').addEventListener('dblclick',(event)=>{
      const target=event.target as HTMLElement;
      if(target.closest('.ks-ruler-head'))return;
      event.preventDefault();
      const ruler=$<HTMLElement>('[data-role=ruler]');
      const markerEl=target.closest<HTMLElement>('[data-marker]');
      if(markerEl){
        const marker=project.markers.find((item)=>item.id===markerEl.dataset.marker);
        if(!marker)return;
        const next=prompt('구간 이름', marker.name);
        if(next===null)return;
        marker.name=next.trim()||marker.name;
        saveSoon('marker');renderRuler();status(`이름 → ${marker.name}`);
        return;
      }
      const beat=snapBeat((event.clientX-ruler.getBoundingClientRect().left-172)/pxPerBeat,project.snap);
      const name=prompt('구간 이름', `Section ${project.markers.length+1}`);
      if(name===null)return;
      project.markers=putMarker(project.markers,beat,name.trim()||`Section ${project.markers.length+1}`);
      saveSoon('marker');renderRuler();status(`구간 추가 · ${beatText(beat)}`);
    });
    scroll.addEventListener('click',(event)=>{if(event.button!==0||editTool!=='draw')return;const target=event.target as HTMLElement;if(target.closest('.ks-clip'))return;const lane=target.closest<HTMLElement>('.ks-lane');if(!lane||lane.dataset.kind!=='midi')return;const track=findTrack(project,lane.dataset.lane||'');if(track)createMidiClip(track,(event.clientX-lane.getBoundingClientRect().left)/pxPerBeat);});
    scroll.addEventListener('dblclick',(event)=>{if(event.button!==0)return;event.preventDefault();const target=event.target as HTMLElement;const clipElement=target.closest<HTMLElement>('.ks-clip');if(clipElement){const trackId=clipElement.dataset.track||'',clipId=clipElement.dataset.clip||'';const clip=findClip(project,trackId,clipId);if(clip){selection={type:'clip',trackId,clipId};renderTracks();renderSide();setEditorExpanded(true);}return;}const lane=target.closest<HTMLElement>('.ks-lane');if(!lane||lane.dataset.kind!=='midi')return;const track=findTrack(project,lane.dataset.lane||'');if(track)createMidiClip(track,(event.clientX-lane.getBoundingClientRect().left)/pxPerBeat,true);});

    /** 트랙 머리 아래 모서리를 끌어 줄 높이를 바꾼다. */
    root.addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const handle=(event.target as HTMLElement).closest<HTMLElement>('[data-track-resize]');
      if(!handle)return;
      const track=findTrack(project,handle.dataset.trackResize||'');
      if(!track)return;
      event.preventDefault();
      const startY=event.clientY;const origin=track.height;
      const row=handle.closest<HTMLElement>('.ks-track-row');
      gestures.begin({
        capture:handle,pointerId:event.pointerId,
        move:(moveEvent)=>{ track.height=clampTrackHeight(origin+(moveEvent.clientY-startY)); if(row)row.style.setProperty('--ks-row',`${track.height}px`); },
        commit:()=>{ saveSoon('track-height');renderTracks();status(`${track.name} 줄 높이 ${track.height}px`); },
        cancel:()=>{ track.height=origin; if(row)row.style.setProperty('--ks-row',`${origin}px`); }
      });
    });
    /** 트랙 머리의 손잡이를 끌어 순서를 바꾼다. 놓을 자리를 줄 위/아래 선으로 보여 준다. */
    root.addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const grip=(event.target as HTMLElement).closest<HTMLElement>('[data-track-grip]');
      if(!grip)return;
      const fromIndex=project.tracks.findIndex((track)=>track.id===grip.dataset.trackGrip);
      if(fromIndex<0)return;
      event.preventDefault();
      const rows=[...root.querySelectorAll<HTMLElement>('.ks-track-row')];
      const dragged=rows[fromIndex];
      dragged?.classList.add('is-dragging');
      let target=fromIndex;
      const clearMarks=():void=>rows.forEach((row)=>row.classList.remove('is-drop-before','is-drop-after'));
      const move=(moveEvent:PointerEvent):void=>{
        let next=fromIndex;
        for(let index=0;index<rows.length;index++){
          const box=rows[index].getBoundingClientRect();
          if(moveEvent.clientY>=box.top&&moveEvent.clientY<=box.bottom){next=moveEvent.clientY<box.top+box.height/2?index:index+(index>fromIndex?0:1);break;}
          if(moveEvent.clientY<box.top){next=index;break;}
          next=rows.length-1;
        }
        target=Math.max(0,Math.min(project.tracks.length-1,next));
        clearMarks();
        const marker=rows[Math.min(target,rows.length-1)];
        if(marker&&target!==fromIndex)marker.classList.add(target<fromIndex?'is-drop-before':'is-drop-after');
      };
      const finish=(commit:boolean):void=>{
        clearMarks();dragged?.classList.remove('is-dragging');
        if(!commit||target===fromIndex){renderTracks();return;}
        const name=project.tracks[fromIndex].name;
        project.tracks=moveTrack(project.tracks,fromIndex,target);
        engine.updateProject(project);saveSoon('track-order');renderTracks();renderSide();
        status(`${name} → ${target+1}번째`);
      };
      gestures.begin({ move, commit:()=>finish(true), cancel:()=>finish(false) });
    });
    /** 자동화 줄 조작 — 빈 곳 클릭은 점 추가, 점 드래그는 이동, 우클릭은 삭제. */
    root.addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const target=event.target as HTMLElement;
      const lane=target.closest<HTMLElement>('[data-auto]');
      if(!lane)return;
      const track=findTrack(project,lane.dataset.auto||'');if(!track)return;
      const param=(lane.dataset.autoKind as AutomationParam)||'volume';
      event.preventDefault();
      const rect=lane.getBoundingClientRect();
      const valueAt=(clientY:number):number=>automationValue((clientY-rect.top)/Math.max(1,rect.height),param);
      const beatAt=(clientX:number):number=>snapBeat((clientX-rect.left)/pxPerBeat,project.snap);
      const dot=target.closest<HTMLElement>('[data-auto-point]');
      let point=track.automation[param].find((item)=>item.id===dot?.dataset.autoPoint);
      if(!point){
        track.automation[param]=putAutomationPoint(track.automation[param],beatAt(event.clientX),valueAt(event.clientY),param);
        point=track.automation[param].find((item)=>Math.abs(item.beat-beatAt(event.clientX))<=0.05);
        renderTracks();
        if(!point){saveSoon('automation');return;}
      }
      const held=point;const originBeat=held.beat,originValue=held.value;
      const move=(moveEvent:PointerEvent):void=>{
        held.beat=beatAt(moveEvent.clientX);held.value=valueAt(moveEvent.clientY);
        track.automation[param]=[...track.automation[param]].sort((a,b)=>a.beat-b.beat);
        renderTracks();
      };
      gestures.begin({
        move,
        commit:()=>{saveSoon('automation');engine.updateProject(project);status(`볼륨 ${Math.round(held.value*100)}% @ ${beatText(held.beat)}`);},
        cancel:()=>{held.beat=originBeat;held.value=originValue;renderTracks();}
      });
    });
    /** piano roll box selection — 빈 칸에서 끌면 지나간 음을 묶는다. */
    root.addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const target=event.target as HTMLElement;
      const piano=target.closest<HTMLElement>('[data-piano]');
      if(!piano||target.closest('.ks-note,.ks-key,.ks-piano-ruler'))return;
      const mode=markMode(event);
      if(editTool!=='select'&&mode==='replace')return;
      const clip=selectedClip();if(!clip)return;
      const band=piano.querySelector<HTMLElement>('[data-role=piano-band]');if(!band)return;
      const startX=event.clientX,startY=event.clientY;
      reconcileNotes();
      const before=noteSel.list();let boxed=false;
      const paint=(moveEvent:PointerEvent):void=>{
        const rect=dragRect(startX,startY,moveEvent.clientX,moveEvent.clientY);
        boxed=isBoxDrag(rect);band.hidden=!boxed;if(!boxed)return;
        const surface=(piano.firstElementChild as HTMLElement).getBoundingClientRect();
        band.style.left=`${rect.left-surface.left}px`;band.style.top=`${rect.top-surface.top}px`;
        band.style.width=`${rect.right-rect.left}px`;band.style.height=`${rect.bottom-rect.top}px`;
        const hit:NoteRef[]=[];
        piano.querySelectorAll<HTMLElement>('.ks-note').forEach((element)=>{const box=element.getBoundingClientRect();if(rectOverlaps(rect,{left:box.left,top:box.top,right:box.right,bottom:box.bottom}))hit.push({clipId:clip.id,noteId:element.dataset.note||''});});
        noteSel.replace(mode==='replace'?hit:[...before,...hit]);
        const keys=new Set(noteSel.list().map((ref)=>ref.noteId));
        piano.querySelectorAll<HTMLElement>('.ks-note').forEach((element)=>element.classList.toggle('is-selected',keys.has(element.dataset.note||'')));
      };
      const finish=(committed:boolean):void=>{
        band.hidden=true;
        if(!boxed)return;
        if(!committed){noteSel.replace(before);renderEditor();return;}
        const chosen=noteSel.list();const track=selectedTrack();
        if(chosen.length&&track)selection={type:'note',trackId:track.id,clipId:clip.id,noteId:chosen[0].noteId};
        renderEditor();renderSide();status(chosen.length?`${chosen.length} note${chosen.length>1?'s':''} selected`:'Selection cleared');
      };
      gestures.begin({ move:paint, commit:()=>finish(true), cancel:()=>finish(false) });
    });
    root.addEventListener('pointerdown',(event)=>{
      if(event.button!==0||!event.isPrimary)return;
      const target=event.target as HTMLElement;const noteEl=target.closest<HTMLElement>('.ks-note');
      const clip=selectedClip();const track=selectedTrack();
      if(!noteEl||!clip||!track)return;
      const note=clip.notes.find((item)=>item.id===noteEl.dataset.note);if(!note)return;
      const isResize=Boolean(target.closest('[data-note-resize]'));
      reconcileNotes();
      noteSel.apply({clipId:clip.id,noteId:note.id},markMode(event));
      selection={type:'note',trackId:track.id,clipId:clip.id,noteId:note.id};
      /** resize 는 집은 음 하나만, 이동은 표시된 음 전부가 같은 간격을 유지한 채 간다. */
      const group=(isResize?[{clip,note}]:markedNotes()).map((item)=>({note:item.note,el:root.querySelector<HTMLElement>(`.ks-note[data-note="${item.note.id}"]`),beat:item.note.beat,pitch:item.note.pitch,duration:item.note.duration}));
      if(!group.length)return;
      const anchor=group.find((item)=>item.note.id===note.id)||group[0];
      const keys=new Set(noteSel.list().map((ref)=>ref.noteId));
      root.querySelectorAll<HTMLElement>('.ks-note').forEach((element)=>element.classList.toggle('is-selected',keys.has(element.dataset.note||'')));
      renderSide();
      if(group.length>1&&!isResize)status(`${group.length} notes selected`);
      const startX=event.clientX,startY=event.clientY;
      const move=(moveEvent:PointerEvent)=>{
        if(isResize)anchor.note.duration=Math.max(project.snap,Math.min(clip.duration-anchor.note.beat,snapBeat(anchor.duration+(moveEvent.clientX-startX)/pianoPxPerBeat,project.snap)));
        else{
          const step=snapBeat(Math.max(0,anchor.beat+(moveEvent.clientX-startX)/pianoPxPerBeat),project.snap)-anchor.beat;
          const rows=Math.round((moveEvent.clientY-startY)/PIANO_GEOMETRY.row);
          for(const item of group){
            item.note.beat=Math.max(0,Math.min(clip.duration-item.note.duration,item.beat+step));
            item.note.pitch=Math.max(PIANO_GEOMETRY.low,Math.min(PIANO_GEOMETRY.high,item.pitch-rows));
          }
        }
        for(const item of group){if(!item.el)continue;item.el.style.left=`${PIANO_GEOMETRY.keyWidth+item.note.beat*pianoPxPerBeat}px`;item.el.style.top=`${PIANO_GEOMETRY.rulerHeight+(PIANO_GEOMETRY.high-item.note.pitch)*PIANO_GEOMETRY.row+2}px`;item.el.style.width=`${item.note.duration*pianoPxPerBeat}px`;}
      };
      gestures.begin({
        capture:noteEl,pointerId:event.pointerId,move,
        commit:()=>{void engine.preview(track,anchor.note.pitch,anchor.note.velocity);saveSoon();renderEditor();renderTracks();},
        cancel:()=>{for(const item of group){item.note.beat=item.beat;item.note.pitch=item.pitch;item.note.duration=item.duration;}renderEditor();renderTracks();}
      });
    });
    root.addEventListener('contextmenu',(event)=>{const target=event.target as HTMLElement;const markerEl=target.closest<HTMLElement>('[data-marker]');if(markerEl){event.preventDefault();const gone=project.markers.find((item)=>item.id===markerEl.dataset.marker);project.markers=project.markers.filter((item)=>item.id!==markerEl.dataset.marker);saveSoon('marker');renderRuler();status(gone?`${gone.name} 지움`:'구간 지움');return;}const dot=target.closest<HTMLElement>('[data-auto-point]');if(dot){event.preventDefault();const track=findTrack(project,dot.dataset.track||'');const kind=(dot.closest<HTMLElement>('[data-auto]')?.dataset.autoKind as AutomationParam)||'volume';if(track){track.automation[kind]=track.automation[kind].filter((point)=>point.id!==dot.dataset.autoPoint);saveSoon('automation');engine.updateProject(project);renderTracks();status('자동화 점 삭제');}return;}const clipEl=target.closest<HTMLElement>('.ks-clip');const noteEl=target.closest<HTMLElement>('.ks-note');const lane=target.closest<HTMLElement>('.ks-lane');if(!clipEl&&!noteEl&&!lane)return;event.preventDefault();event.stopPropagation();if(noteEl){const clip=selectedClip();const track=selectedTrack();const note=clip?.notes.find((item)=>item.id===noteEl.dataset.note);if(clip&&track&&note){clip.notes=clip.notes.filter((item)=>item.id!==note.id);selection={type:'clip',trackId:track.id,clipId:clip.id};saveSoon();renderEditor();renderTracks();renderSide();status('Right-click · deleted MIDI note');}}else if(clipEl){const trackId=clipEl.dataset.track||'',clipId=clipEl.dataset.clip||'';selection={type:'clip',trackId,clipId};renderSide();renderEditor();showContextMenu(event.clientX,event.clientY,[['open-editor','편집기 열기'],['rename','이름 바꾸기'],['mute','소리 끄기/켜기'],['lock','잠금/풀기'],['color','색 바꾸기'],['copy','클립 복사'],['cut','클립 잘라내기'],['duplicate','클립 복제'],['split','재생 헤드에서 분할'],['delete','클립 삭제']]);}else if(lane){selection={type:'track',trackId:lane.dataset.lane||''};renderSide();showContextMenu(event.clientX,event.clientY,[['open-editor','클립을 더블클릭해 편집']]);}});
    function deleteSelection():void{
      const chosen=selection;if(!chosen)return;const track=findTrack(project,chosen.trackId);if(!track)return;
      if(chosen.type==='note'){const doomed=markedNotes();const clip=findClip(project,chosen.trackId,chosen.clipId);if(clip&&doomed.length){const ids=new Set(doomed.map((item)=>item.note.id));clip.notes=clip.notes.filter((note)=>!ids.has(note.id));noteSel.clear();if(doomed.length>1)status(`Deleted ${doomed.length} notes`);}selection={type:'clip',trackId:chosen.trackId,clipId:chosen.clipId};saveSoon();renderAll();return;}
      else if(chosen.type==='clip'){const all=markedClips();const doomed=all.filter((item)=>!item.clip.locked);const kept=all.length-doomed.length;for(const item of doomed)item.track.clips=item.track.clips.filter((clip)=>clip.id!==item.clip.id);marks.clear();if(kept)status(doomed.length?`${doomed.length}개 삭제 · 잠긴 ${kept}개는 남김`:`잠겨 있어 안 지운다 (${kept}개)`);else if(doomed.length>1)status(`Deleted ${doomed.length} clips`);}
      selection={type:'track',trackId:track.id};saveSoon();renderAll();}
    const keydown=(event:KeyboardEvent)=>{if(!root.isConnected)return;if(event.key==='Escape'){event.preventDefault();gestures.cancel();hideContextMenu();if($<HTMLElement>('[data-role=help]').innerHTML){closeHelp();return;}if($<HTMLElement>('[data-role=export]').innerHTML){closeExport();return;}if(editorExpanded)setEditorExpanded(false);return;}const command=event.ctrlKey||event.metaKey;if(command&&event.key.toLowerCase()==='z'){event.preventDefault();restoreHistory(event.shiftKey?'redo':'undo');return;}if(command&&event.key.toLowerCase()==='y'){event.preventDefault();restoreHistory('redo');return;}const tag=(event.target as HTMLElement).tagName;if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA')return;if(event.key==='?'||(event.shiftKey&&event.key==='/')){event.preventDefault();if($<HTMLElement>('[data-role=help]').innerHTML)closeHelp();else openHelp();return;}if(stepMode&&!command&&!event.altKey){
        const clip=selectedClip();const track=selectedTrack();
        if(clip&&track&&clip.kind==='midi'){
          if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();stepBeat=Math.max(0,Math.min(clip.duration,stepBeat+(event.key==='ArrowRight'?project.snap:-project.snap)));status(`자리 ${beatText(clip.start+stepBeat)}`);return;}
          if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();stepOctave=Math.max(0,Math.min(8,stepOctave+(event.key==='ArrowUp'?1:-1)));status(`옥타브 ${stepOctave}`);return;}
          if(event.key==='Backspace'){event.preventDefault();const last=stepAdded.pop();if(last){const gone=clip.notes.find((note)=>note.id===last);if(gone)stepBeat=gone.beat;clip.notes=clip.notes.filter((note)=>note.id!==last);saveSoon('step');renderEditor();renderTracks();status(`되돌림 · 자리 ${beatText(clip.start+stepBeat)}`);}else{stepBeat=Math.max(0,stepBeat-project.snap);status(`자리 ${beatText(clip.start+stepBeat)}`);}return;}
          const pitch=keyToPitch(event.key,stepOctave,PIANO_GEOMETRY.low,PIANO_GEOMETRY.high);
          if(pitch!==null){
            event.preventDefault();
            if(stepBeat>=clip.duration){status('클립 끝이다 — 길이를 늘려라');return;}
            const note={id:studioId('note'),beat:stepBeat,duration:Math.min(project.snap,clip.duration-stepBeat),pitch,velocity:0.8};
            clip.notes.push(note);stepAdded.push(note.id);
            noteSel.replace([{clipId:clip.id,noteId:note.id}]);
            selection={type:'note',trackId:track.id,clipId:clip.id,noteId:note.id};
            void engine.preview(track,pitch);
            stepBeat=Math.min(clip.duration,stepBeat+project.snap);
            saveSoon('step');renderEditor();renderTracks();renderSide();
            return;
          }
        }
      }
      if(!command&&event.key.toLowerCase()==='m'&&selection?.type==='clip'){event.preventDefault();const chosen=markedClips();const focus=selectedClip()||chosen[0]?.clip;if(chosen.length&&focus){const next=!focus.mute;for(const item of chosen)item.clip.mute=next;engine.updateProject(project);saveSoon('clip-mute');renderAll();status(next?`${chosen.length}개 소리 끔`:`${chosen.length}개 소리 켬`);}return;}
      if(!command&&['p','e','c'].includes(event.key.toLowerCase())){editTool=event.key.toLowerCase()==='p'?'draw':event.key.toLowerCase()==='e'?'select':'slice';renderAll();status(`${editTool.toUpperCase()} tool`);return;}if(command&&event.key.toLowerCase()==='c'){event.preventDefault();copySelection();return;}if(command&&event.key.toLowerCase()==='x'){event.preventDefault();cutSelection();return;}if(command&&event.key.toLowerCase()==='v'){event.preventDefault();pasteClipboard();return;}if(event.altKey&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){event.preventDefault();const marker=stepMarker(project.markers,playhead,event.key==='ArrowRight'?1:-1);if(!marker){status(event.key==='ArrowRight'?'뒤에 구간이 없다':'앞에 구간이 없다');return;}playhead=marker.beat;updatePlayhead();status(`${marker.name} · ${beatText(marker.beat)}`);return;}if(event.code==='Space'){event.preventDefault();if(event.shiftKey){engine.isPlaying()?stop():playSelection();return;}if(engine.isPlaying()){stop();return;}if(playhead>0){playhead=0;updatePlayhead();status('처음으로');return;}play();}else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteSelection();}else if(command&&event.key.toLowerCase()==='b'){event.preventDefault();root.querySelector<HTMLElement>('[data-act=duplicate]')?.click();}};document.addEventListener('keydown',keydown);
    $<HTMLElement>('[data-role=backdrop]').addEventListener('click',()=>{if($<HTMLElement>('[data-role=help]').innerHTML){closeHelp();return;}if($<HTMLElement>('[data-role=export]').innerHTML){closeExport();return;}setEditorExpanded(false);});
    Toolbox.onHandoff?.('karmo-studio',(file: File)=>{if(file.type.startsWith('audio/'))void importAudio([file]);else if(file.type==='application/json')void file.text().then(importPortable).then((next: StudioProject)=>{project=next;history.reset(project);return refreshAssets();}).then(()=>renderAll());});
    Toolbox.onDispose?.(()=>{stop();engine.dispose();if(countInTimer!==undefined)clearInterval(countInTimer);document.removeEventListener('keydown',keydown);if(saveTimer!==undefined)clearTimeout(saveTimer);if(recording)recording.stop();});
    /* 처음 여는 사람에게만 세 줄. 「알겠다」를 누르면 다시 안 뜬다. */
    const GUIDE_KEY='karmolab_karmo_studio_guide_v1';
    try{ if(!localStorage.getItem(GUIDE_KEY)) $<HTMLElement>('[data-role=guide]').hidden=false; }catch(_){ /* 저장소가 막혀 있으면 그냥 안 띄운다 */ }
    renderAll(); void refreshAssets().then(()=>{renderAll();status('Ready · autosave on');}); Mdd.linePreset('tool_run',{mood:'idle',msg:'Karmo Studio — 편곡부터 WAV까지 한 프로젝트에서.'});
  }
})();
