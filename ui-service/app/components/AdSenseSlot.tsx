"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function AdSenseSlot() {
  const pubId = process.env.NEXT_PUBLIC_ADSENSE_PUB_ID;
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;

  useEffect(() => {
    if (!pubId || !slotId) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense load failure는 무시
    }
  }, [pubId, slotId]);

  if (!pubId || !slotId) return null;

  return (
    <div className="p-3 border-t border-slate-100">
      <div className="min-h-[100px] bg-slate-50 rounded-md overflow-hidden">
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
