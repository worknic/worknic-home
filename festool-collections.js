(function(root){'use strict';
 const norm=v=>String(v||'').normalize('NFKC').toUpperCase().replace(/\s+/g,' ').trim();
 function classify(p){
  if(p.brand!=='festool')return null;
  const model=norm(p.model),name=norm(p.name),text=norm([p.name,p.sourceTitle].join(' '));
  // A tool supplied in a Systainer remains a tool, even in a dealer's Systainer shop.
  if(/^(?:DF[CR]?|TS[C]?|HK[C]?|KS[C]?|OF|RO|ETS[C]?|DTS[C]?|RTS[C]?|CXS|TXS|TDC|TPC|DWC|OSC|RG|AGC|CT[A-Z]*|HL|EHL|MFK)\s*[-\d]/.test(model))return 'tools';
  if(/칸막이|수납 용기|플라스틱 컨테이너|인서트|인서트폼|패드 폼|커버 패드|베이스 패드|라벨|롤보드|카트|운반용구|시스테이너 포트|CART|TROLLEY|INSERT|FOAM|PADDING/.test(text)||/^(?:SYS[- ]?(?:RB|ROLL|PORT|AZ)|SE[- ]|AB[- ]BF|TZE[- ]|BOX\b)/.test(model))return 'systainer-accessories';
  const casePattern=/SYS[- ]?3?[- ]*(?:COMBI|ORG|TB|DF|XXL|XXS|M\b|L\b|S\b|SORT)|SORTAINER|소르테이너/;
  if(casePattern.test(model)||casePattern.test(name))return 'systainer';
  // Numeric article numbers need a positive container name; a mere source URL is never evidence.
  if(/^(?:시스테이너|SYSTAINER|소르테이너)/.test(name)&&!/(?:접합기|드릴|샌더|집진기|충전기|배터리|핀 세트|커터)/.test(name))return 'systainer';
  return 'tools';
 }
 root.WORKNIC_FESTOOL=Object.freeze({classify});
})(typeof window==='undefined'?globalThis:window);
