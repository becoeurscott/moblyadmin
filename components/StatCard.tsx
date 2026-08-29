interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  accent?: "primary" | "accent" | "success" | "danger" | "warning";
}

const accentClasses = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
} as const;

export default function StatCard({
  label,
  value,
  delta,
  accent = "primary",
}: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-border/50">
      <p className="text-sm text-text mb-1">{label}</p>
      <p className="text-2xl font-bold text-dark">{value}</p>
      {delta && (
        <span
          className={`inline-block text-xs font-medium mt-2 px-2 py-0.5 rounded-full ${accentClasses[accent]}`}
        >
          {delta}
        </span>
      )}
    </div>
  );
}
