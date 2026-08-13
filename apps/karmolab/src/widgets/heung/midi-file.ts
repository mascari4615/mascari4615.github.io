import type { StudioNote } from './model';

export interface MidiFileData { bpm: number; duration: number; notes: Omit<StudioNote, 'id'>[]; }
const PPQ = 480;
const vlq = (value: number): number[] => { const bytes=[value&127];for(value>>=7;value;value>>=7)bytes.unshift((value&127)|128);return bytes; };
const u16 = (value:number):number[] => [(value>>8)&255,value&255];
const u32 = (value:number):number[] => [(value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255];

export function encodeMidi(notes: StudioNote[], bpm: number): Uint8Array {
  const events:{tick:number,order:number,data:number[]}[]=[];
  const tempo=Math.round(60_000_000/Math.max(1,bpm));events.push({tick:0,order:0,data:[0xff,0x51,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255]});
  for(const note of notes){const start=Math.max(0,Math.round(note.beat*PPQ)),end=Math.max(start+1,Math.round((note.beat+note.duration)*PPQ)),velocity=Math.max(1,Math.min(127,Math.round(note.velocity*127)));events.push({tick:start,order:1,data:[0x90,note.pitch&127,velocity]},{tick:end,order:0,data:[0x80,note.pitch&127,0]});}
  events.sort((a,b)=>a.tick-b.tick||a.order-b.order);const track:number[]=[];let tick=0;for(const event of events){track.push(...vlq(event.tick-tick),...event.data);tick=event.tick;}track.push(0,0xff,0x2f,0);
  return new Uint8Array([...Array.from(new TextEncoder().encode('MThd')),...u32(6),...u16(0),...u16(1),...u16(PPQ),...Array.from(new TextEncoder().encode('MTrk')),...u32(track.length),...track]);
}

export function decodeMidi(bytes: Uint8Array): MidiFileData {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const text=(at:number,n:number)=>new TextDecoder().decode(bytes.slice(at,at+n));
  if(text(0,4)!=='MThd')throw new Error('MIDI 헤더가 아니다');const tracks=view.getUint16(10),division=view.getUint16(12);if(division&0x8000)throw new Error('SMPTE MIDI는 아직 지원하지 않는다');let offset=8+view.getUint32(4),bpm=120,maxTick=0;const notes:MidiFileData['notes']=[];const active=new Map<string,{tick:number;velocity:number;pitch:number}>();
  const readVlq=(end:number):number=>{let value=0,byte=0;do{if(offset>=end)throw new Error('잘린 MIDI');byte=bytes[offset++];value=(value<<7)|(byte&127);}while(byte&128);return value;};
  for(let trackIndex=0;trackIndex<tracks;trackIndex++){if(text(offset,4)!=='MTrk')throw new Error('MIDI 트랙이 없다');const end=offset+8+view.getUint32(offset+4);offset+=8;let tick=0,running=0;while(offset<end){tick+=readVlq(end);maxTick=Math.max(maxTick,tick);let status=bytes[offset++];if(status<0x80){offset--;status=running;}else if(status<0xf0)running=status;if(status===0xff){const type=bytes[offset++],length=readVlq(end);if(type===0x51&&length===3)bpm=Math.round(60_000_000/((bytes[offset]<<16)|(bytes[offset+1]<<8)|bytes[offset+2]));offset+=length;continue;}if(status===0xf0||status===0xf7){offset+=readVlq(end);continue;}const kind=status&0xf0,channel=status&15,pitch=bytes[offset++],velocity=(kind===0xc0||kind===0xd0)?0:bytes[offset++];if(kind===0x90&&velocity>0)active.set(`${channel}:${pitch}`,{tick,velocity,pitch});else if(kind===0x80||(kind===0x90&&velocity===0)){const start=active.get(`${channel}:${pitch}`);if(start){notes.push({beat:start.tick/division,duration:Math.max(1/division,(tick-start.tick)/division),pitch:start.pitch,velocity:start.velocity/127,muted:false});active.delete(`${channel}:${pitch}`);}}}offset=end;}
  return {bpm,duration:Math.max(1,maxTick/division),notes};
}
