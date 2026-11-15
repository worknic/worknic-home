import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';import net from 'node:net';
import {signBusinessEvent} from '../server/business-enrollment.mjs';
test('실제 격리 서버: 본인 신청 외 이벤트 거부·기본 발송 차단·인증된 결과 조회',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'worknic-sandbox-http-')),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const secret='synthetic-sandbox-secret-'.repeat(3),origin='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[new URL('../server/sandbox-main.mjs',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',RENDER_EXTERNAL_URL:'',WORKNIC_SANDBOX_ORIGIN:origin,WORKNIC_SANDBOX_BRIDGE_SECRET:secret,WORKNIC_SANDBOX_DATA_KEY:'ab'.repeat(32),WORKNIC_SANDBOX_DATA_DIR:dir,WORKNIC_SANDBOX_GAS_ENDPOINT:'',WORKNIC_SANDBOX_SMS_ARMED:'false'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Sandbox startup timeout')),10000);child.stdout.on('data',b=>{if(String(b).includes('sandbox ready')){clearTimeout(timer);resolve()}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Sandbox stopped: '+code))})});
  const health=await (await fetch(origin+'/api/beta/health')).json();assert.equal(health.approvalBridgeConfigured,false);
  assert.equal((await fetch(origin+'/sandbox-report')).status,401);
  const event=requestId=>{const e={timestamp:Date.now(),nonce:randomUUID(),payload:{eventId:randomUUID(),requestId,kind:'saved',revision:1,status:'pending',contactVerified:false,profile:{companyName:'합성',businessNumber:'3638603519',contactName:'합성',phone:'01000000000',email:'qa@example.invalid'}}};e.signature=signBusinessEvent(secret,e);return e};
  const post=e=>fetch(origin+'/api/beta/enrollment/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(e)});
  assert.equal((await post(event('another-request'))).status,403);
  assert.equal((await post(event('911d7c48-6fa4-4677-afd2-2104f57ed699'))).status,201);
  const report=await (await fetch(origin+'/sandbox-report',{headers:{Authorization:'Bearer '+secret}})).json();assert.equal(report.smsArmed,false);assert.equal(report.messages.length,1);assert.equal(report.messages[0].status,'queued');assert.equal(report.messages[0].provider_id,null);
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));rmSync(dir,{recursive:true,force:true})}
});
