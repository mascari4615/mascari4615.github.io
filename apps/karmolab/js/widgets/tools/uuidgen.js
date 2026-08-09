"use strict";(()=>{var x={id:"uuidgen",ops:{generate:{desc:"\uC554\uD638\uD559\uC801\uC73C\uB85C \uC548\uC804\uD55C \uB09C\uC218\uB85C ID \uB97C \uB9CC\uB4E0\uB2E4 (LLM \uC774 \uC9C0\uC5B4\uB0B8 \uAC12\uC740 \uBB34\uC791\uC704\uAC00 \uC544\uB2C8\uB2E4). kind = uuid4(\uAE30\uBCF8) \xB7 uuid7(\uC2DC\uAC04\uC21C \uC815\uB82C\uB428) \xB7 ulid \xB7 nanoid \xB7 password. count \uB294 \uAC1C\uC218, length \uB294 nanoid\xB7password \uC758 \uAE38\uC774, symbols \uB294 password \uC5D0 \uAE30\uD638 \uD3EC\uD568.",in:{kind:"string?",count:"number?",length:"number?",symbols:"boolean?"},out:"string"}}};function d(e){let n=new Uint8Array(e);return crypto.getRandomValues(n),n}var y=e=>[...e].map(n=>n.toString(16).padStart(2,"0")).join(""),v=e=>`${e.slice(0,8)}-${e.slice(8,12)}-${e.slice(12,16)}-${e.slice(16,20)}-${e.slice(20)}`;function h(){if(typeof crypto.randomUUID=="function")return crypto.randomUUID();let e=d(16);return e[6]=e[6]&15|64,e[8]=e[8]&63|128,v(y(e))}function T(e=Date.now()){let n=d(16);return n[0]=e/2**40&255,n[1]=e/2**32&255,n[2]=e/2**24&255,n[3]=e/2**16&255,n[4]=e/2**8&255,n[5]=e&255,n[6]=n[6]&15|112,n[8]=n[8]&63|128,v(y(n))}var b="useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";function w(e=21){return[...d(e)].map(n=>b[n%b.length]).join("")}var m="0123456789ABCDEFGHJKMNPQRSTVWXYZ";function L(e=Date.now()){let n=e,t="";for(let r=0;r<10;r++)t=m[n%32]+t,n=Math.floor(n/32);let o=[...d(16)].map(r=>m[r%32]).join("").slice(0,16);return t+o}function k(e=16,n=!1){let o="abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"+(n?"!@#$%^&*()-_=+[]{}":"");return[...d(e)].map(r=>o[r%o.length]).join("")}function E(e){return e.endsWith("?")?e.slice(0,-1):e}function M(e){return e.endsWith("?")}function $(e,n,t){switch(E(n)){case"number":{let o=Number(t);if(Number.isNaN(o))throw new Error(`${e} \uC740 \uC22B\uC790\uC5EC\uC57C \uD558\uB294\uB370 \u300C${t}\u300D \uAC00 \uC654\uC2B5\uB2C8\uB2E4`);return o}case"boolean":if(t===""||t==="1"||t==="true")return!0;if(t==="0"||t==="false")return!1;throw new Error(`${e} \uC740 true/false \uC5EC\uC57C \uD558\uB294\uB370 \u300C${t}\u300D \uAC00 \uC654\uC2B5\uB2C8\uB2E4`);default:return t}}function S(e,n){let t=new URLSearchParams(n??(typeof location>"u"?"":location.search)),o=t.get("op");if(o===null)return null;let r=t.get("out")==="raw",l=e.ops[o];if(l===void 0){let i=Object.keys(e.ops).join(" \xB7 ");return{op:o,args:{},raw:r,error:`\uC774 \uB3C4\uAD6C\uC5D0 \u300C${o}\u300D \uB294 \uC5C6\uC2B5\uB2C8\uB2E4. \uC788\uB294 \uAC83: ${i}`}}let a={};for(let[i,s]of Object.entries(l.in)){let c=t.get(i);if(c===null){if(M(s)===!1)return{op:o,args:a,raw:r,error:`\u300C${i}\u300D \uAC12\uC774 \uBE60\uC84C\uC2B5\uB2C8\uB2E4`};continue}try{a[i]=$(i,s,c)}catch(p){return{op:o,args:a,raw:r,error:p.message}}}return{op:o,args:a,raw:r}}(function(){Toolbox.register({id:"uuidgen",title:"UUID \uC0DD\uC131\uAE30",category:"tool",desc:"UUID v4\xB7v7, ULID, NanoID, \uC548\uC804\uD55C \uBE44\uBC00\uBC88\uD638\uB97C \uC6D0\uD558\uB294 \uAC1C\uC218\uB9CC\uD07C \uB9CC\uB4ED\uB2C8\uB2E4",layout:"form",icon:'<rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 12h2M11 12h2M15 12h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',tabs:[{id:"app",label:"UUID",build:function(e){Mdd.linePreset("tool_run",{msg:"\uACB9\uCE60 \uB9AC \uC5C6\uB294 \uC774\uB984\uD45C, \uCC0D\uC5B4 \uB4DC\uB9B4\uAC8C\uC694."}),e.innerHTML=`
            <div class="field-group">
              <label class="field-label">\uC885\uB958</label>
              <select id="uuKind" aria-label="\uC885\uB958">
                <option value="v4">UUID v4 \u2014 \uC644\uC804 \uBB34\uC791\uC704 (\uAC00\uC7A5 \uC77C\uBC18\uC801)</option>
                <option value="v7">UUID v7 \u2014 \uC2DC\uAC04 \uC815\uB82C \uAC00\uB2A5 (DB \uAE30\uBCF8\uD0A4 \uCD94\uCC9C)</option>
                <option value="ulid">ULID \u2014 26\uC790, \uC2DC\uAC04 \uC815\uB82C + \uB300\uC18C\uBB38\uC790 \uD63C\uB3D9 \uC5C6\uC74C</option>
                <option value="nano">NanoID \u2014 \uC9E7\uC740 URL \uC548\uC804 ID</option>
                <option value="pw">\uBE44\uBC00\uBC88\uD638 \u2014 \uD5F7\uAC08\uB9AC\uB294 \uAE00\uC790(0/O, l/1) \uC81C\uC678</option>
              </select>
            </div>
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">\uAC1C\uC218 <span id="uuCountVal" class="range-value">10\uAC1C</span></div>
                  <input type="range" id="uuCount" aria-label="\uAC1C\uC218" min="1" max="100" value="10">
                </div>
                <div>
                  <div class="tool-sublabel">\uAE38\uC774 <span id="uuLenVal" class="range-value">21\uC790</span></div>
                  <input type="range" id="uuLen" aria-label="\uAE38\uC774" min="6" max="64" value="21">
                </div>
              </div>
              <div style="display:flex; gap:14px; margin-top:10px; flex-wrap:wrap;">
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="uuUpper" style="width:auto;"> \uB300\uBB38\uC790
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="uuNoDash" style="width:auto;"> \uD558\uC774\uD508 \uC81C\uAC70
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="uuSymbols" style="width:auto;" checked> \uBE44\uBC00\uBC88\uD638\uC5D0 \uAE30\uD638 \uD3EC\uD568
                </label>
              </div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-lg);">
              <button class="btn btn-primary" id="uuGen">\uC0DD\uC131</button>
              <button class="btn btn-ghost" id="uuCopy">\uC804\uCCB4 \uBCF5\uC0AC</button>
            </div>
            <textarea id="uuOut" aria-label="\uB9CC\uB4E4\uC5B4\uC9C4 \uAC12" class="mono-input" readonly style="min-height:240px;"></textarea>
            <div class="tool-status">\uBAA8\uB450 \uBE0C\uB77C\uC6B0\uC800\uC758 \uC554\uD638\uD559\uC801 \uB09C\uC218(crypto.getRandomValues)\uB85C \uB9CC\uB4E4\uBA70 \uC11C\uBC84\uB85C \uC804\uC1A1\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</div>
          `;let n=s=>e.querySelector(s),t=n("#uuKind"),o=n("#uuCount"),r=n("#uuLen"),l=n("#uuOut");function a(){n("#uuCountVal").textContent=o.value+"\uAC1C",n("#uuLenVal").textContent=r.value+"\uC790";let s=parseInt(o.value,10),c=parseInt(r.value,10),p=n("#uuUpper").checked,U=n("#uuNoDash").checked,I=n("#uuSymbols").checked,f=[];for(let g=0;g<s;g++){let u;switch(t.value){case"v7":u=T();break;case"ulid":u=L();break;case"nano":u=w(c);break;case"pw":u=k(c,I);break;default:u=h()}U&&(u=u.replace(/-/g,"")),p&&(u=u.toUpperCase()),f.push(u)}l.value=f.join(`
`)}[t,o,r].forEach(s=>{s.addEventListener("input",a),s.addEventListener("change",a)}),e.querySelectorAll('input[type="checkbox"]').forEach(s=>s.addEventListener("change",a)),n("#uuGen").onclick=a;let i=S(x);i!==null&&i.error===void 0&&i.op==="generate"&&(i.args.kind!==void 0&&(t.value=String(i.args.kind)),i.args.count!==void 0&&(o.value=String(i.args.count)),i.args.length!==void 0&&(r.value=String(i.args.length))),n("#uuCopy").onclick=async()=>{l.value&&await Toolbox.copyText?.(l.value,{message:`${l.value.split(`
`).length}\uAC1C\uB97C \uBCF5\uC0AC\uD588\uC5B4\uC694`})},a()}}]})})();})();
