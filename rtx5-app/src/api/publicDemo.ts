import { timedFetch } from '../utils/apiLatency';

const DEFAULT_API_BASE_URL = 'https://backend.orrnn.com/api/v2';
const CONFIGURED_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;

function configuredPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const ORRNN_DEMO_BROKER_ID = process.env.EXPO_PUBLIC_ORRNN_DEMO_BROKER_ID || 'orrnn';
export const ORRNN_DEMO_INITIAL_BALANCE = configuredPositiveNumber(
  process.env.EXPO_PUBLIC_ORRNN_DEMO_INITIAL_BALANCE,
  10000,
);
export const ORRNN_DEMO_ORIGIN_BROKER =
  process.env.EXPO_PUBLIC_ORRNN_DEMO_ORIGIN_BROKER ||
  process.env.EXPO_PUBLIC_ORIGIN_BROKER ||
  undefined;
export const PUBLIC_API_V1_BASE_URL =
  process.env.EXPO_PUBLIC_API_V1_BASE_URL ||
  CONFIGURED_API_BASE_URL.replace(/\/api\/v\d+\/?$/, '/api/v1');

export interface OrrnnDemoStatusResponse {
  service: string;
  status: string;
  broker: string;
  demo_groups_available: number;
  total_demo_accounts: number;
  database: string;
}

export class OrrnnDemoApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'OrrnnDemoApiError';
    this.statusCode = statusCode;
  }
}

export function isOrrnnDemoHealthy(status: OrrnnDemoStatusResponse | null | undefined): boolean {
  return (
    status?.service === 'orrnn-demo' &&
    status.status === 'ok' &&
    status.broker === 'active' &&
    status.database === 'connected' &&
    status.demo_groups_available > 0
  );
}

export async function getOrrnnDemoStatus(): Promise<OrrnnDemoStatusResponse> {
  let response: Response;

  try {
    response = await timedFetch(`${PUBLIC_API_V1_BASE_URL}/public/demo-status`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    }, {
      label: 'publicDemo.status',
      method: 'GET',
      endpoint: '/public/demo-status',
      source: 'publicDemo',
    });
  } catch (_error) {
    throw new OrrnnDemoApiError(
      0,
      'Network error - unable to reach the demo account service.',
    );
  }

  if (!response.ok) {
    let serverMessage = '';

    try {
      const errorData = await response.json();
      serverMessage = errorData.detail || errorData.message || errorData.error || '';
    } catch (_error) {
      // Use the status-specific fallback below when the response body is not JSON.
    }

    const fallbackMessage =
      response.status === 503
        ? 'Demo account service is unavailable.'
        : `Demo status check failed: HTTP ${response.status}`;

    throw new OrrnnDemoApiError(
      response.status,
      serverMessage ? `${fallbackMessage} ${serverMessage}` : fallbackMessage,
    );
  }

  return response.json();
}

export interface OrrnnDemoGroup {
  name: string;
  description: string;
  currency: string;
  leverage: number;
}

export interface OrrnnDemoGroupsResponse {
  groups: OrrnnDemoGroup[];
  count: number;
}

export interface CreateOrrnnDemoAccountRequest {
  group: string;
  email: string;
  master_pass: string;
  investor_pass: string;
  first_name: string;
  last_name?: string;
  phone?: string;
  country?: string;
  currency?: string;
  leverage?: number;
  initial_balance?: number;
  origin_broker?: string;
  comment?: string;
}

export interface OrrnnDemoAccountResponse {
  login: number;
  broker_id?: string;
  group?: string;
  Group?: string;
  currency?: string;
  Currency?: string;
  leverage?: number;
  Leverage?: number;
  balance: number;
  api_key?: string;
  master_pass?: string;
  created_at?: number;
  Registration?: number;
}

/**
 * Retrieves the list of available demo groups for the orrnn broker.
 * The `name` field from the response items should be used as the `group`
 * parameter when creating a new demo account via POST /api/v1/public/demo-account.
 */
export async function getOrrnnDemoGroups(): Promise<OrrnnDemoGroupsResponse> {
  let response: Response;

  try {
    response = await timedFetch(`${PUBLIC_API_V1_BASE_URL}/public/demo-groups`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    }, {
      label: 'publicDemo.groups',
      method: 'GET',
      endpoint: '/public/demo-groups',
      source: 'publicDemo',
    });
  } catch (_error) {
    throw new OrrnnDemoApiError(
      0,
      'Network error - unable to fetch demo groups.',
    );
  }

  if (!response.ok) {
    let serverMessage = '';

    try {
      const errorData = await response.json();
      serverMessage = errorData.detail || errorData.message || errorData.error || '';
    } catch (_error) {
      // Use the status-specific fallback below when the response body is not JSON.
    }

    const fallbackMessage =
      response.status === 503
        ? 'Demo account service is unavailable.'
        : `Demo groups fetch failed: HTTP ${response.status}`;

    throw new OrrnnDemoApiError(
      response.status,
      serverMessage ? `${fallbackMessage} ${serverMessage}` : fallbackMessage,
    );
  }

  return response.json();
}

function compactDemoAccountRequest(
  data: CreateOrrnnDemoAccountRequest,
): CreateOrrnnDemoAccountRequest {
  const entries = Object.entries(data).filter(([, value]) => {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  });

  return Object.fromEntries(entries) as CreateOrrnnDemoAccountRequest;
}

async function getDemoAccountErrorMessage(response: Response): Promise<string> {
  const errorData = await response.json().catch(() => ({}));
  const code =
    errorData.code ||
    errorData.retcode ||
    errorData.error?.code ||
    errorData.detail?.code ||
    '';
  const message =
    errorData.message ||
    errorData.detail?.message ||
    errorData.detail ||
    errorData.error?.message ||
    errorData.error ||
    '';

  if (code && message) return `${code}: ${message}`;
  if (message) return String(message);
  if (code) return String(code);
  return `HTTP ${response.status}`;
}

/**
 * INTEGRATED: POST /api/v1/public/demo-account.
 *
 * Creates an unauthenticated Orrnn demo trading account for white-label
 * frontends. The server owns broker_id=orrnn, created_by_type=user, live-group
 * rejection, and default initial_balance handling, so the client only sends
 * user-entered fields plus the selected demo group/currency/leverage.
 */
export async function createOrrnnDemoAccount(
  data: CreateOrrnnDemoAccountRequest,
): Promise<OrrnnDemoAccountResponse> {
  let response: Response;

  try {
    response = await timedFetch(`${PUBLIC_API_V1_BASE_URL}/public/demo-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(compactDemoAccountRequest(data)),
    }, {
      label: 'publicDemo.createAccount',
      method: 'POST',
      endpoint: '/public/demo-account',
      source: 'register',
    });
  } catch (_error) {
    throw new OrrnnDemoApiError(
      0,
      'Network error - unable to create the demo account.',
    );
  }

  // The public demo-account contract returns 200 for success. Some server
  // errors are documented as 201 with an MT5-compatible ExceptionResult body,
  // so do not use response.ok here.
  if (response.status !== 200) {
    const serverMessage = await getDemoAccountErrorMessage(response);
    throw new OrrnnDemoApiError(
      response.status,
      `Demo account creation failed: ${serverMessage}`,
    );
  }

  const account = await response.json();
  if (typeof account?.login !== 'number') {
    throw new OrrnnDemoApiError(
      response.status,
      'Demo account creation failed: response did not include a login number.',
    );
  }

  return account;
}
