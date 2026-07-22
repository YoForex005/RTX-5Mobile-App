export type ClosePositionVolume = number | string;

export type FullClosePositionBody = Readonly<{ mode: 'full' }>;
export type PartialClosePositionBody = Readonly<{ volume: ClosePositionVolume }>;

export type PreparedClosePositionRequest = Readonly<{
  body: FullClosePositionBody | PartialClosePositionBody;
  journalPayload?: Readonly<{ volume: number }>;
}>;

export type ClosePositionRequestDescriptor = Readonly<{
  ticket: string;
  endpoint: string;
  method: 'POST';
  body: string;
  journalPayload?: Readonly<{ volume: number }>;
}>;

const FULL_CLOSE_BODY: FullClosePositionBody = Object.freeze({ mode: 'full' });
const DECIMAL_VOLUME_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Position mutations must use the broker ticket, never a generated UI row id.
 * Numeric strings are preserved so 64-bit ticket values are not rounded by JS.
 */
export const normalizeClosePositionTicket = (ticket: string | number): string => {
  if (typeof ticket === 'number') {
    if (!Number.isSafeInteger(ticket) || ticket <= 0) {
      throw new TypeError('Position close requires a positive broker ticket.');
    }
    return String(ticket);
  }

  const normalized = ticket.trim();
  if (!/^\d+$/.test(normalized) || !/[1-9]/.test(normalized)) {
    throw new TypeError('Position close requires a positive broker ticket.');
  }
  return normalized;
};

/** Builds the only valid body for a full position close. */
export const buildFullClosePositionRequestPayload = (): PreparedClosePositionRequest => ({
  body: FULL_CLOSE_BODY,
});

/**
 * Builds the strict partial-close alternative. Keeping this separate from the
 * full-close helper makes it impossible to serialize mode and volume together.
 */
export const buildPartialClosePositionRequestPayload = (
  volume: ClosePositionVolume,
): PreparedClosePositionRequest => {
  const normalizedVolume = typeof volume === 'string' ? volume.trim() : volume;
  if (
    (typeof normalizedVolume === 'string' && !DECIMAL_VOLUME_PATTERN.test(normalizedVolume)) ||
    (typeof normalizedVolume !== 'string' && typeof normalizedVolume !== 'number')
  ) {
    throw new TypeError('Partial close volume must be a positive number or decimal string.');
  }

  const numericVolume = Number(normalizedVolume);
  if (!Number.isFinite(numericVolume) || numericVolume <= 0) {
    throw new TypeError('Partial close volume must be a positive number or decimal string.');
  }

  return {
    body: Object.freeze({ volume: normalizedVolume }),
    journalPayload: Object.freeze({ volume: numericVolume }),
  };
};

/** Produces the complete RN-free request contract consumed by positionsApi. */
export const buildClosePositionRequestDescriptor = (
  ticketId: string | number,
  request: PreparedClosePositionRequest,
): ClosePositionRequestDescriptor => {
  const ticket = normalizeClosePositionTicket(ticketId);
  return Object.freeze({
    ticket,
    endpoint: `/positions/${ticket}/close`,
    method: 'POST',
    body: JSON.stringify(request.body),
    ...(request.journalPayload ? { journalPayload: request.journalPayload } : {}),
  });
};
