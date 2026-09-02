interface FutureBadgeProps {
  label?: string;
}

export default function FutureBadge({ label = "Futuro" }: FutureBadgeProps) {
  return <span className="future-badge">{label}</span>;
}
