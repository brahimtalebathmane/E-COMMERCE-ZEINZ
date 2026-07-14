import { STATUS_HUE_CLASSES, type StatusHue } from "./status-colors";

type Props = {
  label: string;
  value: number;
  hue: StatusHue;
};

export function AdminMetricPill({ label, value, hue }: Props) {
  const colors = STATUS_HUE_CLASSES[hue];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${colors.pill}`}
    >
      <span className="tabular-nums" dir="ltr">
        {value}
      </span>
      <span className="font-medium opacity-85">{label}</span>
    </span>
  );
}
