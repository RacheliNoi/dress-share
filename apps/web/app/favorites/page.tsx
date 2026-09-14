"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, getUser, logout } from "@/lib/auth";
import {
  ApiError,
  Dress,
  getFavoriteDresses,
  unfavoriteDress,
} from "@/lib/api";
import Header from "@/components/Header";
import DressCard from "@/components/DressCard";

// Module-scope (not state) so it survives this page unmounting when the
// user clicks into a dress, and is still there when they navigate back via
// router.back() - see the identical, more-detailed comment on
// catalogResultCache in app/page.tsx for why this is what makes scroll
// restoration actually work (no loading-skeleton flash on return). Keyed by
// user id so switching accounts in the same tab never shows a stale list.
let favoritesCache: { userId: number; dresses: Dress[] } | null = null;

// Starts false on every real page load (server-rendered HTML always has
// this false too, since it's a fresh module instance per request) and
// flips true once this component has mounted for the first time. Lets the
// checkingAuth initializer below skip straight past its gate on a later
// client-side-only remount (e.g. router.back() from a dress page) without
// ever disagreeing with what was server-rendered on the real first load -
// see checkingAuth's declaration for why that distinction matters.
let hasMountedBefore = false;

export default function FavoritesPage() {
  const router = useRouter();

  const currentUserId = getUser()?.id;
  const cached =
    currentUserId !== undefined && favoritesCache?.userId === currentUserId
      ? favoritesCache
      : null;

  const [dresses, setDresses] = useState<Dress[]>(() => cached?.dresses ?? []);
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState("");
  // getToken() is a synchronous localStorage read, not real async work -
  // when it already confirms a token at mount time, there's nothing to
  // "check" and this skips straight past the gate below. Without this, the
  // page always rendered null for at least one tick (this state starting
  // true, only flipped by the mount effect after first paint) even when
  // already known-authenticated - on a return visit via router.back(),
  // that blank first paint was enough to occasionally cut the browser's
  // scroll restoration short, the same failure mode the caching above
  // fixes for the loading skeleton.
  //
  // Only takes that shortcut once hasMountedBefore is true, i.e. this is a
  // later client-side remount, not the real first load - on the real first
  // load, getToken() would read `null` during server rendering (no
  // localStorage there) but a real token during client hydration, and
  // starting from two different values would be a hydration mismatch.
  const [checkingAuth, setCheckingAuth] = useState(() =>
    hasMountedBefore ? !getToken() : true,
  );

  async function loadFavorites() {
    const token = getToken();
    const userId = getUser()?.id;

    if (!token || userId === undefined) {
      router.push("/login");
      return;
    }

    const hasCache = favoritesCache?.userId === userId;

    // A cache hit (returning here via router.back()) renders instantly at
    // the right height instead of the loading skeleton, then this still
    // silently revalidates in the background rather than blocking on it.
    if (hasCache) {
      setDresses(favoritesCache!.dresses);
      setError("");
    } else {
      setLoading(true);
      setError("");
    }

    try {
      const data = await getFavoriteDresses(token);
      setDresses(data);
      favoritesCache = { userId, dresses: data };
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        logout();
        router.push("/login");
        return;
      }

      if (!hasCache) {
        setError("לא הצלחנו לטעון את המועדפים שלך. נסי שוב.");
      }
    } finally {
      if (!hasCache) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    hasMountedBefore = true;

    if (!getToken()) {
      router.push("/login");
      return;
    }

    setCheckingAuth(false);
    loadFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unfavoriting here removes the card immediately - there's no reason to
  // keep it in a list titled "favorites" once it's no longer one.
  function handleRemove(dress: Dress) {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setDresses((current) => current.filter((item) => item.id !== dress.id));
    if (favoritesCache) {
      favoritesCache = {
        ...favoritesCache,
        dresses: favoritesCache.dresses.filter((item) => item.id !== dress.id),
      };
    }

    unfavoriteDress(token, dress.id).catch(() => {
      loadFavorites();
    });
  }

  if (checkingAuth) {
    return null;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
        <section className="mb-6 sm:mb-8">
          <p className="text-sm font-medium text-accent">✦ המועדפים שלי</p>

          <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-accent-deep sm:text-4xl">
            השמלות ששמרת
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            כל שמלה שסימנת בלב, במקום אחד.
          </p>
        </section>

        {error && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-error-soft bg-error-soft px-5 py-4 text-sm text-error">
            <span>{error}</span>

            <button
              type="button"
              onClick={loadFavorites}
              className="font-bold underline underline-offset-4"
            >
              נסי שוב
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="animate-pulse overflow-hidden rounded-[20px] bg-white ring-1 ring-line"
              >
                <div className="aspect-[3/4] w-full bg-zinc-100" />
                <div className="space-y-2 p-4 sm:p-5">
                  <div className="h-4 w-2/3 rounded bg-zinc-100" />
                  <div className="h-3 w-1/2 rounded bg-zinc-100" />
                </div>
              </div>
            ))}
          </div>
        ) : dresses.length === 0 ? (
          <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-20 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-4xl">
              🤍
            </div>

            <h3 className="mt-6 text-2xl font-black text-zinc-900">
              עדיין אין לך מועדפים
            </h3>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
              לחצי על הלב בכרטיס של כל שמלה שאהבת בקטלוג, וכאן תוכלי למצוא
              אותה שוב בקלות.
            </p>

            <Link
              href="/"
              className="mt-7 inline-flex rounded-full bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700"
            >
              מעבר לקטלוג
            </Link>
          </section>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {dresses.map((dress) => (
              <DressCard
                key={dress.id}
                dress={dress}
                isFavorited
                onToggleFavorite={handleRemove}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
