import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function LandingHero() {
  return (
    <section className="max-w-[1100px] mx-auto px-10 pt-[88px] pb-10 text-center">
      <div
        className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-7"
        style={{
          color: "var(--muted)",
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--good)" }} />
        <b style={{ color: "var(--fg)", fontWeight: 600 }}>v2.4</b>
        <span>· 조항 단위 근거 인용 엔진</span>
      </div>
      <h1
        className="mx-auto mb-6 max-w-[820px] text-[64px] font-bold leading-[1.05] tracking-[-0.035em]"
      >
        <span
          style={{
            background: "linear-gradient(180deg, var(--fg) 0%, var(--muted) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          보험 약관을 AI가<br />조항 단위로 해석합니다.
        </span>
      </h1>
      <p
        className="mx-auto mb-9 max-w-[560px] text-[17px] leading-[1.6]"
        style={{ color: "var(--muted)" }}
      >
        PDF를 올리고 한국어로 질문하세요. 답변마다 인용된 조항·페이지·관련도가 투명하게 표시됩니다.
      </p>
      <div className="inline-flex gap-2.5">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-3.5 rounded-[10px]"
          style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
        >
          Google로 무료 시작 <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}
