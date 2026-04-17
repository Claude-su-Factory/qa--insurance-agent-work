"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../lib/supabase/client";

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
  selectedDocument: DocumentMeta | null;
  selectDocument: (doc: DocumentMeta | null) => void;
  ingesting: IngestingDoc | null;
  setIngesting: React.Dispatch<React.SetStateAction<IngestingDoc | null>>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  citations: Citation[];
  setCitations: React.Dispatch<React.SetStateAction<Citation[]>>;
  activeCitation: number | null;
  setActiveCitation: React.Dispatch<React.SetStateAction<number | null>>;
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
  const [selectedDocument, setSelectedDocument] = useState<DocumentMeta | null>(null);
  const [ingesting, setIngesting] = useState<IngestingDoc | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const selectDocument = useCallback(async (doc: DocumentMeta | null) => {
    setSelectedDocument(doc);
    setMessages([]);
    setCitations([]);
    setActiveCitation(null);

    if (!doc) return;

    const { data } = await supabase
      .from("messages")
      .select("id, role, content, citations, created_at")
      .eq("document_id", doc.id)
      .order("created_at", { ascending: true });

    if (data) {
      const loaded = data.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        citations: m.citations as Citation[] | undefined,
        timestamp: new Date(m.created_at),
      }));
      setMessages(loaded);

      const lastAssistant = [...loaded].reverse().find((m) => m.role === "assistant");
      if (lastAssistant?.citations && lastAssistant.citations.length > 0) {
        setCitations(lastAssistant.citations);
      }
    }
  }, [supabase]);

  return (
    <AppContext.Provider
      value={{
        user, setUser,
        documents, setDocuments,
        selectedDocument, selectDocument,
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
