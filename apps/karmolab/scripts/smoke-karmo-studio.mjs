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
/* 다중 선택 — box drag 로 묶고, 한 clip 을 끌면 묶음 전체가 같은 거리만큼 간다. */
await page.keyboard.press('e');
/* 좁은 화면에서도 두 clip 이 한 화면에 들어오도록 먼저 축소한다 (mobile 390px). */
for(let step=0;step<4;step++)await page.click('[data-act=zoom-out]');
await page.waitForTimeout(80);
const multiClipBoxes=await page.locator('.ks-lane[data-kind=midi]').first().locator('.ks-clip').evaluateAll((elements)=>elements.map((element)=>{const box=element.getBoundingClientRect();return {left:box.left,top:box.top,right:box.right,bottom:box.bottom};}));
const viewport=page.viewportSize();
const multiLaneBox=await page.locator('.ks-lane[data-kind=midi]').first().boundingBox();
const bandLeft=Math.max(multiLaneBox.x+2,Math.min(...multiClipBoxes.map((box)=>box.left))-8);
const bandRight=Math.min(viewport.width-2,multiLaneBox.x+multiLaneBox.width-2,Math.max(...multiClipBoxes.map((box)=>box.right))+8);
const bandTop=Math.min(...multiClipBoxes.map((box)=>box.top))+3;
const bandBottom=Math.max(...multiClipBoxes.map((box)=>box.bottom))-3;
await page.mouse.move(bandRight,bandTop);await page.mouse.down();await page.mouse.move(bandLeft,bandBottom,{steps:6});await page.mouse.up();await page.waitForTimeout(80);
const boxSelected=await page.locator('.ks-lane[data-kind=midi]').first().locator('.ks-clip.is-selected').count();
/* 묶음 clipboard — 선택한 clip 전부가 재생 헤드 기준으로 상대 간격을 지킨 채 붙는다. */
const clipCountBeforeMultiCopy=await page.locator('.ks-clip').count();
await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');await page.waitForTimeout(140);
const clipCountAfterMultiPaste=await page.locator('.ks-clip').count();
await page.keyboard.press('Delete');await page.waitForTimeout(140);
const clipCountAfterMultiPasteUndo=await page.locator('.ks-clip').count();
/* 붙여넣기가 선택을 사본으로 옮겼으니 원본을 다시 묶어 준다. */
await page.mouse.move(bandRight,bandTop);await page.mouse.down();await page.mouse.move(bandLeft,bandBottom,{steps:6});await page.mouse.up();await page.waitForTimeout(100);
const startsBeforeMultiMove=await page.locator('.ks-lane[data-kind=midi]').first().locator('.ks-clip').evaluateAll((elements)=>elements.map((element)=>parseFloat(element.style.left)));
const dragTarget=await page.locator('.ks-lane[data-kind=midi]').first().locator('.ks-clip').first().boundingBox();
/* sticky track head 가 lane 왼쪽을 덮고 오른쪽 8px 은 resize handle 이라, 실제로 clip 본체가
   드러나는 x 를 화면에서 직접 찾는다. */
