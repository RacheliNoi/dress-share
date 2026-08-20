"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, logout } from "@/lib/auth";
import { API_URL } from "@/lib/api";
import Header from "@/components/Header";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import FormMessage from "@/components/ui/FormMessage";

type ClothingItem = {
  id: number;
  name: string;
  category: string;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
};

export default function WardrobePage() {
  const router = useRouter();

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [image, setImage] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  async function loadItems() {
    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setError("");

      const response = await fetch(`${API_URL}/clothing-items`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        logout();
        router.push("/login");
        return;
      }

      if (!response.ok) {
        throw new Error("לא הצלחנו לטעון את הארון");
      }

      const data = await response.json();
      setItems(data);
    } catch {
      setError("שגיאה בטעינת הארון");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }

    setCheckingAuth(false);
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checkingAuth) {
    return null;
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setImage(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const formData = new FormData();

      formData.append("name", name);
      formData.append("category", category);
      formData.append("size", size);
      formData.append("color", color);

      if (image) {
        formData.append("image", image);
      }

      const response = await fetch(`${API_URL}/clothing-items`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.status === 401 || response.status === 403) {
        logout();
        router.push("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "שגיאה בהוספת הפריט");
      }

      setItems((currentItems) => [data, ...currentItems]);

      setName("");
      setCategory("");
      setSize("");
      setColor("");
      setImage(null);

      const fileInput = document.getElementById(
        "clothing-image",
      ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "שגיאה בהוספת הפריט",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setError("");

      const response = await fetch(`${API_URL}/clothing-items/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        logout();
        router.push("/login");
        return;
      }

      if (!response.ok) {
        throw new Error("שגיאה במחיקת הפריט");
      }

      setItems((currentItems) =>
        currentItems.filter((item) => item.id !== id),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "שגיאה במחיקת הפריט",
      );
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-paper text-ink">
      <Header />

      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <header className="mb-8">
          <h1 className="font-display text-3xl font-semibold text-ink">
            הארון שלי
          </h1>

          <p className="mt-2 text-sm text-ink-soft">
            כל הפריטים שלך במקום אחד
          </p>
        </header>

        <section className="rounded-[20px] bg-surface p-6 shadow-sm ring-1 ring-line">
          <h2 className="text-lg font-bold text-ink">הוספת פריט</h2>

          <form
            onSubmit={handleSubmit}
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            <TextField
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="שם הפריט"
              required
            />

            <TextField
              type="text"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="קטגוריה"
              required
            />

            <TextField
              type="text"
              value={size}
              onChange={(event) => setSize(event.target.value)}
              placeholder="מידה"
            />

            <TextField
              type="text"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              placeholder="צבע"
            />

            <div className="md:col-span-2">
              <label
                htmlFor="clothing-image"
                className="block text-sm font-medium text-ink-soft"
              >
                תמונה
              </label>

              <input
                id="clothing-image"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="mt-2 block w-full rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-sm text-ink-soft"
              />

              {image && (
                <p className="mt-2 text-sm text-ink-faint">
                  נבחר: {image.name}
                </p>
              )}
            </div>

            <Button type="submit" disabled={saving} className="md:col-span-2">
              {saving ? "שומר..." : "+ הוספת פריט"}
            </Button>
          </form>
        </section>

        {error && (
          <div className="mt-6">
            <FormMessage variant="error">{error}</FormMessage>
          </div>
        )}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-ink">הפריטים שלי</h2>

            <span className="rounded-full bg-surface-sunken px-3 py-1 text-sm text-ink-soft">
              {items.length} פריטים
            </span>
          </div>

          {loading ? (
            <div className="rounded-[20px] bg-surface p-8 text-center text-ink-faint ring-1 ring-line">
              טוען את הארון...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-[20px] bg-surface p-8 text-center text-ink-faint ring-1 ring-line">
              עדיין אין פריטים בארון.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-[20px] bg-surface shadow-sm ring-1 ring-line"
                >
                  {item.imageUrl ? (
                    <img
                      src={`${API_URL}${item.imageUrl}`}
                      alt={item.name}
                      className="h-64 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center bg-surface-sunken text-5xl">
                      👕
                    </div>
                  )}

                  <div className="p-6">
                    <h3 className="text-lg font-bold text-ink">
                      {item.name}
                    </h3>

                    <p className="mt-1 text-sm text-ink-faint">
                      {item.category}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                      {item.size && (
                        <span className="rounded-full bg-surface-sunken px-3 py-1 text-ink-soft">
                          מידה {item.size}
                        </span>
                      )}

                      {item.color && (
                        <span className="rounded-full bg-surface-sunken px-3 py-1 text-ink-soft">
                          {item.color}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="mt-4 w-full rounded-2xl border border-error-soft px-4 py-2 text-sm font-medium text-error transition hover:bg-error-soft"
                    >
                      🗑️ מחיקת פריט
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
