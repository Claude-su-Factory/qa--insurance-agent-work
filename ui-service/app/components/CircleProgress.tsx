interface Props {
  progress: number; // 0~100
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export default function CircleProgress({
  progress,
  size = 52,
  strokeWidth = 5,
  label,
}: Props) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (progress / 100) * circumference;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center} cy={center} r={r}
          fill="none" stroke="#dbeafe" strokeWidth={strokeWidth}
        />
        <circle
          cx={center} cy={center} r={r}
          fill="none" stroke="#2563eb" strokeWidth={strokeWidth}
          strokeDasharray={`${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
        <text
          x={center} y={center + 4}
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="#1e293b"
        >
          {progress}%
        </text>
      </svg>
      {label && <span className="text-[9px] text-slate-500">{label}</span>}
    </div>
  );
}
