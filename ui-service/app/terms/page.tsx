import type { Metadata } from "next";
import AdSenseSlot from "../components/AdSenseSlot";

export const metadata: Metadata = {
  title: "이용약관",
  description: "ClauseIQ 보험 약관 QA 서비스 이용약관",
};

export default function Terms() {
  return (
    <main className="max-w-2xl mx-auto py-12 px-6 text-slate-800">
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>
      <p className="text-sm text-slate-500 mb-8">최종 수정일: 2026-04-20</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold mt-6">1. 서비스 목적 및 범위</h2>
        <p>ClauseIQ(이하 &quot;서비스&quot;)는 사용자가 업로드한 보험 약관 PDF를 인공지능 기술로 분석하여 조항 단위의 질의응답을 제공하는 포트폴리오 성격의 웹 서비스입니다. 본 서비스는 보험사의 공식 상담 창구가 아니며, 개별 계약의 해석이나 청구 실무에 대해 법적 효력을 가지는 판단을 제공하지 않습니다.</p>

        <h2 className="text-lg font-semibold mt-6">2. 이용 자격 및 계정</h2>
        <p>서비스는 Google 계정을 통한 인증을 필수로 요구합니다. 사용자는 본인 계정의 보안을 책임져야 하며, 계정 도용이 의심되는 경우 즉시 서비스 운영자에게 통지해야 합니다. 만 14세 미만의 아동이 서비스를 이용하려면 법정대리인의 동의가 필요합니다.</p>

        <h2 className="text-lg font-semibold mt-6">3. AI 답변의 책임 한계</h2>
        <p>본 서비스가 제공하는 AI 답변은 참고 자료이며, 법적 구속력을 갖지 않습니다. 실제 보험금 청구, 보장 범위 해석, 법적 분쟁 등 중요한 의사결정이 필요한 경우 반드시 보험사, 금융감독원, 변호사 등 공식 기관 또는 전문가와 상담하시기 바랍니다. AI 답변의 오류, 누락, 지연으로 인한 직접적 또는 간접적 손실에 대해 서비스 운영자는 법이 허용하는 최대 범위에서 책임을 지지 않습니다.</p>

        <h2 className="text-lg font-semibold mt-6">4. 저작권 및 문서 업로드 책임</h2>
        <p>업로드된 보험 약관 PDF의 저작권은 해당 원저작자(주로 보험사)에게 귀속됩니다. 사용자는 본인이 당사자이거나 정당한 이용 권한을 가진 문서만 업로드해야 하며, 저작권 침해 또는 계약상 비밀 유지 의무 위반에 대한 책임은 업로드한 사용자 본인에게 있습니다. 서비스 운영자는 저작권 침해 신고 접수 시 해당 콘텐츠를 즉시 비활성화할 수 있습니다.</p>

        <h2 className="text-lg font-semibold mt-6">5. 데이터 처리 및 사용자 간 격리</h2>
        <p>업로드된 PDF는 청크 단위로 분할되어 Qdrant 벡터 데이터베이스에 저장되며, 각 청크에는 업로더의 user_id가 태깅되어 다른 사용자의 검색 결과에 노출되지 않습니다. 질의 처리 과정에서 Anthropic(Claude), Voyage AI(임베딩) 등 외부 LLM API가 호출되며, 이들 서비스의 데이터 처리 정책이 함께 적용됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">6. 금지 행위</h2>
        <p>다음 행위는 금지됩니다. 타인의 저작물 또는 계약 문서를 무단으로 업로드하는 행위, 서비스 API에 과도한 부하를 유발하는 자동화 스크립트 사용, AI 시스템의 취약점을 의도적으로 탐색하거나 악용하는 행위, 서비스를 활용하여 법률·의료·금융 상담을 대리 제공하는 영업 활동, 타 사용자의 개인정보를 추론하거나 재구성하려는 시도가 이에 해당합니다.</p>

        <h2 className="text-lg font-semibold mt-6">7. 서비스 변경, 중단 및 약관 수정</h2>
        <p>서비스 운영자는 기술적 개선, 정책 변경, 외부 API 종속성 변화 등의 사유로 서비스 내용을 변경하거나 일시 중단할 수 있습니다. 중대한 변경의 경우 최소 30일 전 서비스 내 공지 또는 등록된 이메일을 통해 사전 안내합니다. 약관 변경 후에도 서비스를 계속 이용하는 경우 변경된 약관에 동의한 것으로 간주됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">8. 분쟁 해결 및 준거법</h2>
        <p>본 약관 및 서비스 이용과 관련하여 발생하는 분쟁은 대한민국 법을 준거법으로 하며, 관할 법원은 서비스 운영자의 주소지를 관할하는 지방법원을 1심 관할 법원으로 합니다. 본 약관은 법률 자문을 거치지 않고 서비스 운영자가 작성한 문서로, 실제 법적 효력에 대한 해석은 관할 법원의 판단에 따릅니다.</p>
      </section>

      <AdSenseSlot variant="inline" />
    </main>
  );
}
