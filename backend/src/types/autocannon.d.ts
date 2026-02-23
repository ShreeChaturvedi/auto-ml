declare module 'autocannon' {
  interface Options {
    url: string;
    connections?: number;
    duration?: number;
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
    pipelining?: number;
    timeout?: number;
    amount?: number;
    workers?: number;
  }

  interface Result {
    requests: {
      average: number;
      mean: number;
      stddev: number;
      min: number;
      max: number;
      total: number;
      sent: number;
    };
    latency: {
      average: number;
      mean: number;
      stddev: number;
      min: number;
      max: number;
      p2_5: number;
      p50: number;
      p75: number;
      p90: number;
      p95: number;
      p97_5: number;
      p99: number;
      p99_9: number;
      p99_99: number;
      p99_999: number;
    };
    throughput: {
      average: number;
      mean: number;
      stddev: number;
      min: number;
      max: number;
      total: number;
    };
    errors: number;
    timeouts: number;
    mismatches: number;
    resets: number;
    duration: number;
    non2xx: number;
  }

  function autocannon(options: Options): Result;
  function autocannon(options: Options, callback: (err: Error | null, result: Result) => void): void;

  export = autocannon;
}
