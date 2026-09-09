import type { Metadata } from "next";
import { Frank_Ruhl_Libre, Geist_Mono, Rubik } from "next/font/google";
import "./globals.css";
import WelcomeNotice from "@/components/WelcomeNotice";
import Footer from "@/components/Footer";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
});

const frankRuhlLibre = Frank_Ruhl_Libre({
  variable: "--font-frank-ruhl-libre",
  subsets: ["hebrew", "latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "DressShare";
const SITE_DESCRIPTION =
  "השכרת שמלות בקלות — עיינו בקטלוג ומצאו את השמלה הבאה שלכם";

export const metadata: Metadata = {
  metadataBase: new URL("https://dressshare.co.il"),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  // Without these, sharing the site link anywhere (WhatsApp, Facebook,
  // Slack...) showed the bare URL instead of a real name - these give
  // link-preview crawlers a proper Hebrew title/description to show
  // instead.
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "https://dressshare.co.il",
    siteName: SITE_NAME,
    locale: "he_IL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${rubik.variable} ${frankRuhlLibre.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <Footer />
        <WelcomeNotice />
      </body>
    </html>
  );
}
