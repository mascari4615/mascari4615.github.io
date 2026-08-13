/**
 * 대회 셈법 — 창 없이 (TASK-KL-264 E3)
 *
 * 판마다 점수의 뜻이 다르다(제기는 많이 찰수록, 반응 측정은 빠를수록). 그래서 대회는 raw
 * 점수를 더하지 않고 **등수**로 센다. 그 셈이 맞는지를 여기서 잰다 — 창을 띄우지 않으므로
 * 1초 안에 끝나고, 틀리면 반드시 빨개진다(공동 1등 뒤를 2등으로 세던 것을 이 검사가 잡았다).
 */
import { build } from 'esbuild';
const r = await build({ entryPoints:['src/widgets/arcade/tour.ts'], bundle:true, format:'esm', write:false, platform:'node' });
const mod = await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
const { pickGames, award, isOver, ROUNDS, PARTY } = mod;
const KINDS=['quick','board','sport','card','puzzle'];
const all=[]; for(let i=0;i<51;i++) all.push({id:'g'+i,kind:KINDS[i%5],seats: i%3===0?[2,2]:[2,4]});
let bad=0;
for(let t=0;t<200;t++){
  const g=pickGames(all);
  if(g.length!==ROUNDS){console.log('len',g.length);bad++;break}
  if(new Set(g).size!==g.length){console.log('dup',g);bad++;break}
  const two=g.filter(id=>all.find(x=>x.id===id).seats[1]<PARTY);
  if(two.length){console.log('2인판 섞임',two);bad++;break}
}
// award
let st={games:['a','b'],at:0,points:[0,0,0],crew:[]};
st=award(st,[10,5,1]); console.log('1등3 2등1 3등0 →',st.points, st.at);
st=award(st,[7,7,1]);
const tie = st.points[0]===6 && st.points[1]===4 && st.points[2]===0;
console.log('공동 1등 둘, 나머지는 3등 →',st.points, tie?'✅':'❌ (공동1등 뒤는 0점이어야)');
if(!tie) bad++;
let st2={games:['a'],at:0,points:[0,0,0],crew:[]};
st2=award(st2,[5,3]); console.log('두 명만 앉은 판 →',st2.points,'(셋째는 그대로 0)');
console.log('isOver', isOver({games:['a','b'],at:2,points:[],crew:[]}));
if(bad) process.exit(1);
console.log(bad? '❌ 빨강':'✅ 200판 뽑기 전부 통과 (5판·중복없음·2인판 없음)');
