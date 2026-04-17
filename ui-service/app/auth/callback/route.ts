import { createClient } from "../../lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Next.js standalone + HOSTNAME=0.0.0.0 환경에서 request.url의 origin이 0.0.0.0이 되는 문제를 회피.
  // 실제 브라우저가 보낸 host 헤더를 사용. 프록시(port-forward 등) 뒤에 있을 수 있으니 x-forwarded-host 우선.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  const origin = `${protocol}://${host}`;

  return NextResponse.redirect(`${origin}/dashboard`);
}
