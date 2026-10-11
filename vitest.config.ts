import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{alias:{'server-only':fileURLToPath(new URL('./tests/server-only.ts',import.meta.url))}},test:{environment:'node',fileParallelism:false,maxWorkers:1,isolate:false,execArgv:['--wasm-num-compilation-tasks=1'],testTimeout:15000}});
