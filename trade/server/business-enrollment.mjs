import {randomBytes,randomUUID,createHash,createHmac,timingSafeEqual,createCipheriv,createDecipheriv} from 'node:crypto';
import {TradeError,passwordHash} from './store.mjs';
import {validSetupUsername,normalizeSetupUsername} from '../setup-policy.js';
const fail=(message,status=400)=>{throw new TradeError(message,status)};
const hash=s=>createHash('sha256').update(s).digest('hex');
const text=(s,max=200)=>{if(typeof s!=='string'||s.length>max)fail('입력 내용을 확인해 주세요.');return s.trim()};
export const SETUP_CONSENT='business-setup-2026-11-15';
export function mobile(s){s=text(s,30).replace(/[\s()-]/g,'');if(!/^010\d{8}$/.test(s))fail('앞 0을 포함한 휴대폰 번호를 확인해 주세요.');return s;}
export function signBusinessEvent(secret,{timestamp,nonce,payload}){return createHmac('sha256',secret).update(JSON.stringify({timestamp,nonce,payload})).digest('hex');}
// Installed only with an explicit feature gate. No new account or provider configuration is created.
export function installBusinessEnrollment(api,db,{clock,transaction,audit,adminOnly},{enabled=false,secret='',encryptionKey='',origin=''}={}){
 if(!enabled)return null;
 if(secret.length<32||!/^[a-f0-9]{64}$/i.test(encryptionKey))throw Error('Enrollment signing and encryption configuration required');
 const base=new URL(origin);if(base.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(base.hostname))throw Error('HTTPS enrollment origin required');
 const key=createHmac('sha256',Buffer.from(encryptionKey,'hex')).update('business-outbox-v1').digest();
 const encrypt=value=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return JSON.stringify({iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')})};
 const decrypt=value=>{const v=JSON.parse(value),c=createDecipheriv('aes-256-gcm',key,Buffer.from(v.iv,'base64'));c.setAuthTag(Buffer.from(v.tag,'base64'));return JSON.parse(Buffer.concat([c.update(Buffer.from(v.data,'base64')),c.final()]).toString())};
 db.exec(`CREATE TABLE IF NOT EXISTS business_applications(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,status TEXT NOT NULL,profile TEXT NOT NULL,contact_verified INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS business_events(id TEXT PRIMARY KEY,hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS business_nonces(id TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS business_invites(hash TEXT PRIMARY KEY,request_id TEXT NOT NULL,revision INTEGER NOT NULL,expires INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS business_verifications(hash TEXT PRIMARY KEY,invite_hash TEXT NOT NULL,request_id TEXT NOT NULL,expires INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0,member_id TEXT);
 CREATE TABLE IF NOT EXISTS business_sms(event_key TEXT PRIMARY KEY,request_id TEXT NOT NULL,kind TEXT NOT NULL,body TEXT,status TEXT NOT NULL,provider_id TEXT,provider_code TEXT,updated INTEGER NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS business_setup_member ON business_verifications(member_id) WHERE member_id IS NOT NULL;`);
 const application=id=>{const r=db.prepare('SELECT * FROM business_applications WHERE id=?').get(id);if(!r)fail('신청 정보를 확인해 주세요.',404);return {...r,profile:JSON.parse(r.profile)}};
 const queue=(id,kind,eventKey,body)=>{db.prepare("INSERT OR IGNORE INTO business_sms VALUES(?,?,?,?,'queued',NULL,NULL,?)").run(eventKey,id,kind,encrypt(body),clock());};
 const linked=id=>db.prepare('SELECT member_id FROM beta_bindings WHERE request_id=?').get(id);
 const issue=(r,eventKey)=>{
  if(r.status!=='approved'||!r.contact_verified)fail('승인과 담당자 연락처 확인이 필요합니다.',409);
  if(db.prepare('SELECT 1 FROM business_sms WHERE event_key=?').get(eventKey))return;
  if(linked(r.id)){queue(r.id,'approved',eventKey,{to:r.profile.phone,text:'[워크닉] 사업자 승인이 완료되었습니다. 기존 거래 계정으로 로그인해주세요. https://worknic-trade-beta.onrender.com/trade/#account'});return;}
  const token=randomBytes(32).toString('base64url');
  db.prepare('UPDATE business_invites SET consumed=1 WHERE request_id=?').run(r.id);
  db.prepare('INSERT INTO business_invites VALUES(?,?,?,?,0)').run(hash(token),r.id,r.revision,clock()+30*60000);
  const url=new URL('/trade/setup.html',base);url.hash=token;
  queue(r.id,'approved',eventKey,{to:r.profile.phone,text:'[워크닉] 사업자 승인이 완료되었습니다. 본인 확인 후 직접 아이디와 비밀번호를 설정해주세요. 이 링크는 30분간 유효합니다. '+url.href});
 };
 const verifySignature=envelope=>{
  const {timestamp,nonce,payload,signature}=envelope||{};
  if(!Number.isSafeInteger(timestamp)||Math.abs(clock()-timestamp)>60000||typeof nonce!=='string'||!/^[a-f0-9-]{36}$/.test(nonce)||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!payload)fail('연결 서명을 확인해 주세요.',401);
  if(!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(signBusinessEvent(secret,{timestamp,nonce,payload}),'hex')))fail('연결 서명을 확인해 주세요.',401);
  return {timestamp,nonce,payload};
 };
 const liveInvite=token=>{
  const r=db.prepare('SELECT * FROM business_invites WHERE hash=? AND consumed=0 AND expires>?').get(hash(text(token,100)),clock());
  if(!r)fail('본인 확인 링크가 만료되었거나 사용되었습니다.',410);
  const a=application(r.request_id);if(a.status!=='approved'||!a.contact_verified||a.revision!==r.revision)fail('현재 사업자 승인을 확인해 주세요.',403);
  return {invite:r,application:a};
 };
 const context=verificationToken=>{
  const p=db.prepare('SELECT * FROM business_verifications WHERE hash=? AND expires>?').get(hash(text(verificationToken,100)),clock());
  if(!p)fail('본인 확인을 다시 진행해주세요.',410);
  return {proof:p,...liveInviteByProof(p)};
 };
 function liveInviteByProof(p){
  const i=db.prepare('SELECT * FROM business_invites WHERE hash=?').get(p.invite_hash),a=application(p.request_id);
  if(!i||i.expires<=clock()||a.status!=='approved'||!a.contact_verified||i.revision!==a.revision||(!p.consumed&&i.consumed))fail('현재 사업자 승인과 본인 확인을 다시 확인해 주세요.',403);
  return {invite:i,application:a};
 }
 return {
  importApproved(actor,proof,{contactVerified,requestKey}={}){
   adminOnly(actor);if(proof?.status!=='approved'||contactVerified!==true||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey||''))fail('기존 승인 기록과 담당자 연락처 확인이 필요합니다.',409);
   const payload={eventId:proof.id+':existing:'+requestKey,requestId:proof.id,revision:proof.revision,status:proof.status,kind:'existing',contactVerified:true,profile:proof.profile};
   const envelope={timestamp:clock(),nonce:randomUUID(),payload};envelope.signature=signBusinessEvent(secret,envelope);return this.receive(envelope);
  },
  receive(envelope){
   const {nonce,payload:p}=verifySignature(envelope);
   const id=text(p.requestId,100),eventId=text(p.eventId,150),revision=p.revision,status=p.status;
   if(!id||!eventId||!Number.isSafeInteger(revision)||revision<1||!['pending','approved','rejected','suspended'].includes(status)||!['saved','reviewed','existing'].includes(p.kind))fail('신청 이벤트를 확인해 주세요.');
   if(Object.keys(p).some(k=>/password|secret|token/i.test(k)))fail('신청 이벤트에 인증 비밀값을 넣지 마세요.');
   const profile={companyName:text(p.profile?.companyName,100),businessNumber:text(p.profile?.businessNumber,20).replace(/[-\s]/g,''),contactName:text(p.profile?.contactName,60),phone:mobile(p.profile?.phone),email:text(p.profile?.email,254).toLowerCase()};
   if(!profile.companyName||!profile.contactName||!/^\d{10}$/.test(profile.businessNumber)||!/^\S+@\S+\.\S+$/.test(profile.email))fail('신청 원본을 확인해 주세요.');
   return transaction(()=>{
    db.prepare('DELETE FROM business_nonces WHERE expires<?').run(clock());
    if(db.prepare('SELECT 1 FROM business_nonces WHERE id=?').get(nonce))fail('이미 사용된 연결 요청입니다.',409);
    db.prepare('INSERT INTO business_nonces VALUES(?,?)').run(nonce,clock()+120000);
    const digest=hash(JSON.stringify(p)),oldEvent=db.prepare('SELECT hash FROM business_events WHERE id=?').get(eventId);
    if(oldEvent){if(oldEvent.hash!==digest)fail('이벤트 내용이 변경되었습니다.',409);return {saved:true,duplicate:true};}
    const old=db.prepare('SELECT * FROM business_applications WHERE id=?').get(id);
    if(old&&revision<old.revision)fail('이전 신청 상태입니다.',409);
    if(old&&revision===old.revision&&(old.status!==status||old.profile!==JSON.stringify(profile)||old.contact_verified!==Number(p.contactVerified===true)))fail('동일 수정번호의 내용이 다릅니다.',409);
    db.prepare('INSERT INTO business_applications VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,status=excluded.status,profile=excluded.profile,contact_verified=excluded.contact_verified').run(id,revision,status,JSON.stringify(profile),Number(p.contactVerified===true));
    db.prepare('INSERT INTO business_events VALUES(?,?)').run(eventId,digest);
    if(!old||revision!==old.revision||status!=='approved')db.prepare("UPDATE business_sms SET status='cancelled',provider_code='SUPERSEDED',body=NULL,updated=? WHERE request_id=? AND kind='approved' AND status='queued'").run(clock(),id);
    if(p.kind==='saved'&&status==='pending')queue(id,'received',id+':received',{to:profile.phone,text:'[워크닉] 사업자 신청이 저장되었습니다. 담당자가 확인 후 승인 결과를 안내드립니다. 신청 저장과 문자 전달 상태는 별도로 관리됩니다.'});
    if(status==='approved'&&p.contactVerified===true)issue(application(id),id+':approved:'+revision);
    if(status!=='approved'){
     db.prepare('UPDATE business_invites SET consumed=1 WHERE request_id=?').run(id);
     db.prepare('UPDATE members SET status=?,revision=revision+1 WHERE id IN (SELECT member_id FROM beta_bindings WHERE request_id=?)').run(status,id);
     db.prepare('DELETE FROM sessions WHERE member_id IN (SELECT member_id FROM beta_bindings WHERE request_id=?)').run(id);
    }
    audit({id:'os-business-bridge'},'business.event_saved',id,{revision,status});
    return {saved:true,notificationQueued:!!db.prepare('SELECT 1 FROM business_sms WHERE request_id=?').get(id)};
   });
  },
  reissue(actor,id,{contactVerified,requestKey}={}){
   adminOnly(actor);if(contactVerified!==true||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey||''))fail('연락처와 요청번호를 확인해 주세요.');
   return transaction(()=>{const eventKey=id+':invite:'+requestKey;if(db.prepare('SELECT 1 FROM business_sms WHERE event_key=?').get(eventKey))return {queued:true,duplicate:true};issue(application(id),eventKey);audit(actor,'business.invitation_reissued',id);return {queued:true}});
  },
  applicationContext(actor,id){adminOnly(actor);const a=application(id);return {requestId:a.id,profile:a.profile,revision:a.revision}},
  check({token,phone}){
   api.limit('setup-link:'+hash(text(token,100)),5,10*60000);
   const {invite:i,application:a}=liveInvite(token);
   if(!timingSafeEqual(Buffer.from(hash(mobile(phone))),Buffer.from(hash(a.profile.phone))))fail('본인 확인 정보를 확인해 주세요.',403);
   const verificationToken=randomBytes(32).toString('base64url');
   db.prepare('INSERT INTO business_verifications(hash,invite_hash,request_id,expires) VALUES(?,?,?,?)').run(hash(verificationToken),i.hash,a.id,clock()+10*60000);
   return {verificationToken,companyName:a.profile.companyName,consentVersion:SETUP_CONSENT};
  },
  context(token,type='verification') {const x=type==='invite'?liveInvite(token):context(token);return {requestId:x.application.id,profile:x.application.profile,revision:x.application.revision};},
  complete({verificationToken,username,password,consent,consentVersion}){
   username=normalizeSetupUsername(text(username,40));
   if(!validSetupUsername(username))fail('아이디는 영문과 숫자를 조합해 4~40자로 입력해주세요.');
   if(typeof password!=='string'||password.length<10||password.length>128||consent!==true||consentVersion!==SETUP_CONSENT)fail('비밀번호·필수 동의를 확인해 주세요.');
   return transaction(()=>{
    const {proof:p,invite:i,application:a}=context(verificationToken);
    if(p.consumed){const m=db.prepare('SELECT username FROM members WHERE id=?').get(p.member_id);if(m?.username===username)return {ok:true,alreadyCompleted:true};fail('이미 사용된 본인 확인입니다.',409);}
    if(linked(a.id))fail('이미 연결된 계정이 있습니다. 기존 계정으로 로그인해주세요.',409);
    if(db.prepare('SELECT 1 FROM members WHERE username=?').get(username))fail('사용할 수 없는 아이디입니다.',409);
    const memberId=randomUUID(),profile={...a.profile,postalCode:'',address:'',addressDetail:'',consentVersion,consentAt:clock(),businessVerification:'os_contact_verified'};
    try{db.prepare("INSERT INTO members(id,username,password,role,status,profile,created_at) VALUES(?,?,?,'customer','approved',?,?)").run(memberId,username,passwordHash(password),JSON.stringify(profile),clock())}catch(e){if(String(e.code).includes('SQLITE_CONSTRAINT'))fail('사용할 수 없는 아이디입니다.',409);throw e}
    db.prepare('INSERT INTO beta_bindings VALUES(?,?,1,1)').run(memberId,a.id);
    db.prepare('UPDATE business_invites SET consumed=1 WHERE request_id=?').run(a.id);
    db.prepare('DELETE FROM business_verifications WHERE request_id=? AND hash!=?').run(a.id,p.hash);
    db.prepare('UPDATE business_verifications SET consumed=1,member_id=? WHERE hash=?').run(memberId,p.hash);
    audit({id:memberId},'business.account_setup_completed',a.id,{memberId});
    return {ok:true};
   });
  },
  messages(actor,id){adminOnly(actor);return db.prepare('SELECT event_key,kind,status,provider_id,provider_code,updated FROM business_sms WHERE request_id=? ORDER BY updated').all(id)},
  queuedRequests(){return db.prepare("SELECT DISTINCT request_id FROM business_sms WHERE status='queued' LIMIT 10").all().map(r=>r.request_id)},
  pendingResults(){return db.prepare("SELECT event_key,request_id FROM business_sms WHERE status IN ('accepted','unknown') AND provider_id IS NOT NULL LIMIT 20").all()},
  recoverInterrupted(){db.prepare("UPDATE business_sms SET status='unknown',updated=? WHERE status='submitting'").run(clock())},
  async dispatchOne(provider,{requestId,allowedKinds=['received','approved']}={}){
   // Mandatory explicit request scope prevents accidental bulk sends during review.
   if(!requestId||!provider?.send)fail('발송 대상과 기존 문자 연결을 확인해 주세요.',503);
   const job=transaction(()=>{const r=db.prepare("SELECT * FROM business_sms WHERE request_id=? AND status='queued' ORDER BY updated LIMIT 1").get(requestId);if(!r||!allowedKinds.includes(r.kind))return null;
    const a=application(requestId),expired=r.kind==='approved'&&!linked(requestId)&&!db.prepare('SELECT 1 FROM business_invites WHERE request_id=? AND consumed=0 AND expires>?').get(requestId,clock());
    if(!['pending','approved'].includes(a.status)||(r.kind==='approved'&&(a.status!=='approved'||!a.contact_verified||expired))){db.prepare("UPDATE business_sms SET status='cancelled',provider_code='APPROVAL_OR_LINK_INVALID',body=NULL,updated=? WHERE event_key=?").run(clock(),r.event_key);return null}
    db.prepare("UPDATE business_sms SET status='submitting',updated=? WHERE event_key=? AND status='queued'").run(clock(),r.event_key);return r});
   if(!job)return {sent:false};
   let result;try{result=await provider.send({...decrypt(job.body),eventKey:job.event_key,requestId:job.request_id,profile:application(job.request_id).profile})}catch{result={status:'unknown'}}
   const status=['accepted','delivered','failed'].includes(result?.status)?result.status:'unknown';
   db.prepare('UPDATE business_sms SET status=?,provider_id=?,provider_code=?,body=NULL,updated=? WHERE event_key=?').run(status,result?.messageId||null,result?.code||null,clock(),job.event_key);
   return {sent:true,status};
  },
  async refreshMessage(provider,eventKey){
   const r=db.prepare('SELECT * FROM business_sms WHERE event_key=?').get(eventKey);if(!r)fail('문자 기록을 확인해 주세요.',404);
   if(['delivered','failed'].includes(r.status)||!r.provider_id)return {status:r.status};
   let result;try{result=await provider.status(r.provider_id,{eventKey,requestId:r.request_id,profile:application(r.request_id).profile})}catch{return {status:r.status,lookupFailed:true}}
   if(!['accepted','delivered','failed'].includes(result?.status))return {status:r.status,lookupUnknown:true};
   // A lookup can finish after a newer lookup on another worker. Terminal results never regress.
   return transaction(()=>{
    const current=db.prepare('SELECT status,provider_id FROM business_sms WHERE event_key=?').get(eventKey);
    if(!current||current.provider_id!==r.provider_id||['delivered','failed','cancelled'].includes(current.status))return {status:current?.status||r.status};
    db.prepare('UPDATE business_sms SET status=?,provider_code=?,updated=? WHERE event_key=?').run(result.status,result.code||null,clock(),eventKey);return {status:result.status};
   });
  },
 };
}
