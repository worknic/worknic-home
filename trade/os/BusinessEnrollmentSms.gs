/** Candidate only. Uses the SAME wsSolapi_/WORKNIC_SOLAPI_* service account.
 * Existing service SMS handlers and ledgers are not changed.
 * Requires the signed dispatcher patch in TradeBridge.gs; disabled by default.
 */
function worknicBusinessSms_(signed){
 var proof=worknicTradeStatus_(signed),p=signed.payload,props=PropertiesService.getScriptProperties(),mode=props.getProperty('WORKNIC_BUSINESS_SMS_MODE')||'disabled';
 if(mode!=='production'&&!(mode==='test'&&props.getProperty('WORKNIC_BUSINESS_SMS_TEST_REQUEST_ID')===proof.id))throw Error('BUSINESS_SMS_DISABLED');
 var r=wnbRows_(wnbTables_().requests,WNB_HEADERS_).filter(function(x){return x.id===proof.id})[0];
 if(!r||typeof r.phone!=='string'||!/^010\d{8}$/.test(r.phone.replace(/[\s()-]/g,'')))throw Error('PHONE_REVIEW_REQUIRED');
 if(typeof p.eventKey!=='string'||p.eventKey.length>250||p.eventKey.indexOf(r.id+':')!==0)throw Error('INVALID_EVENT');
 var ss=SpreadsheetApp.openById(wnbConfig_().sheetId),headers=['eventKey','requestId','status','messageId','groupId','providerCode','updated'],sheet=ss.getSheetByName('OS_����ڹ��ڿ���');
 var lock=LockService.getScriptLock();lock.waitLock(10000);var row;
 try{
  if(!sheet){sheet=ss.insertSheet('OS_����ڹ��ڿ���');sheet.appendRow(headers)}
  if(JSON.stringify(sheet.getRange(1,1,1,7).getValues()[0])!==JSON.stringify(headers))throw Error('SCHEMA_MISMATCH');
  var records=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,7).getValues():[],index=records.findIndex(function(x){return x[0]===p.eventKey});
  if(index>=0){row={index:index+2,values:records[index]};if(p.operation==='send')return {status:row.values[2]==='submitting'?'unknown':row.values[2],messageId:row.values[3]||null,code:String(row.values[5]||'')};}
  if(p.operation==='send'){
   if(typeof p.text!=='string'||p.text.length>900||!['pending','approved'].includes(r.status))throw Error('INVALID_SEND');
   if(p.eventKey.indexOf(':approved:')>=0&&r.status!=='approved')throw Error('APPROVAL_REQUIRED');
   sheet.appendRow([p.eventKey,r.id,'submitting','','','',new Date().toISOString()]);SpreadsheetApp.flush();row={index:sheet.getLastRow(),values:[p.eventKey,r.id,'submitting','','','',new Date().toISOString()]};
  }else if(p.operation!=='status'||!row||row.values[3]!==p.messageId)throw Error('INVALID_STATUS');
 }finally{lock.releaseLock()}
 var state='unknown',messageId=row.values[3]||'',groupId=row.values[4]||'',code='';
 try{
  if(p.operation==='send'){
   var reply=wsSolapi_('/messages/v4/send-many/detail',{messages:[{to:r.phone.replace(/[\s()-]/g,''),from:wsCredentials_().from,text:p.text,type:'LMS',subject:'WORKNIC ����� �ȳ�',customFields:{worknicBusinessEvent:p.eventKey}}],allowDuplicates:false,showMessageList:true});
   var failed=(reply.data.failedMessageList||[])[0],message=(reply.data.messageList||[])[0];groupId=reply.data.groupInfo&&reply.data.groupInfo.groupId||'';
   if(reply.code>=400){code=String(reply.code);state=reply.code<500?'failed':'unknown'}else if(failed){messageId=failed.messageId||'';code=String(failed.statusCode||'');state='failed'}else if(message&&message.messageId){messageId=message.messageId;code=String(message.statusCode);state=worknicBusinessSmsState_(code)}
  }else{
   if(['delivered','failed'].includes(row.values[2]))return {status:row.values[2],messageId:messageId,code:String(row.values[5]||'')};
   var lookup=wsSolapi_('/messages/v4/list?criteria=messageId&cond=eq&value='+encodeURIComponent(messageId)+'&limit=1');
   if(lookup.code!==200)throw Error('LOOKUP_FAILED');var detail=(lookup.data.messageList||{})[messageId];if(!detail||detail.messageId!==messageId)throw Error('LOOKUP_UNKNOWN');code=String(detail.statusCode);state=worknicBusinessSmsState_(code);
  }
 }catch(error){if(p.operation==='status')return {status:row.values[2],messageId:messageId,code:String(row.values[5]||'')};state='unknown'}
 lock.waitLock(10000);try{
  var current=sheet.getRange(row.index,1,1,7).getValues()[0];
  if(current[0]!==p.eventKey)throw Error('LEDGER_CHANGED');
  if(['delivered','failed'].includes(current[2]))return {status:current[2],messageId:current[3]||null,code:String(current[5]||'')};
  if(p.operation==='status'&&current[3]!==messageId)throw Error('MESSAGE_CHANGED');
  sheet.getRange(row.index,3,1,5).setValues([[state,messageId,groupId,code,new Date().toISOString()]]);SpreadsheetApp.flush()
 }finally{lock.releaseLock()}
 return {status:state,messageId:messageId||null,code:code};
}
function worknicBusinessSmsState_(code){return code==='4000'?'delivered':code==='5000'?'failed':['2000','3000'].includes(code)?'accepted':/^[123]\d{3}$/.test(code)?'failed':'unknown'}
