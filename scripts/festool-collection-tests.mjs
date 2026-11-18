import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../festool-collections.js',import.meta.url),'utf8'),sandbox);const c=sandbox.window.WORKNIC_FESTOOL.classify;
const fixtures=[
 [{model:'SYS3-COMBI M 337',name:'시스테이너³ 콤비'},'systainer'],
 [{model:'577348',name:'시스테이너 SYS3 DF M 237'},'systainer'],
 [{model:'204844',name:'시스테이너 SYS3 M 337_bl'},'systainer'],
 [{model:'DF 500 RQ Plus',name:'도미노 시스테이너 포함 세트',collections:['systainer'],sourceUrl:'https://smartstore.naver.com/worknic_festool/products/1'},'tools'],
 [{model:'TSC 55',name:'시스테이너 포함 충전쏘'},'tools'],
 [{model:'SE-BP SYS3 M',name:'베이스 패드 폼'},'systainer-accessories'],
 [{model:'204858',name:'플라스틱 컨테이너 Box 50x50x68mm'},'systainer-accessories'],
 [{model:'SYS-Roll 100',name:'운반용구'},'systainer-accessories'],
 [{model:'578056',name:'플라스틱 컨테이너 세트'},'systainer-accessories'],
 [{model:'204844',name:'시스테이너 SYS3 M 337_화이트'},'systainer'],
 [{model:'D 5-NL',name:'도미노 커터',sourceUrl:'https://smartstore.naver.com/worknic_festool/products/2'},'tools']
];for(const [p,want]of fixtures)assert.equal(c({brand:'festool',...p}),want,JSON.stringify(p));assert.equal(c({brand:'makita',name:'SYS3 M 337'}),null);
const input=JSON.parse(fs.readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));const summary={};for(const p of input.products.filter(p=>p.brand==='festool')){const kind=c(p);summary[kind]=(summary[kind]||0)+1;}console.log('PASS: cases, accessory separation, color suffixes, tool kits and dealer-URL false positives; catalog counts '+JSON.stringify(summary));
