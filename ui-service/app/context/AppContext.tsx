"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";

export interface DocumentMeta {
  id: string;
  filename: string;
  clauseCount: number;
  createdAt: string;
}

export interface IngestingDoc {
  jobId: string;
  filename: string;
  filesize: string;
  progress: number;
  currentStep: "parsing" | "chunking" | "embedding" | "storing" | "done" | "failed";
  currentChunk: number;
  totalChunks: number;
  error?: string;
}

export interface Citation {
  clauseNumber: string;
  clauseTitle: string;
  excerpt: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: Date;
}

interface AppContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  documents: DocumentMeta[];
  setDocuments: React.Dispatch<React.SetStateAction<DocumentMeta[]>>;
  ingesting: IngestingDoc | null;
  setIngesting: React.Dispatch<React.SetStateAction<IngestingDoc | null>>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  citations: Citation[];
  setCitations: React.Dispatch<React.SetStateAction<Citation[]>>;
  activeCitation: number | null;
  setActiveCitation: React.Dispatch<React.SetStateAction<number | null>>;
}

const MESSAGES_KEY = "qa_messages";
const CITATIONS_KEY = "qa_citations";

function loadMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as (Omit<Message, "timestamp"> & { timestamp: string })[];
    return parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function loadCitations(): Citation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CITATIONS_KEY);
    return raw ? (JSON.parse(raw) as Citation[]) : [];
  } catch {
    return [];
  }
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser: User | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [ingesting, setIngesting] = useState<IngestingDoc | null>(null);
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [citations, setCitations] = useState<Citation[]>(loadCitations);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(CITATIONS_KEY, JSON.stringify(citations));
  }, [citations]);

  return (
    <AppContext.Provider
      value={{
        user, setUser,
        documents, setDocuments,
        ingesting, setIngesting,
        messages, setMessages,
        citations, setCitations,
        activeCitation, setActiveCitation,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
