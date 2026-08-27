export type AuthUser = {
  id: number;
  nickname: string;
};

export type Auth = {
  token: string;
  user: AuthUser;
};

const STORAGE_KEY = "auth";

export function saveAuth(auth: Auth): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function getAuth(): Auth | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Auth;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
