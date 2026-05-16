export type ApiLatencySource =
  | 'apiClient'
  | 'auth'
  | 'publicDemo'
  | 'register'
  | 'trade'
  | 'candles'
  | 'positions'
  | 'unknown';

export type ApiLatencySample = {
  id: string;
  label: string;
  method: string;
  endpoint: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  source: ApiLatencySource;
  recordedAtIso: string;
  error?: string;
};

type ApiLatencyInput = {
  label: string;
  method?: string;
  endpoint?: string;
  source?: ApiLatencySource;
  status?: number | null;
  ok?: boolean;
  durationMs: number;
  error?: unknown;
};

type TimedFetchMeta = {
  label: string;
  method?: string;
  endpoint?: string;
  source?: ApiLatencySource;
};

const API_LATENCY_SAMPLE_LIMIT = 120;
const API_LATENCY_WARN_MS = 1000;
const API_LATENCY_SLOW_MS = 3000;
const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'api_key',
  'authorization',
  'key',
  'pass',
  'password',
  'refresh_token',
  'token',
]);

let samples: ApiLatencySample[] = [];

export const getApiLatencyNow = () =>
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();

const createSampleId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const shouldLogApiLatency = () =>
  typeof __DEV__ !== 'undefined' && __DEV__;

function normalizeError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function sanitizeApiLatencyEndpoint(endpoint: string | undefined): string {
  if (!endpoint) return 'unknown';

  try {
    const parsed = new URL(endpoint);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, '[redacted]');
      }
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch (_error) {
    const [path, query = ''] = endpoint.split('?');
    if (!query) return path || endpoint;
    const params = new URLSearchParams(query);
    for (const key of Array.from(params.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        params.set(key, '[redacted]');
      }
    }
    return `${path}?${params.toString()}`;
  }
}

export function recordApiLatency(input: ApiLatencyInput): ApiLatencySample {
  const sample: ApiLatencySample = {
    id: createSampleId(),
    label: input.label,
    method: (input.method ?? 'GET').toUpperCase(),
    endpoint: sanitizeApiLatencyEndpoint(input.endpoint),
    status: input.status ?? null,
    ok: input.ok ?? false,
    durationMs: Math.round(input.durationMs),
    source: input.source ?? 'unknown',
    recordedAtIso: new Date().toISOString(),
    error: normalizeError(input.error),
  };

  samples = [sample, ...samples].slice(0, API_LATENCY_SAMPLE_LIMIT);

  if (shouldLogApiLatency()) {
    const severity = sample.durationMs >= API_LATENCY_SLOW_MS
      ? 'slow'
      : sample.durationMs >= API_LATENCY_WARN_MS
        ? 'warn'
        : 'ok';
    const message =
      `[API ${severity}] ${sample.method} ${sample.endpoint} ${sample.status ?? 'ERR'} ` +
      `${sample.durationMs}ms (${sample.label})`;
    if (severity === 'slow') {
      console.warn(message);
    } else {
      console.log(message);
    }
  }

  return sample;
}

export function getApiLatencySamples(): ApiLatencySample[] {
  return samples;
}

export function clearApiLatencySamples() {
  samples = [];
}

export async function timedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  meta: TimedFetchMeta,
): Promise<Response> {
  const startedAtMs = getApiLatencyNow();
  const method = (meta.method ?? init?.method ?? 'GET').toUpperCase();
  const endpoint = meta.endpoint ?? String(input);

  try {
    const response = await fetch(input, init);
    recordApiLatency({
      label: meta.label,
      method,
      endpoint,
      source: meta.source,
      status: response.status,
      ok: response.ok,
      durationMs: getApiLatencyNow() - startedAtMs,
    });
    return response;
  } catch (error) {
    recordApiLatency({
      label: meta.label,
      method,
      endpoint,
      source: meta.source,
      status: null,
      ok: false,
      durationMs: getApiLatencyNow() - startedAtMs,
      error,
    });
    throw error;
  }
}
