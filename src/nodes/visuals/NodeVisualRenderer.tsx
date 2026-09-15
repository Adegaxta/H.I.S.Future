import { lazy, Suspense } from "react";
import type { IconName } from "lucide-react/dynamic.mjs";
import "@material-symbols/font-400/rounded.css";
import "./visualFonts.css";
import type { ResolvedNodeVisual } from "./types";

const DynamicLucideIcon = lazy(() => import("lucide-react/dynamic.mjs").then((module) => ({ default: module.DynamicIcon })));

interface NodeVisualRendererProps {
  visual: ResolvedNodeVisual;
  className?: string;
  label?: string;
  decorative?: boolean;
}

export function NodeVisualRenderer({ visual, className = "", label = "", decorative = true }: NodeVisualRendererProps) {
  const accessibility = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": label };
  if (visual.kind === "image") {
    return <img className={className} src={visual.src} alt={decorative ? "" : label} aria-hidden={decorative || undefined} />;
  }
  if (visual.kind === "emoji") {
    return <span {...accessibility} className={`node-visual node-visual--emoji node-visual--${visual.style} ${className}`}>{visual.value}</span>;
  }
  if (visual.provider === "material-symbols") {
    return <span {...accessibility} className={`material-symbols-rounded node-visual node-visual--material-symbols ${className}`}>{visual.name}</span>;
  }
  return (
    <Suspense fallback={<span {...accessibility} className={`node-visual node-visual--lucide ${className}`} />}>
      <DynamicLucideIcon {...accessibility} className={`node-visual node-visual--lucide ${className}`} name={visual.name as IconName} />
    </Suspense>
  );
}
