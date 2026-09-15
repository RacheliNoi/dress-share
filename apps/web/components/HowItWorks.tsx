"use client";

import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";

type Step = {
  title: string;
  body: string;
  icon: ReactNode;
};

const STEPS: Step[] = [
  {
    title: "מעיינות ובוחרות",
    body: "מסננות לפי מידה, צבע ותאריך, עד שמוצאות את השמלה שמרגישה נכונה.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    title: "שולחות התעניינות",
    body: "לחיצה אחת, והבעלים כבר יודעת שמישהי מחכה לתשובה.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 20.5s-7.6-4.6-10.2-9.2C.3 8.4 1.6 4.9 5 4a5 5 0 0 1 7 1.5A5 5 0 0 1 19 4c3.4.9 4.7 4.4 3.2 7.3C19.6 15.9 12 20.5 12 20.5Z" />
      </svg>
    ),
  },
  {
    title: "מתאמות בצ'אט",
    body: "כל הפרטים — תאריך, מידה, מסירה — נשארים כתובים במקום אחד.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: "חוגגות",
    body: "השמלה מחכה לרגע שלכן. ואחר כך היא נשארת כאן גם לפעם הבאה.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) {
      return;
    }

    // Reveals once, the first time the section scrolls into view - never
    // hides again on scroll-out, so it doesn't flicker if someone scrolls
    // back and forth past it.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-line bg-accent-soft/25">
      <div
        ref={sectionRef}
        className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20"
      >
        <div className="mx-auto max-w-xl text-center">
          <p className="text-sm font-medium text-accent">✦ איך זה עובד</p>

          <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight text-accent-deep sm:text-3xl">
            מהחיפוש ועד הרגע שהיא כבר עליכן
          </h2>

          <p className="mt-3 text-sm leading-6 text-zinc-600 sm:text-base">
            ארבעה צעדים פשוטים, בלי הודעות שהולכות לאיבוד ובלי לרדוף אחרי אף
            אחת.
          </p>
        </div>

        <div className="relative mt-12 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {/* Connecting line between steps - desktop only, purely decorative
              (the numbers themselves already carry the sequence). */}
          <div
            className="pointer-events-none absolute top-6 right-[12.5%] left-[12.5%] hidden h-px bg-line-strong lg:block"
            aria-hidden
          />

          {STEPS.map((step, index) => (
            <div
              key={step.title}
              className={`relative text-center transition-all duration-700 ease-out motion-reduce:transition-none ${
                visible
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100"
              }`}
              style={{ transitionDelay: visible ? `${index * 140}ms` : "0ms" }}
            >
              <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-accent-deep ring-1 ring-line-strong">
                <span className="[&>svg]:h-5 [&>svg]:w-5">{step.icon}</span>
                <span className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-deep text-[11px] font-bold text-white">
                  {index + 1}
                </span>
              </div>

              <h3 className="mt-4 text-sm font-bold text-zinc-900 sm:text-base">
                {step.title}
              </h3>

              <p className="mx-auto mt-1.5 max-w-[22ch] text-xs leading-5 text-zinc-500 sm:text-sm sm:leading-6">
                {step.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-zinc-500">
            יש לך שמלה שמחכה להזדמנות הבאה שלה?{" "}
            <Link
              href="/register"
              className="font-bold text-accent-deep underline underline-offset-4 hover:text-accent"
            >
              הצטרפי כמשכירה
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
