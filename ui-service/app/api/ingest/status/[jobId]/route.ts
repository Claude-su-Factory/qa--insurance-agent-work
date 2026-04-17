import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ingestionUrl = process.env.INGESTION_API_URL;

  const res = await fetch(`${ingestionUrl}/ingest/status/${params.jobId}`, {
    cache: "no-store",
    headers: {
      "X-User-ID": user.id,
      "X-Internal-Token": process.env.INTERNAL_AUTH_TOKEN ?? "",
    },
  });

  if (res.status === 404) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
