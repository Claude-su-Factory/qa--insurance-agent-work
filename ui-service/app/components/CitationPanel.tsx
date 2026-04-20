"use client";

import { useState } from "react";
import { useApp } from "../context/AppContext";
import type { Citation } from "../context/AppContext";
import AdSenseSlot from "./AdSenseSlot";

function CitationModal({ citation, score, onClose }: { citation: Citation; score: number; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl shadow-xl"
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between p-5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded"
              style={{
                background: "rgba(79,70,229,0.1)",
                color: "var(--accent)",
                letterSpacing: "0.02em",
              }}
            >
              {citation.clauseNumber}
            </span>
            <h2 className="text-[15px] font-bold mt-2">{citation.clauseTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ml-3"
            style={{ color: "var(--muted)" }}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--fg-2)" }}>
            {citation.excerpt}
          </p>
        </div>
        <div className="px-5 pb-5 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex justify-between text-[11px] mb-1.5" style={{ color: "var(--muted)" }}>
            <span>관련도</span>
            <span className="font-semibold" style={{ color: "var(--accent)" }}>{score}%</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "var(--bg-2)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ background: "var(--accent)", width: `${score}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CitationPanel() {
  const { citations, activeCitation } = useApp();
  const [modalCitation, setModalCitation] = useState<{ citation: Citation; score: number } | null>(null);

  const Header = ({ count }: { count: number }) => (
    <div className="px-4 pt-4 pb-2.5 flex items-center gap-2">
      <span
        className="text-xs font-bold tracking-[0.1em] uppercase"
        style={{ color: "var(--muted)" }}
      >
        근거 조항
      </span>
      <span
        className="ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded"
        style={{ background: "var(--bg-2)", color: "var(--muted)" }}
      >
        {count}
      </span>
    </div>
  );

  if (citations.length === 0) {
    return (
      <aside className="flex flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
        <Header count={0} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-5 text-center">
          <div
            className="w-10 h-10 rounded-full grid place-items-center"
            style={{ background: "var(--bg-2)", color: "var(--muted)" }}
          >
            📋
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
            AI가 답변하면<br />참조한 조항이<br />여기 표시됩니다
          </p>
        </div>
        <AdSenseSlot />
      </aside>
    );
  }

  return (
    <>
      {modalCitation && (
        <CitationModal
          citation={modalCitation.citation}
          score={modalCitation.score}
          onClose={() => setModalCitation(null)}
        />
      )}
      <aside className="flex flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
        <Header count={citations.length} />
        <div className="flex-1 overflow-y-auto px-3.5 pb-3.5 flex flex-col gap-2">
          {citations.map((c, i) => {
            const isActive = activeCitation === i;
            const score = Math.round(90 + (citations.length - i) * 3);
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => setModalCitation({ citation: c, score })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setModalCitation({ citation: c, score });
                  }
                }}
                className="rounded-[10px] px-3.5 py-3 cursor-pointer"
                style={{
                  background: isActive ? "var(--accent-soft)" : "var(--surface)",
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span
                    className="text-[11px] font-bold px-1.5 py-[1px] rounded"
                    style={{
                      background: "rgba(79,70,229,0.1)",
                      color: "var(--accent)",
                    }}
                  >
                    {c.clauseNumber}
                  </span>
                  <span
                    className="ml-auto text-[10.5px] font-bold mono"
                    style={{ color: "var(--good)" }}
                  >
                    {score}%
                  </span>
                </div>
                <p className="text-[12.5px] font-semibold mb-1.5">{c.clauseTitle}</p>
                <p
                  className="text-[11.5px] leading-[1.6] line-clamp-3"
                  style={{ color: "var(--muted)" }}
                >
                  {c.excerpt}
                </p>
                <div className="mt-2 h-[2px] rounded" style={{ background: "var(--bg-2)" }}>
                  <div
                    className="h-full rounded"
                    style={{ background: "var(--accent)", width: `${score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <AdSenseSlot />
      </aside>
    </>
  );
}
