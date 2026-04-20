"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, ArrowUp } from "lucide-react";
import { useApp } from "../context/AppContext";
import QueryProgress from "./QueryProgress";

interface ProgressState {
  stepLabel: string;
  progressIndex: number;
  totalSteps: number | null;
}

export default function ChatPanel() {
  const { messages, setMessages, setCitations, selectedDocument } = useApp();
  const [input, setInput] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    stepLabel: "대기 중",
    progressIndex: 0,
    totalSteps: null,
  });
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isInFlight = activeJobId !== null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isInFlight]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // SSE 구독 — 기존 로직 그대로
  useEffect(() => {
    if (!activeJobId) return;
    const es = new EventSource(`/api/query/stream/${activeJobId}`);
    const cleanCloseRef = { current: false };
    const timeout = setTimeout(() => {
      cleanCloseRef.current = true;
      es.close();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.", timestamp: new Date() },
      ]);
      setActiveJobId(null);
    }, 60_000);

    es.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.status === "completed" && data.result) {
        const citations = data.result.citations ?? [];
        cleanCloseRef.current = true;
        clearTimeout(timeout);
        es.close();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.result.answer ?? "답변을 받을 수 없습니다.", citations, timestamp: new Date() },
        ]);
        setCitations(citations);
        setActiveJobId(null);
        return;
      }
      if (data.status === "failed") {
        cleanCloseRef.current = true;
        clearTimeout(timeout);
        es.close();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "오류가 발생했습니다. 잠시 후 다시 시도해주세요.", timestamp: new Date() },
        ]);
        setActiveJobId(null);
        return;
      }
      setProgress({ stepLabel: data.stepLabel ?? "처리 중", progressIndex: data.progressIndex ?? 0, totalSteps: data.totalSteps ?? null });
    };

    es.addEventListener("done", () => {
      cleanCloseRef.current = true;
      clearTimeout(timeout);
      es.close();
      setActiveJobId(null);
    });

    es.onerror = () => {
      if (cleanCloseRef.current) return;
      cleanCloseRef.current = true;
      clearTimeout(timeout);
      es.close();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "연결이 끊어졌습니다. 다시 시도해주세요.", timestamp: new Date() },
      ]);
      setActiveJobId(null);
    };

    return () => {
      cleanCloseRef.current = true;
      clearTimeout(timeout);
      es.close();
    };
  }, [activeJobId, setMessages, setCitations]);

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || isInFlight || !selectedDocument) return;
      setMessages((prev) => [...prev, { role: "user", content: question, timestamp: new Date() }]);
      setInput("");
      setProgress({ stepLabel: "대기 중", progressIndex: 0, totalSteps: null });
      try {
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, documentId: selectedDocument.id }),
        });
        if (res.status === 409) {
          const { jobId } = await res.json();
          setToast("이전 질의가 아직 처리 중입니다");
          setActiveJobId(jobId);
          return;
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: errData.error ?? "오류가 발생했습니다. 잠시 후 다시 시도해주세요.", timestamp: new Date() },
          ]);
          return;
        }
        const { jobId } = await res.json();
        setActiveJobId(jobId);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "네트워크 오류가 발생했습니다.", timestamp: new Date() },
        ]);
      }
    },
    [isInFlight, selectedDocument, setMessages]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!selectedDocument) {
    return (
      <section
        className="flex flex-col items-center justify-center gap-4 text-center min-w-0"
        style={{ background: "var(--bg)" }}
      >
        <div
          className="w-14 h-14 rounded-2xl grid place-items-center"
          style={{ background: "var(--bg-2)" }}
        >
          <Sparkles size={24} style={{ color: "var(--muted)" }} aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold mb-1">약관을 선택해주세요</h2>
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>
            왼쪽 패널에서 약관을 선택하면 대화를 시작할 수 있습니다
          </p>
        </div>
      </section>
    );
  }

  const userCount = messages.filter((m) => m.role === "user").length;
  const citationCount = messages.reduce((acc, m) => acc + (m.citations?.length ?? 0), 0);

  return (
    <section
      className="flex flex-col min-w-0 relative overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {toast && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-xs px-3 py-2 rounded-lg shadow-lg"
          style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
        >
          {toast}
        </div>
      )}

      <div
        className="flex items-center gap-3 px-7 py-3.5"
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h2 className="text-[15px] font-bold tracking-[-0.015em]">
          {selectedDocument.filename.replace(".pdf", "")}
        </h2>
        <div className="ml-auto flex items-center gap-2.5 text-[11px]" style={{ color: "var(--muted)" }}>
          <Chip><b>{userCount}</b> 질의</Chip>
          <Chip><b>{citationCount}</b> 인용</Chip>
          <Chip>Claude Sonnet 4.6</Chip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-9 py-6 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <div
              className="w-14 h-14 rounded-2xl grid place-items-center"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <Sparkles size={24} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold mb-1">약관에 대해 질문해보세요</h2>
              <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                답변마다 조항 번호·페이지·관련도가 함께 표시됩니다
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 max-w-[640px] ${msg.role === "user" ? "self-end" : ""}`}>
              {msg.role === "assistant" && (
                <div
                  className="w-7 h-7 rounded-full grid place-items-center flex-shrink-0"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  <Sparkles size={13} aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0">
                <div
                  className="px-4 py-3 rounded-xl text-[13.5px] leading-[1.7]"
                  style={
                    msg.role === "user"
                      ? { background: "var(--fg)", color: "var(--bg-alt)", border: "1px solid var(--fg)" }
                      : { background: "var(--surface)", color: "var(--fg-2)", border: "1px solid var(--border)" }
                  }
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="mb-2 pl-4 list-disc">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2 pl-4 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
                        strong: ({ children }) => <strong style={{ color: "var(--fg)", fontWeight: 700 }}>{children}</strong>,
                        code: ({ children }) => (
                          <code
                            className="text-xs mono px-1 rounded"
                            style={{ background: "var(--bg-2)" }}
                          >
                            {children}
                          </code>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
                <p
                  className={`text-[10.5px] mt-1 ${msg.role === "user" ? "text-right" : "text-left"}`}
                  style={{ color: "var(--muted)" }}
                >
                  {msg.timestamp.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                    <> · 인용 {msg.citations.length}건</>
                  )}
                </p>
              </div>
              {msg.role === "user" && (
                <div
                  className="w-7 h-7 rounded-full grid place-items-center flex-shrink-0 text-[11px] font-bold"
                  style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
                >
                  나
                </div>
              )}
            </div>
          ))
        )}
        {isInFlight && (
          <QueryProgress
            stepLabel={progress.stepLabel}
            progressIndex={progress.progressIndex}
            totalSteps={progress.totalSteps}
          />
        )}
        <div ref={bottomRef} />
      </div>

      <div
        className="px-7 pt-3.5 pb-4"
        style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}
      >
        <form onSubmit={handleSubmit}>
          <div
            className="flex items-end gap-2.5 rounded-xl px-3.5 py-2.5 transition-colors focus-within:[border-color:var(--accent)]"
            style={{ background: "var(--bg)", border: "1.5px solid var(--border)" }}
          >
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isInFlight ? "답변을 받는 중입니다..." : "약관에 대해 질문해보세요"}
              disabled={isInFlight}
              className="flex-1 bg-transparent outline-none resize-none text-[13.5px] leading-[1.5] min-h-[22px] max-h-[100px] disabled:opacity-50"
              style={{ color: "var(--fg)" }}
            />
            <button
              type="submit"
              disabled={isInFlight || !input.trim()}
              className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 disabled:opacity-40"
              style={{ background: "var(--fg)", color: "var(--bg-alt)" }}
              aria-label="전송"
            >
              <ArrowUp size={14} aria-hidden="true" />
            </button>
          </div>
        </form>
        <div className="mt-2.5 flex items-center gap-3.5 text-[10.5px]" style={{ color: "var(--muted)" }}>
          <span>
            <b style={{ color: "var(--fg-2)", fontWeight: 600 }}>컨텍스트</b>{" "}
            {selectedDocument.filename.replace(".pdf", "")}
          </span>
          <span>•</span>
          <span>근거 없는 답변은 생성되지 않습니다</span>
          <span>•</span>
          <span>⌘ ↵ 전송</span>
        </div>
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="px-2 py-0.5 rounded-md"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </span>
  );
}
