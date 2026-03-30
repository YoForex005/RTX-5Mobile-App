/**
 * Financial Transactions API (V2)
 * 
 * Fetches non-trading balance operations like Deposits, Withdrawals,
 * and internal transfers using pagination.
 */

import { apiClient } from './apiClient';

/** Single transaction from GET /api/account/transactions */
export interface Transaction {
  id: string;
  type: string;           // 'deposit' | 'withdrawal' | 'trade' | 'fee' | etc.
  amount: number;
  currency: string;
  description: string;
  created_at: string;     // ISO 8601 timestamp
  status?: string;
  symbol?: string;
  side?: string;
  volume?: number;
  open_price?: number;
  close_price?: number;
  profit?: number;
  commission?: number;
  swap?: number;
}

/** API response shape */
export interface TransactionsResponse {
  count: number;
  message?: string;
  transactions: Transaction[];
}

/**
 * Fetches the account transaction history.
 * Uses JWT auth.
 *
 * GET /api/account/transactions?type=&limit=50
 *
 * @param type  - Optional filter by transaction type
 * @param limit - Maximum number of transactions (default 50)
 */
export async function getTransactions(
  type?: string,
  limit: number = 50,
): Promise<TransactionsResponse> {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  params.set('limit', String(limit));

  const response = await apiClient(`/api/account/transactions?${params.toString()}`);

  if (!response.ok) {
    let errorMsg = 'Failed to fetch transactions';
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch (e) {
      // Ignored
    }
    throw new Error(`API Error ${response.status}: ${errorMsg}`);
  }

  return response.json();
}
