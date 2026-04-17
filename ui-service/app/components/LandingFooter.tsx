import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 py-8 px-6">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-xs text-slate-400">
          © 2026 보험 약관 QA. All rights reserved.
        </div>
        <div className="flex gap-4 text-xs text-slate-500">
          <Link href="/privacy" className="hover:text-slate-800">개인정보처리방침</Link>
          <Link href="/terms" className="hover:text-slate-800">이용약관</Link>
        </div>
      </div>
    </footer>
  );
}
