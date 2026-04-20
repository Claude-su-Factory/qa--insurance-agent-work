"use client";

import { LogOut } from "lucide-react";
import { createClient } from "../lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const supabase = createClient();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-colors"
      style={{ background: "var(--bg-2)", color: "var(--fg-2)" }}
      title="로그아웃"
    >
      <LogOut size={12} aria-hidden="true" />
      로그아웃
    </button>
  );
}
