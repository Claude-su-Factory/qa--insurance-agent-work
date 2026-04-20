import { Loader2 } from "lucide-react";

interface Props {
  stepLabel: string;
  progressIndex: number;
  totalSteps: number | null;
}

export default function QueryProgress({ stepLabel, progressIndex, totalSteps }: Props) {
  const hasDeterminate = totalSteps !== null && totalSteps > 0;
  const pct = hasDeterminate ? Math.min(100, (progressIndex / totalSteps!) * 100) : null;

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[340px] w-full rounded-xl px-3.5 py-2.5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
            <Loader2 size={12} className="animate-spin" style={{ color: "var(--accent)" }} aria-label="Loading" />
            {stepLabel}
          </span>
          {hasDeterminate && (
            <span className="text-[10.5px] mono" style={{ color: "var(--muted)" }}>
              STEP {progressIndex}/{totalSteps}
            </span>
          )}
        </div>
        <div className="h-[3px] rounded overflow-hidden" style={{ background: "var(--bg-2)" }}>
          {hasDeterminate ? (
            <div
              className="h-full transition-all duration-300 ease-out"
              style={{ background: "var(--accent)", width: `${pct}%` }}
            />
          ) : (
            <div
              className="h-full w-1/3 animate-progress-indeterminate"
              style={{ background: "var(--accent)" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
