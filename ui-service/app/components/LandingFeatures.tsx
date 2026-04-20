import { FileSearch, Scale, ShieldCheck, ArrowUpRight } from "lucide-react";

const features = [
  {
    icon: FileSearch,
    title: "조항 단위 청킹",
    desc: "약관 구조(조·항·호)를 파서가 인식해 의미 단위로 쪼갭니다. 임의 길이 청크는 사용하지 않습니다.",
    meta: "Voyage AI voyage-2 · 1024-dim",
  },
  {
    icon: Scale,
    title: "자가 채점 루프",
    desc: "Grader가 답변을 평가하고 부족하면 질의를 재작성합니다. 낮은 신뢰도 답변을 걸러냅니다.",
    meta: "LangGraph 조건부 엣지",
  },
  {
    icon: ShieldCheck,
    title: "투명한 인용",
    desc: "모든 문장에 조항 번호·페이지·관련도 점수가 연결됩니다. 블랙박스 답변을 신뢰하지 않아도 됩니다.",
    meta: "100% 근거 매칭",
  },
];

export default function LandingFeatures() {
  return (
    <section id="features" className="max-w-[1200px] mx-auto mt-[120px] px-10">
      <div className="flex items-baseline mb-10">
        <div>
          <div
            className="text-xs font-semibold tracking-[0.1em] uppercase"
            style={{ color: "var(--accent)" }}
          >
            WHY CLAUSEIQ
          </div>
          <h2 className="mt-2 text-[36px] font-bold tracking-[-0.025em]">검색이 아닌 해석.</h2>
        </div>
        <p
          className="ml-auto max-w-[320px] text-sm leading-[1.6]"
          style={{ color: "var(--muted)" }}
        >
          일반적인 RAG를 넘어, 약관의 조·항·호 구조를 이해하고 다중 조항을 교차 참조해 답합니다.
        </p>
      </div>
      <div
        className="grid grid-cols-3 rounded-2xl overflow-hidden"
        style={{ gap: "1px", background: "var(--border)", border: "1px solid var(--border)" }}
      >
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="flex flex-col gap-3.5 px-7 pt-7 pb-8"
              style={{ background: "var(--surface)" }}
            >
              <div
                className="w-9 h-9 rounded-lg grid place-items-center"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                <Icon size={18} />
              </div>
              <h3 className="text-[17px] font-bold tracking-[-0.015em]">{f.title}</h3>
              <p
                className="text-[13.5px] leading-[1.7] flex-1"
                style={{ color: "var(--muted)" }}
              >
                {f.desc}
              </p>
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                {f.meta} <ArrowUpRight size={13} />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
