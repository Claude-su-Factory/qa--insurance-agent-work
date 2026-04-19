export type EvalCategory = "coverage" | "claim_eligibility" | "general";

export interface Citation {
  clauseNumber: string;
  clauseTitle: string;
  excerpt: string;
}

export interface RetrievedClauseSnapshot {
  clauseNumber: string;
  clauseTitle: string;
  score: number;
}

export interface MetricScores {
  faithfulness: number;
  answer_relevance: number;
  context_precision: number;
  answer_consistency: number;
  citation_stability: number;
}

export const ZERO_SCORES: MetricScores = {
  faithfulness: 0,
  answer_relevance: 0,
  context_precision: 0,
  answer_consistency: 0,
  citation_stability: 0,
};

export const METRIC_KEYS: (keyof MetricScores)[] = [
  "faithfulness",
  "answer_relevance",
  "context_precision",
  "answer_consistency",
  "citation_stability",
];

export interface EvalSnapshotRow {
  id: string;
  question_hash: string;
  question: string;
  user_id: string;
  document_id: string;
  category: EvalCategory;
  baseline_answer: string;
  baseline_citations: Citation[];
  baseline_retrieved_clauses: RetrievedClauseSnapshot[];
  baseline_grader_score: number;
  source_trace_id: string | null;
  created_at: string;
}

export interface EvalSnapshotInsert {
  question_hash: string;
  question: string;
  user_id: string;
  document_id: string;
  category: EvalCategory;
  baseline_answer: string;
  baseline_citations: Citation[];
  baseline_retrieved_clauses: RetrievedClauseSnapshot[];
  baseline_grader_score: number;
  source_trace_id: string | null;
}

export interface EvalRunRow {
  id: string;
  run_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "failed";
  dataset_size: number;
  aggregate: MetricScores | null;
  by_category: Partial<Record<EvalCategory, MetricScores>> | null;
  has_regression: boolean;
  error: string | null;
}

export interface EvalRunItemInsert {
  run_id: string;
  snapshot_id: string;
  answer: string | null;
  retrieved_clauses: RetrievedClauseSnapshot[] | null;
  scores: MetricScores;
  error: string | null;
}

export interface EvalBaselineRow {
  id: string;
  run_id: string;
  aggregate: MetricScores;
  by_category: Partial<Record<EvalCategory, MetricScores>>;
  approved_at: string;
  approved_by: "auto" | "manual";
}
