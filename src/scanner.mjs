import fs from 'node:fs/promises';
import path from 'node:path';
import { candidates, describe } from './profiles.mjs';

export const schemaVersion = '1.0';
export const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
export function normalizeRoots(roots) {
  return [...new Set(roots.map(r => path.resolve(r)))].sort((a,b) => a.length-b.length).filter((r,i,all) => !all.slice(0,i).some(parent => inside(parent,r)));
}
// Check each component rather than only the final component: a junction in a parent also escapes scope.
export async function noLinks(location, io = fs) {
  const absolute = path.resolve(location);
  let current = path.parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await io.lstat(current);
    if (stat.isSymbolicLink()) throw Object.assign(new Error('Symbolic link or junction skipped'), { code: 'LINK_SKIPPED' });
  }
  return absolute;
}
export async function discover({ allowedRoots, context, io = fs } = {}) {
  const profiles = candidates(context);
  const locations = [];
  for (const row of profiles) {
    if (allowedRoots && !allowedRoots.some(root => inside(path.resolve(root), row.path))) continue;
    try { await noLinks(row.path, io); const stat = await io.lstat(row.path); locations.push({ ...row, status: stat.isDirectory() ? 'detected' : 'not-directory' }); }
    catch (e) { locations.push({ ...row, status: e.code === 'ENOENT' ? 'missing' : 'unavailable', reason: e.code || 'ERROR' }); }
  }
  return { schemaVersion, locations, note: 'Detected folders indicate possible agent storage, not proof the application is installed.' };
}
export async function authorize(location, allowedRoots, io = fs) {
  const absolute = path.resolve(location);
  if (!allowedRoots.some(root => inside(path.resolve(root), absolute))) throw new Error('Path is outside configured scan roots');
  await noLinks(absolute, io);
  // Every component was checked with lstat, including ancestors of the root.
  // Windows app-container hosts may deny realpath despite permitting metadata.
  // No fallback that follows links is used.
  return absolute;
}
export async function describeFolder(location, { allowedRoots, io = fs, profiles = candidates() }) {
  const absolute = await authorize(location, allowedRoots, io);
  if (!(await io.lstat(absolute)).isDirectory()) throw new Error('Expected a directory');
  return { schemaVersion, ...describe(absolute, profiles) };
}
export async function scan({ roots, allowedRoots = roots, maxEntries = 500000, timeoutMs = 120000, top = 10, signal, io = fs, profiles = candidates() }) {
  for (const [key,value,min,max] of [['maxEntries',maxEntries,1,2000000],['timeoutMs',timeoutMs,1,600000],['top',top,1,50]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
  }
  const started = Date.now();
  const report = { schemaVersion, startedAt: new Date(started).toISOString(), complete: true, totals: { bytes:0, files:0, directories:0 }, roots:[], largestFolders:[], largestFiles:[], warnings:[], warningCount:0, entriesVisited:0,
    measurement: 'Logical bytes per file path; hard links count per path. Not RAM or physical disk allocation. Live best-effort scan, not an atomic snapshot.', nestedTotals: 'Largest folders are already included in root totals. Do not add nested rows together.' };
  report.warningCounts={};
  const warn = (location, code) => { report.complete = false; report.warningCount++; report.warningCounts[code]=(report.warningCounts[code] || 0)+1; if (report.warnings.length < 100) report.warnings.push({ path:location, code }); };
  const keep = (list,item) => { list.push(item); list.sort((a,b) => b.bytes-a.bytes || a.path.localeCompare(b.path)); if(list.length>top) list.length=top; };
  let stopped = false;
  const stop = () => {
    if (stopped) return true;
    const reason = signal?.aborted ? 'CANCELLED' : Date.now()-started >= timeoutMs ? 'TIME_LIMIT' : report.entriesVisited >= maxEntries ? 'ENTRY_LIMIT' : null;
    if(reason) { warn('',reason); report.stopReason=reason; stopped=true; }
    return stopped;
  };
  async function visit(location, depth, rootRow) {
    const subtotal = { bytes:0, files:0, directories:0 };
    if(stop()) return subtotal;
    report.entriesVisited++;
    let stat;
    try { stat = await io.lstat(location); } catch(e) { warn(location,e.code || 'STAT_ERROR'); return subtotal; }
    if(stat.isSymbolicLink()) { warn(location,'LINK_SKIPPED'); return subtotal; }
    if(stat.isFile()) {
      try {
        const after=await io.lstat(location);
        if(!after.isFile() || after.size!==stat.size || after.mtimeMs!==stat.mtimeMs) warn(location,'FILE_CHANGED_DURING_SCAN');
      } catch(e) { warn(location,e.code || 'FILE_CHANGED_DURING_SCAN'); }
      subtotal.bytes = stat.size; subtotal.files=1;
      keep(report.largestFiles,{ path:location, bytes:stat.size, agent:describe(location,profiles).agent, modifiedAt:stat.mtime.toISOString() });
      if(depth===1) { rootRow.directFiles.bytes+=stat.size; rootRow.directFiles.files++; }
      return subtotal;
    }
    if(!stat.isDirectory()) { warn(location,'SPECIAL_FILE_SKIPPED'); return subtotal; }
    subtotal.directories=1;
    if(depth>256) { warn(location,'DEPTH_LIMIT'); return subtotal; }
    let dir;
    try {
      dir = await io.opendir(location);
      for await (const entry of dir) {
        if(stop()) break;
        const child = await visit(path.join(location,entry.name),depth+1,rootRow);
        for(const key of ['bytes','files','directories']) subtotal[key]+=child[key];
      }
      const after = await io.lstat(location);
      if(after.mtimeMs!==stat.mtimeMs) warn(location,'DIRECTORY_CHANGED_DURING_SCAN');
    } catch(e) { warn(location,e.code || 'READ_ERROR'); }
    const row = { ...describe(location,profiles), ...subtotal };
    if(depth>0) keep(report.largestFolders,row);
    if(depth===1) { rootRow.childFolderCount++; keep(rootRow.folders,row); }
    return subtotal;
  }
  for (const root of normalizeRoots(roots)) {
    const row = { ...describe(root,profiles), bytes:0, files:0, directories:0, folders:[], childFolderCount:0, directFiles:{bytes:0,files:0}, complete:true };
    report.roots.push(row);
    const before=report.warningCount;
    try {
      await authorize(root,allowedRoots,io);
      if(!(await io.lstat(root)).isDirectory()) throw Object.assign(new Error('Expected a directory'),{code:'NOT_DIRECTORY'});
      Object.assign(row,await visit(root,0,row));
    } catch(e) { warn(root,e.code || e.message); }
    row.complete=before===report.warningCount && !stopped;
    for(const key of ['bytes','files','directories']) report.totals[key]+=row[key];
  }
  report.finishedAt=new Date().toISOString();
  return report;
}
