import { openStore } from './store.mjs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';

// Read the initial password on stdin; never put it in argv or a tracked file.
let masked = false;
const output = new Writable({ write(chunk, encoding, done) { if (!masked) stdout.write(chunk, encoding); done(); } });
const rl = createInterface({ input: stdin, output, terminal: !!stdin.isTTY });
const username = await rl.question('관리자 아이디: ');
stdout.write('관리자 비밀번호 (10자 이상, 입력 숨김): '); masked = true;
const password = await rl.question('');
masked = false; stdout.write('\n');
rl.close();
const store = openStore(resolve(process.env.TRADE_DATA_DIR || new URL('../.runtime/', import.meta.url).pathname, 'trade.sqlite'));
try { store.createAdmin(username, password); console.log('관리자를 생성했습니다.'); }
finally { store.close(); }
