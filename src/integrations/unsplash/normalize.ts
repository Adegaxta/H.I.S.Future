import type { ImageProvenance } from "../../utils/imageResource";
import type { UnsplashApiPhoto, UnsplashImageSelection } from "./types";

const UNSPLASH_HOSTS = new Set(["unsplash.com", "www.unsplash.com", "api.unsplash.com", "images.unsplash.com"]);

function requireUrl(value: string, label: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || !UNSPLASH_HOSTS.has(url.hostname)) {
    throw new Error(`Invalid Unsplash ${label} URL`);
  }
  return url.toString();
}

function withAttribution(value: string, appName: string): string {
  const url = new URL(value);
  url.searchParams.set("utm_source", appName || "hisfuture");
  url.searchParams.set("utm_medium", "referral");
  return url.toString();
}

function optionalUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function toUnsplashImageSelection(photo: UnsplashApiPhoto, appName = "hisfuture"): UnsplashImageSelection {
  const src = requireUrl(photo.urls.regular, "image");
  const resourceUrl = withAttribution(requireUrl(photo.links.html, "photo"), appName);
  const creatorUrl = withAttribution(requireUrl(photo.user.links.html, "creator"), appName);
  const providerUrl = withAttribution("https://unsplash.com/", appName);
  const portfolioUrl = optionalUrl(photo.user.portfolio_url);
  const provenance: ImageProvenance = {
    provider: "unsplash",
    resourceId: photo.id,
    resourceUrl,
    providerUrl,
    creatorName: photo.user.name,
    creatorUrl,
    downloadLocation: requireUrl(photo.links.download_location, "download"),
    ...(portfolioUrl ? { creatorPortfolioUrl: portfolioUrl } : {}),
    ...(photo.user.instagram_username ? { creatorInstagramUrl: `https://www.instagram.com/${encodeURIComponent(photo.user.instagram_username)}/` } : {}),
    ...(photo.user.twitter_username ? { creatorTwitterUrl: `https://twitter.com/${encodeURIComponent(photo.user.twitter_username)}` } : {}),
  };
  return {
    src,
    fileName: `unsplash-${photo.id}.jpg`,
    description: photo.alt_description || photo.description || `Unsplash photo by ${photo.user.name}`,
    width: photo.width,
    height: photo.height,
    provenance,
  };
}

export function addAttributionParams(value: string, appName = "hisfuture"): string {
  return withAttribution(value, appName);
}