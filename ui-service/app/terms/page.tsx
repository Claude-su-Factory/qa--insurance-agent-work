import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관",
  description: "보험 약관 QA 서비스 이용약관",
};

export default function Terms() {
  return (
    <main className="max-w-2xl mx-auto py-12 px-6 text-slate-800">
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>
      <p className="text-sm text-slate-500 mb-8">최종 수정일: 2026-04-17</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold mt-6">1. 서비스 내용</h2>
        <p>본 서비스는 사용자가 업로드한 보험 약관 PDF를 AI로 분석하여 질의응답을 제공합니다.</p>

        <h2 className="text-lg font-semibold mt-6">2. AI 답변의 책임 한계</h2>
        <p>본 서비스가 제공하는 AI 답변은 참고용입니다. 실제 보험 청구, 법적 판단이 필요한 경우 반드시 보험사 또는 전문가와 상담하시기 바랍니다. AI 답변의 오류로 인한 손실에 대해 서비스 운영자는 책임지지 않습니다.</p>

        <h2 className="text-lg font-semibold mt-6">3. 금지 행위</h2>
        <p>저작권이 있는 문서를 무단으로 업로드하거나, 서비스를 악용하는 행위는 금지됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">4. 서비스 변경 및 중단</h2>
        <p>운영자는 사전 공지 후 서비스 내용을 변경하거나 중단할 수 있습니다.</p>
      </section>
    </main>
  );
}
