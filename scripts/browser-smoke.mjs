// A real ChromeDriver UI check on the hosted Linux runner. No npm browser dependency.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createAgasServer } from "../src/server.js";

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const temp=await mkdtemp(join(tmpdir(),"agas-ui-"));
const app=createAgasServer({database:join(temp,"agas.db"),vault:join(temp,"vault"),
  workspaces:join(temp,"workspaces"),token:"browser-smoke",adapters:{}});
const driver=spawn("chromedriver",["--port=9515","--allowed-ips=127.0.0.1"],{stdio:["ignore","pipe","pipe"]});
let driverErrors="",session;
driver.stderr.on("data",chunk=>{driverErrors=(driverErrors+chunk).slice(-8000)});
const origin="http://127.0.0.1:9515";
async function command(method,path,data) {
  const response=await fetch(origin+path,{method,headers:{"content-type":"application/json"},
    body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  if(!response.ok||result.value?.error)throw new Error(`WebDriver ${path}: ${JSON.stringify(result.value||result).slice(0,1500)}`);
  return result.value;
}
async function execute(script,args=[]) {return command("POST",`/session/${session}/execute/sync`,{script,args})}
async function element(selector) {
  const result=await command("POST",`/session/${session}/element`,{using:"css selector",value:selector});
  return result["element-6066-11e4-a52e-4f735466cecf"];
}
async function click(selector) {await command("POST",`/session/${session}/element/${await element(selector)}/click`,{})}
async function waitFor(script,description) {
  for(let attempt=0;attempt<80;attempt++){
    if(await execute(script))return;
    await pause(200);
  }
  throw new Error(`Browser never reached: ${description}`);
}
async function fillAndSubmit(fields) {
  const errors=await execute(`const form=document.querySelector('#modal-form');
    for(const [name,value] of Object.entries(arguments[0])) {
      const control=form.elements.namedItem(name);
      if(!control)return 'Missing '+name;
      control.value=value;
      control.dispatchEvent(new Event('input',{bubbles:true}));
      control.dispatchEvent(new Event('change',{bubbles:true}));
    }
    if(!form.checkValidity())return 'Invalid form '+Array.from(form.elements).filter(x=>x.willValidate&&!x.checkValidity()).map(x=>x.name).join(',');
    form.requestSubmit();return '';`,[fields]);
  assert.equal(errors,"",errors);
  await waitFor("return !document.querySelector('#modal').open","form save");
  assert.equal(await execute("return document.querySelector('#notice').style.background === 'rgb(84, 45, 50)'"),false,
    "the UI showed an error toast");
}
async function screenshot(name) {
  await execute("window.scrollTo(0,0);document.querySelector('#main').scrollTop=0");
  const bytes=await command("GET",`/session/${session}/screenshot`);
  await mkdir(resolve("data"),{recursive:true});
  await writeFile(resolve(`data/${name}`),Buffer.from(bytes,"base64"));
}
try {
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  let available=false;
  for(let i=0;i<100;i++){
    if(driver.exitCode!==null)throw new Error(`ChromeDriver exited: ${driverErrors}`);
    try{const status=await fetch(origin+"/status",{signal:AbortSignal.timeout(500)});if(status.ok){available=true;break}}catch{}
    await pause(100);
  }
  if(!available)throw new Error(`ChromeDriver did not start: ${driverErrors}`);
  const created=await command("POST","/session",{capabilities:{alwaysMatch:{browserName:"chrome",
    "goog:chromeOptions":{args:["--headless=new","--no-sandbox","--disable-dev-shm-usage","--window-size=1440,900"]}}}});
  session=created.sessionId;
  assert.ok(session,"Chrome did not return a WebDriver session");
  await command("POST",`/session/${session}/url`,{url:`http://127.0.0.1:${app.server.address().port}`});
  await waitFor("return !!document.querySelector('#login-form #token')","login screen");
  await execute(`window.__agasBrowserErrors=[];
    window.addEventListener('error',e=>window.__agasBrowserErrors.push(e.message));
    window.addEventListener('unhandledrejection',e=>window.__agasBrowserErrors.push(String(e.reason)));
    const original=console.error;console.error=(...args)=>{window.__agasBrowserErrors.push(args.map(String).join(' '));original(...args)};`);
  const token=await element("#token");
  await command("POST",`/session/${session}/element/${token}/value`,{text:"browser-smoke"});
  await click("#login-form button[type=submit]");
  await waitFor("return document.querySelector('#login-overlay').classList.contains('hidden') && document.querySelector('#content').innerText.includes('Mission control')","authenticated workspace");
  await screenshot("agas-overview.png");
  await click('[data-action="hub"][data-id="security"]');
  await waitFor("return document.querySelector('#content').innerText.includes('Authorized Security · findings')","Security hub");
  await click('[data-action="new-project"]');
  await fillAndSubmit({hubId:"security",kind:"security",title:"Owned test system",description:"Read only assessment"});
  await waitFor("return document.querySelector('#content').innerText.includes('Owned test system')","Security project");
  await click('[data-action="new-assessment"]');
  await fillAndSubmit({projectId:(await execute("return document.querySelector('#modal-form [name=projectId]').value")),
    assetLabel:"owned.example.test",scopeNote:"Configuration review only",authorizedBy:"Test owner",
    authorizationNote:"Owner attests to this fixture",validUntil:new Date(Date.now()+7*86400000).toISOString().slice(0,10)});
  await waitFor("return document.querySelector('#content').innerText.includes('owned.example.test')","Security assessment");
  await click('[data-action="hub"][data-id="health"]');
  await waitFor("return document.querySelector('#content').innerText.includes('Family Health · care coordination')","Health hub");
  await click('[data-action="new-project"]');
  await fillAndSubmit({hubId:"health",kind:"health",title:"Private care project",description:"One person's local administration"});
  await click('[data-action="new-health-profile"]');
  await fillAndSubmit({projectId:(await execute("return document.querySelector('#modal-form [name=projectId]').value")),
    alias:"Person A",consentBy:"Person A",consentPurpose:"Local appointments only",
    validUntil:new Date(Date.now()+7*86400000).toISOString().slice(0,10)});
  await waitFor("return document.querySelector('#content').innerText.includes('Person A')","Health profile");
  await click('[data-action="new-care-item"]');
  await fillAndSubmit({kind:"document",title:"Check paperwork",nextStep:"Confirm forms with owner"});
  await waitFor("return document.querySelector('#content').innerText.includes('Check paperwork')","Health care item");
  assert.deepEqual(await execute("return window.__agasBrowserErrors"),[],"browser reported page errors");
  await screenshot("agas-health.png");
  await click('#nav button[data-view="windows"]');
  await waitFor("return document.querySelector('.window-tabs')?.querySelectorAll('button').length === 5","five agent windows");
  await click('[data-action="select-window"][data-id="claude"]');
  await waitFor("return document.querySelector('.window-header')?.innerText.includes('bounded text tasks')","Claude workspace and capability");
  assert.equal(await execute("return !!document.querySelector('.window-header iframe')"),false,
    "desktop agent window must not masquerade as an embedded native UI");
  await click('[data-action="select-window"][data-id="hermes"]');
  await waitFor("return !!document.querySelector('#window-form input[name=url]')","Hermes native URL form");
  assert.equal(await execute("return !!document.querySelector('.window-frame iframe')"),false,
    "the native web panel opens only after a local address is selected");
  assert.deepEqual(await execute("return window.__agasBrowserErrors"),[],"agent window navigation reported page errors");
  await screenshot("agas-agent-windows.png");
  await command("POST",`/session/${session}/window/rect`,{width:390,height:844});
  await click('#nav button[data-view="overview"]');
  await waitFor("return document.querySelector('#content').innerText.includes('Mission control')","mobile overview");
  const mobileLayout=await execute(`return {
    viewport:window.innerWidth,document:document.documentElement.scrollWidth,
    rowChain:(()=>{let node=Array.from(document.querySelectorAll('.row')).find(item=>item.getBoundingClientRect().right>window.innerWidth+1);
      const chain=[];while(node&&chain.length<6){const rect=node.getBoundingClientRect();chain.push({tag:node.tagName,
        className:String(node.className).slice(0,70),width:Math.round(rect.width),right:Math.round(rect.right),
        columns:getComputedStyle(node).gridTemplateColumns});node=node.parentElement}return chain})(),
    offenders:Array.from(document.querySelectorAll('body *')).filter(node=>{
      const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
      return style.display!=='none'&&rect.width>0&&rect.right>window.innerWidth+1;
    }).slice(0,15).map(node=>({tag:node.tagName,className:String(node.className).slice(0,100),
      right:Math.round(node.getBoundingClientRect().right),width:Math.round(node.getBoundingClientRect().width)}))
  }`);
  await screenshot("agas-mobile.png");
  assert.equal(mobileLayout.document<=mobileLayout.viewport+1,true,
    `mobile workspace must not overflow the viewport horizontally: ${JSON.stringify(mobileLayout)}`);
  assert.deepEqual(await execute("return window.__agasBrowserErrors"),[],"mobile navigation reported page errors");
  console.log("Chrome UI pass: login, Security, Health, five agent windows and mobile overview; no page errors");
} finally {
  if(session)await command("DELETE",`/session/${session}`).catch(()=>{});
  driver.kill();
  if(app.server.listening)await new Promise(resolve=>app.server.close(resolve));
}
