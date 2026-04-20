import type { Metadata } from "next";
import AdSenseSlot from "../components/AdSenseSlot";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "ClauseIQ 보험 약관 QA 서비스의 개인정보 수집 및 이용 방침",
};

export default function Privacy() {
  return (
    <main className="max-w-2xl mx-auto py-12 px-6 text-slate-800">
      <h1 className="text-2xl font-bold mb-6">개인정보처리방침</h1>
      <p className="text-sm text-slate-500 mb-8">최종 수정일: 2026-04-20</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold mt-6">1. 수집하는 개인정보 항목</h2>
        <p>ClauseIQ(이하 &quot;서비스&quot;)는 다음 개인정보를 수집합니다. Google OAuth 로그인을 통해 제공된 이메일 주소, 이름, 프로필 사진이 수집되며, 이는 사용자 인증과 계정 식별 목적으로만 사용됩니다. 서비스 이용 과정에서 업로드한 보험 약관 PDF 파일은 분석을 위해 서버에 일시 저장되며, 추출된 텍스트는 조항 단위로 청크 분할되어 벡터 데이터베이스에 저장됩니다. 사용자가 입력한 질의 내용과 AI가 생성한 답변은 서비스 품질 개선 및 감사 목적으로 보관됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">2. 개인정보의 이용 목적</h2>
        <p>수집된 정보는 회원 인증, 사용자별 문서 격리, 질의응답 제공, 서비스 이용 분석, 법적 의무 이행 범위 내에서만 이용됩니다. 광고 또는 마케팅 목적의 별도 활용은 없으며, 사용자 본인의 동의 없이 목적 외 용도로 사용되지 않습니다.</p>

        <h2 className="text-lg font-semibold mt-6">3. 쿠키 및 Google AdSense</h2>
        <p>본 서비스는 Google AdSense를 통해 광고를 제공합니다. Google은 쿠키 및 유사 기술을 사용하여 이전 방문 내역을 기반으로 맞춤형 광고를 제공할 수 있습니다. 사용자는 <a href="https://adssettings.google.com" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">Google 광고 설정</a>에서 맞춤 광고를 비활성화할 수 있으며, 브라우저 설정을 통해 쿠키 저장을 거부할 수도 있습니다. 단, 쿠키를 거부할 경우 일부 기능 이용에 제약이 있을 수 있습니다.</p>

        <h2 className="text-lg font-semibold mt-6">4. 개인정보 보관 기간</h2>
        <p>회원 가입 시 수집된 개인정보는 회원 탈퇴 시까지 보관됩니다. 회원 탈퇴 요청이 접수되면 업로드된 PDF 파일, Qdrant 벡터 데이터, 질의/답변 이력을 포함한 모든 개인정보가 지체 없이 파기됩니다. 다만 관련 법령에 따라 보관이 의무화된 정보는 해당 기간 동안 별도 보관됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">5. 제3자 제공 및 처리 위탁</h2>
        <p>서비스 운영을 위해 다음 외부 업체에 개인정보 처리를 위탁합니다. Supabase(인증 세션 관리 및 메타데이터 저장), Anthropic(질의 처리를 위한 Claude LLM 호출), Voyage AI(텍스트 임베딩 생성), Qdrant Cloud(벡터 검색), Google AdSense(광고 게재). 각 제공 업체는 해당 서비스 제공 목적 범위 내에서만 정보에 접근하며, 자체 개인정보 처리 방침을 따릅니다.</p>

        <h2 className="text-lg font-semibold mt-6">6. 사용자의 권리</h2>
        <p>사용자는 언제든지 본인의 개인정보에 대한 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다. 업로드한 문서는 대시보드에서 개별 삭제가 가능하며, 전체 계정 삭제를 원할 경우 서비스 운영자에게 문의하시기 바랍니다. 법정대리인 또는 제3자를 통한 요청 시 정당한 위임 여부를 확인합니다.</p>

        <h2 className="text-lg font-semibold mt-6">7. 보안 조치</h2>
        <p>서비스는 사용자 정보 보호를 위해 다음 조치를 시행합니다. 전송 구간 HTTPS 암호화, Supabase JWT 기반 인증, Qdrant payload의 user_id 필터링을 통한 사용자 간 데이터 격리, 내부 서비스 간 호출에 X-Internal-Token 검증 미들웨어 적용, 민감한 환경 변수는 Doppler를 통해 안전하게 관리합니다. 기술적 한계로 완전한 보안을 보장할 수는 없으나 업계 표준 수준의 조치를 유지합니다.</p>

        <h2 className="text-lg font-semibold mt-6">8. 문의 및 분쟁 해결</h2>
        <p>개인정보 관련 문의, 불만 처리, 피해 구제에 관한 사항은 서비스 운영자에게 연락해 주시기 바랍니다. 분쟁이 해결되지 않을 경우 개인정보보호위원회(privacy.go.kr) 또는 개인정보 침해신고센터(privacy.kisa.or.kr)에 도움을 요청할 수 있습니다.</p>
      </section>

      <AdSenseSlot variant="inline" />
    </main>
  );
}
