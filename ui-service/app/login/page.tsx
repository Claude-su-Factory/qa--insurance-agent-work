"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "../lib/supabase/client";

function ShieldLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="16" height="16">
      <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" style={{ background: "#fff", borderRadius: "50%", padding: 2 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function LoginPage() {
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <main
      className="min-h-screen grid place-items-center p-10"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="w-[980px] max-w-full grid grid-cols-2 overflow-hidden rounded-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {/* LEFT: brand + pitch */}
        <div
          className="relative overflow-hidden p-12"
          style={{
            background: "linear-gradient(155deg, var(--bg-2) 0%, var(--surface) 100%)",
          }}
        >
          <div
            className="absolute w-[280px] h-[280px] rounded-full opacity-10"
            style={{
              top: "-80px",
              right: "-80px",
              background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
            }}
          />
          <div className="flex items-center gap-2.5 font-bold text-base tracking-tight">
            <span
              className="w-7 h-7 rounded-md grid place-items-center"
              style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
            >
              <ShieldLogo />
            </span>
            <span>ClauseIQ</span>
          </div>
          <div className="mt-10">
            <div
              className="text-[11px] font-bold tracking-[0.15em] uppercase mb-4"
              style={{ color: "var(--accent)" }}
            >
              AI · Insurance · Transparent
            </div>
            <h2 className="text-[28px] font-bold tracking-[-0.025em] leading-[1.2] mb-4">
              조항 근거 없이는<br />답변도 없습니다.
            </h2>
            <p className="text-[13px] leading-[1.7]" style={{ color: "var(--muted)" }}>
              답변 신뢰도를 자체 채점하는 Self-Correcting Agent가 당신의 약관을 분석합니다.
              소비자 관점의 질문에 조항 단위로 답합니다.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              {[
                "Supabase Auth(JWT) + X-Internal-Token 이중 보호",
                "업로드 PDF는 사용자별로 격리 (user_id 필터)",
                "Langfuse 전 트레이스 관찰성, 프로덕션 투명성",
              ].map((line) => (
                <div
                  key={line}
                  className="flex gap-2.5 text-[12.5px] leading-[1.5]"
                  style={{ color: "var(--fg-2)" }}
                >
                  <CheckCircle2 aria-hidden={true} size={15} style={{ color: "var(--good)", marginTop: 2, flexShrink: 0 }} />
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 text-[11px]" style={{ color: "var(--muted)" }}>
            v2.4 · Seoul · built with Claude Sonnet 4.6
          </div>
        </div>

        {/* RIGHT: Google login */}
        <div className="p-14 flex flex-col justify-center">
          <h1 className="text-[26px] font-bold tracking-[-0.025em] mb-1.5">시작하기</h1>
          <p className="text-[13.5px] leading-[1.6] mb-8" style={{ color: "var(--muted)" }}>
            Google 계정으로 3초 가입. 약관 PDF 1개는 언제나 무료.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2.5 text-sm font-semibold py-3.5 rounded-[10px]"
            style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
          >
            <GoogleIcon />
            Google로 계속하기
          </button>
          <p className="mt-7 text-[11px] leading-[1.6]" style={{ color: "var(--muted)" }}>
            계속 진행하면{" "}
            <Link href="/terms" style={{ color: "var(--fg-2)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              이용약관
            </Link>
            과{" "}
            <Link href="/privacy" style={{ color: "var(--fg-2)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              개인정보처리방침
            </Link>
            에 동의하는 것입니다.
          </p>
        </div>
      </div>
    </main>
  );
}
