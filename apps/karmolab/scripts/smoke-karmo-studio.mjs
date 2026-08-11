/** Karmo Studio 의 닫힌 제작 흐름을 실제 브라우저에서 검증한다 (TASK-KL-220). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { stripJekyll } from './lib/serve-static.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const bundle = path.join(root, 'js/widgets/karmo-studio/karmo-studio.js');
if (!fs.existsSync(bundle)) { console.error('[smoke-karmo-studio] bundle missing — run build.mjs first'); process.exit(1); }
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2' };
const server = http.createServer((request,response)=>{let url=decodeURIComponent(request.url.split('?')[0]);if(url.endsWith('/'))url+='index.html';const file=path.join(repoRoot,url.replace(/^\//,''));if(!file.startsWith(repoRoot)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){response.writeHead(404).end('not found');return;}const ext=path.extname(file);let body=fs.readFileSync(file);if(ext==='.html')body=Buffer.from(stripJekyll(String(body)));response.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream'}).end(body);});
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const mobile=process.argv.includes('--mobile');
const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1500,height:1000},serviceWorkers:'block',acceptDownloads:true});
const page=await context.newPage();const errors=[];page.on('pageerror',(error)=>errors.push(String(error)));page.on('console',(message)=>{if(message.type()==='error'&&!/CORS|ERR_FAILED|Failed to load resource|yawnbot/.test(message.text()))errors.push(message.text());});
await page.addInitScript(()=>{window.__ksOsc=0;window.__ksClose=0;window.__ksParamUpdates=0;const original=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){window.__ksOsc++;return original.call(this);};const close=AudioContext.prototype.close;AudioContext.prototype.close=function(){window.__ksClose++;return close.call(this);};const target=AudioParam.prototype.setTargetAtTime;AudioParam.prototype.setTargetAtTime=function(...args){window.__ksParamUpdates++;return target.apply(this,args);};});
await page.goto(base+'/apps/karmolab/index.html#karmo-studio',{waitUntil:'load',timeout:30000});
try { await page.waitForSelector('.ks-root',{timeout:20000}); }
catch (error) {
  const diagnostic = await page.evaluate(() => ({ hash: location.hash, title: document.title, panels: [...document.querySelectorAll('.tab-panel')].map((element) => ({ id: element.id, text: element.textContent?.slice(0, 80), active: element.classList.contains('active') })), scripts: [...document.scripts].map((script) => script.src).filter((src) => src.includes('karmo-studio')) }));
  console.error('[smoke-karmo-studio] boot diagnostic', JSON.stringify(diagnostic), errors);
  throw error;
}
await page.waitForTimeout(400);
const problems=[];
const initial=await page.evaluate(()=>({tracks:document.querySelectorAll('.ks-track-row').length,clips:document.querySelectorAll('.ks-clip').length,notes:document.querySelectorAll('.ks-note').length,layout:getComputedStyle(document.querySelector('.ks-work')).display}));
/* 우클릭은 드래그/브라우저 메뉴로 새지 않고 위젯 메뉴만 열어야 한다. */
const clipStartBeforeContext=await page.locator('.ks-clip').first().evaluate((element)=>element.style.left);
await page.locator('.ks-clip').first().click({button:'right'});await page.waitForSelector('.ks-context:not([hidden])');
const contextLabels=await page.locator('.ks-context [role=menuitem]').allTextContents();
const clipStartAfterContext=await page.locator('.ks-clip').first().evaluate((element)=>element.style.left);
await page.keyboard.press('Escape');
await page.keyboard.press('e');const selectTool=await page.locator('.ks-root').getAttribute('data-tool');await page.keyboard.press('p');const drawTool=await page.locator('.ks-root').getAttribute('data-tool');await page.keyboard.press('e');
await page.keyboard.press('Control+c');const firstLaneBox=await page.locator('.ks-lane[data-kind=midi]').first().boundingBox();await page.mouse.click(firstLaneBox.x+420,firstLaneBox.y+38);await page.keyboard.press('Control+v');await page.waitForTimeout(80);const clipCountAfterPaste=await page.locator('.ks-clip').count();
const volume=page.locator('[data-track-volume]').first();const volumeBefore=Number(await volume.inputValue());await volume.evaluate((element)=>{for(const value of ['0.2','0.35','0.5']){element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));}});await page.keyboard.press('Control+z');const volumeAfterMergedUndo=Number(await page.locator('[data-track-volume]').first().inputValue());await page.keyboard.press('Control+y');const volumeAfterMergedRedo=Number(await page.locator('[data-track-volume]').first().inputValue());
await page.locator('.ks-clip').last().dispatchEvent('dblclick',{button:0});await page.waitForSelector('.ks-editor.is-expanded');await page.click('[data-act=toggle-editor]');
/* 선택하면서 타임라인을 다시 그린 뒤 이미 제거된 요소에 pointer capture를 걸었던 회귀를 직접 밟는다. */
const firstClipBox=await page.locator('.ks-clip.is-selected').boundingBox();
await page.mouse.move(firstClipBox.x+40,firstClipBox.y+30);await page.mouse.down();await page.mouse.move(firstClipBox.x+75,firstClipBox.y+30,{steps:3});await page.mouse.up();await page.waitForTimeout(80);
/* FL Studio처럼 MIDI 클립 더블클릭 → 큰 피아노롤. 그 안에서 음을 수정해 재렌더되어도
   사용자가 보고 있던 세로 위치가 맨 위로 튀지 않아야 한다. */
