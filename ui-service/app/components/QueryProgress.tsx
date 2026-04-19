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
      <div className="max-w-[72%] w-full bg-slate-50 border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-medium text-slate-700">{stepLabel}</span>
          {hasDeterminate && (
            <span className="text-[11px] text-slate-400 font-mono">
              {progressIndex}/{totalSteps}
            </span>
          )}
        </div>

        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          {hasDeterminate ? (
            <div
              className="h-full bg-blue-500 transition-all duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="h-full w-1/3 bg-blue-500 rounded-full animate-progress-indeterminate" />
          )}
        </div>
      </div>
    </div>
  );
}
