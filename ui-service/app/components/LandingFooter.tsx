import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer
      className="max-w-[1200px] mx-auto px-10 py-7 flex items-center gap-5 text-xs"
      style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}
    >
      <span>© 2026 ClauseIQ</span>
      <span className="flex-1" />
      <Link href="/privacy" className="hover:opacity-80">개인정보처리방침</Link>
      <Link href="/terms" className="hover:opacity-80">이용약관</Link>
    </footer>
  );
}
