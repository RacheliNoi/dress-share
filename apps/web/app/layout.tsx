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

export const metadata: Metadata = {
  title: "DressShare",
  description: "השכרת שמלות בקלות — עיינו בקטלוג ומצאו את השמלה הבאה שלכם",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
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
