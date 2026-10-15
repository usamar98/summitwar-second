import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url)),'server-only':fileURLToPath(new URL('./tests/server-only.ts',import.meta.url))}},test:{environment:'node',fileParallelism:false,maxWorkers:1,isolate:true,execArgv:['--wasm-num-compilation-tasks=1','--liftoff-only','--no-wasm-tier-up'],testTimeout:15000}});
