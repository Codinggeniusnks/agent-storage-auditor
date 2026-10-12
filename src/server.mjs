import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import { discover, scan, describeFolder, normalizeRoots } from './scanner.mjs';

// Only the process owner can expand scope, through launch arguments. Tool calls cannot.
const allowedRoots=normalizeRoots(process.argv.slice(2));
if(!allowedRoots.length) { console.error('Pass one or more permitted folders as server arguments.'); process.exit(1); }
const server=new Server({name:'agent-storage-auditor',version:'1.0.0'},{capabilities:{tools:{}}});
const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const tools=[
  {name:'discover_agents',description:'Discover known agent storage folders inside configured roots. Does not inspect file contents.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations},
  {name:'scan_storage',description:'Measure logical storage in configured roots. Defaults to detected agent folders; explicit roots must be inside launch-time permissions. Results may be partial.',inputSchema:{type:'object',properties:{roots:{type:'array',items:{type:'string'},maxItems:100},top:{type:'integer',minimum:1,maximum:50},maxEntries:{type:'integer',minimum:1,maximum:2000000},timeoutMs:{type:'integer',minimum:1,maximum:600000}},additionalProperties:false},annotations},
  {name:'describe_folder',description:'Explain a permitted folder using its name and known location; returns evidence and confidence without reading contents.',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false},annotations}
];
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{
  try {
    const name=request.params.name, args=request.params.arguments || {};
    const spec=tools.find(t=>t.name===name);
    if(!spec || Object.keys(args).some(k=>!(k in spec.inputSchema.properties))) throw new Error('Unknown tool or argument');
    let result;
    if(name==='discover_agents') result=await discover({allowedRoots});
    else if(name==='describe_folder') {
      if(typeof args.path!=='string' || !path.isAbsolute(args.path)) throw new Error('Provide an absolute path');
      result=await describeFolder(args.path,{allowedRoots});
    } else {
      if(args.roots && (!Array.isArray(args.roots) || args.roots.length>100 || args.roots.some(r=>typeof r!=='string' || !path.isAbsolute(r)))) throw new Error('roots must be up to 100 absolute paths');
      const discovery=await discover({allowedRoots});
      const roots=args.roots || discovery.locations.filter(r=>r.status==='detected').map(r=>r.path);
      result=await scan({...args,roots,allowedRoots,signal:extra.signal});
      if(!args.roots) result.discovery=discovery;
    }
    return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
  } catch(e) { return {isError:true,content:[{type:'text',text:e.message}]}; }
});
await server.connect(new StdioServerTransport());
