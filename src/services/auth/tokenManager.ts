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
      const tokenAtStart = tokenManager.getToken();
      const wasLoggedIn = !!tokenAtStart;

      // 재발급이 실패하더라도, 요청이 도는 사이에 로그인 등으로 새로 발급된 토큰이면
      // 지우면 안 된다. (지우면 갓 로그인한 세션의 토큰이 날아가 소켓 인증이 실패한다)
      const failRefresh = () => {
        if (tokenManager.getToken() === tokenAtStart) {
          tokenManager.clearToken();
          if (wasLoggedIn) tokenManager.redirectToLogin();
        }
        return null;
      };

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
        return failRefresh();
      } catch {
        return failRefresh();
      } finally {
        _refreshPromise = null;
      }
    })();

    return _refreshPromise;
  },
};
