export default function JsonLd() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "보험 약관 QA",
    description: "AI 기반 보험 약관 질의응답 서비스. PDF를 업로드하고 질문하면 근거 조항과 함께 답변을 제공합니다.",
    url: baseUrl,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
