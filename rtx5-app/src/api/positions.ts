import { apiClient } from './apiClient';

export interface ClosePositionResponse {
  message?: string;
  // Based on the curl response, it might be minimal:
  // Code 200: Position closed with realized P&L
}

export const positionsApi = {
  /**
   * Close an open position by ID
   * @param id The position ID to close
   */
  closePosition: async (id: string): Promise<ClosePositionResponse> => {
    const response = await apiClient(`/api/positions/${id}/close`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw { response: { data: errorData } };
    }

    return response.json().catch(() => ({})); // Sometimes 200 responses are empty or simple text
  },
};
