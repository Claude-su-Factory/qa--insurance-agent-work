"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import CircleProgress from "./CircleProgress";
import { useApp } from "../context/AppContext";
import { createClient } from "../lib/supabase/client";

const STEP_LABELS: Record<string, string> = {
  parsing: "PDF 파싱 중",
  chunking: "텍스트 청킹 중",
  embedding: "임베딩 생성 중",
  storing: "Qdrant 저장 중",
  done: "완료",
  failed: "실패",
};

const STEPS = ["parsing", "chunking", "embedding", "storing"] as const;

export default function LeftPanel() {
  const { documents, setDocuments, ingesting, setIngesting } = useApp();
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // 초기 문서 목록 로드
  useEffect(() => {
    async function loadDocuments() {
      const { data } = await supabase
        .from("documents")
        .select("id, filename, chunk_count, created_at")
        .order("created_at", { ascending: false });

      if (data) {
        setDocuments(
          data.map((d) => ({
            id: d.id,
            filename: d.filename,
            clauseCount: d.chunk_count,
            createdAt: d.created_at,
          }))
        );
      }
    }
    loadDocuments();
  }, []);

  // 1초 polling
  useEffect(() => {
    if (!ingesting || ingesting.currentStep === "done" || ingesting.currentStep === "failed") return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/ingest/status/${ingesting.jobId}`);
      if (!res.ok) return;

      const data = await res.json();
      setIngesting((prev) =>
        prev
          ? {
              ...prev,
              progress: data.progress ?? prev.progress,
              currentStep: data.step ?? prev.currentStep,
              currentChunk: data.currentChunk ?? prev.currentChunk,
              totalChunks: data.totalChunks ?? prev.totalChunks,
              error: data.error,
            }
          : null
      );

      if (data.step === "done") {
        const { data: docs } = await supabase
          .from("documents")
          .select("id, filename, chunk_count, created_at")
          .order("created_at", { ascending: false });

        if (docs) {
          setDocuments(
            docs.map((d) => ({
              id: d.id,
              filename: d.filename,
              clauseCount: d.chunk_count,
              createdAt: d.created_at,
            }))
          );
        }
        setTimeout(() => setIngesting(null), 2000);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [ingesting?.jobId, ingesting?.currentStep, setIngesting, setDocuments]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        alert("PDF 파일만 업로드 가능합니다.");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ingest", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "업로드 실패");
        return;
      }

      setIngesting({
        jobId: data.jobId,
        filename: file.name,
        filesize: `${(file.size / 1024 / 1024).toFixed(1)}MB`,
        progress: 0,
        currentStep: "parsing",
        currentChunk: 0,
        totalChunks: 0,
      });
    },
    [setIngesting]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <aside className="w-60 bg-white flex flex-col border-r border-slate-100 flex-shrink-0">
      <div className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
        📁 내 약관
      </div>
      <div className="p-3">
        <div
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            isDragOver
              ? "border-blue-500 bg-blue-50"
              : "border-blue-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="text-2xl mb-2">📄</div>
          <p className="text-[11px] text-slate-500 mb-1">PDF 약관 파일 업로드</p>
          <p className="text-[10px] text-slate-400 mb-3">드래그 앤 드롭 또는</p>
          <button className="bg-blue-600 text-white text-[11px] font-semibold px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
            파일 선택
          </button>
          <input ref={inputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
        </div>
      </div>

      {ingesting && (
        <div className="mx-3 mb-3 bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">📑</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-slate-800 truncate">{ingesting.filename}</p>
              <p className="text-[9px] text-slate-400">{ingesting.filesize}</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <CircleProgress
              progress={ingesting.progress}
              label={ingesting.currentStep === "done" ? "완료" : "처리중"}
            />
            <div className="flex-1 bg-slate-50 rounded-lg p-2 font-mono">
              {STEPS.map((step) => {
                const stepIndex = STEPS.indexOf(step);
                const currentIndex = STEPS.indexOf(ingesting.currentStep as typeof STEPS[number]);
                const isDone = stepIndex < currentIndex || ingesting.currentStep === "done";
                const isActive = step === ingesting.currentStep;
                return (
                  <div key={step} className={`flex items-center gap-2 text-[9px] mb-1.5 last:mb-0 ${isDone ? "text-green-600" : isActive ? "text-blue-600" : "text-slate-300"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDone ? "bg-green-500" : isActive ? "bg-blue-500 animate-pulse" : "bg-slate-200"}`} />
                    <span>
                      {isDone ? `✓ ${STEP_LABELS[step]}` : isActive
                        ? `${STEP_LABELS[step]}${ingesting.totalChunks > 0 ? ` ${ingesting.currentChunk}/${ingesting.totalChunks}` : "..."}`
                        : STEP_LABELS[step]}
                    </span>
                  </div>
                );
              })}
              {ingesting.currentStep === "failed" && (
                <div className="text-red-500 text-[9px]">✗ {ingesting.error}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <>
          <div className="px-4 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">업로드된 약관</div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-blue-50 border border-blue-100 cursor-pointer hover:border-blue-300 transition-colors">
                <div className="w-7 h-8 bg-blue-100 rounded flex items-center justify-center text-xs flex-shrink-0">📋</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-slate-800 truncate">{doc.filename.replace(".pdf", "")}</p>
                  <p className="text-[9px] text-slate-400">{doc.clauseCount}개 조항</p>
                </div>
                <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[8px] font-bold">✓</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