await page.locator('.ks-clip.is-selected').dispatchEvent('dblclick',{button:0});await page.waitForSelector('.ks-editor.is-expanded');
const selectedTextAfterDoubleClick=await page.evaluate(()=>window.getSelection()?.toString()||'');
await page.keyboard.press('Escape');
const editorClosedByEscape=await page.locator('.ks-editor.is-expanded').count()===0;
await page.locator('.ks-clip.is-selected').dispatchEvent('dblclick',{button:0});await page.waitForSelector('.ks-editor.is-expanded');
const editorShotIndex=process.argv.indexOf('--editor-shot');if(editorShotIndex>0&&process.argv[editorShotIndex+1])await page.screenshot({path:process.argv[editorShotIndex+1],fullPage:true});
await page.click('[data-act=toggle-editor]');
await page.locator('.ks-piano').evaluate((element)=>{element.scrollTop=260;});
const existingNoteBox=await page.locator('.ks-note').first().boundingBox();
await page.mouse.move(existingNoteBox.x+4,existingNoteBox.y+5);await page.mouse.down();await page.mouse.move(existingNoteBox.x+14,existingNoteBox.y-16,{steps:2});await page.mouse.up();await page.waitForTimeout(80);
const rollScrollAfter=await page.locator('.ks-piano').evaluate((element)=>element.scrollTop);
/* 기존 오디오 도구와 같은 WAV 경로를 실제 파일로 밟는다. 0.25초 사인파를 브라우저 파일 입력에 넣어
   decode → asset 저장 → 오디오 클립 배치까지 확인한다. */
