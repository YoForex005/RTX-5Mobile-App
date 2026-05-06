/**
 * Types for the Trading Positions & History API (V2).
 */

/**
 * Raw position object returned by GET /api/v2/positions/{login}.
 * Represents a single open position on the trading account.
 */
export interface Position {
  ticket: number;
  account_login: number;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  price_open: number;
  price_current: number;
  price_sl?: number;
  price_tp?: number;
  profit: number;
  swap: number;
  commission?: number;
  comment?: string;
  time_create: number;
  time_update: number;
  trailing_stop?: number;
  trailing_step?: number;
  magic?: number;
}

/**
 * Raw closed-position object returned by GET /api/v2/positions/{login}/history.
 * Contains the same fields as an open position plus close-specific metadata.
 */
export interface ClosedPosition {
  ticket: number;
  account_login: number;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  price_open: number;
  price_close?: number;
  price_current?: number;
  price_sl?: number;
  price_tp?: number;
  profit: number;
  swap: number;
  commission?: number;
  comment?: string;
  time_create: number;
  time_update: number;
  time_close?: number;
  trailing_stop?: number;
  trailing_step?: number;
  magic?: number;
}

/**
 * Response payload from POST /api/v2/positions/{id}/close.
 * The server returns the resulting deal record for the closed position.
 * The position is closed using its **ticket ID** (not account login).
 */
export interface ClosePositionResponse {
  partial?: boolean;
  price_close?: number;
  price_open?: number;
  profit?: number;
  side?: string;
  status?: string;
  swap?: number;
  symbol?: string;
  ticket?: number;
  time?: number;
  volume_closed?: number;
  volume_total?: number;

  // Alternate documented properties
  order_ticket?: number;
  position_ticket?: number;
  account_login?: number;
  action?: string;
  entry?: string;
  volume?: number;
  price?: number;
  commission?: number;
  fee?: number;
  magic?: number;
  comment?: string;
}

/**
 * Payload for PUT /api/v2/positions/{id} to modify SL/TP on an open position.
 */
export interface ModifyPositionPayload {
  price_sl: number;
  price_tp: number;
  trailing_stop?: number;
  trailing_step?: number;
}

export type JsonRecord = Record<string, unknown>;
