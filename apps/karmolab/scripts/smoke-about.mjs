import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {serveRepo} from './lib/serve-static.mjs';
const app=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const supplied=process.argv.find(arg=>/^https?:/.test(arg));
const out=process.env.ABOUT_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'about-review-'));
fs.mkdirSync(out,{recursive:true});
const server=supplied?null:await serveRepo(); const base=supplied||server.base;
const pages=fs.mkdtempSync(path.join(os.tmpdir(),'about-pages-'));
const errors=[]; const results={base,out,geometry:{},checks:[]};
const browser=await chromium.launch(process.env.CI?{headless:true}:{channel:'msedge',headless:false});
try{
 if(!supplied)execFileSync(process.execPath,[path.join(app,'scripts/gen-post-pages.mjs'),'--out',pages],{cwd:app,stdio:'pipe',windowsHide:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}); page.setDefaultTimeout(20000);
 if(!supplied){const html=fs.readFileSync(path.join(pages,'about/index.html'),'utf8').replace(/^---\n[\s\S]*?\n---\n/,'');await page.route(new URL('/about/',base).href,r=>r.fulfill({contentType:'text/html',body:html}));}
 if(process.argv.includes('--mutation'))await page.route('**/data/works.json',async route=>{const response=await route.fetch();const data=await response.json();data.works.pop();await route.fulfill({response,json:data})});
 page.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await page.goto(new URL('/about/',base).href);await page.locator('.ab[data-ready="true"]').waitFor();await page.locator('.ab img').evaluateAll(xs=>Promise.all(xs.map(i=>i.decode().catch(()=>{}))))};
 await ready();
 const source=await(await page.request.get(new URL('/apps/karmolab/data/works.json',base).href)).json();
 const config=await(await page.request.get(new URL('/apps/karmolab/data/about-presentation.json',base).href)).json();
 assert.equal(await page.locator('.ab-record dd').first().textContent(),String(source.works.length),'Project count matches the source data');
 const selected=[...new Set([...config.featured.flatMap(id=>source.works.find(w=>(w.slug||w.url)===id)||[]),...source.works])].slice(0,config.featuredLimit);
 assert.deepEqual(await page.locator('.ab-work h3').allTextContents(),selected.map(w=>w.title));
 assert.equal(await page.locator('.ab-account-card').count(),config.profiles.length);
 assert.equal(await page.locator('.ab-profile-record').count(),Object.keys(config.records).length);
 assert.equal(await page.locator('.ab-identity h1').isVisible(),true);
 assert.equal(await page.locator('.ab-resume details').count(),0);
 assert.equal(await page.locator('.ab-identity details').count(),0);
 assert.equal(await page.locator('.ab-record-symbol').count(),Object.values(config.records).filter(x=>x.symbol).length);
 for(const visual of Object.values(config.records)){const asset=visual.image||visual.symbol;if(asset)assert.equal((await page.request.get(new URL(asset,base).href)).status(),200)}
 assert.equal(await page.locator('.ab-identity img').evaluate(i=>i.naturalWidth>0),true);
 const art=await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();return [image.naturalWidth,image.naturalHeight]},config.art);results.art=art;
 for(const width of [1440,2560,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  await ready();
  results.geometry[width]=await page.locator('.ab').evaluate(el=>{const box=s=>{const r=el.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,right:r.right,bottom:r.bottom}};return {root:el.getBoundingClientRect().width,main:box('.ab-main'),sidebar:box('.ab-sidebar'),columns:getComputedStyle(el.querySelector('.ab-works')).gridTemplateColumns,overflow:document.documentElement.scrollWidth>innerWidth}});
  assert.equal(results.geometry[width].overflow,false);
  if(width===390)assert.ok(results.geometry[width].root>=330,'Mobile content remains wide enough to read');
  if(width>900)assert.ok(results.geometry[width].sidebar.x>=results.geometry[width].main.right);
  else assert.ok(results.geometry[width].sidebar.y>=results.geometry[width].main.bottom);
  await page.screenshot({path:path.join(out,`about-${width}.png`),fullPage:true});
  await page.locator('.ab-exhibit').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`projects-${width}.png`)});
  await page.locator('.ab-component').last().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`records-${width}.png`)});
 }
 await page.locator('.ab-more').click();assert.equal(await page.locator('.ab-work').count(),source.works.length);
 await page.locator('.ab-more').click();assert.equal(await page.locator('.ab-work').count(),selected.length);
 results.checks.push('featured order, all projects expand/collapse, records, profile links, icons, hero, responsive');
 if(!supplied){
  await page.route('**/data/works.json',r=>r.fulfill({json:{works:[{title:'Replacement project',url:'/posts/replacement/',image:'data:text/html,invalid',platform:'Other',roles:[],description:'A different dataset'}]}}));
  await ready();assert.equal(await page.locator('.ab-work').count(),1);assert.equal(await page.locator('.ab-placeholder').count(),1);assert.equal(await page.locator('.ab-more').isVisible(),false);
  await page.route('**/data/works.json',r=>r.fulfill({json:{works:[]}}));await ready();assert.equal(await page.locator('.ab-work').count(),0);assert.equal(await page.locator('.ab-more').isVisible(),false);
  await page.route('**/data/about-presentation.json',r=>r.fulfill({json:{...config,records:{},profiles:[]}}));await ready();assert.equal(await page.locator('.ab-record-icon').count(),Object.keys(config.records).length);assert.equal(await page.locator('.ab-accounts').isVisible(),false);
  results.checks.push('replacement and empty projects, missing icons, empty profiles');
 }
 assert.deepEqual(errors,[]);results.errors=errors;results.status='PASS';
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
}catch(error){
 results.status='FAIL';results.error=error.stack||String(error);results.errors=errors;
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n');console.error(results.error);process.exitCode=1;
}finally{
 for(const context of browser.contexts())await context.request.dispose();
 await browser.close();server?.close();fs.rmSync(pages,{recursive:true,force:true});
}
