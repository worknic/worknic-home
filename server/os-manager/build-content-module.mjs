import fs from 'node:fs';
const source=new URL('../../content/public-content.js',import.meta.url),target=new URL('./site-manager/content/public-content.js',import.meta.url);
fs.copyFileSync(source,target);console.log('OS content module copied from the shared public adapter.');
