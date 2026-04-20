import LeftPanel from "../components/LeftPanel";
import ChatPanel from "../components/ChatPanel";
import CitationPanel from "../components/CitationPanel";
import LogoutButton from "../components/LogoutButton";
import { createClient } from "../lib/supabase/server";

function ShieldLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="13" height="13" aria-hidden="true">
      <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const initial = (user?.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <main className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      <header
        className="h-[52px] flex items-center gap-3.5 px-5 flex-shrink-0"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2.5 font-bold text-[14px] tracking-tight">
          <span
            className="w-6 h-6 rounded-[5px] grid place-items-center"
            style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
          >
            <ShieldLogo />
          </span>
          ClauseIQ
        </div>
        <span className="text-xs" style={{ color: "var(--border-2)" }}>/</span>
        <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
          <b style={{ color: "var(--fg)", fontWeight: 600 }}>대시보드</b>
        </span>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            color: "var(--fg-2)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--good)" }} aria-hidden="true" />
          Agent 정상
        </span>
        <div className="ml-auto flex items-center gap-3">
          {user && (
            <>
              <span
                className="w-7 h-7 rounded-full grid place-items-center font-bold text-xs"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                title={user.email ?? ""}
              >
                {initial}
              </span>
              <LogoutButton />
            </>
          )}
        </div>
      </header>
      <div
        className="flex-1 grid overflow-hidden"
        style={{
          gridTemplateColumns: "260px 1fr 300px",
          gap: "1px",
          background: "var(--border)",
        }}
      >
        <LeftPanel />
        <ChatPanel />
        <CitationPanel />
      </div>
    </main>
  );
}
