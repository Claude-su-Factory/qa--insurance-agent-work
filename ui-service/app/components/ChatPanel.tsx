"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useApp } from "../context/AppContext";
import QueryProgress from "./QueryProgress";

const SUGGESTED_QUESTIONS = [
  "💊 면책기간이 언제 시작되나요?",
  "🏥 입원 보장 범위가 어떻게 되나요?",
  "💰 보험금 청구 조건을 알려주세요",
];


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

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // SSE 구독
  useEffect(() => {
    if (!activeJobId) return;

    const es = new EventSource(`/api/query/stream/${activeJobId}`);
    const cleanCloseRef = { current: false };
    const timeout = setTimeout(() => {
      cleanCloseRef.current = true;
      es.close();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.",
          timestamp: new Date(),
        },
      ]);
      setActiveJobId(null);
    }, 60_000);

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.status === "completed" && data.result) {
        const citations = data.result.citations ?? [];
        cleanCloseRef.current = true;
        clearTimeout(timeout);
        es.close();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.result.answer ?? "답변을 받을 수 없습니다.",
            citations,
            timestamp: new Date(),
          },
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
          {
            role: "assistant",
            content: "오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
            timestamp: new Date(),
          },
        ]);
        setActiveJobId(null);
        return;
      }

      setProgress({
        stepLabel: data.stepLabel ?? "처리 중",
        progressIndex: data.progressIndex ?? 0,
        totalSteps: data.totalSteps ?? null,
      });
    };

    es.addEventListener("done", () => {
      cleanCloseRef.current = true;
      clearTimeout(timeout);
      es.close();
    });

    es.onerror = () => {
      // 클린 close 후에도 onerror가 fire될 수 있음 → ref로 구분
      if (cleanCloseRef.current) return;
      cleanCloseRef.current = true;
      clearTimeout(timeout);
      es.close();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "연결이 끊어졌습니다. 다시 시도해주세요.",
          timestamp: new Date(),
        },
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

      setMessages((prev) => [
        ...prev,
        { role: "user", content: question, timestamp: new Date() },
      ]);
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
            {
              role: "assistant",
              content: errData.error ?? "오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
              timestamp: new Date(),
            },
          ]);
          return;
        }

        const { jobId } = await res.json();
        setActiveJobId(jobId);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "네트워크 오류가 발생했습니다.",
            timestamp: new Date(),
          },
        ]);
      }
    },
    [isInFlight, selectedDocument, setMessages]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (!selectedDocument) {
    return (
      <div className="flex-1 bg-white flex flex-col items-center justify-center gap-4 text-center min-w-0">
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl">📄</div>
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-1">약관을 선택해주세요</h2>
          <p className="text-[12px] text-slate-400">왼쪽 패널에서 약관을 선택하면 대화를 시작할 수 있습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white flex flex-col min-w-0 relative">
      {/* Toast */}
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-slate-800 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl">💬</div>
            <div>
              <h2 className="text-base font-semibold text-slate-800 mb-1">약관에 대해 질문해보세요</h2>
              <p className="text-[12px] text-slate-400">
                업로드된 약관을 분석하여 정확한 답변을 제공합니다
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={isInFlight}
                  className="text-[11px] px-3 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 hover:text-blue-600 rounded-full text-slate-600 transition-all disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[72%]">
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-slate-50 text-slate-800 border border-slate-200 rounded-bl-sm"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1 first:mt-0">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1 first:mt-0">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>,
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="mb-2 space-y-0.5 pl-4 list-disc">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2 space-y-0.5 pl-4 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        hr: () => <hr className="my-2 border-slate-200" />,
                        blockquote: ({ children }) => <blockquote className="border-l-2 border-blue-300 pl-3 text-slate-600 my-2">{children}</blockquote>,
                        code: ({ children }) => <code className="bg-slate-200 rounded px-1 text-xs font-mono">{children}</code>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
                <p className={`text-[10px] text-slate-400 mt-1 ${msg.role === "user" ? "text-right" : "text-left"}`}>
                  {msg.timestamp.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))
        )}

        {/* 진행 상태 표시 */}
        {isInFlight && (
          <QueryProgress
            stepLabel={progress.stepLabel}
            progressIndex={progress.progressIndex}
            totalSteps={progress.totalSteps}
          />
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="border-t border-slate-100 p-4">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-4 py-2.5 transition-all">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isInFlight ? "답변을 받는 중입니다..." : "약관에 대해 질문해보세요"}
              disabled={isInFlight}
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isInFlight || !input.trim()}
              className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
            >
              <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </form>
        <div className="flex gap-2 mt-2 flex-wrap">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              disabled={isInFlight}
              className="text-[10px] px-2.5 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 hover:text-blue-600 rounded-full text-slate-500 transition-all disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
