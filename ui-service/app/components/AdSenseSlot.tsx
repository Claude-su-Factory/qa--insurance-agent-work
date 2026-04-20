"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdSenseSlotProps = {
  variant?: "panel" | "inline";
};

export default function AdSenseSlot({ variant = "panel" }: AdSenseSlotProps) {
  const pubId = process.env.NEXT_PUBLIC_ADSENSE_PUB_ID;
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;

  useEffect(() => {
    if (!pubId || !slotId) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }, [pubId, slotId]);

  if (!pubId || !slotId) return null;

  if (variant === "inline") {
    return (
      <div className="my-10 mx-auto max-w-2xl px-4">
        <div
          className="text-[10px] uppercase tracking-[0.1em] mb-1.5"
          style={{ color: "var(--muted)" }}
        >
          광고
        </div>
        <div
          className="min-h-[100px] rounded-md overflow-hidden"
          style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
        >
          <ins
            className="adsbygoogle"
            style={{ display: "block", minHeight: 100 }}
            data-ad-client={pubId}
            data-ad-slot={slotId}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3.5" style={{ borderTop: "1px solid var(--border)" }}>
      <div
        className="text-[10px] uppercase tracking-[0.1em] mb-1.5"
        style={{ color: "var(--muted)" }}
      >
        광고
      </div>
      <div
        className="min-h-[100px] rounded-md overflow-hidden"
        style={{ background: "var(--bg-2)" }}
      >
        <ins
          className="adsbygoogle"
          style={{ display: "block", minHeight: 100 }}
          data-ad-client={pubId}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </div>
  );
}
