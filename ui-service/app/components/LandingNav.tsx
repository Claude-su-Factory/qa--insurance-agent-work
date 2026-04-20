import Link from "next/link";

function ShieldLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="15" height="15" aria-hidden="true">
      <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export default function LandingNav() {
  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-10 h-16 mx-auto flex items-center gap-8 px-10 max-w-[1200px]"
      style={{
        background: "color-mix(in srgb, var(--bg-alt) 85%, transparent)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <Link href="/" className="flex items-center gap-2.5 font-bold text-[15px] tracking-tight">
        <span
          className="w-[26px] h-[26px] rounded-md grid place-items-center"
          style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
        >
          <ShieldLogo />
        </span>
        <span>ClauseIQ</span>
      </Link>
      <div className="flex gap-6 text-[13px] font-medium" style={{ color: "var(--fg-2)" }}>
        <a href="#features" className="hover:opacity-80">기능</a>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/login"
          className="text-[13px] font-medium px-3 py-1.5 rounded-md"
          style={{ color: "var(--fg-2)" }}
        >
          로그인
        </Link>
        <Link
          href="/login"
          className="text-[13px] font-semibold px-3.5 py-2 rounded-md"
          style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
        >
          무료 시작 →
        </Link>
      </div>
    </nav>
  );
}
