export default function JsonLd() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ClauseIQ",
    description: "조항 단위 근거 인용 보험 약관 QA Agent. PDF 업로드 → 한국어 질의 → 조·항·호 단위 답변.",
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
