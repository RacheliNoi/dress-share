export default function Footer() {
  return (
    <footer dir="rtl" className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-ink-faint sm:flex-row sm:px-8">
        <span>
          Dress<span className="text-accent">Share</span> · השכרת שמלות בקלות
        </span>
        <span>© {new Date().getFullYear()} DressShare</span>
      </div>
    </footer>
  );
}
