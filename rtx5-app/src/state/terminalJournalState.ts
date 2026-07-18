import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { resolveTradingLogin } from './tradingLogin';
import { sanitizeTerminalJournalMessage } from './terminalJournalSecurity';

export type TerminalJournalSource = 'Trades' | 'Accounts' | 'Actions' | 'Terminal' | 'Network' | 'Notes';
export type TerminalJournalLevel = 'info' | 'success' | 'error';

export type TerminalJournalEntry = {
  id: string;
  createdAt: string;
  source: TerminalJournalSource;
  level: TerminalJournalLevel;
  message: string;
  accountLogin?: string;
};

type TerminalJournalEntryInput = Omit<TerminalJournalEntry, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};

type MarketOrderJournalPayload = {
  account_login?: string | number;
  symbol?: string;
  side?: string;
  volume?: number;
  price_sl?: number | null;
  price_tp?: number | null;
};

type MarketOrderJournalResponse = {
  account_login?: string | number;
  symbol?: string;
  side?: string;
  volume?: number;
  price?: number;
  price_open?: number;
  price_current?: number;
  ticket?: string | number;
  order_ticket?: string | number;
  position_ticket?: string | number;
  message?: string;
  status?: string;
};

type PositionModifyJournalPayload = {
  price_sl?: number | null;
  price_tp?: number | null;
  trailing_stop?: number | null;
  trailing_step?: number | null;
};

type PositionJournalResponse = {
  account_login?: string | number;
  symbol?: string;
  side?: string;
  volume?: number;
  volume_closed?: number;
  volume_total?: number;
  price?: number;
  price_open?: number;
  price_close?: number;
  price_current?: number;
  price_sl?: number | null;
  price_tp?: number | null;
  ticket?: string | number;
  order_ticket?: string | number;
  position_ticket?: string | number;
  message?: string;
  status?: string;
};

type TerminalJournalState = {
  entries: TerminalJournalEntry[];
  addEntry: (entry: TerminalJournalEntryInput) => void;
  clearEntries: () => void;
  pruneExpiredEntries: (nowMs?: number) => void;
};

const TERMINAL_JOURNAL_MAX_ENTRIES = 500;
const TERMINAL_JOURNAL_RETENTION_DAYS = 90;
let journalEntrySequence = 0;

function createEntryId(source: TerminalJournalSource): string {
  journalEntrySequence = (journalEntrySequence + 1) % 100000;
  return `terminal-${source.toLowerCase()}-${Date.now()}-${journalEntrySequence}`;
}

function parseEntryTimeMs(entry: Pick<TerminalJournalEntry, 'createdAt'>): number {
  const time = Date.parse(entry.createdAt);
  return Number.isFinite(time) ? time : 0;
}

