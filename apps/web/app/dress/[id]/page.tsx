import type { Metadata } from "next";
import { getApprovedDressById, getDressImageUrl } from "@/lib/api";
import DressDetailClient from "./DressDetailClient";

type Props = {
  params: Promise<{ id: string }>;
};

// A real Server Component (not "use client") purely so this can run before
// the page is sent to the browser - link-preview crawlers (WhatsApp,
// Facebook, iMessage...) never execute the client-side fetch the actual
// page content uses, so without this every shared dress link showed the
// site's generic brand image/description instead of that dress's own
// photo and name. The page content itself stays exactly as client-rendered
// as before, in DressDetailClient.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    return {};
  }

  const dress = await getApprovedDressById(numericId).catch(() => null);

  if (!dress) {
    return {};
  }

  const title = dress.name;
  const description = [dress.category, dress.city]
    .filter(Boolean)
    .join(" · ") || "השכרת שמלות בקלות ב-DressShare";

  const photo = [...dress.photos].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  const imageUrl = photo ? getDressImageUrl(photo) : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function DressDetailPage({ params }: Props) {
  const { id } = await params;
  return <DressDetailClient id={id} />;
}
