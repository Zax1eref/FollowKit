import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const template=readFileSync('src/index.html','utf8');
const domain=readFileSync('src/domain.mjs','utf8').replaceAll('export function','function');
const app=readFileSync('src/client-api.mjs','utf8')+'\n'+readFileSync('src/app.mjs','utf8');
mkdirSync('dist',{recursive:true});
writeFileSync('dist/index.html',template.replace('/* APPLICATION */',domain+'\n'+app));
console.log('Built standalone dist/index.html');
