import type { Clause } from "../state.js";

export function checkExclusionClause(clauses: Clause[], condition: string): boolean {
  const exclusionClauses = clauses.filter(
    (c) => c.clauseTitle.includes("면책") || c.clauseTitle.includes("제외")
  );
  return exclusionClauses.some((c) => c.content.includes(condition));
}
