/** Durable event handoff; no passwords. The trigger is NOT installed automatically. */
function wnbEnrollmentQueue_(r,kind,contactVerified){
 if(PropertiesService.getScriptProperties().getProperty('WORKNIC_BUSINESS_ENROLLMENT_ENABLED')!=='true')return {state:'disabled'};
 try{
  if(typeof r.phone!=='string'||!/^010\d{8}$/.test(r.phone.replace(/[\s()-]/g,'')))return {state:'phone_review_required'};
  var headers=['eventId','requestId','revision','kind','payload','state','updated'],ss=SpreadsheetApp.openById(wnbConfig_().sheetId),s=ss.getSheetByName('OS_사업자연결이벤트');
  if(!s){s=ss.insertSheet('OS_사업자연결이벤트');s.appendRow(headers)}
  if(JSON.stringify(s.getRange(1,1,1,7).getValues()[0])!==JSON.stringify(headers))throw Error('SCHEMA_MISMATCH');
  var eventId=r.id+':'+kind+':'+r.revision,rows=s.getLastRow()>1?s.getRange(2,1,s.getLastRow()-1,7).getValues():[];
  if(rows.some(function(x){return x[0]===eventId}))return {state:'queued'};
  var payload={eventId:eventId,requestId:r.id,revision:Number(r.revision),status:r.status,kind:kind,contactVerified:contactVerified===true,profile:{companyName:r.companyName,businessNumber:String(r.businessNumber).replace(/[-\s']/g,''),contactName:r.contactName,phone:r.phone.replace(/[\s()-]/g,''),email:r.email}};
  s.appendRow([eventId,r.id,r.revision,kind,JSON.stringify(payload),'queued',new Date().toISOString()]);return {state:'queued'};
 }catch(error){return {state:'handoff_check_required'}}
}
function processWorknicBusinessEvents(){
 var props=PropertiesService.getScriptProperties();if(props.getProperty('WORKNIC_BUSINESS_ENROLLMENT_ENABLED')!=='true')return;
 var secret=props.getProperty('WORKNIC_TRADE_BRIDGE_SECRET')||'';if(secret.length<32)throw Error('BRIDGE_NOT_CONFIGURED');
 var sheet=SpreadsheetApp.openById(wnbConfig_().sheetId).getSheetByName('OS_사업자연결이벤트');if(!sheet||sheet.getLastRow()<2)return;
 var lock=LockService.getScriptLock();lock.waitLock(10000);var job;
 try{var rows=sheet.getRange(2,1,sheet.getLastRow()-1,7).getValues(),index=rows.findIndex(function(r){return ['queued','retry_required'].includes(r[5])||(r[5]==='handing_off'&&Date.now()-Date.parse(r[6])>300000)});if(index<0)return;job={index:index+2,payload:JSON.parse(rows[index][4])};sheet.getRange(job.index,6,1,2).setValues([['handing_off',new Date().toISOString()]]);SpreadsheetApp.flush()}finally{lock.releaseLock()}
 var timestamp=Date.now(),nonce=Utilities.getUuid(),body={timestamp:timestamp,nonce:nonce,payload:job.payload};body.signature=Utilities.computeHmacSha256Signature(JSON.stringify(body),secret).map(function(b){return('0'+((b+256)%256).toString(16)).slice(-2)}).join('');
 var state='retry_required';try{var response=UrlFetchApp.fetch('https://worknic-trade-beta.onrender.com/api/beta/enrollment/events',{method:'post',contentType:'application/json',payload:JSON.stringify(body),muteHttpExceptions:true,followRedirects:false});if(response.getResponseCode()===201&&JSON.parse(response.getContentText()).saved===true)state='handed_off'}catch(error){}
 lock.waitLock(10000);try{sheet.getRange(job.index,6,1,2).setValues([[state,new Date().toISOString()]]);SpreadsheetApp.flush()}finally{lock.releaseLock()}
}