function getLocalDayStartMs(nowMs: number): number {
  const date = new Date(nowMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getRetentionStartMs(nowMs: number): number {
  const date = new Date(getLocalDayStartMs(nowMs));
  date.setDate(date.getDate() - (TERMINAL_JOURNAL_RETENTION_DAYS - 1));
  return date.getTime();
}

function retainRecentEntries(entries: TerminalJournalEntry[], nowMs = Date.now()) {
  const retentionStartMs = getRetentionStartMs(nowMs);
  return entries
    .filter((entry) => parseEntryTimeMs(entry) >= retentionStartMs)
    .slice(0, TERMINAL_JOURNAL_MAX_ENTRIES);
}

function normalizeAccountLogin(value?: string | number): string | undefined {
  const explicit = value === undefined ? undefined : String(value).trim();
  if (explicit) {
    return explicit;
  }

  const resolved = resolveTradingLogin();
  return resolved === undefined ? undefined : String(resolved);
}

function normalizeSymbol(value: unknown): string | undefined {
  const symbol = typeof value === 'string' ? value.trim() : '';
  return symbol || undefined;
}

function normalizeSide(value: unknown): 'buy' | 'sell' {
  return String(value ?? '').toLowerCase() === 'sell' ? 'sell' : 'buy';
}

function formatLoginPrefix(login?: string): string {
  return login ? `'${login}': ` : '';
}

function formatVolume(value: unknown): string | null {
  const volume = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(volume) || volume <= 0) {
    return null;
  }

  return Number(volume.toFixed(2)).toFixed(2);
}

function formatRequiredVolume(value: unknown): string {
  return formatVolume(value) ?? 'unknown volume';
}

function formatPrice(value: unknown, symbol?: string): string | null {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const upper = symbol?.toUpperCase() ?? '';
  const decimals = upper.includes('JPY') ? 3 : upper.includes('XAU') || Math.abs(numeric) >= 100 ? 2 : 5;
  return numeric.toFixed(decimals);
}

function formatStops(payload: MarketOrderJournalPayload): string {
  const symbol = normalizeSymbol(payload.symbol);
  const parts: string[] = [];
  const sl = formatPrice(payload.price_sl, symbol);
  const tp = formatPrice(payload.price_tp, symbol);
  if (sl) parts.push(`sl: ${sl}`);
  if (tp) parts.push(`tp: ${tp}`);
  return parts.length > 0 ? `, ${parts.join(', ')}` : '';
}

function buildMarketOrderText(payload: MarketOrderJournalPayload): string {
  const side = normalizeSide(payload.side).toUpperCase();
  const symbol = normalizeSymbol(payload.symbol);
  const symbolText = symbol ? ` ${symbol}` : '';
  return `market ${side} ${formatRequiredVolume(payload.volume)}${symbolText}${formatStops(payload)}`;
}

function getOrderTicket(response?: MarketOrderJournalResponse | PositionJournalResponse): string | undefined {
  const ticket = response?.order_ticket ?? response?.ticket ?? response?.position_ticket;
  return ticket === undefined || ticket === null ? undefined : String(ticket);
}

function getErrorMessage(error: unknown): string {
  const source = error as {
    message?: unknown;
    response?: { data?: { message?: unknown; error?: unknown } };
    data?: { message?: unknown; error?: unknown };
  };
  const message =
    source?.response?.data?.message ??
    source?.response?.data?.error ??
    source?.data?.message ??
    source?.data?.error ??
    source?.message;
  return typeof message === 'string' && message.trim() ? message.trim() : 'request failed';
}

export const useTerminalJournalState = create<TerminalJournalState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => {
          const createdAt = entry.createdAt ?? new Date().toISOString();
          const next: TerminalJournalEntry = {
            id: entry.id ?? createEntryId(entry.source),
            createdAt,
            source: entry.source,
            level: entry.level,
            // The terminal journal is persisted in AsyncStorage. Treat every
            // caller message as untrusted backend text and strip credentials
            // and URL query values before it can reach disk/support exports.
            message: sanitizeTerminalJournalMessage(entry.message),
            accountLogin: entry.accountLogin,
          };
          return {
            entries: retainRecentEntries([next, ...state.entries]),
          };
        }),
      clearEntries: () => set({ entries: [] }),
      pruneExpiredEntries: (nowMs = Date.now()) =>
        set((state) => ({ entries: retainRecentEntries(state.entries, nowMs) })),
    }),
    {
      name: 'terminalJournalEntries',
      storage: createJSONStorage(() => ({
        getItem: async (name) => {
          try {
            const value = await AsyncStorage.getItem(name);
            if (value == null) return null;
            JSON.parse(value);
            return value;
          } catch (error) {
            console.warn('[Journal] Ignoring unreadable terminal journal', error);
            void AsyncStorage.removeItem(name).catch(() => {});
            return null;
          }
        },
        setItem: (name, value) => AsyncStorage.setItem(name, value),
        removeItem: (name) => AsyncStorage.removeItem(name),
      })),
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);

export function addTerminalJournalEntry(entry: TerminalJournalEntryInput): void {
  useTerminalJournalState.getState().addEntry(entry);
}

export function recordAppActionJournalEvent({
  message,
  source = 'Actions',
  level = 'info',
  accountLogin,
}: {
  message: string;
  source?: TerminalJournalSource;
  level?: TerminalJournalLevel;
  accountLogin?: string | number;
}): void {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return;
  }

  const login = normalizeAccountLogin(accountLogin);
  addTerminalJournalEntry({
    source,
    level,
    accountLogin: login,
    message: `${formatLoginPrefix(login)}${trimmedMessage}`,
  });
}

export function recordAccountJournalEvent(
  message: string,
  options?: {
    level?: TerminalJournalLevel;
    accountLogin?: string | number;
  },
): void {
  recordAppActionJournalEvent({
    source: 'Accounts',
    level: options?.level ?? 'info',
    accountLogin: options?.accountLogin,
    message,
  });
}

