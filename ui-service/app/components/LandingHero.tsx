import Link from "next/link";

export default function LandingHero() {
  return (
    <section className="py-20 px-6 text-center">
      <div className="inline-flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-full text-xs font-semibold text-blue-600 mb-6">
        🤖 AI 기반 약관 분석 서비스
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 leading-tight">
        복잡한 보험 약관,<br />AI가 쉽게 설명해드립니다
      </h1>
      <p className="text-base text-slate-500 mb-8 max-w-xl mx-auto">
        PDF를 업로드하고 질문하세요. 근거 조항까지 정확하게 알려드립니다.
      </p>
      <Link
        href="/login"
        className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
      >
        무료로 시작하기
      </Link>
    </section>
  );
}
