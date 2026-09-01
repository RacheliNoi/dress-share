"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { getToken, getUser } from "@/lib/auth";
import { ApiError, BookingMessage, getBookingMessages, sendBookingMessage } from "@/lib/api";

const POLL_INTERVAL_MS = 4000;

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Single shared implementation used on both sides of a booking - the
// renter's "הבקשות שלי" page and the owner's dress management page. Simple
// polling (not WebSockets) is intentional at this stage, per the roadmap
// prompt for this task.
export default function BookingChat({ bookingId }: { bookingId: number }) {
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const currentUserId = getUser()?.id ?? null;
  const listRef = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    const token = getToken();

    if (!token) {
      return;
    }

    try {
      const data = await getBookingMessages(token, bookingId);
      setMessages(data);
      setError("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "לא הצלחנו לטעון את השיחה.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    const body = draft.trim();

    if (!token || !body) {
      return;
    }

    setSending(true);
    setError("");

    try {
      const message = await sendBookingMessage(token, bookingId, body);
      setMessages((current) => [...current, message]);
      setDraft("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "השליחה נכשלה. נסי שוב.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-sunken/40 p-3">
      {loading ? (
        <div className="space-y-2 py-2">
          <div className="h-8 w-2/3 animate-pulse rounded-2xl bg-zinc-200" />
          <div className="mr-auto h-8 w-1/2 animate-pulse rounded-2xl bg-zinc-200" />
        </div>
      ) : (
        <div ref={listRef} className="max-h-64 space-y-2 overflow-y-auto py-1">
          {messages.length === 0 ? (
            <p className="py-3 text-center text-xs text-zinc-400">
              עדיין אין הודעות. אפשר להתחיל את השיחה.
            </p>
          ) : (
            messages.map((message) => {
              const isMine = message.senderId === currentUserId;

              return (
                <div
                  key={message.id}
                  className={`flex ${isMine ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-6 ${
                      isMine
                        ? "bg-ink text-white"
                        : "bg-white text-ink ring-1 ring-line"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    <p
                      className={`mt-1 text-[10px] ${
                        isMine ? "text-white/60" : "text-ink-faint"
                      }`}
                    >
                      {formatTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-error">{error}</p>}

      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="כתיבת הודעה..."
          aria-label="הודעה חדשה"
          className="flex-1 rounded-full border border-line-strong bg-white px-4 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-ink/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          שליחה
        </button>
      </form>
    </div>
  );
}
