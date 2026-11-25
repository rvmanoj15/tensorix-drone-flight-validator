const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
test('pilot, admin, rules and permits on an isolated database',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'tensorix-check-'));let proc;
 async function start(){
  proc=spawn(process.execPath,[join(__dirname,'server.cjs')],{env:{...process.env,PORT:'39273',TENSORIX_DATA:dir,PILOT_PASSWORD:'testpilot',ADMIN_PASSWORD:'testadmin'},stdio:['ignore','pipe','pipe']});
  await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('Startup timeout')),8000);proc.once('exit',()=>{clearTimeout(timer);no(Error('Server stopped'));});proc.stdout.on('data',m=>{if(m.toString().includes('Open http')){clearTimeout(timer);ok();}});});
 }
 async function stop(){if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=once(proc,'exit');proc.kill();await done;}}
 t.after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});
 async function req(name,body,cookie){return fetch('http://127.0.0.1:39273/api/'+name,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
 async function login(role){const r=await req('login',{role,password:'test'+role});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
 await start();let pilot=await login('pilot');const admin=await login('admin');
 async function check(points,altitude,expected){const res=await req('validate-route',{points,altitude},pilot);assert.equal(res.status,200);const v=await res.json();assert.equal(v.verdict,expected);return v;}
 const Y=[[0,200],[400,200]],G=[[-220,200],[-10,200]],R=[[420,200],[620,200]];
 await t.test('boundaries, mixed zones, segments and edge contact',async()=>{
  await check(G,120,'Approve');await check(G,121,'Conditional');await check(Y,60,'Conditional');await check(Y,59,'Approve');await check(R,0,'Reject');await check([[-220,200],[620,200]],200,'Reject');
  const v=await check([[0,0],[0,200],[400,200]],90,'Conditional');assert.deepEqual(v.hits[0].segments,[2]);assert.equal(v.suggestion,59);
  await check([[0,300],[400,300]],60,'Conditional');await check([[0,320],[400,320]],60,'Approve');
 });
 const approved=await check(Y,59,'Approve');const pdf=()=>req('permit/'+approved.id,undefined,pilot);
 await t.test('authentication, access control and invalid input',async()=>{
  assert.equal((await req('state')).status,401);assert.equal((await req('zones',{action:'delete',id:'Y1',version:1},pilot)).status,403);
  assert.equal((await req('validate-route',{points:Y,altitude:-1},pilot)).status,400);
  assert.equal((await req('permit/'+approved.id,undefined,admin)).status,404);
 });
 await t.test('zone editing, buffers, stale writes and deletion',async()=>{
  const state=await (await req('state',undefined,pilot)).json(),z=state.zones.find(z=>z.id==='Y1');
  const change={action:'edit',version:1,zone:{...z,limit:50,buffer:25}};
  assert.equal((await req('zones',change,admin)).status,200);assert.equal((await req('zones',change,admin)).status,409);
  await check([[0,320],[400,320]],60,'Conditional');await check(Y,59,'Conditional');
  assert.equal((await req('zones',{action:'create',version:2,zone:{...z,id:'Y2'}},admin)).status,200);
  assert.equal((await req('zones',{action:'delete',version:3,id:'Y2'},admin)).status,200);
 });
 await t.test('historical PDF and restart persistence',async()=>{
  await stop();await start();pilot=await login('pilot');
  const state=await (await req('state',undefined,pilot)).json();assert.equal(state.version,4);
  assert.equal(state.history.find(p=>p.id===approved.id).version,1);
  const r=await pdf();assert.equal(r.status,200);assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,4).toString(),'%PDF');
 });
});
