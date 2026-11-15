import {el,field,formTask,card,call,button,say} from './beta-common.js';
export function businessEnrollmentAdmin(root){
 const c=card('이미 승인된 고객 · 계정 설정 안내'),form=el('form');
 c.append(el('p','기존 OS 신청을 다시 작성하지 않고 연결합니다. OS의 정확한 신청번호와 연락처를 확인해야 하며, 사업자번호만으로 권한을 부여하지 않습니다.'));
 field(form,'requestId','OS 신청번호');field(form,'businessNumber','사업자등록번호');field(form,'email','신청 담당자 이메일');field(form,'contactVerified','신청 원본과 실제 담당자 연락처를 확인했습니다.',false,'checkbox').required=true;
 let requestKey=crypto.randomUUID();const result=el('div');form.append(el('button','계정 설정 안내 준비','button'));formTask(form,async data=>{await call('/admin/enrollment/import',{requestId:data.requestId,profile:{businessNumber:data.businessNumber.replace(/[-\s]/g,''),email:data.email},contactVerified:true,requestKey});say('기존 승인 신청을 연결하고 안내 대기를 기록했습니다. 문자 접수·전달 상태를 따로 확인해주세요.');await refresh(data.requestId)});
 async function refresh(requestId){const d=await call('/admin/enrollment/messages',{requestId});result.replaceChildren();const labels={queued:'발송 대기',submitting:'접수 요청 중',accepted:'발송 접수됨 · 전달 확인 중',delivered:'전달 완료',failed:'실패',unknown:'결과 불명 · 자동 재발송 안 함',cancelled:'상태 변경으로 취소됨'};for(const m of d.messages){const row=el('div');row.append(el('p',(m.kind==='received'?'신청 안내':'승인 안내')+' · '+(labels[m.status]||m.status)));if(m.provider_id&&!['delivered','failed','cancelled'].includes(m.status))row.append(button('전달 결과 조회',async()=>{await call('/admin/enrollment/refresh-message',{eventKey:m.event_key});await refresh(requestId)},'button secondary'));result.append(row)}if(!d.messages.length)result.append(el('p','문자 기록이 없습니다.'))}
 let reissueRequest=null;
 form.append(button('안내 상태 확인',async()=>{const id=form.elements.requestId.value.trim();if(!id)throw Error('OS 신청번호를 입력해주세요.');await refresh(id)},'button secondary'));
 form.append(button('계정 설정 링크 다시 안내',async()=>{
  const id=form.elements.requestId.value.trim();if(!id||!form.elements.contactVerified.checked)throw Error('신청번호와 실제 담당자 연락처를 다시 확인해주세요.');
  if(!confirm('기존 계정 설정 링크는 만료되고 새 안내 문자가 준비됩니다. 확인한 담당자에게 다시 안내할까요?'))return;
  if(reissueRequest?.id!==id)reissueRequest={id,key:crypto.randomUUID()};
  await call('/admin/enrollment/reissue',{requestId:id,contactVerified:true,requestKey:reissueRequest.key});
  reissueRequest=null;say('새 계정 설정 안내를 준비했습니다. 문자 전달 상태를 확인해주세요.');await refresh(id);
 },'button secondary'));
 c.append(form,result);root.append(c);
}
