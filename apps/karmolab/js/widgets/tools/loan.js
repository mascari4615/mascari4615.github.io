"use strict";(()=>{var H={id:"loan",ops:{schedule:{desc:"\uB300\uCD9C \uC0C1\uD658\uD45C\uB97C \uB9CC\uB4E0\uB2E4. method = equal(\uC6D0\uB9AC\uAE08\uADE0\uB4F1\xB7\uAE30\uBCF8) | principal(\uC6D0\uAE08\uADE0\uB4F1) | bullet(\uB9CC\uAE30\uC77C\uC2DC). grace \uB294 \uAC70\uCE58\uAC1C\uC6D4(\uC774\uC790\uB9CC \uB0C4), extra \uB294 \uB9E4\uB2EC \uB354 \uAC1A\uB294 \uAE08\uC561.",in:{amount:"number",rate:"number",months:"number",method:"string?",grace:"number?",extra:"number?"},out:"string"},compare:{desc:"\uC138 \uC0C1\uD658 \uBC29\uC2DD(\uC6D0\uB9AC\uAE08\uADE0\uB4F1\xB7\uC6D0\uAE08\uADE0\uB4F1\xB7\uB9CC\uAE30\uC77C\uC2DC)\uC758 \uCD1D\uC774\uC790\uC640 \uCCAB \uB2EC \uC0C1\uD658\uC561\uC744 \uB098\uB780\uD788 \uBE44\uAD50\uD55C\uB2E4.",in:{amount:"number",rate:"number",months:"number"},out:"string"}}},c=t=>Math.round(t).toLocaleString("ko-KR")+"\uC6D0";function E(t,e,n){let l=e/100/12,i=l===0?t/n:t*l*Math.pow(1+l,n)/(Math.pow(1+l,n)-1),o=[],r=t;for(let s=1;s<=n;s++){let u=r*l,f=i-u;r=Math.max(0,r-f),o.push({n:s,pay:i,interest:u,principal:f,left:r})}return o}function L(t,e,n){let l=e/100/12,i=t/n,o=[],r=t;for(let s=1;s<=n;s++){let u=r*l;r=Math.max(0,r-i),o.push({n:s,pay:i+u,interest:u,principal:i,left:r})}return o}function S(t,e,n){let l=e/100/12,i=[];for(let o=1;o<=n;o++){let r=o===n;i.push({n:o,pay:t*l+(r?t:0),interest:t*l,principal:r?t:0,left:r?0:t})}return i}function I(t,e,n,l){if(n<=0)return l;let i=e/100/12,o=[];for(let r=1;r<=n;r++)o.push({n:r,pay:t*i,interest:t*i,principal:0,left:t});return o.concat(l.map(r=>({...r,n:r.n+n})))}function k(t,e,n){if(n<=0)return t;let l=e/100/12,i=[],o=t[0]?t[0].left+t[0].principal:0;for(let r of t){if(o<=0)break;let s=o*l,u=Math.min(r.principal+n,o);o=Math.max(0,o-u),i.push({n:r.n,pay:s+u,interest:s,principal:u,left:o})}return i}function q(t){return t.endsWith("?")?t.slice(0,-1):t}function j(t){return t.endsWith("?")}function G(t,e,n){switch(q(e)){case"number":{let l=Number(n);if(Number.isNaN(l))throw new Error(`${t} \uC740 \uC22B\uC790\uC5EC\uC57C \uD558\uB294\uB370 \u300C${n}\u300D \uAC00 \uC654\uC2B5\uB2C8\uB2E4`);return l}case"boolean":if(n===""||n==="1"||n==="true")return!0;if(n==="0"||n==="false")return!1;throw new Error(`${t} \uC740 true/false \uC5EC\uC57C \uD558\uB294\uB370 \u300C${n}\u300D \uAC00 \uC654\uC2B5\uB2C8\uB2E4`);default:return n}}function F(t,e){let n=new URLSearchParams(e??(typeof location>"u"?"":location.search)),l=n.get("op");if(l===null)return null;let i=n.get("out")==="raw",o=t.ops[l];if(o===void 0){let s=Object.keys(t.ops).join(" \xB7 ");return{op:l,args:{},raw:i,error:`\uC774 \uB3C4\uAD6C\uC5D0 \u300C${l}\u300D \uB294 \uC5C6\uC2B5\uB2C8\uB2E4. \uC788\uB294 \uAC83: ${s}`}}let r={};for(let[s,u]of Object.entries(o.in)){let f=n.get(s);if(f===null){if(j(u)===!1)return{op:l,args:r,raw:i,error:`\u300C${s}\u300D \uAC12\uC774 \uBE60\uC84C\uC2B5\uB2C8\uB2E4`};continue}try{r[s]=G(s,u,f)}catch(b){return{op:l,args:r,raw:i,error:b.message}}}return{op:l,args:r,raw:i}}(function(){Toolbox.register({id:"loan",title:"\uB300\uCD9C \uC0C1\uD658\uD45C",category:"tool",desc:"\uC6D0\uB9AC\uAE08\uADE0\uB4F1\xB7\uC6D0\uAE08\uADE0\uB4F1\xB7\uB9CC\uAE30\uC77C\uC2DC \uC0C1\uD658\uC744 \uBE44\uAD50\uD558\uACE0 \uB2EC\uBCC4 \uC6D0\uAE08\xB7\uC774\uC790\uB97C \uBD05\uB2C8\uB2E4",layout:"wide",icon:'<path d="M3 20h18M6 20V10M11 20V6M16 20v-8M21 20v-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',tabs:[{id:"app",label:"\uC0C1\uD658\uD45C",build:function(t){t.innerHTML=`
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">\uB300\uCD9C \uAE08\uC561</div>
                  <input type="number" id="loP" value="100000000" step="1000000" min="0" aria-label="\uB300\uCD9C \uAE08\uC561">
                </div>
                <div>
                  <div class="tool-sublabel">\uC5F0 \uC774\uC790\uC728 (%)</div>
                  <input type="number" id="loR" value="4.5" step="0.1" min="0" aria-label="\uC5F0 \uC774\uC790\uC728 (%)">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">\uAE30\uAC04 (\uAC1C\uC6D4)</div>
                  <input type="number" id="loM" value="360" step="12" min="1" aria-label="\uAE30\uAC04 (\uAC1C\uC6D4)">
                </div>
                <div>
                  <div class="tool-sublabel">\uC0C1\uD658 \uBC29\uC2DD</div>
                  <select id="loType" aria-label="\uC0C1\uD658 \uBC29\uC2DD">
                    <option value="ep">\uC6D0\uB9AC\uAE08\uADE0\uB4F1 \u2014 \uB9E4\uB2EC \uAC19\uC740 \uAE08\uC561</option>
                    <option value="pp">\uC6D0\uAE08\uADE0\uB4F1 \u2014 \uC810\uC810 \uC904\uC5B4\uB4E6</option>
                    <option value="bu">\uB9CC\uAE30\uC77C\uC2DC \u2014 \uC774\uC790\uB9CC \uB0B4\uB2E4 \uD55C \uBC88\uC5D0</option>
                  </select>
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">\uAC70\uCE58\uAE30\uAC04 (\uAC1C\uC6D4) \u2014 \uC774\uC790\uB9CC \uB0B4\uB294 \uAE30\uAC04</div>
                  <input type="number" id="loG" value="0" step="6" min="0" aria-label="\uAC70\uCE58\uAE30\uAC04 (\uAC1C\uC6D4)">
                </div>
                <div>
                  <div class="tool-sublabel">\uB9E4\uB2EC \uB354 \uAC1A\uAE30 (\uC6D0)</div>
                  <input type="number" id="loX" value="0" step="100000" min="0" aria-label="\uB9E4\uB2EC \uB354 \uAC1A\uAE30 (\uC6D0)">
                </div>
              </div>
            </div>

            <div class="cc-stats" id="loStats"></div>
            <div class="tool-list" id="loCompare"></div>

            <div class="field-row" style="margin:16px 0 6px;">
              <div class="tool-sublabel" id="loTableHead" style="margin:0;">\uB2EC\uBCC4 \uC0C1\uD658\uD45C \u2014 \uCC98\uC74C 12\uAC1C\uC6D4\uACFC \uB9C8\uC9C0\uB9C9 \uB2EC</div>
              <div style="display:flex; gap:6px;">
                <button class="btn btn-ghost" id="loAll">\uC804\uCCB4 \uBCF4\uAE30</button>
                <button class="btn btn-ghost" id="loCsv">\uD45C \uB0B4\uB824\uBC1B\uAE30</button>
              </div>
            </div>
            <div class="tool-list" id="loTable"></div>
            <div class="tool-status" id="loStatus">\uBD80\uB300\uBE44\uC6A9\xB7\uC911\uB3C4\uC0C1\uD658\uC218\uC218\uB8CC\uB294 \uB123\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.</div>
          `;let e=a=>t.querySelector(a),n=e("#loStats"),l=e("#loCompare"),i=e("#loTable"),o=(a,p,g=!1)=>`<div class="cc-stat${g?" cc-stat-primary":""}"><div class="cc-stat-label">${a}</div><div class="cc-stat-value">${p}</div></div>`,r=(a,p)=>`<div class="tool-list-row"><span class="tool-list-key">${a}</span><span class="tool-list-val">${p}</span></div>`;function s(){let a=parseFloat(e("#loP").value)||0,p=parseFloat(e("#loR").value)||0,g=Math.max(1,Math.round(parseFloat(e("#loM").value)||1)),h=e("#loType").value,M=Math.max(0,Math.round(parseFloat(e("#loG").value)||0)),$=Math.max(0,parseFloat(e("#loX").value)||0),v=I(a,p,M,(h==="pp"?L:h==="bu"?S:E)(a,p,g)),d=h==="bu"?v:k(v,p,$),x=d.reduce((m,y)=>m+y.interest,0),w=v.reduce((m,y)=>m+y.interest,0)-x,R=v.length-d.length;n.innerHTML=o(h==="ep"?"\uC6D4 \uC0C1\uD658\uC561":"\uCCAB \uB2EC \uC0C1\uD658\uC561",c(d[0].pay),!0)+o("\uCD1D \uC774\uC790",c(x))+o("\uCD1D \uC0C1\uD658\uC561",c(a+x))+(M>0?o("\uAC70\uCE58 \uC911 \uC6D4 \uC774\uC790",c(a*(p/100/12))):"")+(w>0?o("\uB354 \uAC1A\uC544 \uC544\uB080 \uC774\uC790",c(w),!0):"")+(R>0?o("\uBE68\uB77C\uC9C4 \uAE30\uAC04",`${R}\uAC1C\uC6D4`):"");let O=[["\uC6D0\uB9AC\uAE08\uADE0\uB4F1",E(a,p,g)],["\uC6D0\uAE08\uADE0\uB4F1",L(a,p,g)],["\uB9CC\uAE30\uC77C\uC2DC",S(a,p,g)]];l.innerHTML=O.map(([m,y])=>{let U=y.reduce((N,B)=>N+B.interest,0);return r(m,`\uCD1D\uC774\uC790 ${c(U)} \xB7 \uCCAB \uB2EC ${c(y[0].pay)}`)}).join(""),f=d;let C=u?d:[...d.slice(0,12),...d.length>12?[d[d.length-1]]:[]];e("#loTableHead").textContent=u?`\uB2EC\uBCC4 \uC0C1\uD658\uD45C \u2014 ${d.length}\uAC1C\uC6D4 \uC804\uBD80`:"\uB2EC\uBCC4 \uC0C1\uD658\uD45C \u2014 \uCC98\uC74C 12\uAC1C\uC6D4\uACFC \uB9C8\uC9C0\uB9C9 \uB2EC",i.innerHTML=C.map(m=>`<div class="tool-list-row"><span class="tool-list-key">${m.n}\uAC1C\uC6D4</span><span class="tool-list-val">${c(m.pay)} <span class="tool-list-dim">\uC6D0\uAE08 ${c(m.principal)} \xB7 \uC774\uC790 ${c(m.interest)} \xB7 \uC794\uC561 ${c(m.left)}</span></span></div>`).join("");let A=d[0].pay?d[0].interest/d[0].pay*100:0;e("#loStatus").textContent=`\uCCAB \uB2EC \uC0C1\uD658\uC561\uC758 ${A.toFixed(0)}%\uAC00 \uC774\uC790\uC785\uB2C8\uB2E4.`+(M>0?` \uAC70\uCE58 ${M}\uAC1C\uC6D4 \uB3D9\uC548\uC740 \uC6D0\uAE08\uC774 \uC548 \uC904\uC5B4\uB4ED\uB2C8\uB2E4.`:"")+(w>0?` \uB9E4\uB2EC ${c($)} \uB354 \uAC1A\uC73C\uBA74 ${R}\uAC1C\uC6D4 \uBE68\uB9AC \uB05D\uB098\uACE0 \uC774\uC790 ${c(w)}\uC744 \uC544\uB08D\uB2C8\uB2E4.`:"")+" \uBD80\uB300\uBE44\uC6A9\xB7\uC911\uB3C4\uC0C1\uD658\uC218\uC218\uB8CC\uB294 \uB123\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",Toolbox.trackUse?.(h)}let u=!1,f=[];e("#loAll").onclick=()=>{u=!u,e("#loAll").textContent=u?"\uC811\uAE30":"\uC804\uCCB4 \uBCF4\uAE30",s()},e("#loCsv").onclick=()=>{if(!f.length)return;let a=`
`,p="\uFEFF",g="\uD68C\uCC28,\uC0C1\uD658\uC561,\uC6D0\uAE08,\uC774\uC790,\uC794\uC561",h=f.map(v=>[v.n,Math.round(v.pay),Math.round(v.principal),Math.round(v.interest),Math.round(v.left)].join(",")).join(a),M=new Blob([p+g+a+h],{type:"text/csv;charset=utf-8"}),$=URL.createObjectURL(M),T=document.createElement("a");T.href=$,T.download="\uB300\uCD9C\uC0C1\uD658\uD45C.csv",T.click(),URL.revokeObjectURL($),Toolbox.trackUse?.("csv")},t.querySelectorAll("input, select").forEach(a=>{a.addEventListener("input",s),a.addEventListener("change",s)});let b=F(H);if(b!==null&&b.error===void 0){e("#loP").value=String(b.args.amount??e("#loP").value),e("#loR").value=String(b.args.rate??e("#loR").value),e("#loM").value=String(b.args.months??e("#loM").value),b.args.grace!==void 0&&(e("#loG").value=String(b.args.grace)),b.args.extra!==void 0&&(e("#loX").value=String(b.args.extra));let a=String(b.args.method??"equal");e("#loType").value=a==="principal"?"pp":a==="bullet"?"bu":"ep"}s()}}]})})();})();
