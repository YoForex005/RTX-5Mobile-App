export type ClosePositionTicketBy =
  | string
  | number
  | { ticketBy?: string | number; volume?: number };

type ClosePositionDetails = {
  ticket_by?: number;
  volume?: number;
};

/** Builds the server-required full-close body while preserving Close By details. */
export const buildClosePositionRequestPayload = (
  ticketBy?: ClosePositionTicketBy,
): Readonly<{
  body: { mode: 'full'; ticket_by?: number; volume?: number };
  journalPayload: { ticketBy?: number; volume?: number } | undefined;
}> => {
  const closeDetails: ClosePositionDetails =
    ticketBy && typeof ticketBy === 'object'
      ? {
          ...(ticketBy.ticketBy !== undefined ? { ticket_by: Number(ticketBy.ticketBy) } : {}),
          ...(typeof ticketBy.volume === 'number' && ticketBy.volume > 0 ? { volume: ticketBy.volume } : {}),
        }
      : ticketBy
        ? { ticket_by: Number(ticketBy) }
        : {};

  return {
    body: { mode: 'full', ...closeDetails },
    journalPayload: Object.keys(closeDetails).length > 0
      ? { ticketBy: closeDetails.ticket_by, volume: closeDetails.volume }
      : undefined,
  };
};
