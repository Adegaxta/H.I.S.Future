export type VideoSource =
  | { kind: "empty" }
  | { kind: "direct"; url: string; extension: string }
  | { kind: "embed"; url: string; provider: "youtube" | "vimeo" }
  | { kind: "external"; url: string };

export function resolveVideoSource(value: string): VideoSource {
  const source = value.trim();
  if (!source) return { kind: "empty" };
  let url: URL;
  try { url = new URL(source); } catch { return { kind: "external", url: source }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "external", url: source };
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? { kind: "embed", provider: "youtube", url: `https://www.youtube.com/embed/${encodeURIComponent(id)}` } : { kind: "external", url: source };
  }
  if (host.endsWith("youtube.com")) {
    const id = url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : url.searchParams.get("v");
    return id ? { kind: "embed", provider: "youtube", url: `https://www.youtube.com/embed/${encodeURIComponent(id)}` } : { kind: "external", url: source };
  }
  if (host === "vimeo.com" || host.endsWith("player.vimeo.com")) {
    const segments = url.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 1];
    return id && /^\d+$/.test(id) ? { kind: "embed", provider: "vimeo", url: `https://player.vimeo.com/video/${id}` } : { kind: "external", url: source };
  }
  const extension = /\.([a-z0-9]{2,5})$/i.exec(url.pathname)?.[1]?.toLowerCase() ?? "";
  if (["mp4", "webm", "ogg", "ogv", "mov", "m4v"].includes(extension)) return { kind: "direct", url: source, extension };
  return { kind: "external", url: source };
}
