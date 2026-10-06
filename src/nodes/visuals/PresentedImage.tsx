import { useLayoutEffect, useRef, useState } from "react";
import { imagePresentationGeometry, type ImagePresentation } from "../../utils/imagePresentation";
import "./imagePresentation.css";

/** The same geometry as the framing editor; the source is never rewritten. */
export function PresentedImage({ src, presentation, className = "", label = "", decorative = true }: { src: string; presentation: ImagePresentation; className?: string; label?: string; decorative?: boolean }) {
  const frame = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = frame.current!;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const geometry = natural.width && size.width ? imagePresentationGeometry(natural.width, natural.height, size.width, size.height, presentation) : null;
  return <span ref={frame} className={`his-presented-image ${className}`} aria-hidden={decorative || undefined}>
    <img src={src} alt={decorative ? "" : label} onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} style={geometry ? { width: geometry.width, height: geometry.height, left: geometry.left, top: geometry.top } : { width: "100%", height: "100%", objectFit: "cover" }} />
  </span>;
}
