import { Annotation } from "@langchain/langgraph";

export interface Clause {
  id: string;
  clauseNumber: string;
  clauseTitle: string;
  content: string;
  documentName: string;
  score: number;
}

export interface Citation {
  clauseNumber: string;
  clauseTitle: string;
  excerpt: string;
}

export type QuestionType = "coverage" | "claim_eligibility" | "general";

export const AgentState = Annotation.Root({
  question: Annotation<string>(),
  userId: Annotation<string>(),
  sessionId: Annotation<string>(),
  documentId: Annotation<string>(),
  questionType: Annotation<QuestionType>({
    reducer: (_, next) => next,
    default: () => "general",
  }),
  retrievedClauses: Annotation<Clause[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  toolResults: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  answer: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  citations: Annotation<Citation[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
});
