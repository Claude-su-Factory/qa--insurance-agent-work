import LeftPanel from "../components/LeftPanel";
import ChatPanel from "../components/ChatPanel";
import CitationPanel from "../components/CitationPanel";
import LogoutButton from "../components/LogoutButton";
import { createClient } from "../lib/supabase/server";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex h-screen flex-col bg-slate-100">
      <header className="bg-white border-b border-slate-200 h-[52px] flex items-center gap-3 px-5 flex-shrink-0 shadow-sm">
        <div className="w-[30px] h-[30px] bg-gradient-to-br from-blue-700 to-blue-500 rounded-lg flex items-center justify-center text-base">
          🛡️
        </div>
        <span className="font-bold text-[15px] text-slate-800">보험 약관 QA</span>
        <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
          AI Agent
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-[11px] text-slate-500">서비스 정상 운영 중</span>
          {user && (
            <>
              <span className="text-[11px] text-slate-400">{user.email}</span>
              <LogoutButton />
            </>
          )}
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden gap-px bg-slate-200">
        <LeftPanel />
        <ChatPanel />
        <CitationPanel />
      </div>
    </main>
  );
}
