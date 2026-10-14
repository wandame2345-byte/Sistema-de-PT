import {build as viteBuild} from 'vite';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{stdio:'inherit'});
await viteBuild();
await build({entryPoints:['lib/guild.ts'],outfile:'dist-server/guild.js',bundle:true,platform:'node',format:'esm',target:'node22'});
