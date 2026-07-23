import { normalizeSymbol } from '../../domain/symbols';

export type ModifyPositionRequest = Readonly<{
  price_sl: number;
  price_tp: number;
}>;

/**
 * Compatibility acknowledgement returned by the current gateway handler.
 *
 * This is deliberately not a full Position. A successful handler response is
 * followed by an authoritative positions-list reconciliation before the app
 * commits any SL/TP value to its shared position ledger.
 */
export type ModifyPositionAckWire = Readonly<{
  ticket: number;
  symbol: string;
  status: 'modified';
  time: number;
  sl: number | null;
  price_sl: number | null;
  tp: number | null;
  price_tp: number | null;
}>;

export type KnownModifyPositionErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'STALE_QUOTE'
  | 'RATE_LIMITED'
  | 'DATABASE_ERROR'
  | 'NO_FRESH_QUOTE'
  | 'SOURCE_MISMATCH';

export type ModifyPositionErrorWire = Readonly<{
  error: KnownModifyPositionErrorCode | (string & {});
  message: string;
  [futureField: string]: unknown;
}>;

export type ReconciliablePosition<TExistingPosition> =
  TExistingPosition & Readonly<{
    ticket: number;
    price_sl?: number | null;
    price_tp?: number | null;
  }>;

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

// The app's four-digit UTC calendar ceiling (9999-12-31T23:59:59Z) is
// generous for gateway timestamps while still rejecting millisecond epochs.
const MAX_SUPPORTED_UNIX_SECONDS = 253_402_300_799;

export class AmbiguousModifyPositionOutcomeError extends Error {
  public readonly code = 'AMBIGUOUS_MODIFY_POSITION_OUTCOME';
  public readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AmbiguousModifyPositionOutcomeError';
    this.status = status;
  }
}

export const normalizePositiveSafeIntegerPathSegment = (
  value: string | number,
  label: string,
): Readonly<{ numeric: number; path: string }> => {
  const raw = typeof value === 'number' ? String(value) : value.trim();
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new TypeError(`${label} must be a positive decimal integer.`);
  }

  const numeric = Number(raw);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new TypeError(`${label} must be a positive JavaScript-safe integer.`);
  }

  return Object.freeze({ numeric, path: String(numeric) });
};

export const normalizeModifyPositionRequest = (
  value: ModifyPositionRequest,
): ModifyPositionRequest => {
  const source = value as unknown as Record<string, unknown>;
  const priceSl = source?.price_sl;
  const priceTp = source?.price_tp;

  if (
    typeof priceSl !== 'number' ||
    !Number.isFinite(priceSl) ||
    priceSl < 0 ||
    typeof priceTp !== 'number' ||
    !Number.isFinite(priceTp) ||
    priceTp < 0
  ) {
    throw new TypeError('Modify Position requires finite non-negative price_sl and price_tp numbers.');
  }

  // Build the wire object explicitly so extra identity/concurrency fields can
  // never leak from an untyped caller.
  return Object.freeze({
    price_sl: priceSl,
    price_tp: priceTp,
  });
};

const parseEcho = (
  record: Record<string, unknown>,
  currentKey: 'sl' | 'tp',
  canonicalKey: 'price_sl' | 'price_tp',
  submitted: number,
): number | null => {
  if (!hasOwn(record, currentKey) || !hasOwn(record, canonicalKey)) {
    throw new AmbiguousModifyPositionOutcomeError(
      `Modify Position acknowledgement is missing ${currentKey}/${canonicalKey}.`,
      200,
    );
  }

  const current = record[currentKey];
  const canonical = record[canonicalKey];
  if (submitted === 0) {
    if (current !== null || canonical !== null) {
      throw new AmbiguousModifyPositionOutcomeError(
        `Modify Position clear acknowledgement has an impossible ${currentKey}/${canonicalKey} echo.`,
        200,
      );
    }
    return null;
  }

  if (
    typeof current !== 'number' ||
    !Number.isFinite(current) ||
    current <= 0 ||
    typeof canonical !== 'number' ||
    !Number.isFinite(canonical) ||
    canonical <= 0 ||
    current !== submitted ||
    canonical !== submitted ||
    current !== canonical
  ) {
    throw new AmbiguousModifyPositionOutcomeError(
      `Modify Position acknowledgement does not exactly echo ${currentKey}/${canonicalKey}.`,
      200,
    );
  }

  return current;
};

export const parseModifyPositionAck = (
  value: unknown,
  expected: Readonly<{
    ticket: string | number;
    symbol: string;
    request: ModifyPositionRequest;
  }>,
): ModifyPositionAckWire => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AmbiguousModifyPositionOutcomeError(
      'Modify Position returned a non-object acknowledgement.',
      200,
    );
  }

  const record = value as Record<string, unknown>;
  const requiredKeys = [
    'ticket',
    'symbol',
    'status',
    'time',
    'sl',
    'price_sl',
    'tp',
    'price_tp',
  ] as const;
  if (requiredKeys.some((key) => !hasOwn(record, key))) {
    throw new AmbiguousModifyPositionOutcomeError(
      'Modify Position acknowledgement is missing required fields.',
      200,
    );
  }

  const expectedTicket = normalizePositiveSafeIntegerPathSegment(expected.ticket, 'Position ticket');
  const request = normalizeModifyPositionRequest(expected.request);
  if (
    typeof record.ticket !== 'number' ||
    !Number.isSafeInteger(record.ticket) ||
    record.ticket <= 0 ||
    record.ticket !== expectedTicket.numeric
  ) {
    throw new AmbiguousModifyPositionOutcomeError(
      'Modify Position acknowledgement ticket does not match the submitted ticket.',
      200,
    );
  }

  const expectedSymbol = normalizeSymbol(expected.symbol);
  const actualSymbol = typeof record.symbol === 'string'
    ? normalizeSymbol(record.symbol)
    : '';
  if (!expectedSymbol || !actualSymbol || actualSymbol !== expectedSymbol) {
    throw new AmbiguousModifyPositionOutcomeError(
      'Modify Position acknowledgement symbol does not match the selected position.',
      200,
    );
  }
  if (record.status !== 'modified') {
    throw new AmbiguousModifyPositionOutcomeError(
      'Modify Position acknowledgement status is not modified.',
      200,
    );
  }
  if (
    typeof record.time !== 'number' ||
    !Number.isSafeInteger(record.time) ||
    record.time <= 0 ||
    record.time > MAX_SUPPORTED_UNIX_SECONDS
  ) {
    throw new AmbiguousModifyPositionOutcomeError(
      'Modify Position acknowledgement time is not a valid Unix-seconds value.',
      200,
    );
  }

  const sl = parseEcho(record, 'sl', 'price_sl', request.price_sl);
  const tp = parseEcho(record, 'tp', 'price_tp', request.price_tp);
  return Object.freeze({
    ticket: record.ticket,
    symbol: record.symbol as string,
    status: 'modified',
    time: record.time,
    sl,
    price_sl: sl,
    tp,
    price_tp: tp,
  });
};

export const parseModifyPositionError = (
  value: unknown,
): ModifyPositionErrorWire | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.error !== 'string' ||
    !record.error.trim() ||
    typeof record.message !== 'string' ||
    !record.message.trim()
  ) {
    return null;
  }
  return Object.freeze({
    ...record,
    error: record.error.trim() as ModifyPositionErrorWire['error'],
    message: record.message.trim(),
  });
};

export const normalizeReconciledProtectionValue = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  throw new AmbiguousModifyPositionOutcomeError(
    'Modify Position reconciliation returned a malformed SL/TP value.',
  );
};