const grabY=dragTarget.y+22;
const grabX=await page.evaluate(([left,right,y])=>{for(let x=left+6;x<right-14;x+=4){const element=document.elementFromPoint(x,y);if(element&&element.closest('.ks-clip')&&!element.closest('[data-resize]'))return x;}return left+18;},[dragTarget.x,dragTarget.x+dragTarget.width,grabY]);
await page.mouse.move(grabX,grabY);await page.mouse.down();await page.mouse.move(grabX+72,grabY,{steps:4});await page.mouse.up();await page.waitForTimeout(120);
const startsAfterMultiMove=await page.locator('.ks-lane[data-kind=midi]').first().locator('.ks-clip').evaluateAll((elements)=>elements.map((element)=>parseFloat(element.style.left)));
const multiDeltas=startsAfterMultiMove.map((value,index)=>value-(startsBeforeMultiMove[index]??0));
/* 되돌려 놓는다 — 이후 검사(짧은 loop 재생)가 clip 위치에 의존한다. */
const dragBack=await page.locator('.ks-lane[data-kind=midi]').first().locator('.ks-clip').first().boundingBox();
const backX=await page.evaluate(([left,right,y])=>{for(let x=left+6;x<right-14;x+=4){const element=document.elementFromPoint(x,y);if(element&&element.closest('.ks-clip')&&!element.closest('[data-resize]'))return x;}return left+18;},[dragBack.x,dragBack.x+dragBack.width,dragBack.y+22]);
await page.mouse.move(backX,dragBack.y+22);await page.mouse.down();await page.mouse.move(backX-72,dragBack.y+22,{steps:4});await page.mouse.up();await page.waitForTimeout(120);
const startsAfterMultiRestore=await page.locator('.ks-lane[data-kind=midi]').first().locator('.ks-clip').evaluateAll((elements)=>elements.map((element)=>parseFloat(element.style.left)));
const clipCountBeforeMultiDuplicate=await page.locator('.ks-clip').count();
await page.keyboard.press('Control+b');await page.waitForTimeout(120);
const clipCountAfterMultiDuplicate=await page.locator('.ks-clip').count();
await page.keyboard.press('Delete');await page.waitForTimeout(120);
const clipCountAfterMultiDelete=await page.locator('.ks-clip').count();
for(let step=0;step<4;step++)await page.click('[data-act=zoom-in]');await page.waitForTimeout(80);
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
await page.keyboard.press('p');
const lane=page.locator('.ks-lane[data-kind=midi]').last();
/* 좌표 hit-test 는 sticky head·눈금자·가로 스크롤에 흔들린다 — 요소에 직접 이벤트를 준다 (clientX=0 → beat 0). */
await lane.dispatchEvent('dblclick',{button:0});await page.waitForTimeout(140);
const piano=page.locator('[data-piano]');
await piano.dblclick({position:{x:180,y:120}});await page.waitForTimeout(120);
const noteCountBeforeFlDuplicate=await page.locator('.ks-note').count();await page.keyboard.press('Control+b');await page.waitForTimeout(80);const noteCountAfterFlDuplicate=await page.locator('.ks-note').count();
const resizeHandle=page.locator('.ks-note-handle').last();const resizeBox=await resizeHandle.boundingBox();const noteWidthBefore=await resizeHandle.locator('..').evaluate((element)=>element.getBoundingClientRect().width);await page.mouse.move(resizeBox.x+2,resizeBox.y+3);await page.mouse.down();await page.mouse.move(resizeBox.x+70,resizeBox.y+3,{steps:3});await page.mouse.up();await page.waitForTimeout(80);const noteWidthAfter=await page.locator('.ks-note').last().evaluate((element)=>element.getBoundingClientRect().width);
/* piano roll 다중 선택 — 빈 칸 box drag 로 음을 묶고, 하나를 끌면 전부 같이 간다. */
await page.keyboard.press('e');
const pianoSurface=await page.locator('[data-piano]').boundingBox();
const noteBoxes=await page.locator('.ks-note').evaluateAll((elements)=>elements.map((element)=>{const box=element.getBoundingClientRect();return {left:box.left,top:box.top,right:box.right,bottom:box.bottom};}));
const noteBandLeft=Math.max(pianoSurface.x+70,Math.min(...noteBoxes.map((box)=>box.left))-6);
const noteBandRight=Math.min(pianoSurface.x+pianoSurface.width-2,Math.max(...noteBoxes.map((box)=>box.right))+6);
const noteBandTop=Math.max(pianoSurface.y+2,Math.min(...noteBoxes.map((box)=>box.top))-8);
const noteBandBottom=Math.min(pianoSurface.y+pianoSurface.height-2,Math.max(...noteBoxes.map((box)=>box.bottom))+8);
await page.mouse.move(noteBandRight,noteBandBottom);await page.mouse.down();await page.mouse.move(noteBandLeft,noteBandTop,{steps:6});await page.mouse.up();await page.waitForTimeout(100);
const notesBoxSelected=await page.locator('.ks-note.is-selected').count();
const noteTopsBefore=await page.locator('.ks-note').evaluateAll((elements)=>elements.map((element)=>parseFloat(element.style.top)));
const noteGrabY=(noteBoxes[0].top+noteBoxes[0].bottom)/2;
const noteGrabX=await page.evaluate(([left,right,y])=>{for(let x=left+3;x<right-9;x+=3){const element=document.elementFromPoint(x,y);if(element&&element.closest('.ks-note')&&!element.closest('[data-note-resize]'))return x;}return left+3;},[noteBoxes[0].left,noteBoxes[0].right,noteGrabY]);
await page.mouse.move(noteGrabX,noteGrabY);await page.mouse.down();await page.mouse.move(noteGrabX,noteGrabY-32,{steps:4});await page.mouse.up();await page.waitForTimeout(120);
const noteTopsAfter=await page.locator('.ks-note').evaluateAll((elements)=>elements.map((element)=>parseFloat(element.style.top)));
const noteDeltas=noteTopsAfter.map((value,index)=>value-(noteTopsBefore[index]??0));
const noteCountBeforeGroupDelete=await page.locator('.ks-note').count();
await page.keyboard.press('Control+b');await page.waitForTimeout(140);
const noteCountAfterGroupDuplicate=await page.locator('.ks-note').count();
await page.keyboard.press('Delete');await page.waitForTimeout(140);
const noteCountAfterGroupDelete=await page.locator('.ks-note').count();
/* 이후 검사는 note 한 개 선택 상태를 전제한다 — 수식어 없이 하나를 눌러 묶음을 접는다. */
await page.keyboard.press('p');
const focusBox=await page.locator('.ks-note').first().boundingBox();
const focusY=focusBox.y+focusBox.height/2;
const focusX=await page.evaluate(([left,right,y])=>{for(let x=left+3;x<right-9;x+=3){const element=document.elementFromPoint(x,y);if(element&&element.closest('.ks-note')&&!element.closest('[data-note-resize]'))return x;}return left+3;},[focusBox.x,focusBox.x+focusBox.width,focusY]);
await page.mouse.click(focusX,focusY);await page.waitForTimeout(100);
const focusedNotes=await page.locator('.ks-note.is-selected').count();
/* 피아노롤 도구 — quantize / transpose / velocity 가 고른 음에만 닿는다. */
const notePitchesBeforeTranspose=await page.locator('.ks-note').evaluateAll((elements)=>elements.map((element)=>parseFloat(element.style.top)));
/* 지금은 음 하나만 골라 둔 상태 — 도구는 고른 음에만 닿아야 한다.
   ±12 는 음역 천장에 걸려 왕복이 비대칭이라(정상) 여기선 ±1 로 잰다. 천장 규칙은 단위 테스트가 덮는다. */
