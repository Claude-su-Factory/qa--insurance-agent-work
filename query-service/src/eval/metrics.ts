import Anthropic from "@anthropic-ai/sdk";
import type { VoyageClient } from "../clients/voyage.js";
import type {
  MetricScores,
  RetrievedClauseSnapshot,
} from "./types.js";

const JUDGE_MODEL = "claude-haiku-4-5-20251001";
const QUESTION_GEN_COUNT = 3;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

function extractJsonArray(text: string): unknown[] | null {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clauseContextBlock(clauses: RetrievedClauseSnapshot[]): string {
  return clauses
    .map(
      (c, i) => `[${i + 1}] (${c.clauseNumber}) ${c.clauseTitle}`
    )
    .join("\n");
}

async function decomposeAnswer(
  anthropic: Anthropic,
  answer: string
): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 1024,
    system: `당신은 텍스트를 독립적인 사실 주장(claim)으로 분해하는 도우미입니다.
반드시 JSON 배열로만 응답하세요. 예: ["주장1", "주장2"]`,
    messages: [
      {
        role: "user",
        content: `다음 답변을 주장 리스트로 분해하세요.\n\n답변: ${answer}`,
      },
    ],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  const arr = extractJsonArray(text);
  if (!arr) return [answer];
  return arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export async function computeFaithfulness(
  anthropic: Anthropic,
  answer: string,
  clauses: RetrievedClauseSnapshot[]
): Promise<number> {
  if (!answer.trim() || clauses.length === 0) return 0;
  const claims = await decomposeAnswer(anthropic, answer);
  if (claims.length === 0) return 0;

  const ctx = clauseContextBlock(clauses);

  const judgements: number[] = await Promise.all(
    claims.map(async (claim): Promise<number> => {
      try {
        const response = await anthropic.messages.create({
          model: JUDGE_MODEL,
          max_tokens: 10,
          system: `주장이 주어진 조항들에서 직접 도출되는지 판정합니다. "YES" 또는 "NO"만 답하세요.`,
          messages: [
            {
              role: "user",
              content: `조항:\n${ctx}\n\n주장: ${claim}\n\n지지되는가? (YES/NO):`,
            },
          ],
        });
        const text =
          response.content[0].type === "text"
            ? response.content[0].text.trim().toUpperCase()
            : "NO";
        return text.startsWith("Y") ? 1 : 0;
      } catch {
        return 0;
      }
    })
  );

  const supported = judgements.reduce((a: number, b: number) => a + b, 0);
  return supported / claims.length;
}

export async function computeAnswerRelevance(
  anthropic: Anthropic,
  voyage: VoyageClient,
  question: string,
  answer: string
): Promise<number> {
  if (!answer.trim()) return 0;

  const generated: string[] = [];
  for (let i = 0; i < QUESTION_GEN_COUNT; i++) {
    try {
      const response = await anthropic.messages.create({
        model: JUDGE_MODEL,
        max_tokens: 200,
        system: `주어진 답변을 보고 그 답변이 나오게 한 질문을 역으로 생성합니다. 한국어 질문 하나만 출력하세요.`,
        messages: [
          {
            role: "user",
            content: `답변: ${answer}\n\n이 답변이 나오게 한 질문은?`,
          },
        ],
      });
      const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
      if (text) generated.push(text);
    } catch {
      // skip
    }
  }

  if (generated.length === 0) return 0;

  const embeddings = await voyage.embed([question, ...generated]);
  const originalEmb = embeddings[0];
  const similarities = generated.map((_, i) => cosineSimilarity(originalEmb, embeddings[i + 1]));
  return similarities.reduce((a, b) => a + b, 0) / similarities.length;
}

export async function computeContextPrecision(
  anthropic: Anthropic,
  question: string,
  answer: string,
  clauses: RetrievedClauseSnapshot[]
): Promise<number> {
  if (clauses.length === 0) return 0;

  const relevances = await Promise.all(
    clauses.map(async (clause): Promise<number> => {
      try {
        const response = await anthropic.messages.create({
          model: JUDGE_MODEL,
          max_tokens: 10,
          system: `조항이 질문/답변에 직접 필요한 정보를 담고 있는지 판정합니다. "YES" 또는 "NO"만 답하세요.`,
          messages: [
            {
              role: "user",
              content: `질문: ${question}\n답변: ${answer}\n\n조항 (${clause.clauseNumber}) ${clause.clauseTitle}\n\n필요한가? (YES/NO):`,
            },
          ],
        });
        const text =
          response.content[0].type === "text"
            ? response.content[0].text.trim().toUpperCase()
            : "NO";
        return text.startsWith("Y") ? 1 : 0;
      } catch {
        return 0;
      }
    })
  );

  let runningRelevant = 0;
  let sumPrecision = 0;
  let anyRelevant = 0;
  for (let i = 0; i < relevances.length; i++) {
    if (relevances[i] === 1) {
      runningRelevant += 1;
      sumPrecision += runningRelevant / (i + 1);
      anyRelevant += 1;
    }
  }
  if (anyRelevant === 0) return 0;
  return sumPrecision / anyRelevant;
}

/**
 * Answer Consistency — 현재 답변 vs baseline 답변 임베딩 유사도.
 * snapshot testing 성격. drift를 잡기 위한 메트릭.
 */
export async function computeAnswerConsistency(
  voyage: VoyageClient,
  currentAnswer: string,
  baselineAnswer: string
): Promise<number> {
  if (!currentAnswer.trim() || !baselineAnswer.trim()) return 0;
  const embeddings = await voyage.embed([currentAnswer, baselineAnswer]);
  return cosineSimilarity(embeddings[0], embeddings[1]);
}

/**
 * Citation Stability — 현재 검색 조항과 baseline 검색 조항의 Jaccard 유사도.
 * key는 "clauseNumber + clauseTitle" 소문자 조합.
 */
export function computeCitationStability(
  currentClauses: RetrievedClauseSnapshot[],
  baselineClauses: RetrievedClauseSnapshot[]
): number {
  if (currentClauses.length === 0 && baselineClauses.length === 0) return 1;
  if (currentClauses.length === 0 || baselineClauses.length === 0) return 0;

  const key = (c: RetrievedClauseSnapshot) =>
    `${c.clauseNumber}::${c.clauseTitle}`.toLowerCase().trim();

  const currentSet = new Set(currentClauses.map(key));
  const baselineSet = new Set(baselineClauses.map(key));

  let intersection = 0;
  for (const k of currentSet) {
    if (baselineSet.has(k)) intersection += 1;
  }
  const union = new Set([...currentSet, ...baselineSet]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface ComputeMetricsInput {
  question: string;
  currentAnswer: string;
  currentRetrievedClauses: RetrievedClauseSnapshot[];
  baselineAnswer: string;
  baselineRetrievedClauses: RetrievedClauseSnapshot[];
}

export async function computeAllMetrics(
  anthropic: Anthropic,
  voyage: VoyageClient,
  input: ComputeMetricsInput
): Promise<MetricScores> {
  const [faithfulness, answer_relevance, context_precision, answer_consistency] =
    await Promise.all([
      computeFaithfulness(anthropic, input.currentAnswer, input.currentRetrievedClauses),
      computeAnswerRelevance(anthropic, voyage, input.question, input.currentAnswer),
      computeContextPrecision(
        anthropic,
        input.question,
        input.currentAnswer,
        input.currentRetrievedClauses
      ),
      computeAnswerConsistency(voyage, input.currentAnswer, input.baselineAnswer),
    ]);

  const citation_stability = computeCitationStability(
    input.currentRetrievedClauses,
    input.baselineRetrievedClauses
  );

  return {
    faithfulness,
    answer_relevance,
    context_precision,
    answer_consistency,
    citation_stability,
  };
}
