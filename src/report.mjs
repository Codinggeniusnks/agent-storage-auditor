export const size = bytes => bytes>=1073741824 ? `${(bytes/1073741824).toFixed(2)} GiB` : `${(bytes/1048576).toFixed(2)} MiB`;
const cell = text => String(text).replaceAll('|','\\|').replace(/[\r\n]/g,' ');
export function render(r) {
  if(!r.totals) return '```json\n'+JSON.stringify(r,null,2)+'\n```';
  const lines=[`# Agent storage audit`, ``, `${size(r.totals.bytes)} across ${r.totals.files.toLocaleString()} files. ${r.complete?'Completed':'PARTIAL — see coverage warnings'}.`, ``, `Scan: ${r.startedAt} → ${r.finishedAt}`, ``, r.measurement, ``, '| Location | Size | Files | Agent | Purpose |', '|---|---:|---:|---|---|'];
  if(!r.roots.length) lines.splice(2,0,'No detected folders were scanned. Check discovery results and configured permissions, or select a workspace explicitly.','');
  for(const row of r.roots.toSorted((a,b)=>b.bytes-a.bytes)) lines.push(`| ${cell(row.path)} | ${size(row.bytes)} | ${row.files} | ${cell(row.agent)} | ${cell(row.purpose)} (${row.confidence})${row.complete?'':' — partial'} |`);
  for(const root of r.roots) {
    lines.push('',`## ${cell(root.path)}`,`Direct files: ${size(root.directFiles.bytes)} (${root.directFiles.files} files). Showing ${root.folders.length} of ${root.childFolderCount} child folders.`, '', '| Folder | Size | Purpose |','|---|---:|---|');
    for(const row of root.folders) lines.push(`| ${cell(row.path)} | ${size(row.bytes)} | ${cell(row.purpose)} (${row.confidence}) |`);
  }
  lines.push('', '## Largest nested folders', r.nestedTotals, '', '| Folder | Size |','|---|---:|');
  for(const row of r.largestFolders) lines.push(`| ${cell(row.path)} | ${size(row.bytes)} |`);
  lines.push('', '## Largest files', '', '| File | Size |','|---|---:|');
  for(const row of r.largestFiles) lines.push(`| ${cell(row.path)} | ${size(row.bytes)} |`);
  if(r.warningCount) lines.push('',`Coverage warnings: ${r.warningCount} (first ${r.warnings.length} shown).`, `Summary: ${cell(JSON.stringify(r.warningCounts))}. Stop reason: ${r.stopReason || 'none'}.`,...r.warnings.map(w=>`- ${cell(w.code)}: ${cell(w.path)}`));
  lines.push('', 'Agent association does not establish AI authorship. No file contents were read.');
  return lines.join('\n');
}