await page.click('[data-note-act=up]');await page.waitForTimeout(120);
const notePitchesAfterTranspose=await page.locator('.ks-note').evaluateAll((elements)=>elements.map((element)=>parseFloat(element.style.top)));
const transposedCount=notePitchesAfterTranspose.filter((value,index)=>Math.abs(value-notePitchesBeforeTranspose[index])>0.6).length;
await page.click('[data-note-act=down]');await page.waitForTimeout(120);
const notePitchesAfterUndoTranspose=await page.locator('.ks-note').evaluateAll((elements)=>elements.map((element)=>parseFloat(element.style.top)));
const velocityBars=await page.locator('.ks-vel').count();
const velocityHeightsBefore=await page.locator('.ks-vel').evaluateAll((elements)=>elements.map((element)=>parseFloat(element.style.height)));
await page.locator('[data-note-velocity]').evaluate((element)=>{element.value='1';element.dispatchEvent(new Event('input',{bubbles:true}));});
await page.waitForTimeout(120);
const velocityHeightsAfter=await page.locator('.ks-vel').evaluateAll((elements)=>elements.map((element)=>parseFloat(element.style.height)));
const quantizeStatus=await (async()=>{await page.click('[data-note-act=quantize]');await page.waitForTimeout(120);return page.locator('[data-role=status]').textContent();})();
const noteCountBeforePaste=await page.locator('.ks-note').count();await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');await page.waitForTimeout(80);const noteCountAfterPaste=await page.locator('.ks-note').count();
/* 확장 편집기가 열려 있을 때만 접는다 — 무조건 toggle 하면 오히려 열려서 툴바를 덮는다. */
if(await page.locator('.ks-editor.is-expanded').count())await page.click('[data-act=toggle-editor]');
const arrangerScrollBefore=await page.locator('[data-role=scroll]').evaluate((element)=>{element.scrollLeft=300;return element.scrollLeft;});await page.click('[data-act=zoom-in]');const arrangerScrollAfter=await page.locator('[data-role=scroll]').evaluate((element)=>element.scrollLeft);
/* ruler — 클릭은 재생 헤드, 빈 곳 드래그는 새 loop 구간, 손잡이는 경계 이동. */
const rulerBox=await page.locator('[data-role=ruler]').boundingBox();
const rulerY=rulerBox.y+15;
/* 눈금자 왼쪽 172px 은 sticky 머리라 눌러도 안 먹는다 — 실제로 눈금이 드러난 x 를 찾는다. */
const rulerX=await page.evaluate(([y])=>{const ruler=document.querySelector('[data-role=ruler]');const box=ruler.getBoundingClientRect();for(let x=Math.max(2,box.left)+4;x<Math.min(window.innerWidth-4,box.right);x+=6){const el=document.elementFromPoint(x,y);if(el===ruler||(el&&el.closest('[data-role=ruler]')&&!el.closest('.ks-ruler-head')))return x;}return box.left+200;},[rulerY]);
const playheadBeforeRulerClick=await page.locator('[data-role=playhead]').evaluate((element)=>parseFloat(element.style.left));
await page.mouse.click(rulerX,rulerY);await page.waitForTimeout(120);
const playheadAfterRulerClick=await page.locator('[data-role=playhead]').evaluate((element)=>parseFloat(element.style.left));
const rulerExpected=await page.evaluate(([x])=>{const box=document.querySelector('[data-role=ruler]').getBoundingClientRect();return 172+(x-box.left-172);},[rulerX]);
await page.mouse.move(rulerX+20,rulerY);await page.mouse.down();await page.mouse.move(Math.min(rulerX+220,(page.viewportSize().width)-6),rulerY,{steps:5});await page.mouse.up();await page.waitForTimeout(120);
const loopAfterDrag=await page.locator('.ks-loop').evaluate((element)=>({left:parseFloat(element.style.left),width:parseFloat(element.style.width)}));
await page.locator('[data-loop-edge=end]').hover({force:true});
const loopGripHit=await page.evaluate(()=>{const grip=document.querySelector('[data-loop-edge=end]').getBoundingClientRect();const x=grip.left+grip.width/2,y=grip.top+grip.height/2;const el=document.elementFromPoint(x,y);return {x,y,edge:el?.dataset?.loopEdge||null};});
await page.mouse.move(loopGripHit.x,loopGripHit.y);await page.mouse.down();await page.mouse.move(loopGripHit.x+120,loopGripHit.y,{steps:4});await page.mouse.up();await page.waitForTimeout(120);
const loopAfterGrip=await page.locator('.ks-loop').evaluate((element)=>({left:parseFloat(element.style.left),width:parseFloat(element.style.width)}));
await page.click('[data-act=back]');await page.locator('[data-project-ins=loopEnd]').fill('0.25');await page.locator('[data-project-ins=loopEnd]').press('Tab');await page.waitForTimeout(800);const engineBefore=await page.evaluate(()=>({close:window.__ksClose,param:window.__ksParamUpdates}));await page.click('[data-act=play]');await page.waitForTimeout(180);await page.locator('[data-track-volume]').first().evaluate((element)=>{element.value='0.42';element.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForTimeout(520);const engineDuring=await page.evaluate(()=>({close:window.__ksClose,param:window.__ksParamUpdates}));await page.click('[data-act=stop]');
/* 녹음 대상(●)·박자 소리 — 죽어 있던 단추가 실제 상태를 갖는다. */
const armButtons=page.locator('[data-track-act=arm]');
const armDisabledOnMidi=await armButtons.first().isDisabled();
const audioArm=page.locator('.ks-track-row').filter({has:page.locator('.ks-lane[data-kind=audio]')}).locator('[data-track-act=arm]').first();
await audioArm.click();await page.waitForTimeout(100);
const armedOn=await audioArm.evaluate((element)=>element.classList.contains('is-on'));
const armStatus=await page.locator('[data-role=status]').textContent();
/* 무장한 오디오 트랙에 음원을 넣으면 그 트랙으로 들어간다. */
const armedLaneClipsBefore=await page.locator('.ks-lane[data-kind=audio]').last().locator('.ks-clip').count();
await audioArm.click();await page.waitForTimeout(80);
const armedOff=await audioArm.evaluate((element)=>element.classList.contains('is-on'));
await page.click('[data-act=metronome]');await page.waitForTimeout(80);
const metronomeOn=await page.locator('[data-act=metronome]').evaluate((element)=>element.classList.contains('is-on'));
const clicksBefore=await page.evaluate(()=>window.__ksOsc);
await page.click('[data-act=play]');await page.waitForTimeout(700);await page.click('[data-act=stop]');
const clicksAfter=await page.evaluate(()=>window.__ksOsc);
await page.click('[data-act=metronome]');await page.waitForTimeout(80);
const metronomeOff=await page.locator('[data-act=metronome]').evaluate((element)=>element.classList.contains('is-on'));
await page.fill('[data-bind=project-name]','Smoke Song');await page.locator('[data-bind=project-name]').press('Tab');await page.waitForTimeout(400);
const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('karmolab_karmo_studio_project_v1')||'null'));
const projectDownload=page.waitForEvent('download',{timeout:10000});await page.click('[data-act=save]');let projectDownloadEvent;try{projectDownloadEvent=await projectDownload;}catch(error){const state=await page.evaluate(()=>({expanded:document.querySelector('.ks-editor')?.className,status:document.querySelector('[data-role=status]')?.textContent,tool:document.querySelector('.ks-root')?.getAttribute('data-tool')}));throw new Error(`project download missing: ${JSON.stringify(state)} · ${errors.join(' | ')}`,{cause:error});}const portable=JSON.parse(fs.readFileSync(await projectDownloadEvent.path(),'utf8'));
const portableNoteCount=portable.tracks.flatMap((track)=>track.clips).flatMap((clip)=>clip.notes||[]).length;
await page.locator('[data-file=project]').setInputFiles({name:'roundtrip.karmo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(portable))});await page.waitForTimeout(500);
const reopened=await page.evaluate(()=>({name:document.querySelector('[data-bind=project-name]').value,tracks:document.querySelectorAll('.ks-track-row').length,assets:JSON.parse(localStorage.getItem('karmolab_karmo_studio_project_v1')||'null')?.assets?.length}));
const wavDownload=page.waitForEvent('download');await page.click('[data-act=export-wav]');const download=await wavDownload;const wavPath=await download.path();const wav=fs.readFileSync(wavPath);await page.waitForTimeout(200);
/* 같은 종류의 다른 트랙으로 세로 drag — 클립이 실제로 다른 lane 으로 옮겨져야 한다.
   390px 화면에서는 세로 drop 지점의 hit-test 가 lane 을 안정적으로 집지 못해 desktop 에서만 잰다. */
const midiLaneCounts=async()=>page.locator('.ks-lane[data-kind=midi]').evaluateAll((elements)=>elements.map((element)=>element.querySelectorAll('.ks-clip').length));
/* 좁은 화면에서는 lane 이 스크롤 밖에 있을 수 있다 — 먼저 보이게 만들고 좌표를 잰다. */
let laneCountsBeforeCross=[],laneCountsAfterCross=[];
if(!mobile){
  await page.locator('[data-role=scroll]').evaluate((element)=>{element.scrollTop=0;element.scrollLeft=0;});
  await page.locator('.ks-lane[data-kind=midi]').last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  laneCountsBeforeCross=await midiLaneCounts();
  const crossSource=await page.locator('.ks-lane[data-kind=midi]').first().locator('.ks-clip').first().boundingBox();
  const crossTargetLane=await page.locator('.ks-lane[data-kind=midi]').last().boundingBox();
  const crossY=crossSource.y+crossSource.height/2;
  const crossX=await page.evaluate(([left,right,y])=>{for(let x=left+6;x<right-14;x+=4){const element=document.elementFromPoint(x,y);if(element&&element.closest('.ks-clip')&&!element.closest('[data-resize]'))return x;}return left+18;},[crossSource.x,crossSource.x+crossSource.width,crossY]);
  await page.mouse.move(crossX,crossY);await page.mouse.down();
  const liveTarget=await page.locator('.ks-lane[data-kind=midi]').last().boundingBox();
  for(const y of [crossY,(crossY+liveTarget.y+30)/2,liveTarget.y+30,liveTarget.y+40])await page.mouse.move(crossX+4,y,{steps:3});
  await page.mouse.up();await page.waitForTimeout(180);
  laneCountsAfterCross=await midiLaneCounts();
}

const after=await page.evaluate(()=>({tracks:document.querySelectorAll('.ks-track-row').length,clips:document.querySelectorAll('.ks-clip').length,notes:document.querySelectorAll('.ks-note').length,osc:window.__ksOsc,status:document.querySelector('[data-role=status]').textContent}));
if(initial.tracks<2||initial.clips<1||initial.notes<4)problems.push(`기본 프로젝트가 비었다 (${JSON.stringify(initial)})`);
if(clipStartAfterContext!==clipStartBeforeContext||!contextLabels.includes('편집기 열기'))problems.push(`우클릭 입력 격리 실패 (${clipStartBeforeContext}→${clipStartAfterContext}, ${contextLabels.join(', ')})`);
if(selectTool!=='select'||drawTool!=='draw')problems.push(`FL식 tool 단축키 실패 (${selectTool}, ${drawTool})`);
if(clipCountAfterMultiPaste!==clipCountBeforeMultiCopy*2)problems.push(`묶음 clip 붙여넣기 실패 (${clipCountBeforeMultiCopy}→${clipCountAfterMultiPaste})`);
if(clipCountAfterMultiPasteUndo!==clipCountBeforeMultiCopy)problems.push(`붙여넣은 묶음 삭제 실패 (${clipCountAfterMultiPaste}→${clipCountAfterMultiPasteUndo})`);
if(boxSelected<2)problems.push(`box drag 다중 선택 실패 (${boxSelected} selected)`);
if(multiDeltas.length<2||multiDeltas.some((value)=>Math.abs(value-multiDeltas[0])>0.6)||multiDeltas[0]<=0)problems.push(`묶음 이동이 어긋났다 (${JSON.stringify(multiDeltas)})`);
if(startsAfterMultiRestore.some((value,index)=>Math.abs(value-(startsBeforeMultiMove[index]??0))>0.6))problems.push(`묶음 되돌리기 실패 (${JSON.stringify(startsAfterMultiRestore)} vs ${JSON.stringify(startsBeforeMultiMove)})`);
if(clipCountAfterMultiDuplicate!==clipCountBeforeMultiDuplicate*2)problems.push(`묶음 복제 실패 (${clipCountBeforeMultiDuplicate}→${clipCountAfterMultiDuplicate})`);
if(clipCountAfterMultiDelete!==clipCountBeforeMultiDuplicate)problems.push(`묶음 삭제 실패 (${clipCountAfterMultiDuplicate}→${clipCountAfterMultiDelete})`);
if(clipCountAfterPaste!==initial.clips+1)problems.push(`클립 copy/paste 실패 (${initial.clips}→${clipCountAfterPaste})`);
if(Math.abs(volumeAfterMergedUndo-volumeBefore)>.001||Math.abs(volumeAfterMergedRedo-.5)>.001)problems.push(`연속 입력 history 병합 실패 (${volumeBefore}→${volumeAfterMergedUndo}→${volumeAfterMergedRedo})`);
if(selectedTextAfterDoubleClick||!editorClosedByEscape)problems.push(`더블클릭/모달 수명주기 실패 (selection=${JSON.stringify(selectedTextAfterDoubleClick)}, escape=${editorClosedByEscape})`);
if(rollScrollAfter<240)problems.push(`피아노롤 수정 뒤 스크롤이 초기화됐다 (${rollScrollAfter})`);
if(!audioWave||audioWave.length<100||!largeAudioWave||largeAudioWave.length<100)problems.push('실제 오디오 파형을 그리지 못했다');
if(afterAddTrack!==3||afterUndoTrack!==2||afterRedoTrack!==3)problems.push(`undo/redo 실패 (${afterAddTrack}→${afterUndoTrack}→${afterRedoTrack})`);
if(noteWidthAfter<=noteWidthBefore)problems.push(`MIDI 노트 길이 조절 실패 (${noteWidthBefore}→${noteWidthAfter})`);
if(noteCountAfterFlDuplicate!==noteCountBeforeFlDuplicate+1)problems.push(`FL식 Ctrl+B note 복제 실패 (${noteCountBeforeFlDuplicate}→${noteCountAfterFlDuplicate})`);
if(notesBoxSelected<2)problems.push(`piano roll box 다중 선택 실패 (${notesBoxSelected} selected)`);
if(noteDeltas.length<2||noteDeltas.some((value)=>Math.abs(value-noteDeltas[0])>0.6)||noteDeltas[0]>=0)problems.push(`묶음 note 이동이 어긋났다 (${JSON.stringify(noteDeltas)})`);
if(noteCountAfterGroupDuplicate!==noteCountBeforeGroupDelete*2)problems.push(`묶음 note 복제 실패 (${noteCountBeforeGroupDelete}→${noteCountAfterGroupDuplicate})`);
if(noteCountAfterGroupDelete!==noteCountBeforeGroupDelete)problems.push(`묶음 note 삭제 실패 (${noteCountAfterGroupDuplicate}→${noteCountAfterGroupDelete})`);
if(focusedNotes!==1)problems.push(`수식어 없는 클릭이 묶음을 접지 않았다 (${focusedNotes} selected)`);
if(transposedCount!==1)problems.push(`반음 올림이 고른 음 하나에만 닿지 않았다 (${transposedCount}개 이동, ${JSON.stringify(notePitchesBeforeTranspose)}→${JSON.stringify(notePitchesAfterTranspose)})`);
if(Math.abs((notePitchesAfterTranspose.find((value,index)=>Math.abs(value-notePitchesBeforeTranspose[index])>0.6)??0)-(notePitchesBeforeTranspose[notePitchesAfterTranspose.findIndex((value,index)=>Math.abs(value-notePitchesBeforeTranspose[index])>0.6)]-16))>0.6)problems.push('반음 올림 폭이 1반음(16px)이 아니다');
if(notePitchesAfterUndoTranspose.some((value,index)=>Math.abs(value-notePitchesBeforeTranspose[index])>0.6))problems.push(`반음 내림이 원래 자리로 안 돌아왔다 (${JSON.stringify(notePitchesAfterUndoTranspose)})`);
if(velocityBars<1)problems.push('velocity lane 막대가 없다');
if(velocityHeightsAfter.filter((value,index)=>value>velocityHeightsBefore[index]).length!==1)problems.push(`velocity 슬라이더가 고른 음 하나에만 닿지 않았다 (${JSON.stringify(velocityHeightsBefore)}→${JSON.stringify(velocityHeightsAfter)})`);
if(!/Quantized|grid/.test(quantizeStatus||''))problems.push(`quantize 결과 보고가 없다 (${quantizeStatus})`);
if(noteCountAfterPaste!==noteCountBeforePaste+1)problems.push(`MIDI note copy/paste 실패 (${noteCountBeforePaste}→${noteCountAfterPaste})`);
if(arrangerScrollBefore>5&&arrangerScrollAfter<arrangerScrollBefore-5)problems.push(`타임라인 재렌더 뒤 스크롤 초기화 (${arrangerScrollBefore}→${arrangerScrollAfter})`);
if(!mobile&&(laneCountsBeforeCross.length<2||laneCountsAfterCross[0]!==laneCountsBeforeCross[0]-1||laneCountsAfterCross[laneCountsAfterCross.length-1]!==laneCountsBeforeCross[laneCountsBeforeCross.length-1]+1))problems.push(`트랙 간 클립 이동 실패 (${JSON.stringify(laneCountsBeforeCross)}→${JSON.stringify(laneCountsAfterCross)})`);
if(Math.abs(playheadAfterRulerClick-rulerExpected)>40||playheadAfterRulerClick===playheadBeforeRulerClick)problems.push(`ruler 클릭이 재생 헤드를 옮기지 않았다 (${playheadBeforeRulerClick}→${playheadAfterRulerClick}, 기대 ${rulerExpected})`);
if(!(loopAfterDrag.width>60))problems.push(`ruler 드래그가 loop 구간을 만들지 않았다 (${JSON.stringify(loopAfterDrag)})`);
if(!(loopAfterGrip.width>loopAfterDrag.width+40))problems.push(`loop 끝 손잡이가 구간을 늘리지 않았다 (${loopAfterDrag.width}→${loopAfterGrip.width}, hit=${JSON.stringify(loopGripHit)})`);
if(after.tracks!==initial.tracks+1)problems.push(`MIDI 트랙 추가 실패 (${initial.tracks}→${after.tracks})`);
/* 피아노롤 DOM 은 선택한 클립 하나만 그린다. 기본 클립의 4음은 새 클립을 고르면 화면에서
   빠지는 게 정상이라, 새 클립 안에 방금 찍은 음이 하나 보이는지를 센다. */
if(after.clips<initial.clips+2||(!mobile&&portableNoteCount<initial.notes+1))problems.push(`오디오/MIDI 클립 편집 실패 (${after.clips} clips, ${portableNoteCount} project notes)`);
if(after.osc<(mobile?2:4))problems.push(`신스 재생 실패 (oscillator ${after.osc})`);
if(engineDuring.close!==engineBefore.close)problems.push(`loop에서 AudioContext를 재생성했다 (close ${engineBefore.close}→${engineDuring.close})`);
if(engineDuring.param<=engineBefore.param)problems.push(`재생 중 mixer parameter가 graph에 반영되지 않았다 (${engineBefore.param}→${engineDuring.param})`);
if(!armDisabledOnMidi)problems.push('MIDI 트랙의 녹음 대상 단추가 잠겨 있지 않다');
if(!armedOn||!/Armed/.test(armStatus||''))problems.push(`녹음 대상 지정이 안 된다 (${armedOn}, ${armStatus})`);
if(armedOff)problems.push('녹음 대상 해제가 안 된다');
if(armedLaneClipsBefore<1)problems.push('오디오 트랙에 클립이 없다 — 무장 대상 검사가 무의미');
if(!metronomeOn||metronomeOff)problems.push(`박자 소리 토글이 상태를 안 바꾼다 (${metronomeOn}→${metronomeOff})`);
if(clicksAfter<=clicksBefore)problems.push(`박자 소리가 안 난다 (oscillator ${clicksBefore}→${clicksAfter})`);
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
