#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { discover, scan, describeFolder } from './scanner.mjs';
import { render } from './report.mjs';

try {
  const { values, positionals } = parseArgs({ allowPositionals:true, options: {
    root:{type:'string',multiple:true}, allow:{type:'string',multiple:true}, top:{type:'string'}, 'max-entries':{type:'string'}, 'timeout-ms':{type:'string'}, format:{type:'string'}, help:{type:'boolean'}
  }});
  const command=positionals[0] || 'discover_agents';
  if(values.help) console.log('Commands: discover_agents | scan_storage | describe_folder PATH\nOptions: --root PATH (repeatable), --allow PATH (restrict scope), --top 10, --max-entries 500000, --timeout-ms 120000, --format json|markdown\nScanning defaults to detected agent folders. Explicit --root grants that root for this local invocation. No files are modified.');
  else {
    if(values.format && !['json','markdown'].includes(values.format)) throw new Error('format must be json or markdown');
    const controller=new AbortController(); process.once('SIGINT',()=>controller.abort());
    let result;
    if(command==='discover_agents') result=await discover({allowedRoots:values.allow});
    else if(command==='scan_storage') {
      const discovery=await discover({allowedRoots:values.allow});
      const roots=values.root || discovery.locations.filter(r=>r.status==='detected').map(r=>r.path);
      result=await scan({roots,allowedRoots:values.allow || roots,top:values.top?Number(values.top):10,maxEntries:values['max-entries']?Number(values['max-entries']):500000,timeoutMs:values['timeout-ms']?Number(values['timeout-ms']):120000,signal:controller.signal});
      if(!values.root) result.discovery=discovery;
    } else if(command==='describe_folder') {
      if(!positionals[1]) throw new Error('Provide a folder path');
      result=await describeFolder(positionals[1],{allowedRoots:values.allow || [positionals[1]]});
    } else throw new Error('Unknown command');
    console.log(values.format==='markdown' ? render(result) : JSON.stringify(result,null,2));
  }
} catch(e) { console.error(e.message); process.exitCode=1; }
