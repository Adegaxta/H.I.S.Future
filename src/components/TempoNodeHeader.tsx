import type { NodeItem } from "../types/nodes";
import { getNodeDefinition, getNodeDisplayLabel } from "../defs/nodeTypes";
import { formatTempoTime, getTempoMeta, setTempoMeta, type TimeFormat } from "../utils/temporalMeta";

interface TempoNodeHeaderProps {
  node: NodeItem;
  onContentChange: (id: string, content: string) => void;
  timeFormat: TimeFormat;
}

export default function TempoNodeHeader({ node, onContentChange, timeFormat }: TempoNodeHeaderProps) {
  const meta = getTempoMeta(node.content);
  const formattedTime = formatTempoTime(meta, timeFormat);
  const update = (next: typeof meta) => {
    onContentChange(node.id, setTempoMeta(node.content, next));
  };

  return (
    <header className="tempo-node-header">
      <h1>{node.name}</h1>
      {formattedTime && <div className="tempo-node-header__time">{formattedTime}</div>}
      <div className="tempo-node-header__type" style={{ color: getNodeDefinition("tempo").color }}>
        {getNodeDisplayLabel("tempo")}
      </div>
      <div className="tempo-node-header__fields">
        <label>
          Fecha
          <input
            type="date"
            required
            value={meta.date}
            onChange={(event) => {
              if (event.target.value) update({ ...meta, date: event.target.value });
            }}
          />
        </label>
        <label>
          Hora inicial
          <input
            type="time"
            value={meta.startTime ?? ""}
            onChange={(event) => update({ ...meta, startTime: event.target.value || null })}
          />
        </label>
        <label>
          Hora final
          <input
            type="time"
            value={meta.endTime ?? ""}
            onChange={(event) => update({ ...meta, endTime: event.target.value || null })}
          />
        </label>
        {!meta.startTime && !meta.endTime && (
          <span className="tempo-node-header__all-day">Asociado al día completo</span>
        )}
      </div>
    </header>
  );
}
