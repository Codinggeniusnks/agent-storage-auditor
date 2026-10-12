import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scan, discover, describeFolder, normalizeRoots } from '../src/scanner.mjs';
import { candidates } from '../src/profiles.mjs';

async function fixture(t) {
  const temp=process.platform==='darwin'?await fs.realpath(os.tmpdir()):os.tmpdir();
  const root=await fs.mkdtemp(path.join(temp,'storage-auditor-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'outputs'));
  await fs.mkdir(path.join(root,'empty'));
  await fs.writeFile(path.join(root,'.hidden'),Buffer.alloc(7));
  await fs.writeFile(path.join(root,'outputs','你好.txt'),Buffer.alloc(13));
  return root;
}
test('exact totals, hidden files, empty folder, Unicode, bounded rankings and overlap',async t=>{
  const root=await fixture(t);
  const r=await scan({roots:[root,path.join(root,'outputs'),root],top:1});
  assert.equal(r.totals.bytes,20); assert.equal(r.totals.files,2); assert.equal(r.totals.directories,3);
  assert.equal(r.roots.length,1); assert.equal(r.roots[0].directFiles.bytes,7);
  assert.equal(r.largestFiles.length,1); assert.equal(r.largestFiles[0].bytes,13); assert.equal(r.complete,true);
  assert.equal((await describeFolder(path.join(root,'outputs'),{allowedRoots:[root]})).category,'generated outputs');
});
test('missing, outside-root, and prefix sibling are rejected without traversal',async t=>{
  const root=await fixture(t);
  const r=await scan({roots:[path.join(root,'missing')],allowedRoots:[root]});
  assert.equal(r.complete,false); assert.equal(r.totals.bytes,0);
  await assert.rejects(describeFolder(root+'-other',{allowedRoots:[root]}),/outside/);
  assert.equal(normalizeRoots([root,root+'-other']).length,2);
});
test('junction/symlink and nested link escape are skipped',async t=>{
  const root=await fixture(t), external=await fixture(t);
  const link=path.join(root,'escape');
  try { await fs.symlink(external,link,process.platform==='win32'?'junction':'dir'); }
  catch(e) { if(e.code==='EPERM') return t.skip('Host does not permit symlinks'); throw e; }
  const r=await scan({roots:[root]}); assert.equal(r.totals.bytes,20); assert.equal(r.complete,false);
  assert.ok(r.warnings.some(w=>w.code==='LINK_SKIPPED'));
  await assert.rejects(describeFolder(path.join(link,'outputs'),{allowedRoots:[root]}),/link|junction/i);
});
test('cancellation, entry limit, invalid options',async t=>{
  const root=await fixture(t);
  const controller=new AbortController(); controller.abort();
  assert.ok((await scan({roots:[root],signal:controller.signal})).warnings.some(w=>w.code==='CANCELLED'));
  const r=await scan({roots:[root],maxEntries:1}); assert.equal(r.complete,false); assert.equal(r.totals.files,0);
  await assert.rejects(scan({roots:[root],top:0}),/Invalid/);
});
test('inaccessible entries and disappearing files produce partial totals',async t=>{
  const root=await fixture(t);
  const io={...fs,lstat:async p=>{ if(path.basename(p)==='.hidden') throw Object.assign(new Error('gone'),{code:'ENOENT'}); return fs.lstat(p); },opendir:async p=>{if(path.basename(p)==='outputs') throw Object.assign(new Error('denied'),{code:'EACCES'}); return fs.opendir(p);}};
  const r=await scan({roots:[root],io}); assert.equal(r.complete,false); assert.equal(r.totals.bytes,0);
  assert.ok(r.warnings.some(w=>w.code==='EACCES')); assert.ok(r.warnings.some(w=>w.code==='ENOENT'));
});
test('directory changes and time bounds are reported',async t=>{
  const root=await fixture(t); let seen=0;
  const io={...fs,lstat:async p=>{const s=await fs.lstat(p); if(p===path.join(root,'outputs') && ++seen>1) s.mtimeMs+=100; return s;}};
  assert.ok((await scan({roots:[root],io})).warnings.some(w=>w.code==='DIRECTORY_CHANGED_DURING_SCAN'));
  const slow={...fs,lstat:async p=>{await new Promise(r=>setTimeout(r,2)); return fs.lstat(p);}};
  assert.ok((await scan({roots:[root],io:slow,timeoutMs:1})).warnings.some(w=>w.code==='TIME_LIMIT'));
});
for(const platform of ['win32','darwin','linux']) test(`profile discovery paths on ${platform}`,async()=>{
  const home=platform==='win32'?'C:\\Users\\Example':'/users/example';
  const rows=candidates({platform,home,env:{}});
  const p=platform==='win32'?path.win32:path.posix;
  assert.equal(rows.find(r=>r.agent==='Codex').path,p.join(home,'.codex'));
  assert.equal(rows.find(r=>r.agent==='Gemini CLI').path,p.join(home,'.gemini'));
  assert.equal(rows.find(r=>r.agent==='OpenCode').path,p.join(home,'.local','share','opencode'));
  assert.equal(new Set(rows.map(r=>r.agent)).size,7);
  assert.ok(rows.every(r=>r.source.startsWith('https://') && r.verifiedOn));
});
test('configuration overrides and actual discovery fixture',async t=>{
  const root=await fixture(t);
  const env={CODEX_HOME:path.join(root,'custom'),CLAUDE_CONFIG_DIR:path.join(root,'claude'),GEMINI_CLI_HOME:root,XDG_DATA_HOME:path.join(root,'data')};
  await fs.mkdir(env.CODEX_HOME);
  const r=await discover({context:{home:root,env}});
  assert.equal(r.locations.find(r=>r.agent==='Codex').status,'detected');
  assert.equal(r.locations.find(r=>r.agent==='Claude Code').path,env.CLAUDE_CONFIG_DIR);
});
test('link detection is covered even on hosts that prohibit creating links',async t=>{
  const root=await fixture(t);
  const io={...fs,lstat:async p=>{const stat=await fs.lstat(p); if(p===path.join(root,'outputs')) stat.isSymbolicLink=()=>true; return stat;}};
  const r=await scan({roots:[root],io});
  assert.equal(r.totals.bytes,7); assert.ok(r.warnings.some(w=>w.code==='LINK_SKIPPED'));
  await assert.rejects(describeFolder(path.join(root,'outputs'),{allowedRoots:[root],io}),/link|junction/i);
});
test('file size changes are reported and metadata is the only input',async t=>{
  const root=await fixture(t); let visits=0;
  const io={...fs,readFile:()=>{throw new Error('Must not read contents');},lstat:async p=>{const s=await fs.lstat(p); if(path.basename(p)==='.hidden' && ++visits>1) s.size+=1; return s;}};
  const r=await scan({roots:[root],io}); assert.equal(r.totals.bytes,20);
  assert.ok(r.warnings.some(w=>w.code==='FILE_CHANGED_DURING_SCAN'));
});
