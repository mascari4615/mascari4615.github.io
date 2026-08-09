"use strict";(()=>{var M={"A+":4.5,A0:4,"A-":3.7,"B+":3.5,B0:3,"B-":2.7,"C+":2.5,C0:2,"C-":1.7,"D+":1.5,D0:1,"D-":.7,F:0},y={"A+":4.3,A0:4,"A-":3.7,"B+":3.3,B0:3,"B-":2.7,"C+":2.3,C0:2,"C-":1.7,"D+":1.3,D0:1,"D-":.7,F:0},x=r=>String(r)==="43"?y:M,T=r=>r["A+"];function L(r,t){let l=0,a=0,d=0,o={},p=[];for(let c of r.split(`
`)){let i=c.trim();if(i==="")continue;let n=/^(\d+(?:\.\d+)?)[\s,\t]+([A-Fa-f][+\-0]?)$/.exec(i);if(n===null){p.push(i);continue}let b=parseFloat(n[1]),e=n[2].toUpperCase();if(e.length===1&&e!=="F"&&(e+="0"),t[e]===void 0){p.push(i);continue}l+=b,a+=b*t[e],d++,o[e]=(o[e]??0)+1}let g=d===0?0:Object.keys(o).reduce((c,i)=>c+t[i]*o[i],0)/d;return{gpa:l===0?0:a/l,simple:g,credits:l,points:a,counted:d,bad:p}}function A(r,t,l,a,d){let o=(l*(t+a)-r)/a;return{required:o,possible:o<=d,alreadyThere:o<=0,best:(r+a*d)/(t+a)}}(function(){Toolbox.register({id:"grade",title:"\uD559\uC810 \uACC4\uC0B0\uAE30",category:"tool",desc:"\uACFC\uBAA9\uBCC4 \uD559\uC810\uACFC \uC131\uC801\uC73C\uB85C \uD3C9\uC810\uC744 \uACC4\uC0B0\uD569\uB2C8\uB2E4. \uBAA9\uD45C \uD559\uC810\uC5D0 \uD544\uC694\uD55C \uC131\uC801\uB3C4 \uD568\uAED8",layout:"wide",icon:'<path d="M12 4 2 9l10 5 10-5z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',tabs:[{id:"app",label:"\uD559\uC810",build:function(r){r.innerHTML=`
            <div class="field-group">
              <div class="tool-chips" id="grScale">
                <button type="button" class="tool-chip active" data-scale="45">4.5 \uB9CC\uC810</button>
                <button type="button" class="tool-chip" data-scale="43">4.3 \uB9CC\uC810</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">\uACFC\uBAA9 \u2014 \uD55C \uC904\uC5D0 \u300C\uD559\uC810 \uC131\uC801\u300D (\uC608: 3 A+)</label>
              <textarea id="grList" rows="8" spellcheck="false" placeholder="3 A+&#10;3 B0&#10;2 A0&#10;1 B+"></textarea>
            </div>

            <div class="cc-stats" id="grStats"></div>
            <div class="tool-list" id="grOut"></div>

            <div class="field-group" style="margin-top:var(--space-xl);">
              <label class="field-label">\uBAA9\uD45C \uD559\uC810 \uCC44\uC6B0\uAE30</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">\uBAA9\uD45C \uD3C9\uC810</div>
                  <input type="number" id="grTarget" aria-label="\uBAA9\uD45C \uD3C9\uC810" value="4.0" step="0.1" min="0" max="4.5">
                </div>
                <div>
                  <div class="tool-sublabel">\uC55E\uC73C\uB85C \uB4E4\uC744 \uD559\uC810</div>
                  <input type="number" id="grFuture" aria-label="\uC55E\uC73C\uB85C \uB4E4\uC744 \uD559\uC810" value="18" step="1" min="1">
                </div>
              </div>
            </div>
            <div class="tool-list" id="grNeed"></div>
            <div class="tool-status" id="grStatus">\uD559\uC810 \uC218\uB85C \uAC00\uC911\uD55C \uD3C9\uADE0\uC785\uB2C8\uB2E4. \uB2E8\uC21C \uD3C9\uADE0\uACFC \uB2E4\uB985\uB2C8\uB2E4.</div>
          `;let t=e=>r.querySelector(e),l=t("#grList"),a=t("#grStats"),d=t("#grOut"),o=t("#grNeed"),p=t("#grStatus"),g=x("45"),c=T(g),i=(e,s,f=!1)=>`<div class="cc-stat${f?" cc-stat-primary":""}"><div class="cc-stat-label">${e}</div><div class="cc-stat-value">${s}</div></div>`,n=(e,s)=>`<div class="tool-list-row"><span class="tool-list-key">${e}</span><span class="tool-list-val">${s}</span></div>`;function b(){let e=L(l.value,g),{credits:s,points:f,counted:h,bad:u}=e,v=e.gpa,E=e.simple;a.innerHTML=i("\uD3C9\uC810",s?v.toFixed(2):"\u2014",!0)+i("\uC774\uC218 \uD559\uC810",String(s))+i("\uBC31\uBD84\uC704 \uD658\uC0B0",s?`${(v/c*100).toFixed(1)}\uC810`:"\u2014"),d.innerHTML=n("\uACFC\uBAA9 \uC218",`${h}\uACFC\uBAA9`)+n("\uD559\uC810 \uAC00\uC911 \uD3C9\uADE0",s?v.toFixed(3):"\u2014")+n("\uB2E8\uC21C \uD3C9\uADE0 (\uCC38\uACE0)",h?E.toFixed(3):"\u2014")+n("\uB9CC\uC810 \uB300\uBE44",s?`${v.toFixed(2)} / ${c}`:"\u2014")+(u.length?n("\uBABB \uC77D\uC740 \uC904",u.slice(0,3).join(" \xB7 ")+(u.length>3?` \uC678 ${u.length-3}`:"")):"");let $=parseFloat(t("#grTarget").value),F=parseFloat(t("#grFuture").value);if(s&&F>0&&isFinite($)){let m=A(f,s,$,F,c);o.innerHTML=n("\uD544\uC694\uD55C \uD3C9\uADE0",m.possible?m.required.toFixed(2):`${m.required.toFixed(2)} \u2014 \uB9CC\uC810\uC73C\uB85C\uB3C4 \uBD88\uAC00\uB2A5`)+n("\uAC00\uB2A5 \uC5EC\uBD80",m.possible===!1?"\uC774\uBC88 \uBAA9\uD45C\uB294 \uB3C4\uB2EC \uBD88\uAC00":m.alreadyThere?"\uC774\uBBF8 \uB118\uC5C8\uC2B5\uB2C8\uB2E4":"\uAC00\uB2A5")+n("\uC804\uBD80 \uB9CC\uC810\uC774\uBA74",m.best.toFixed(2))}else o.innerHTML="";p.textContent=u.length?`${u.length}\uC904\uC744 \uBABB \uC77D\uC5C8\uC5B4\uC694. \u300C3 A+\u300D \uCC98\uB7FC \uD559\uC810\uACFC \uC131\uC801\uC744 \uB744\uC5B4 \uC801\uC5B4 \uC8FC\uC138\uC694.`:"\uD559\uC810 \uC218\uB85C \uAC00\uC911\uD55C \uD3C9\uADE0\uC785\uB2C8\uB2E4. \uB2E8\uC21C \uD3C9\uADE0\uACFC \uB2E4\uB985\uB2C8\uB2E4.",p.className="tool-status"+(u.length?" error":s?" ok":""),Toolbox.trackUse?.("calc")}r.querySelectorAll("#grScale .tool-chip").forEach(e=>{e.onclick=()=>{r.querySelectorAll("#grScale .tool-chip").forEach(s=>s.classList.remove("active")),e.classList.add("active"),g=x(e.dataset.scale),c=T(g),b()}}),[l,t("#grTarget"),t("#grFuture")].forEach(e=>e.addEventListener("input",b)),l.value=`3 A+
3 B0
2 A0
1 B+`,b()}}]})})();})();