const sampleRate=8000,frames=2000,wavBytes=Buffer.alloc(44+frames*2);wavBytes.write('RIFF',0);wavBytes.writeUInt32LE(36+frames*2,4);wavBytes.write('WAVEfmt ',8);wavBytes.writeUInt32LE(16,16);wavBytes.writeUInt16LE(1,20);wavBytes.writeUInt16LE(1,22);wavBytes.writeUInt32LE(sampleRate,24);wavBytes.writeUInt32LE(sampleRate*2,28);wavBytes.writeUInt16LE(2,32);wavBytes.writeUInt16LE(16,34);wavBytes.write('data',36);wavBytes.writeUInt32LE(frames*2,40);for(let index=0;index<frames;index++)wavBytes.writeInt16LE(Math.sin(index/sampleRate*Math.PI*2*220)*9000,44+index*2);
await page.locator('[data-file=audio]').setInputFiles({name:'smoke-tone.wav',mimeType:'audio/wav',buffer:wavBytes});await page.waitForTimeout(400);
const audioWave=await page.locator('.ks-lane[data-kind=audio] .ks-wave-svg path').getAttribute('d');
await page.locator('.ks-lane[data-kind=audio] .ks-clip').dispatchEvent('dblclick',{button:0});await page.waitForSelector('.ks-editor.is-expanded .ks-audio-wave');
const audioEditorShotIndex=process.argv.indexOf('--audio-editor-shot');if(audioEditorShotIndex>0&&process.argv[audioEditorShotIndex+1])await page.screenshot({path:process.argv[audioEditorShotIndex+1],fullPage:true});
const largeAudioWave=await page.locator('.ks-editor.is-expanded .ks-audio-wave path').getAttribute('d');await page.keyboard.press('Escape');
await page.click('[data-act=midi]');
const afterAddTrack=await page.locator('.ks-track-row').count();await page.click('[data-act=undo]');const afterUndoTrack=await page.locator('.ks-track-row').count();await page.click('[data-act=redo]');const afterRedoTrack=await page.locator('.ks-track-row').count();
const lane=page.locator('.ks-lane[data-kind=midi]').last();const laneBox=await lane.boundingBox();await page.mouse.dblclick(laneBox.x+180,laneBox.y+35);await page.waitForTimeout(100);
const piano=page.locator('[data-piano]');const pianoBox=await piano.boundingBox();await page.mouse.dblclick(pianoBox.x+180,pianoBox.y+120);await page.waitForTimeout(100);
const noteCountBeforeFlDuplicate=await page.locator('.ks-note').count();await page.keyboard.press('Control+b');await page.waitForTimeout(80);const noteCountAfterFlDuplicate=await page.locator('.ks-note').count();
const resizeHandle=page.locator('.ks-note-handle').last();const resizeBox=await resizeHandle.boundingBox();const noteWidthBefore=await resizeHandle.locator('..').evaluate((element)=>element.getBoundingClientRect().width);await page.mouse.move(resizeBox.x+2,resizeBox.y+3);await page.mouse.down();await page.mouse.move(resizeBox.x+70,resizeBox.y+3,{steps:3});await page.mouse.up();await page.waitForTimeout(80);const noteWidthAfter=await page.locator('.ks-note').last().evaluate((element)=>element.getBoundingClientRect().width);
const noteCountBeforePaste=await page.locator('.ks-note').count();await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');await page.waitForTimeout(80);const noteCountAfterPaste=await page.locator('.ks-note').count();
await page.click('[data-act=toggle-editor]');
const arrangerScrollBefore=await page.locator('[data-role=scroll]').evaluate((element)=>{element.scrollLeft=300;return element.scrollLeft;});await page.click('[data-act=zoom-in]');const arrangerScrollAfter=await page.locator('[data-role=scroll]').evaluate((element)=>element.scrollLeft);
await page.click('[data-act=back]');await page.locator('[data-project-ins=loopEnd]').fill('0.25');await page.locator('[data-project-ins=loopEnd]').press('Tab');await page.waitForTimeout(800);const engineBefore=await page.evaluate(()=>({close:window.__ksClose,param:window.__ksParamUpdates}));await page.click('[data-act=play]');await page.waitForTimeout(180);await page.locator('[data-track-volume]').first().evaluate((element)=>{element.value='0.42';element.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForTimeout(520);const engineDuring=await page.evaluate(()=>({close:window.__ksClose,param:window.__ksParamUpdates}));await page.click('[data-act=stop]');
await page.fill('[data-bind=project-name]','Smoke Song');await page.locator('[data-bind=project-name]').press('Tab');await page.waitForTimeout(400);
const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('karmolab_karmo_studio_project_v1')||'null'));
const projectDownload=page.waitForEvent('download',{timeout:10000});await page.click('[data-act=save]');let projectDownloadEvent;try{projectDownloadEvent=await projectDownload;}catch(error){const state=await page.evaluate(()=>({expanded:document.querySelector('.ks-editor')?.className,status:document.querySelector('[data-role=status]')?.textContent,tool:document.querySelector('.ks-root')?.getAttribute('data-tool')}));throw new Error(`project download missing: ${JSON.stringify(state)} · ${errors.join(' | ')}`,{cause:error});}const portable=JSON.parse(fs.readFileSync(await projectDownloadEvent.path(),'utf8'));
const portableNoteCount=portable.tracks.flatMap((track)=>track.clips).flatMap((clip)=>clip.notes||[]).length;
await page.locator('[data-file=project]').setInputFiles({name:'roundtrip.karmo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(portable))});await page.waitForTimeout(500);
const reopened=await page.evaluate(()=>({name:document.querySelector('[data-bind=project-name]').value,tracks:document.querySelectorAll('.ks-track-row').length,assets:JSON.parse(localStorage.getItem('karmolab_karmo_studio_project_v1')||'null')?.assets?.length}));
const wavDownload=page.waitForEvent('download');await page.click('[data-act=export-wav]');const download=await wavDownload;const wavPath=await download.path();const wav=fs.readFileSync(wavPath);await page.waitForTimeout(200);
const after=await page.evaluate(()=>({tracks:document.querySelectorAll('.ks-track-row').length,clips:document.querySelectorAll('.ks-clip').length,notes:document.querySelectorAll('.ks-note').length,osc:window.__ksOsc,status:document.querySelector('[data-role=status]').textContent}));
if(initial.tracks<2||initial.clips<1||initial.notes<4)problems.push(`기본 프로젝트가 비었다 (${JSON.stringify(initial)})`);
if(clipStartAfterContext!==clipStartBeforeContext||!contextLabels.includes('편집기 열기'))problems.push(`우클릭 입력 격리 실패 (${clipStartBeforeContext}→${clipStartAfterContext}, ${contextLabels.join(', ')})`);
if(selectTool!=='select'||drawTool!=='draw')problems.push(`FL식 tool 단축키 실패 (${selectTool}, ${drawTool})`);
if(clipCountAfterPaste!==initial.clips+1)problems.push(`클립 copy/paste 실패 (${initial.clips}→${clipCountAfterPaste})`);
if(Math.abs(volumeAfterMergedUndo-volumeBefore)>.001||Math.abs(volumeAfterMergedRedo-.5)>.001)problems.push(`연속 입력 history 병합 실패 (${volumeBefore}→${volumeAfterMergedUndo}→${volumeAfterMergedRedo})`);
if(selectedTextAfterDoubleClick||!editorClosedByEscape)problems.push(`더블클릭/모달 수명주기 실패 (selection=${JSON.stringify(selectedTextAfterDoubleClick)}, escape=${editorClosedByEscape})`);
if(rollScrollAfter<240)problems.push(`피아노롤 수정 뒤 스크롤이 초기화됐다 (${rollScrollAfter})`);
if(!audioWave||audioWave.length<100||!largeAudioWave||largeAudioWave.length<100)problems.push('실제 오디오 파형을 그리지 못했다');
if(afterAddTrack!==3||afterUndoTrack!==2||afterRedoTrack!==3)problems.push(`undo/redo 실패 (${afterAddTrack}→${afterUndoTrack}→${afterRedoTrack})`);
if(noteWidthAfter<=noteWidthBefore)problems.push(`MIDI 노트 길이 조절 실패 (${noteWidthBefore}→${noteWidthAfter})`);
if(noteCountAfterFlDuplicate!==noteCountBeforeFlDuplicate+1)problems.push(`FL식 Ctrl+B note 복제 실패 (${noteCountBeforeFlDuplicate}→${noteCountAfterFlDuplicate})`);
if(noteCountAfterPaste!==noteCountBeforePaste+1)problems.push(`MIDI note copy/paste 실패 (${noteCountBeforePaste}→${noteCountAfterPaste})`);
if(arrangerScrollBefore>5&&arrangerScrollAfter<arrangerScrollBefore-5)problems.push(`타임라인 재렌더 뒤 스크롤 초기화 (${arrangerScrollBefore}→${arrangerScrollAfter})`);
if(after.tracks!==initial.tracks+1)problems.push(`MIDI 트랙 추가 실패 (${initial.tracks}→${after.tracks})`);
/* 피아노롤 DOM 은 선택한 클립 하나만 그린다. 기본 클립의 4음은 새 클립을 고르면 화면에서
   빠지는 게 정상이라, 새 클립 안에 방금 찍은 음이 하나 보이는지를 센다. */
if(after.clips<initial.clips+2||(!mobile&&portableNoteCount<initial.notes+1))problems.push(`오디오/MIDI 클립 편집 실패 (${after.clips} clips, ${portableNoteCount} project notes)`);
if(after.osc<(mobile?2:4))problems.push(`신스 재생 실패 (oscillator ${after.osc})`);
if(engineDuring.close!==engineBefore.close)problems.push(`loop에서 AudioContext를 재생성했다 (close ${engineBefore.close}→${engineDuring.close})`);
if(engineDuring.param<=engineBefore.param)problems.push(`재생 중 mixer parameter가 graph에 반영되지 않았다 (${engineBefore.param}→${engineDuring.param})`);
if(saved?.name!=='Smoke Song'||saved.tracks.length!==after.tracks)problems.push('자동 저장 round-trip 실패');
if(saved?.assets?.length!==1||!portable.assets?.[0]?.dataUrl?.startsWith('data:audio/wav'))problems.push('오디오 asset 또는 휴대용 프로젝트 저장 실패');
if(reopened.name!=='Smoke Song'||reopened.tracks!==after.tracks||reopened.assets!==1)problems.push(`휴대용 프로젝트 다시 열기 실패 (${JSON.stringify(reopened)})`);
if(wav.subarray(0,4).toString()!=='RIFF'||wav.subarray(8,12).toString()!=='WAVE'||wav.length<10000)problems.push(`WAV 출력 실패 (${wav.length} bytes)`);
if(initial.layout!=='grid')problems.push(`작업공간 레이아웃 오류 (${initial.layout})`);
if(errors.length)problems.push(`브라우저 오류: ${errors.slice(0,3).join(' | ')}`);
const shotIndex=process.argv.indexOf('--shot');if(shotIndex>0&&process.argv[shotIndex+1])await page.screenshot({path:process.argv[shotIndex+1],fullPage:true});
await browser.close();server.close();
console.log(`[smoke-karmo-studio] tracks ${initial.tracks}→${after.tracks} · clips ${initial.clips}→${after.clips} · notes ${initial.notes}→${after.notes} · synth ${after.osc} · WAV ${wav.length}B`);
if(problems.length){console.error('[smoke-karmo-studio] ✗\n  - '+problems.join('\n  - '));process.exit(1);}
console.log('[smoke-karmo-studio] ✓ 편집 → 재생 → 자동저장 → WAV 출력이 한 화면에서 닫힌다');
