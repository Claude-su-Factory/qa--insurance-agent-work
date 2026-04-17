import Link from "next/link";

export default function LandingCTA() {
  return (
    <section className="py-16 px-6">
      <div className="max-w-2xl mx-auto bg-gradient-to-br from-blue-700 to-blue-500 rounded-2xl p-10 text-center text-white">
        <h2 className="text-2xl font-bold mb-2">지금 바로 시작하세요</h2>
        <p className="text-sm opacity-90 mb-6">무료로 약관을 분석해보세요</p>
        <Link
          href="/login"
          className="inline-block bg-white text-blue-600 font-bold px-8 py-3 rounded-xl hover:bg-slate-50 transition-colors"
        >
          Google로 시작하기
        </Link>
      </div>
    </section>
  );
}
