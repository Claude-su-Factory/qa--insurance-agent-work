"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Upload, FolderOpen, FileText, Check } from "lucide-react";
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
  const { documents, setDocuments, ingesting, setIngesting, selectedDocument, selectDocument } = useApp();
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // 초기 로드
  useEffect(() => {
    async function loadDocuments() {
      const { data } = await supabase
        .from("documents")
        .select("id, filename, chunk_count, created_at, status")
        .eq("status", "ready")
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

  // polling
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
          .select("id, filename, chunk_count, created_at, status")
          .eq("status", "ready")
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
          const newDoc = docs.find((d: { filename: string }) => d.filename === ingesting.filename);
          if (newDoc) {
            selectDocument({
              id: newDoc.id,
              filename: newDoc.filename,
              clauseCount: newDoc.chunk_count,
              createdAt: newDoc.created_at,
            });
          }
        }
        setTimeout(() => setIngesting(null), 2000);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [ingesting?.jobId, ingesting?.currentStep, ingesting?.filename, setIngesting, setDocuments, selectDocument]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        alert("PDF 파일만 업로드 가능합니다.");
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: formData });
      if (res.status === 409) {
        alert("이미 관리 중인 약관입니다.");
        return;
      }
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
    <aside className="flex flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      <div className="px-4.5 pt-4 pb-2.5 flex items-center gap-2">
        <span
          className="text-xs font-bold tracking-[0.1em] uppercase"
          style={{ color: "var(--muted)" }}
        >
          내 약관
        </span>
        <span
          className="ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: "var(--bg-2)", color: "var(--muted)" }}
        >
          {documents.length}
        </span>
      </div>
      {/* Uploader */}
      <div className="mx-3.5 mb-3.5">
        <div
          className={`rounded-[10px] p-4 text-center cursor-pointer ${
            isDragOver ? "ring-2 ring-offset-0" : ""
          }`}
          style={{
            background: "var(--surface)",
            border: `1.5px dashed ${isDragOver ? "var(--accent)" : "var(--border-2)"}`,
          }}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <div
            className="w-7 h-7 rounded-lg grid place-items-center mx-auto mb-2.5"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Upload size={14} aria-hidden="true" />
          </div>
          <div className="text-[12.5px] font-semibold mb-1">새 PDF 업로드</div>
          <div className="text-[11px] mb-2.5" style={{ color: "var(--muted)" }}>
            드래그 · 최대 30MB
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-3.5 py-1.5 rounded-md"
            style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
          >
            <FolderOpen size={12} aria-hidden="true" />
            파일 선택
          </span>
          <input ref={inputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
        </div>
      </div>

      {/* ingesting progress */}
      {ingesting && (
        <div
          className="mx-3.5 mb-3.5 rounded-xl p-3"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2 mb-2.5">
            <FileText size={14} style={{ color: "var(--muted)" }} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold truncate">{ingesting.filename}</p>
              <p className="text-[9px]" style={{ color: "var(--muted)" }}>
                {ingesting.filesize}
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <CircleProgress
              progress={ingesting.progress}
              label={ingesting.currentStep === "done" ? "완료" : "처리중"}
            />
            <div
              className="flex-1 rounded-lg p-2 mono"
              style={{ background: "var(--bg-2)" }}
            >
              {STEPS.map((step) => {
                const stepIndex = STEPS.indexOf(step);
                const currentIndex = STEPS.indexOf(ingesting.currentStep as typeof STEPS[number]);
                const isDone = stepIndex < currentIndex || ingesting.currentStep === "done";
                const isActive = step === ingesting.currentStep;
                const color = isDone ? "var(--good)" : isActive ? "var(--accent)" : "var(--muted)";
                return (
                  <div key={step} className="flex items-center gap-2 text-[9px] mb-1.5 last:mb-0" style={{ color }}>
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "animate-pulse" : ""}`}
                      style={{ background: color }}
                    />
                    <span>
                      {isDone
                        ? `✓ ${STEP_LABELS[step]}`
                        : isActive
                        ? `${STEP_LABELS[step]}${ingesting.totalChunks > 0 ? ` ${ingesting.currentChunk}/${ingesting.totalChunks}` : "..."}`
                        : STEP_LABELS[step]}
                    </span>
                  </div>
                );
              })}
              {ingesting.currentStep === "failed" && (
                <div className="text-[9px]" style={{ color: "#EF4444" }}>
                  ✗ {ingesting.error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className="px-4.5 py-1.5 text-[10.5px] font-bold tracking-[0.12em] uppercase"
        style={{ color: "var(--muted)" }}
      >
        업로드됨
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 pb-3.5">
        {documents.map((doc) => {
          const isActive = selectedDocument?.id === doc.id;
          return (
            <div
              key={doc.id}
              onClick={() => selectDocument(doc)}
              className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg cursor-pointer mb-0.5"
              style={{
                background: isActive ? "var(--accent-soft)" : "transparent",
              }}
            >
              <div
                className="w-7 h-8 rounded grid place-items-center flex-shrink-0"
                style={{
                  background: isActive ? "var(--accent)" : "var(--surface)",
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                  color: isActive ? "#fff" : "var(--muted)",
                }}
              >
                <FileText size={13} aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-[12.5px] font-semibold truncate tracking-[-0.005em]"
                  style={{ color: isActive ? "var(--accent)" : "var(--fg)" }}
                >
                  {doc.filename.replace(".pdf", "")}
                </div>
                <div className="text-[10.5px]" style={{ color: "var(--muted)" }}>
                  {doc.clauseCount} 조항
                </div>
              </div>
              <Check size={12} style={{ color: "var(--good)" }} aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
