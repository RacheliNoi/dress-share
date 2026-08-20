import type { AuthUser } from "./api";

const TOKEN_KEY = "dressshare_token";
const USER_KEY = "dressshare_user";
const WELCOME_NOTICE_KEY = "dressshare_pending_welcome_notice";

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(USER_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeUser(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(USER_KEY);
}

export function logout(): void {
  removeToken();
  removeUser();
}

// Marks that a post-login/register info notice should be shown once, the
// next time the app checks for it - deliberately sessionStorage (not
// localStorage): it should reappear on every fresh login, but never
// resurface just from a page refresh within an already-handled session.
export function markWelcomeNoticePending(): void {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(WELCOME_NOTICE_KEY, "1");
}

// Read-and-clear in one step, so the notice can only ever be consumed once
// per login - a second check (e.g. React StrictMode's double effect
// invocation in dev) finds nothing and does nothing.
export function consumeWelcomeNoticePending(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const pending = sessionStorage.getItem(WELCOME_NOTICE_KEY);

  if (!pending) {
    return false;
  }

  sessionStorage.removeItem(WELCOME_NOTICE_KEY);
  return true;
}
