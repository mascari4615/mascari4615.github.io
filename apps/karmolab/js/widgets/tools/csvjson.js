"use strict";(()=>{var h={id:"csvjson",ops:{toJson:{desc:"CSV \uB97C JSON \uBC30\uC5F4\uB85C \uBC14\uAFBC\uB2E4. \uB530\uC634\uD45C \uC548\uC758 \uC27C\uD45C\xB7\uC904\uBC14\uAFC8\uC744 \uADDC\uCE59\uB300\uB85C(RFC 4180) \uCC98\uB9AC\uD55C\uB2E4. delimiter \uAE30\uBCF8\uC740 \uC27C\uD45C, coerce \uB97C \uCF1C\uBA74 \uC22B\uC790/true/false/null \uC744 \uADF8 \uD0C0\uC785\uC73C\uB85C \uBC14\uAFBC\uB2E4.",in:{csv:"string",delimiter:"string?",coerce:"boolean?"},out:"string"},toCsv:{desc:"JSON \uBC30\uC5F4\uC744 CSV \uB85C \uBC14\uAFBC\uB2E4. \uAC12\uC5D0 \uC27C\uD45C\xB7\uB530\uC634\uD45C\xB7\uC904\uBC14\uAFC8\uC774 \uC788\uC73C\uBA74 \uADDC\uCE59\uB300\uB85C \uAC10\uC2FC\uB2E4.",in:{json:"string",delimiter:"string?"},out:"string"}}};function S(e,l=","){let t=[],n=[],r="",o=!1;for(let s=0;s<e.length;s++){let i=e[s];if(o){i==='"'?e[s+1]==='"'?(r+='"',s++):o=!1:r+=i;continue}i==='"'?o=!0:i===l?(n.push(r),r=""):i===`
`?(n.push(r),t.push(n),n=[],r=""):i!=="\r"&&(r+=i)}return(r!==""||n.length>0)&&(n.push(r),t.push(n)),t.filter(s=>s.length>1||s[0]!=="")}function y(e,l=","){let t=[];for(let r of e)for(let o of Object.keys(r))t.indexOf(o)<0&&t.push(o);let n=r=>{let o=r==null?"":typeof r=="object"?JSON.stringify(r):String(r);return/["\n\r]|^\s|\s$/.test(o)||o.includes(l)?'"'+o.replace(/"/g,'""')+'"':o};return[t.join(l),...e.map(r=>t.map(o=>n(r[o])).join(l))].join(`
`)}function T(e){return e===""?"":e==="true"?!0:e==="false"?!1:e==="null"?null:/^-?\d+(\.\d+)?$/.test(e)&&String(Number(e))===e?Number(e):e}function w(e){return e.endsWith("?")?e.slice(0,-1):e}function x(e){return e.endsWith("?")}function C(e,l,t){switch(w(l)){case"number":{let n=Number(t);if(Number.isNaN(n))throw new Error(`${e} \uC740 \uC22B\uC790\uC5EC\uC57C \uD558\uB294\uB370 \u300C${t}\u300D \uAC00 \uC654\uC2B5\uB2C8\uB2E4`);return n}case"boolean":if(t===""||t==="1"||t==="true")return!0;if(t==="0"||t==="false")return!1;throw new Error(`${e} \uC740 true/false \uC5EC\uC57C \uD558\uB294\uB370 \u300C${t}\u300D \uAC00 \uC654\uC2B5\uB2C8\uB2E4`);default:return t}}function k(e,l){let t=new URLSearchParams(l??(typeof location>"u"?"":location.search)),n=t.get("op");if(n===null)return null;let r=t.get("out")==="raw",o=e.ops[n];if(o===void 0){let i=Object.keys(e.ops).join(" \xB7 ");return{op:n,args:{},raw:r,error:`\uC774 \uB3C4\uAD6C\uC5D0 \u300C${n}\u300D \uB294 \uC5C6\uC2B5\uB2C8\uB2E4. \uC788\uB294 \uAC83: ${i}`}}let s={};for(let[i,p]of Object.entries(o.in)){let d=t.get(i);if(d===null){if(x(p)===!1)return{op:n,args:s,raw:r,error:`\u300C${i}\u300D \uAC12\uC774 \uBE60\uC84C\uC2B5\uB2C8\uB2E4`};continue}try{s[i]=C(i,p,d)}catch(f){return{op:n,args:s,raw:r,error:f.message}}}return{op:n,args:s,raw:r}}(function(){Toolbox.register({id:"csvjson",title:"CSV \u2194 JSON \uBCC0\uD658",category:"tool",desc:"\uD45C(CSV)\uC640 JSON \uC744 \uC11C\uB85C \uBC14\uAFC9\uB2C8\uB2E4. \uB530\uC634\uD45C \uC548 \uC27C\uD45C\xB7\uC904\uBC14\uAFC8\uB3C4 \uC548 \uAE68\uC9D1\uB2C8\uB2E4",layout:"wide",icon:'<rect x="3" y="4" width="8" height="16" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h8M3 14h8" stroke="currentColor" stroke-width="1.3"/><path d="M15 6h1a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2a2 2 0 0 1-2 2h-1" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',tabs:[{id:"app",label:"CSV \u2194 JSON",build:function(e){e.innerHTML=`
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">\uAD6C\uBD84\uC790</div>
                  <select id="cjDelim" aria-label="\uAD6C\uBD84\uC790">
                    <option value=",">\uC27C\uD45C (,)</option>
                    <option value="&#9;">\uD0ED</option>
                    <option value=";">\uC138\uBBF8\uCF5C\uB860 (;)</option>
                    <option value="|">\uD30C\uC774\uD504 (|)</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">\uC22B\uC790\xB7\uCC38\uAC70\uC9D3 \uC790\uB3D9 \uC778\uC2DD</div>
                  <label class="tool-chip" style="display:inline-flex; align-items:center; height:38px;">
                    <input type="checkbox" id="cjCoerce" checked> \uCF1C\uAE30
                  </label>
                </div>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">CSV \u2014 \uCCAB \uC904\uC774 \uC5F4 \uC774\uB984</label>
              <textarea id="cjCsv" rows="7" spellcheck="false" placeholder="\uC774\uB984,\uB098\uC774&#10;\uD64D\uAE38\uB3D9,30"></textarea>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <!-- \uBC29\uD5A5 \uB2E8\uCD94\uB97C \uC5C6\uC574\uB2E4. **\uACE0\uCE5C \uCABD\uC774 \uACE7 \uBC29\uD5A5**\uC774\uB2E4 \u2014 CSV \uB97C \uACE0\uCE58\uBA74 JSON \uC774,
                   JSON \uC744 \uACE0\uCE58\uBA74 CSV \uAC00 \uB530\uB77C\uC628\uB2E4 (TASK-KL-133). -->
              <button class="btn btn-ghost" id="cjCopy">JSON \uBCF5\uC0AC</button>
            </div>
            <div class="field-group">
              <label class="field-label">JSON \u2014 \uAC1D\uCCB4 \uBC30\uC5F4</label>
              <textarea id="cjJson" aria-label="JSON \uC785\uB825" rows="9" spellcheck="false" placeholder='[{"\uC774\uB984":"\uD64D\uAE38\uB3D9","\uB098\uC774":30}]'></textarea>
            </div>
            <div class="tool-status" id="cjStatus">\uB530\uC634\uD45C \uC548\uC758 \uC27C\uD45C\uC640 \uC904\uBC14\uAFC8\uB3C4 \uADF8\uB300\uB85C \uC0B4\uB9BD\uB2C8\uB2E4.</div>
          `;let l=c=>e.querySelector(c),t=l("#cjCsv"),n=l("#cjJson"),r=l("#cjStatus"),o=()=>l("#cjDelim").value;function s(c,u=""){r.textContent=c,r.className="tool-status"+(u?" "+u:"")}function i(){let c=S(t.value.trim(),o());if(c.length<2){s("\uC5F4 \uC774\uB984 \uC904\uACFC \uC790\uB8CC \uC904\uC774 \uCD5C\uC18C \uD55C \uC904\uC529 \uD544\uC694\uD574\uC694.","error");return}let u=c[0],j=l("#cjCoerce").checked,b=c.slice(1).map(v=>{let m={};return u.forEach((O,g)=>m[O||`\uC5F4${g+1}`]=j?T(v[g]??""):v[g]??""),m});n.value=JSON.stringify(b,null,2),s(`${b.length}\uD589 \xB7 ${u.length}\uC5F4 \uC744 JSON \uC73C\uB85C \uBC14\uAFE8\uC5B4\uC694.`,"ok"),Toolbox.trackUse?.("to-json")}function p(){let c;try{c=JSON.parse(n.value)}catch(u){s("JSON \uC744 \uC77D\uC9C0 \uBABB\uD588\uC5B4\uC694: "+u.message,"error");return}if(!Array.isArray(c)||!c.length||typeof c[0]!="object"){s('\uAC1D\uCCB4\uAC00 \uB4E0 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD574\uC694. \uC608) [{"\uC774\uB984":"\uD64D\uAE38\uB3D9"}]',"error");return}t.value=y(c,o()),s(`${c.length}\uD589\uC744 CSV \uB85C \uBC14\uAFE8\uC5B4\uC694.`,"ok"),Toolbox.trackUse?.("to-csv")}l("#cjCopy").onclick=()=>{n.value&&Toolbox.copyText?.(n.value,{message:"JSON \uC744 \uBCF5\uC0AC\uD588\uC5B4\uC694"})};let d=null,f=c=>()=>{d!==null&&clearTimeout(d),d=setTimeout(c,200)};t.addEventListener("input",f(i)),n.addEventListener("input",f(p)),l("#cjDelim").addEventListener("change",i),l("#cjCoerce").addEventListener("change",i);let a=k(h);a!==null&&a.error===void 0&&a.op==="toCsv"?(n.value=String(a.args.json??""),p()):(t.value=a!==null&&a.error===void 0&&a.op==="toJson"?String(a.args.csv??""):`\uC774\uB984,\uB098\uC774,\uBA54\uBAA8
\uD64D\uAE38\uB3D9,30,"\uC27C\uD45C, \uB4E4\uC5B4\uAC04 \uAC12"
\uAE40\uCCA0\uC218,25,\uBCF4\uD1B5`,i())}}]})})();})();
