const features = [
  { icon: "📄", title: "약관 업로드", desc: "PDF 파일을 업로드하면 AI가 자동으로 분석합니다", bg: "bg-blue-50" },
  { icon: "💬", title: "자연어 질문", desc: "전문 용어 없이 편하게 질문하세요", bg: "bg-green-50" },
  { icon: "📌", title: "정확한 근거 제시", desc: "답변의 출처 조항을 정확하게 보여줍니다", bg: "bg-amber-50" },
];

export default function LandingFeatures() {
  return (
    <section className="py-16 px-6 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">주요 기능 안내</h2>
        <p className="text-center text-slate-500 mb-10 text-sm">보험 약관을 이해하는 가장 쉬운 방법</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-white border border-slate-200 rounded-xl p-6 text-center">
              <div className={`w-12 h-12 ${f.bg} rounded-xl flex items-center justify-center text-2xl mx-auto mb-4`}>{f.icon}</div>
              <h3 className="font-bold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
