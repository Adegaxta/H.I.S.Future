import packageIcon from "../assets/third-party/Lucide.dev/icons/package.svg";
import type { AIModelDescriptor } from "./types";

export function AIModelBadge({ model }: { model: AIModelDescriptor }) {
  return (
    <span className="ai-model-badge" aria-label={`${model.family} ${model.size} ${model.quantization} ${model.variant}`}>
      <img src={packageIcon} alt="" />
      <span>{model.family}</span>
      <span>{model.size}</span>
      <span>{model.quantization}</span>
      <span>{model.variant}</span>
    </span>
  );
}
