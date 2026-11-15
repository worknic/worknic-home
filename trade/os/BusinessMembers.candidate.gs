/** WORKNIC business applications. ADD to the existing project, do not replace it.
 * Dispatch hook and server-side OS session adapter are required before enabling.
 * No passwords, public member lookup, email sending, or price access is provided.
 */
var WNB_HEADERS_=['id','createdAt','companyName','businessNumber','contactName','email','phone','industry','message','status','revision','reviewedAt','reviewedBy','reviewNote','consentVersion'];
var WNB_AUDIT_HEADERS_=['eventId','requestId','at','actor','fromStatus','toStatus','note','revision','phase'];
var WNB_STATUSES_=['pending','approved','rejected','suspended'];
function worknicBusinessAuthenticate_(token){
  // Reuse the deployed OS server session. Never accept a client-supplied role.
  var verified;
  try{verified=session_(token);}catch(e){throw new Error('UNAUTHORIZED');}
  return {user:verified.user,role:verified.role};
}
function worknicBusinessRoute_(req){
  if(!req||typeof req.action!=='string'||req.action.indexOf('business.')!==0)return null;
  try{
    if(JSON.stringify(req).length>10000)throw new Error('INVALID');
    var p=req.payload||{},data;
    if(req.action==='business.challenge')data=wnbChallenge_();
    else if(req.action==='business.apply')data=wnbApply_(p);
    else {
      if(!req.token||typeof req.token!=='string'||req.token.length>512)throw new Error('UNAUTHORIZED');
      var actor=worknicBusinessAuthenticate_(req.token);
      if(!actor||actor.role!=='admin'||!actor.user)throw new Error('FORBIDDEN');
      if(req.action==='business.list')data=wnbList_(p);
      else if(req.action==='business.counts')data={counts:wnbList_({}).counts};
      else if(req.action==='business.review')data=wnbReview_(p,actor);
      else if(req.action==='business.history')data=wnbHistory_(p);
      else throw new Error('UNKNOWN_ACTION');
    }
    return {ok:true,data:data};
  }catch(e){
    var code=String(e.message||'');
    var messages={UNAUTHORIZED:'OS 로그인이 필요합니다.',FORBIDDEN:'관리자만 회원 정보를 확인할 수 있습니다.',AUTH_ADAPTER_REQUIRED:'관리자 인증 연결을 준비하고 있습니다.',NOT_CONFIGURED:'가입 신청 연결을 준비하고 있습니다.',EXPIRED:'신청 시간이 만료되었습니다. 다시 시도해 주세요.',INVALID:'입력 항목과 동의를 확인해 주세요.',RATE_LIMITED:'요청이 반복되었습니다. 잠시 후 다시 시도해 주세요.',CONFLICT:'다른 관리자가 먼저 변경했습니다. 목록을 새로 불러와 주세요.',INVALID_TRANSITION:'현재 상태에서 처리할 수 없습니다.',NOT_FOUND:'신청을 찾지 못했습니다.'};
    return {ok:false,code:messages[code]?code:'UNAVAILABLE',error:messages[code]||'처리 여부를 확인하지 못했습니다. 잠시 후 목록을 다시 확인해 주세요.'};
  }
}
function wnbConfig_(){
  var p=PropertiesService.getScriptProperties(),id=p.getProperty('WORKNIC_BUSINESS_SHEET_ID');
  if(!id||p.getProperty('WORKNIC_BUSINESS_ENABLED')!=='true')throw new Error('NOT_CONFIGURED');
  return {sheetId:id};
}
function wnbTables_(){
  var ss=SpreadsheetApp.openById(wnbConfig_().sheetId);
  function sheet(name,headers){var s=ss.getSheetByName(name);if(!s){s=ss.insertSheet(name);s.getRange(1,1,1,headers.length).setValues([headers]);s.setFrozenRows(1);}else if(JSON.stringify(s.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers))throw new Error('SCHEMA_MISMATCH');return s;}
  return {requests:sheet('OS_사업자가입요청',WNB_HEADERS_),audit:sheet('OS_사업자회원이력',WNB_AUDIT_HEADERS_)};
}
function wnbRows_(sheet,headers){var n=sheet.getLastRow()-1;if(n<1)return [];return sheet.getRange(2,1,n,headers.length).getValues().map(function(row,i){var obj={_row:i+2};headers.forEach(function(k,j){obj[k]=row[j];});return obj;});}
function wnbText_(v,max){if(typeof v!=='string'||v.length>max)throw new Error('INVALID');return v.trim();}
function wnbCell_(v){var s=String(v==null?'':v);return /^[=+\-@\t\r]/.test(s)?"'"+s:s;}
function wnbPack_(obj,headers){return headers.map(function(k){return typeof obj[k]==='number'?obj[k]:wnbCell_(obj[k]);});}
function wnbPublicRow_(r){var out={};WNB_HEADERS_.forEach(function(k){out[k]=r[k];});return out;}
function wnbHash_(v){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(v))).replace(/=+$/,'');}
function wnbLocked_(fn){var lock=LockService.getScriptLock();lock.waitLock(10000);try{return fn();}finally{lock.releaseLock();}}
function wnbChallenge_(){
  wnbConfig_();var token=Utilities.getUuid()+'.'+Utilities.getUuid();
  CacheService.getScriptCache().put('wnb:nonce:'+wnbHash_(token),String(Date.now()),600);
  return {token:token};
}
function wnbValidate_(p){
  var r={companyName:wnbText_(p.companyName,100),businessNumber:wnbText_(p.businessNumber,20).replace(/[-\s]/g,''),contactName:wnbText_(p.contactName,60),email:wnbText_(p.email,254).toLowerCase(),phone:wnbText_(p.phone,30).replace(/[\s()-]/g,''),industry:wnbText_(p.industry||'',100),message:wnbText_(p.message||'',1000),consentVersion:'business-2026-11-07'};
  if(!r.companyName||!r.contactName||!/^\d{10}$/.test(r.businessNumber)||/^(\d)\1{9}$/.test(r.businessNumber)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)||!/^[+\d\s()-]{9,30}$/.test(r.phone)||p.consent!==true||p.consentVersion!==r.consentVersion||p.website)throw new Error('INVALID');
  return r;
}
function wnbApply_(p){
  wnbConfig_();var r=wnbValidate_(p),token=wnbText_(p.challenge,160),key='wnb:nonce:'+wnbHash_(token),cache=CacheService.getScriptCache();
  return wnbLocked_(function(){
    if(!token||!cache.get(key))throw new Error('EXPIRED');
    var rate='wnb:rate:'+wnbHash_(r.businessNumber+'|'+r.email),count=Number(cache.get(rate)||0);
    if(count>=4)throw new Error('RATE_LIMITED');
    cache.remove(key);cache.put(rate,String(count+1),3600);
    var t=wnbTables_(),rows=wnbRows_(t.requests,WNB_HEADERS_);
    // Same company never overwrites an existing contact, even if a stranger applies.
    if(rows.some(function(x){return String(x.businessNumber).replace(/^'/,'')===r.businessNumber;}))return {status:'received'};
    var now=new Date().toISOString();r.id=Utilities.getUuid();r.createdAt=now;r.status='pending';r.revision=1;r.reviewedAt='';r.reviewedBy='';r.reviewNote='';
    t.requests.getRange(t.requests.getLastRow()+1,7).setNumberFormat('@');
    t.requests.appendRow(wnbPack_(r,WNB_HEADERS_));
    t.audit.appendRow(wnbPack_({eventId:Utilities.getUuid(),requestId:r.id,at:now,actor:'homepage',fromStatus:'',toStatus:'pending',note:'홈페이지 가입 신청',revision:1,phase:'committed'},WNB_AUDIT_HEADERS_));
    SpreadsheetApp.flush();var notification=typeof wnbEnrollmentQueue_==='function'?wnbEnrollmentQueue_(r,'saved',false):{state:'handoff_check_required'};return {status:'received',requestId:r.id,notification:notification.state};
  });
}
function wnbList_(p){
  var rows=wnbRows_(wnbTables_().requests,WNB_HEADERS_),status=p.status||'all',query=String(p.query||'').trim().toLowerCase().slice(0,100),page=Math.max(1,Math.floor(Number(p.page)||1)),limit=25;
  if(status!=='all'&&WNB_STATUSES_.indexOf(status)<0)throw new Error('INVALID');
  var counts={pending:0,approved:0,rejected:0,suspended:0};rows.forEach(function(r){if(counts[r.status]!==undefined)counts[r.status]++;});
  rows=rows.filter(function(r){return (status==='all'||r.status===status)&&(!query||[r.companyName,r.businessNumber,r.contactName,r.email].join(' ').toLowerCase().indexOf(query)>=0);}).sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt));});
  return {rows:rows.slice((page-1)*limit,page*limit).map(wnbPublicRow_),counts:counts,total:rows.length,page:page,limit:limit};
}
function wnbReview_(p,actor){
  var id=wnbText_(p.id,80),status=wnbText_(p.status,20),note=wnbText_(p.note||'',1000);
  if((status==='rejected'||status==='suspended')&&!note)throw new Error('INVALID');
  if(status==='approved'&&p.contactVerified!==true)throw new Error('INVALID');
  return wnbLocked_(function(){var t=wnbTables_(),r=wnbRows_(t.requests,WNB_HEADERS_).filter(function(x){return x.id===id;})[0];if(!r)throw new Error('NOT_FOUND');if(Number(p.revision)!==Number(r.revision))throw new Error('CONFLICT');
    var transitions={pending:['approved','rejected'],approved:['suspended'],rejected:['pending'],suspended:['approved']};
    if(!transitions[r.status]||transitions[r.status].indexOf(status)<0)throw new Error('INVALID_TRANSITION');
    var before=r.status,now=new Date().toISOString();r.status=status;r.revision=Number(r.revision)+1;r.reviewedAt=now;r.reviewedBy=String(actor.user);r.reviewNote=note;
    // Persist intent before the mutation; if the sheet write fails the event is
    // still observable, rather than silently changing an approval without a log.
    t.audit.appendRow(wnbPack_({eventId:Utilities.getUuid(),requestId:r.id,at:now,actor:r.reviewedBy,fromStatus:before,toStatus:status,note:note,revision:r.revision,phase:'prepared'},WNB_AUDIT_HEADERS_));
    var eventRow=t.audit.getLastRow();
    t.requests.getRange(r._row,1,1,WNB_HEADERS_.length).setValues([wnbPack_(r,WNB_HEADERS_)]);SpreadsheetApp.flush();
    t.audit.getRange(eventRow,WNB_AUDIT_HEADERS_.length,1,1).setValues([['committed']]);SpreadsheetApp.flush();var notification=typeof wnbEnrollmentQueue_==='function'?wnbEnrollmentQueue_(r,'reviewed',p.contactVerified===true):{state:'handoff_check_required'};return {row:wnbPublicRow_(r),notification:notification.state};
  });
}
function wnbHistory_(p){var id=wnbText_(p.id,80);return {rows:wnbRows_(wnbTables_().audit,WNB_AUDIT_HEADERS_).filter(function(r){return r.requestId===id;}).map(function(r){delete r._row;return r;})};}

function initializeWorknicBusiness(){
  var p=PropertiesService.getScriptProperties();
  p.setProperty("WORKNIC_BUSINESS_SHEET_ID",WORKNIC_SHEET_ID);
  p.setProperty("WORKNIC_BUSINESS_ENABLED","true");
  try { var t=wnbTables_(); Logger.log(JSON.stringify({ok:true,requestSheet:t.requests.getName(),auditSheet:t.audit.getName(),businessSignupReady:true})); }
  catch(e){ p.setProperty("WORKNIC_BUSINESS_ENABLED","false"); throw e; }
}
