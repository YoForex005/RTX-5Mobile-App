import { apiClient } from './apiClient';

export interface PlaceOrderPayload {
  symbol: string;
  type: 'market';
  side: 'buy' | 'sell';
  quantity: number;
  price: number; // 0 for market
  account_login: number;
}

export interface PlaceOrderResponse {
  id: string;
  symbol: string;
  type: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
  created_at: string;
  mt5_order_id: number;
  mt5_deal_id: number;
}

export const ordersApi = {
  /**
   * Place a market order
   */
  placeMarketOrder: async (payload: PlaceOrderPayload): Promise<PlaceOrderResponse> => {
    const response = await apiClient('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw { response: { data: errorData } };
    }
    
    return response.json();
  },
};
