import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
await fs.mkdir('dist',{recursive:true});
const packageDirs=new Set();
for(const entry of ['cli','server']) {
  const result=await build({entryPoints:[`src/${entry}.mjs`],outfile:`dist/${entry}.mjs`,bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,banner:{js:"import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"},legalComments:'eof'});
  for(const input of Object.keys(result.metafile.inputs)) {
    if(!input.startsWith('node_modules/')) continue;
    let dir=path.dirname(input);
    while(dir!=='.') {
      try {
        const metadata=JSON.parse(await fs.readFile(path.join(dir,'package.json'),'utf8'));
        if(metadata.name && metadata.version) { packageDirs.add(dir); break; }
      } catch {}
      dir=path.dirname(dir);
    }
  }
}
const notices=[];
for(const dir of [...packageDirs].sort()) {
  const pkg=JSON.parse(await fs.readFile(path.join(dir,'package.json'),'utf8'));
  notices.push(`
## ${pkg.name} ${pkg.version}
License: ${JSON.stringify(pkg.license || 'See package license')}
`);
  const names=await fs.readdir(dir);
  for(const name of names.filter(n=>/^(licen[sc]e|notice|copying)(\.|$)/i.test(n))) {
    if((await fs.stat(path.join(dir,name))).isFile()) notices.push(await fs.readFile(path.join(dir,name),'utf8'));
  }
}
await fs.writeFile('THIRD-PARTY-NOTICES.txt',notices.join('\n'));
console.log('Built standalone CLI and MCP server; no runtime npm install required.');

