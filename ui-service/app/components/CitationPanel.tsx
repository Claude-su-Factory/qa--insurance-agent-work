"use client";

import { useState } from "react";
import { useApp } from "../context/AppContext";
import type { Citation } from "../context/AppContext";
import AdSenseSlot from "./AdSenseSlot";

function CitationModal({ citation, score, onClose }: { citation: Citation; score: number; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {citation.clauseNumber}
            </span>
            <h2 className="text-[15px] font-bold text-slate-800 mt-2">{citation.clauseTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 ml-3"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">{citation.excerpt}</p>
        </div>

        {/* 관련도 */}
        <div className="px-5 pb-5 pt-3 border-t border-slate-100">
          <div className="flex justify-between text-[11px] text-slate-400 mb-1.5">
            <span>관련도</span>
            <span className="font-semibold text-blue-600">{score}%</span>
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${score}%` }}
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

  if (citations.length === 0) {
    return (
      <aside className="w-64 bg-white flex flex-col border-l border-slate-100 flex-shrink-0">
        <div className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
          📌 근거 조항
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-5 text-center">
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-xl">📋</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
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
      <aside className="w-64 bg-white flex flex-col border-l border-slate-100 flex-shrink-0">
        <div className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 flex items-center gap-2">
          📌 근거 조항
          <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            {citations.length}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {citations.map((c, i) => {
            const isActive = activeCitation === i;
            const score = Math.round(90 + (citations.length - i) * 3);
            return (
              <div
                key={i}
                onClick={() => setModalCitation({ citation: c, score })}
                className={`rounded-xl p-3 cursor-pointer border transition-all ${
                  isActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-slate-50 hover:border-blue-200 hover:bg-blue-50"
                }`}
              >
                <p className="text-[10px] font-bold text-blue-600 mb-1">{c.clauseNumber}</p>
                <p className="text-[11px] font-semibold text-slate-800 mb-2">{c.clauseTitle}</p>
                <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-3">{c.excerpt}</p>
                <div className="mt-2">
                  <div className="flex justify-between text-[9px] text-slate-400 mb-1">
                    <span>관련도</span>
                    <span className="font-semibold text-blue-600">{score}%</span>
                  </div>
                  <div className="h-1 bg-slate-200 rounded-full">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${score}%` }}
                    />
                  </div>
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
