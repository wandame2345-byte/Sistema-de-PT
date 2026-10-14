import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['lib/guild.ts'],outfile:'dist-server/guild.js',bundle:true,platform:'node',format:'esm',target:'node22'});
const result=spawnSync(process.execPath,['--test','tests/guild.test.mjs'],{stdio:'inherit'});
process.exit(result.status??1);
