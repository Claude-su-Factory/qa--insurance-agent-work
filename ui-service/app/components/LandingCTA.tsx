import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function LandingCTA() {
  return (
    <section className="max-w-[1200px] mx-auto my-[100px] px-10">
      <div
        className="relative overflow-hidden rounded-[20px] grid gap-10 items-center p-14"
        style={{
          background: "var(--fg)",
          color: "var(--bg-alt)",
          gridTemplateColumns: "1.3fr 1fr",
        }}
      >
        <div
          className="absolute w-[320px] h-[320px] rounded-full opacity-40"
          style={{
            top: "-80px",
            right: "-80px",
            background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
          }}
        />
        <h3 className="relative text-[36px] font-bold tracking-[-0.025em] leading-[1.15]">
          약관은 어렵지만,<br />답은 어렵지 않아야 합니다.
        </h3>
        <div className="relative text-right">
          <p
            className="text-sm leading-[1.7]"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            Google 계정 하나로 시작. PDF 1개는 언제나 무료.
          </p>
          <Link
            href="/login"
            className="relative mt-4 inline-flex items-center gap-2 text-sm font-semibold px-5 py-3.5 rounded-[10px]"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            무료로 시작하기 <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
