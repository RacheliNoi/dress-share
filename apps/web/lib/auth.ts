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

// Validates a `?redirect=` query value before ever handing it to router.push
// - resolves it exactly the way the browser/router actually will (via the
// same WHATWG URL parser Next's router uses internally) and only trusts the
// result if it still lands on this origin. A naive string prefix check
// (reject "//", "/\\", ...) is NOT enough here: the URL parser silently
// strips ASCII tab/newline/CR characters anywhere in the input before
// resolving it, so a value like "/\t/evil.com" passes a prefix check
// unmodified but actually resolves to https://evil.com/ once navigated to -
// a real open-redirect bypass. Resolving through URL first means whatever
// the parser does to the string, this check sees the same final result the
// navigation would. Falls back to "/" for anything invalid, cross-origin, or
// missing.
export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw || typeof window === "undefined") {
    return "/";
  }

  try {
    const resolved = new URL(raw, window.location.origin);

    if (resolved.origin !== window.location.origin) {
      return "/";
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}

// Marks that the user reached a dress detail page via an in-app link (the
// public catalog, favorites, or the owner's own "my dresses" list) in this
// tab. window.history.length is useless for this - browsers already start a
// fresh tab's history at length 2 (an initial blank document plus the first
// real page), so it's always "truthy" and can't tell a real in-app
// back-target apart from one that doesn't exist. This flag is what each of
// those dress detail pages' "back" button checks to decide whether
// router.back() is actually safe (there's a real previous in-app route in
// this tab) versus just navigating to the list page directly. Deliberately
// never cleared - once true for this tab, back() stays safe for the rest of
// the session.
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
