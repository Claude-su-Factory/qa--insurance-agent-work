import { FileText } from "lucide-react";

export default function LandingProductFrame() {
  return (
    <div className="max-w-[1120px] mx-auto mt-[60px] px-10">
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow:
            "0 40px 80px -40px rgba(79,70,229,0.15), 0 10px 30px -10px rgba(0,0,0,0.08)",
        }}
      >
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--border-2)" }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--border-2)" }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--border-2)" }} />
          </div>
          <div
            className="flex-1 text-center text-[11.5px] rounded-md px-3 py-1"
            style={{ background: "var(--bg-2)", color: "var(--muted)" }}
          >
            clauseiq.app/dashboard
          </div>
        </div>
        <div
          className="grid min-h-[420px]"
          style={{ gridTemplateColumns: "200px 1fr 260px", background: "var(--bg)" }}
        >
          {/* LEFT */}
          <div className="p-4" style={{ borderRight: "1px solid var(--border)" }}>
            <div
              className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2.5"
              style={{ color: "var(--muted)" }}
            >
              약관
            </div>
            {[
              { name: "무배당 종합건강보험", count: "142", active: true },
              { name: "실손의료비 4세대", count: "98" },
              { name: "어린이종합보험", count: "76" },
            ].map((d) => (
              <div
                key={d.name}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium mb-0.5"
                style={{
                  background: d.active ? "var(--accent-soft)" : "transparent",
                  color: d.active ? "var(--accent)" : "var(--fg-2)",
                }}
              >
                <FileText size={14} />
                <span className="flex-1">{d.name}</span>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: d.active ? "var(--accent)" : "var(--muted)" }}
                >
                  {d.count}
                </span>
              </div>
            ))}
          </div>
          {/* CENTER */}
          <div className="px-8 py-7 flex flex-col gap-3.5">
            <Bubble type="u">자살 면책기간은 언제부터 언제까지인가요?</Bubble>
            <Bubble type="a">
              계약의 보장개시일로부터 <b>2년</b>이 면책기간입니다
              <Pill>제14조</Pill>. 이 기간 내 고의 자해는 보험금이 지급되지 않으며,
              심신상실 상태의 자해는 예외입니다<Pill>제14조 ②</Pill>.
            </Bubble>
            <Bubble type="u">계약 1년 6개월 시점에 사고가 나면요?</Bubble>
            <div className="text-[13px] italic max-w-[80%]" style={{ color: "var(--muted)" }}>
              분석 중 · STEP 3/5 조항 재검색
            </div>
          </div>
          {/* RIGHT */}
          <div className="p-4" style={{ borderLeft: "1px solid var(--border)" }}>
            <div
              className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2.5"
              style={{ color: "var(--muted)" }}
            >
              근거 조항
            </div>
            <CitMini n="제14조 · 96%" t="보험금 지급 면책사유" e="회사는 다음 각 호의 어느 하나에 해당하는 사유로 보험금 지급사유가 발생한 때에는 보험금을…" w="96%" />
            <CitMini n="제14조 ① · 88%" t="고의 자해의 정의" e="'고의로 자신을 해친 경우'란 심신상실 등으로 자유로운 의사결정을 할 수 없는 상태에서…" w="88%" />
            <CitMini n="제3조 · 74%" t="보장개시일의 정의" e="보장개시일이란 회사가 제1회 보험료를 받은 때를 말합니다. 다만, 회사가 승낙 전이라도…" w="74%" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ type, children }: { type: "u" | "a"; children: React.ReactNode }) {
  const isUser = type === "u";
  return (
    <div
      className={`max-w-[80%] px-4 py-3 text-[13px] leading-[1.65] rounded-2xl ${
        isUser ? "self-end" : ""
      }`}
      style={
        isUser
          ? { background: "var(--fg)", color: "var(--bg-alt)", borderBottomRightRadius: 4 }
          : {
              background: "var(--bg-2)",
              color: "var(--fg-2)",
              border: "1px solid var(--border)",
              borderBottomLeftRadius: 4,
            }
      }
    >
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mx-0.5 text-[10px] font-bold rounded px-1.5 py-[1px] align-middle"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
    >
      {children}
    </span>
  );
}

function CitMini({ n, t, e, w }: { n: string; t: string; e: string; w: string }) {
  return (
    <div
      className="mb-2 px-3.5 py-3 rounded-[10px]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div
        className="text-[10.5px] font-bold tracking-wider mb-1"
        style={{ color: "var(--accent)" }}
      >
        {n}
      </div>
      <div className="text-xs font-semibold mb-1.5" style={{ color: "var(--fg)" }}>
        {t}
      </div>
      <div
        className="text-[11px] leading-[1.55] line-clamp-2"
        style={{ color: "var(--muted)" }}
      >
        {e}
      </div>
      <div className="mt-2 h-[3px] rounded" style={{ background: "var(--bg-2)" }}>
        <div className="h-full rounded" style={{ background: "var(--accent)", width: w }} />
      </div>
    </div>
  );
}
