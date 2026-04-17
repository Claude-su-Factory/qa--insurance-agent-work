import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "보험 약관 QA 서비스의 개인정보 수집 및 이용 방침",
};

export default function Privacy() {
  return (
    <main className="max-w-2xl mx-auto py-12 px-6 text-slate-800">
      <h1 className="text-2xl font-bold mb-6">개인정보처리방침</h1>
      <p className="text-sm text-slate-500 mb-8">최종 수정일: 2026-04-17</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold mt-6">1. 수집하는 개인정보</h2>
        <p>본 서비스는 Google OAuth 로그인을 통해 이메일과 프로필 정보를 수집합니다. 사용자가 업로드한 PDF 파일은 분석을 위해 서버에 일시 저장되며, 추출된 텍스트는 검색을 위해 벡터 데이터베이스에 저장됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">2. 개인정보의 이용 목적</h2>
        <p>수집된 정보는 서비스 제공, 사용자 인증, 약관 분석 결과 제공에만 사용됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">3. 쿠키 및 AdSense</h2>
        <p>본 서비스는 Google AdSense를 통해 광고를 제공합니다. Google은 쿠키를 사용하여 이전 방문 내역을 기반으로 광고를 제공할 수 있습니다. 사용자는 <a href="https://adssettings.google.com" className="text-blue-600 underline">Google 광고 설정</a>에서 맞춤 광고를 비활성화할 수 있습니다.</p>

        <h2 className="text-lg font-semibold mt-6">4. 개인정보 보관 기간</h2>
        <p>회원 탈퇴 시 모든 개인정보와 업로드된 문서 데이터는 즉시 삭제됩니다.</p>

        <h2 className="text-lg font-semibold mt-6">5. 문의</h2>
        <p>개인정보 관련 문의는 서비스 운영자에게 연락 바랍니다.</p>
      </section>
    </main>
  );
}
