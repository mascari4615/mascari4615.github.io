import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(path.resolve('src/widgets/heung/midi-file.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const module={exports:{}};vm.runInNewContext(`(function(exports,module,require){${compiled}\n})(module.exports,module,()=>({}));`,{module,TextEncoder,TextDecoder,Uint8Array,DataView,Math,Map,Error});
const {encodeMidi,decodeMidi}=module.exports;
const sourceNotes=[{id:'a',beat:0,duration:.5,pitch:60,velocity:.8},{id:'b',beat:1.25,duration:1.5,pitch:67,velocity:.5,muted:false}];
const bytes=encodeMidi(sourceNotes,123);assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'MThd');assert.equal(new TextDecoder().decode(bytes.slice(14,18)),'MTrk');
const decoded=decodeMidi(bytes);assert.equal(decoded.bpm,123);assert.equal(decoded.notes.length,2);assert.equal(decoded.notes.map((note)=>note.pitch).join(','),'60,67');assert.ok(Math.abs(decoded.notes[1].beat-1.25)<.001);assert.ok(Math.abs(decoded.notes[1].duration-1.5)<.001);
assert.throws(()=>decodeMidi(new Uint8Array([1,2,3,4])),/헤더/);
console.log('[test-heung-midi-file] ✓ SMF 헤더 · tempo · note on/off · 왕복 · 잘린 파일 거부');
