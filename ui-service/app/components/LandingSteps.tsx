const steps = [
  { num: "1", icon: "📤", title: "업로드", desc: "약관 PDF 파일을 업로드합니다" },
  { num: "2", icon: "❓", title: "질문", desc: "궁금한 점을 자연어로 질문합니다" },
  { num: "3", icon: "✅", title: "답변 확인", desc: "근거 조항과 함께 답변을 받습니다" },
];

export default function LandingSteps() {
  return (
    <section className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">간단한 3단계</h2>
        <p className="text-center text-slate-500 mb-10 text-sm">누구나 쉽게 사용할 수 있습니다</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div key={s.num} className="text-center">
              <div className="w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                {s.num}
              </div>
              <div className="text-3xl mb-2">{s.icon}</div>
              <h3 className="font-bold text-slate-900 mb-1">{s.title}</h3>
              <p className="text-sm text-slate-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
