const express = require('express');
const turf = require('@turf/turf');
const {DatabaseSync} = require('node:sqlite');
const PDF = require('pdfkit');
const {randomBytes, timingSafeEqual} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const app = express();
const dir = process.env.TENSORIX_DATA || path.join(__dirname, '../local-data');
fs.mkdirSync(dir,{recursive:true});
const db = new DatabaseSync(path.join(dir,'airspace.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS rules(id INTEGER PRIMARY KEY, zones TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS plans(id INTEGER PRIMARY KEY, role TEXT, version INTEGER, altitude REAL, points TEXT, result TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP);`);
const latest=()=>db.prepare('SELECT * FROM rules ORDER BY id DESC LIMIT 1').get();
const sample=[[0,2],[4,2]];
// A synthetic planar district in metres, displayed on a Leaflet Simple CRS map.
function square(id,color,left,right,limit){
 return {id,color,limit,buffer:0,polygon:[[left,1],[right,1],[right,3],[left,3],[left,1]].map(([x,y])=>[x*100,y*100])};
}
if(!latest()) db.prepare('INSERT INTO rules(zones) VALUES (?)').run(JSON.stringify([
 square('G1','Green',-2,-0.3,120),square('Y1','Yellow',1,3,60),square('R1','Red',4.4,6,null)]));
const credentials={pilot:process.env.PILOT_PASSWORD,admin:process.env.ADMIN_PASSWORD};
for(const role of Object.keys(credentials)){
 if(!credentials[role]){credentials[role]=randomBytes(6).toString('hex');console.log(role+' password: '+credentials[role]);}
}
const sessions=new Map();
const bad=(msg,status=400)=>{throw Object.assign(new Error(msg),{status});};
const goodPoint=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000);
const equal=(a,b)=>a[0]===b[0]&&a[1]===b[1];
function pointsOK(p,min,max){
 if(!Array.isArray(p)||p.length<min||p.length>max||!p.every(goodPoint))bad('Choose '+min+' to '+max+' map points within the demo district.');
 if(p.some((v,i)=>i>0&&equal(v,p[i-1])))bad('Consecutive points must be different.');
}
function pointSegment(p,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
 const t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function touches(a,b,zone){
 const ring=zone.polygon;
 if(turf.booleanIntersects(turf.lineString([a,b]),turf.polygon([ring])))return true;
 for(let i=1;i<ring.length;i++){
  const c=ring[i-1],d=ring[i];
  if(Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b))<=zone.buffer+1e-8)return true;
 }
 return false;
}
function evaluate(points,altitude,zones){
 pointsOK(points,2,200);if(!Number.isFinite(altitude)||altitude<0)bad('Enter a nonnegative altitude in metres.');
 const hits=[];
 for(const z of zones){
  const segments=[];
  for(let i=1;i<points.length;i++)if(touches(points[i-1],points[i],z))segments.push(i);
  if(segments.length)hits.push({id:z.id,color:z.color,limit:z.limit,buffer:z.buffer,segments});
 }
 const reject=hits.some(h=>h.color==='Red');
 const excess=hits.some(h=>h.color==='Yellow'?altitude>=h.limit:h.color==='Green'&&altitude>h.limit);
 const verdict=reject?'Reject':excess?'Conditional':'Approve';
 const suggestion=verdict==='Conditional'?Math.min(...hits.map(h=>h.color==='Yellow'?Math.ceil(h.limit)-1:Math.floor(h.limit))):null;
 return {verdict,suggestion,hits,reason:reject?'A segment enters a prohibited area. Change the route.':excess?'The entered altitude conflicts with an intersected zone.':hits.length?'All intersected demo rules pass.':'The route clears all configured zones and buffers.'};
}
function zoneOK(z){
 if(!z||typeof z.id!=='string'||!/^[A-Za-z0-9_-]{1,24}$/.test(z.id))bad('Use a short zone ID with letters, numbers, dashes or underscores.');
 if(!['Green','Yellow','Red'].includes(z.color))bad('Select a zone colour.');
 if(!Number.isFinite(z.buffer)||z.buffer<0||z.buffer>5000)bad('Buffer must be 0–5000 m.');
 if(z.color!=='Red'&&(!Number.isFinite(z.limit)||z.limit<=0||z.limit>10000))bad('Altitude limit must be positive and at most 10000 m.');
 pointsOK(z.polygon,4,101);
 if(!equal(z.polygon[0],z.polygon.at(-1)))bad('Polygon must be closed.');
 const area=z.polygon.slice(1).reduce((sum,b,i)=>sum+z.polygon[i][0]*b[1]-z.polygon[i][1]*b[0],0);
 if(Math.abs(area)<2||turf.kinks(turf.polygon([z.polygon])).features.length)bad('Draw a simple polygon of at least one square metre.');
 return {id:z.id,color:z.color,buffer:z.buffer,limit:z.color==='Red'?null:z.limit,polygon:z.polygon};
}
app.use(express.json({limit:'100kb'}));
app.use('/leaflet',express.static(path.join(__dirname,'../node_modules/leaflet/dist')));
app.get(['/','/planner'],(req,res)=>res.sendFile(path.join(__dirname,'planner.html')));
app.post('/api/login',(req,res)=>{
 const {role,password}=req.body||{};
 if(!Object.hasOwn(credentials,role)||typeof password!=='string')bad('Invalid account or password.',401);
 const a=Buffer.from(password),b=Buffer.from(credentials[role]);if(a.length!==b.length||!timingSafeEqual(a,b))bad('Invalid account or password.',401);
 const token=randomBytes(32).toString('hex');sessions.set(token,{role,until:Date.now()+28800000});
 res.cookie('tx',token,{httpOnly:true,sameSite:'strict',maxAge:28800000});res.json({role});
});
app.use('/api',(req,res,next)=>{
 const token=(req.headers.cookie||'').match(/(?:^|;\s*)tx=([a-f0-9]{64})(?:;|$)/)?.[1];
 const s=sessions.get(token);if(!s||s.until<Date.now()){sessions.delete(token);return res.status(401).json({error:'Sign in to continue.'});}
 req.role=s.role;req.token=token;next();
});
app.post('/api/logout',(req,res)=>{sessions.delete(req.token);res.clearCookie('tx');res.json({ok:true});});
app.get('/api/state',(req,res)=>{
 const v=latest();res.json({role:req.role,version:v.id,zones:JSON.parse(v.zones),sample:sample.map(p=>p.map(n=>n*100)),history:db.prepare("SELECT id,version,altitude,json_extract(result,'$.verdict') verdict FROM plans WHERE role=? ORDER BY id DESC LIMIT 40").all(req.role)});
});
app.post('/api/zones',(req,res)=>{
 if(req.role!=='admin')bad('Administrator access required.',403);
 const {version,action,id,zone}=req.body||{},v=latest(),zones=JSON.parse(v.zones);
 if(version!==v.id)bad('Rules changed. Reload the page before editing.',409);
 if(action==='delete'){const i=zones.findIndex(z=>z.id===id);if(i<0)bad('Unknown zone.',404);zones.splice(i,1);}
 else if(action==='create'||action==='edit'){
  const z=zoneOK(zone),i=zones.findIndex(s=>s.id===z.id);
  if(action==='create'){if(i>=0)bad('Zone ID already exists.',409);if(zones.length>=100)bad('Maximum 100 zones.');zones.push(z);}
  else {if(i<0)bad('Unknown zone.',404);zones[i]=z;}
 }else bad('Choose a zone action.');
 const change=db.prepare('INSERT INTO rules(zones) SELECT ? WHERE (SELECT MAX(id) FROM rules)=?').run(JSON.stringify(zones),version);
 if(!change.changes)bad('Rules changed. Reload and retry.',409);res.json({version:Number(change.lastInsertRowid)});
});
app.post('/api/validate-route',(req,res)=>{
 const {points,altitude,version}=req.body||{},v=latest();if(version!==undefined&&version!==v.id)bad('Rules changed. Reload and validate again.',409);
 const result=evaluate(points,altitude,JSON.parse(v.zones));
 const row=db.prepare('INSERT INTO plans(role,version,altitude,points,result) VALUES(?,?,?,?,?)').run(req.role,v.id,altitude,JSON.stringify(points),JSON.stringify(result));
 res.json({...result,id:Number(row.lastInsertRowid),version:v.id});
});
app.get('/api/permit/:id',(req,res)=>{
 const p=db.prepare('SELECT * FROM plans WHERE id=? AND role=?').get(req.params.id,req.role);
 if(!p)bad('Unknown plan.',404);const r=JSON.parse(p.result);if(r.verdict!=='Approve')bad('Only approved plans have demo permits.',409);
 const doc=new PDF({margin:50});res.type('pdf').attachment('TENSORIX-plan-'+p.id+'.pdf');doc.pipe(res);
 doc.fontSize(23).text('TENSORIX | Demo flight permit').moveDown().fontSize(12).text('Synthetic airspace training exercise. No real flight authorization.').moveDown();
 doc.text('Plan '+p.id+'   |   Rule version '+p.version+'   |   '+p.created+' UTC').text('Approved altitude: '+p.altitude+' m').text(r.reason).moveDown();
 for(const h of r.hits)doc.text(h.id+' ('+h.color+'), segment(s) '+h.segments.join(', ')+', threshold '+h.limit+' m, buffer '+h.buffer+' m.');
 doc.moveDown().text('Waypoints in local map metres (east, north)');JSON.parse(p.points).forEach((v,i)=>doc.text((i+1)+'. '+v.map(n=>n.toFixed(2)).join(', ')));doc.end();
});
app.use('/api',(req,res)=>res.status(404).json({error:'Unknown endpoint.'}));
app.use((err,req,res,next)=>{if(res.headersSent)return next(err);const code=err.status||500;if(code===500)console.error(err);res.status(code).json({error:code===500?'Server error. See terminal.':err.message});});
const port=Number(process.env.PORT||3100);
app.listen(port,'127.0.0.1',err=>{if(err){console.error(err.message);process.exit(1);}console.log('Open http://127.0.0.1:'+port+'/planner');});
