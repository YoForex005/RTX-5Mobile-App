type UnknownRecord = Record<string, unknown>;

const PROTECTION_TRIGGER_EVENTS = new Set(['sl.triggered', 'tp.triggered']);

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const normalizeEventName = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, '.');

export type NormalizedProtectionTriggeredEvent = Readonly<{
  eventName: 'sl.triggered' | 'tp.triggered';
  ticket: number;
  row: Readonly<UnknownRecord>;
  journalPayload: Readonly<{
    ticket: number;
    position_ticket?: string | number;
    account_login?: string | number;
    symbol?: string;
    price_close?: number | string;
    price?: number | string;
    reason?: string;
    type: 'sl.triggered' | 'tp.triggered';
    event: 'sl.triggered' | 'tp.triggered';
  }>;
  eventFingerprint: string;
}>;

/**
 * Normalizes the documented `{type, data: {ticket, ...}}` terminal envelope.
 * Unknown/malformed messages remain harmless hints and return null.
 */
export const normalizeProtectionTriggeredEvent = (
  data: unknown,
  inheritedEventName = '',
): NormalizedProtectionTriggeredEvent | null => {
  const envelope = asRecord(data);
  if (!envelope) {
    return null;
  }

  const eventName = (
    PROTECTION_TRIGGER_EVENTS.has(inheritedEventName)
      ? inheritedEventName
      : normalizeEventName(envelope.type ?? envelope.event ?? envelope.action)
  );
  if (!PROTECTION_TRIGGER_EVENTS.has(eventName)) {
    return null;
  }

  const details =
    asRecord(envelope.data) ??
    asRecord(envelope.payload) ??
    asRecord(envelope.result) ??
    asRecord(envelope.position) ??
    envelope;
  const rawTicket = details.ticket;
  if (
    typeof rawTicket !== 'number' ||
    !Number.isSafeInteger(rawTicket) ||
    rawTicket <= 0
  ) {
    return null;
  }

  const ticket = rawTicket;
  const canonicalEventName = eventName as 'sl.triggered' | 'tp.triggered';
  const row = Object.freeze({
    ...details,
    ticket,
    position_ticket: details.position_ticket ?? ticket,
    event: canonicalEventName,
    type: canonicalEventName,
    status: canonicalEventName,
  });
  const eventSequence =
    details.event_id ??
    details.correlation_id ??
    details.time_close ??
    details.time ??
    details.timestamp ??
    details.price_close ??
    envelope.event_id ??
    envelope.correlation_id ??
    '';

  return Object.freeze({
    eventName: canonicalEventName,
    ticket,
    row,
    journalPayload: Object.freeze({
      ticket,
      position_ticket: details.position_ticket as string | number | undefined,
      account_login: (details.account_login ?? details.login) as string | number | undefined,
      symbol: details.symbol as string | undefined,
      price_close: (details.price_close ?? details.close_price) as number | string | undefined,
      price: details.price as number | string | undefined,
      reason: details.reason as string | undefined,
      type: canonicalEventName,
      event: canonicalEventName,
    }),
    eventFingerprint: `${canonicalEventName}:${String(ticket)}:${String(eventSequence)}`,
  });
};