export function recordMarketOrderJournalRequest(payload: MarketOrderJournalPayload): void {
  const login = normalizeAccountLogin(payload.account_login);
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'info',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}${buildMarketOrderText(payload)}`,
  });
}

export function recordMarketOrderJournalSuccess(
  payload: MarketOrderJournalPayload,
  response?: MarketOrderJournalResponse,
): void {
  const login = normalizeAccountLogin(response?.account_login ?? payload.account_login);
  const symbol = normalizeSymbol(response?.symbol ?? payload.symbol);
  const side = normalizeSide(response?.side ?? payload.side);
  const responseVolume = response?.volume ?? payload.volume;
  const requestText = buildMarketOrderText({ ...payload, symbol, side, volume: responseVolume });
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'success',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}accepted ${requestText}`,
  });

  const ticket = getOrderTicket(response);
  const price = formatPrice(response?.price ?? response?.price_open ?? response?.price_current, symbol);
  const symbolText = symbol ? ` ${symbol}` : '';
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'success',
    accountLogin: login,
    message: ticket && price
      ? `${formatLoginPrefix(login)}order #${ticket} ${side.toUpperCase()} ${formatRequiredVolume(responseVolume)} / ${formatRequiredVolume(payload.volume)}${symbolText} at ${price} done`
      : `${formatLoginPrefix(login)}${requestText} done`,
  });
}

export function recordMarketOrderJournalFailure(
  payload: MarketOrderJournalPayload,
  error: unknown,
): void {
  const login = normalizeAccountLogin(payload.account_login);
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'error',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}${buildMarketOrderText(payload)} failed: ${getErrorMessage(error)}`,
  });
}

export function recordClosePositionJournalRequest(
  ticketId: string | number,
  options?: { ticketBy?: string | number; volume?: number },
): void {
  const login = normalizeAccountLogin();
  const extra = options?.ticketBy
    ? ` by #${options.ticketBy}`
    : options?.volume
      ? ` volume ${formatRequiredVolume(options.volume)}`
      : '';
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'info',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}close position #${ticketId}${extra}`,
  });
}

export function recordClosePositionJournalSuccess(
  ticketId: string | number,
  response?: PositionJournalResponse,
): void {
  const login = normalizeAccountLogin(response?.account_login);
  const symbol = normalizeSymbol(response?.symbol);
  const ticket = getOrderTicket(response) ?? String(ticketId);
  const closePrice = formatPrice(response?.price_close ?? response?.price ?? response?.price_current, symbol);
  const volume = response?.volume_closed ?? response?.volume ?? response?.volume_total;
  const formattedVolume = formatVolume(volume);
  const volumeText = formattedVolume ? ` ${formattedVolume}` : '';
  const symbolText = symbol ? ` ${symbol}` : '';
  const priceText = closePrice ? ` at ${closePrice}` : '';
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'success',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}position #${ticket}${volumeText}${symbolText} closed${priceText}`,
  });
}

export function recordClosePositionJournalFailure(
  ticketId: string | number,
  error: unknown,
): void {
  const login = normalizeAccountLogin();
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'error',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}close position #${ticketId} failed: ${getErrorMessage(error)}`,
  });
}

export function recordModifyPositionJournalRequest(
  ticketId: string | number,
  payload: PositionModifyJournalPayload,
): void {
  const login = normalizeAccountLogin();
  const parts: string[] = [];
  const sl = formatPrice(payload.price_sl);
  const tp = formatPrice(payload.price_tp);
  if (sl) parts.push(`sl: ${sl}`);
  if (tp) parts.push(`tp: ${tp}`);
  if (typeof payload.trailing_stop === 'number' && payload.trailing_stop > 0) {
    parts.push(`trailing stop: ${payload.trailing_stop}`);
  }
  const details = parts.length > 0 ? parts.join(', ') : 'remove sl/tp';
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'info',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}modify position #${ticketId}, ${details}`,
  });
}

export function recordModifyPositionJournalSuccess(
  ticketId: string | number,
  payload: PositionModifyJournalPayload,
  response?: PositionJournalResponse,
): void {
  const login = normalizeAccountLogin(response?.account_login);
  const symbol = normalizeSymbol(response?.symbol);
  const ticket = getOrderTicket(response) ?? String(ticketId);
  const sl = formatPrice(response?.price_sl ?? payload.price_sl, symbol);
  const tp = formatPrice(response?.price_tp ?? payload.price_tp, symbol);
  const symbolText = symbol ? ` ${symbol}` : '';
  const parts: string[] = [];
  if (sl) parts.push(`sl: ${sl}`);
  if (tp) parts.push(`tp: ${tp}`);
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'success',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}position #${ticket}${symbolText} modified${parts.length ? `, ${parts.join(', ')}` : ''}`,
  });
}

export function recordModifyPositionJournalFailure(
  ticketId: string | number,
  payload: PositionModifyJournalPayload,
  error: unknown,
): void {
  const login = normalizeAccountLogin();
  const request = payload.price_sl || payload.price_tp ? 'modify' : 'remove sl/tp from';
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'error',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}${request} position #${ticketId} failed: ${getErrorMessage(error)}`,
  });
}
