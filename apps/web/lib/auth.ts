import type { AuthUser } from "./api";

const TOKEN_KEY = "dressshare_token";
const USER_KEY = "dressshare_user";
const DRESS_LIST_VISITED_KEY = "dressshare_came_from_dress_list";

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

// Marks that the user reached a dress detail page via an in-app link
// (catalog or favorites) in this tab. window.history.length is useless for
// this - browsers already start a fresh tab's history at length 2 (an
// initial blank document plus the first real page), so it's always
// "truthy" and can't tell a real in-app back-target apart from one that
// doesn't exist. This flag is what the dress page's "back to catalog"
// button checks to decide whether router.back() is actually safe (there's
// a real previous in-app route in this tab) versus just navigating to "/"
// directly. Deliberately never cleared - once true for this tab, back()
// stays safe for the rest of the session.
export function markCameFromDressList(): void {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(DRESS_LIST_VISITED_KEY, "1");
}

export function cameFromDressList(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return sessionStorage.getItem(DRESS_LIST_VISITED_KEY) === "1";
}
