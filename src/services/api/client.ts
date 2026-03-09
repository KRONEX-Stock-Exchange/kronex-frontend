import { API_BASE_URL } from '../../constants';
import type { ApiResponse } from '../../types';
import { tokenManager } from '../auth/tokenManager';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const makeRequest = (token: string | null) =>
      fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });

    let response = await makeRequest(tokenManager.getToken());

    // 401 → 토큰 재발급 → 원래 요청 재시도
    if (response.status === 401) {
      const newToken = await tokenManager.refresh();
      if (newToken) {
        response = await makeRequest(newToken);
      }
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', endpoint);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', endpoint, body);
  }

  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', endpoint, body);
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', endpoint);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
