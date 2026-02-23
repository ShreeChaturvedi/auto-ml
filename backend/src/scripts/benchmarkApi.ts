import autocannon from 'autocannon';

const baseUrl = process.env.AUTOML_BENCH_BASE_URL ?? 'http://localhost:4000';
const connections = Number(process.env.AUTOML_BENCH_CONNECTIONS ?? 20);
const duration = Number(process.env.AUTOML_BENCH_DURATION ?? 10);
const pipelining = Number(process.env.AUTOML_BENCH_PIPELINING ?? 1);

const endpoints = [
  { name: 'health', method: 'GET', path: '/api/health' },
  { name: 'projects', method: 'GET', path: '/api/projects' }
];

function formatMs(value: number | undefined) {
  if (typeof value !== 'number') return 'n/a';
  return `${value.toFixed(2)}ms`;
}

function formatRate(value: number | undefined) {
  if (typeof value !== 'number') return 'n/a';
  return `${value.toFixed(2)}/s`;
}

async function runBenchmark() {
  console.log('[benchmark] Starting API benchmark');
  console.log(`[benchmark] Base URL: ${baseUrl}`);
  console.log(`[benchmark] Connections: ${connections}, Duration: ${duration}s, Pipelining: ${pipelining}`);

  for (const endpoint of endpoints) {
    console.log(`\n[benchmark] ${endpoint.name}: ${endpoint.method} ${endpoint.path}`);
    const result = await autocannon({
      url: `${baseUrl}${endpoint.path}`,
      method: endpoint.method,
      connections,
      duration,
      pipelining
    });

    console.log(`[benchmark] Requests: ${formatRate(result.requests?.average)} avg`);
    console.log(`[benchmark] Latency p50: ${formatMs(result.latency?.p50)} p95: ${formatMs(result.latency?.p95)} p99: ${formatMs(result.latency?.p99)}`);
    console.log(`[benchmark] Throughput: ${formatRate(result.throughput?.average)}`);
    console.log(`[benchmark] Errors: ${result.errors} | Timeouts: ${result.timeouts} | Non-2xx: ${result.non2xx}`);
  }
}

runBenchmark().catch((error) => {
  console.error('[benchmark] Failed to run benchmarks', error);
  process.exitCode = 1;
});
