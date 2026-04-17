import Link from "next/link";

export default function LandingNav() {
  return (
    <nav className="bg-white border-b border-slate-100 h-[60px] flex items-center px-6">
      <Link href="/" className="flex items-center gap-2">
        <div className="w-[30px] h-[30px] bg-gradient-to-br from-blue-700 to-blue-500 rounded-lg flex items-center justify-center text-base">
          🛡️
        </div>
        <span className="font-bold text-[15px] text-slate-800">보험 약관 QA</span>
      </Link>
      <Link
        href="/login"
        className="ml-auto text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg transition-colors"
      >
        시작하기
      </Link>
    </nav>
  );
}
