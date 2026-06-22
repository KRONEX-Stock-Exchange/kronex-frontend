import { API_BASE_URL, STORAGE_KEYS } from '../../constants';

// HTTP/WS 동시 재발급 요청을 하나로 합침
let _refreshPromise: Promise<string | null> | null = null;

export const tokenManager = {
  getToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  },

  setToken(token: string): void {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  },

  clearToken(): void {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  },

  redirectToLogin(): void {
    // 이미 로그인 페이지면 리다이렉트 루프 방지
    if (window.location.pathname === '/login') return;
    sessionStorage.setItem('authMessage', '세션이 만료되었습니다. 다시 로그인해주세요.');
    window.location.href = '/login';
  },

  async refresh(): Promise<string | null> {
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = (async () => {
      // 원래 토큰이 있었던 경우에만 "세션 만료" 처리
      const wasLoggedIn = !!tokenManager.getToken();
      try {
        const response = await fetch(`${API_BASE_URL}/auth/access-token`, {
          method: 'POST',
          credentials: 'include',
        });
        const data = await response.json();
        if (data.success && data.data?.accessToken) {
          tokenManager.setToken(data.data.accessToken);
          return data.data.accessToken as string;
        }
        tokenManager.clearToken();
        if (wasLoggedIn) tokenManager.redirectToLogin();
        return null;
      } catch {
        tokenManager.clearToken();
        if (wasLoggedIn) tokenManager.redirectToLogin();
        return null;
      } finally {
        _refreshPromise = null;
      }
    })();

    return _refreshPromise;
  },
};
