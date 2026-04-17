import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const ingestionUrl = process.env.INGESTION_API_URL;

  const res = await fetch(`${ingestionUrl}/ingest`, {
    method: "POST",
    headers: {
      "X-User-ID": user.id,
      "X-Internal-Token": process.env.INTERNAL_AUTH_TOKEN ?? "",
    },
    body: formData,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
