import { Langfuse } from "langfuse";

let client: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
  if (client) return client;

  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const host = process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com";

  if (!secretKey || !publicKey) {
    console.log("[langfuse] keys not configured, tracing disabled");
    return null;
  }

  client = new Langfuse({ secretKey, publicKey, baseUrl: host });
  return client;
}
