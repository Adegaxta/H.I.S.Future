import type { UnsplashApiPhoto, UnsplashSearchResponse } from "./types";

const API_BASE_URL = "https://api.unsplash.com";

export interface UnsplashClientOptions {
  accessKey?: string;
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
}

export interface UnsplashRateLimit {
  limit: number;
  remaining: number;
}

function configuredAccessKey(): string | undefined {
  const value = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function assertPhoto(value: unknown): asserts value is UnsplashApiPhoto {
  if (!value || typeof value !== "object" || typeof (value as UnsplashApiPhoto).id !== "string") {
    throw new Error("Invalid Unsplash photo response");
  }
}

export function createUnsplashClient(options: UnsplashClientOptions = {}) {
  const accessKey = options.accessKey?.trim() || configuredAccessKey();
  const fetcher = options.fetcher || fetch;
  const apiBaseUrl = options.apiBaseUrl || API_BASE_URL;
  let rateLimit: UnsplashRateLimit | null = null;

  const request = async <T>(urlOrPath: string): Promise<T> => {
    if (!accessKey) throw new Error("Unsplash Access Key is not configured");
    const url = /^https?:\/\//.test(urlOrPath) ? urlOrPath : `${apiBaseUrl}${urlOrPath}`;
    const response = await fetcher(url, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
    });
    const limit = Number(response.headers?.get("x-ratelimit-limit"));
    const remaining = Number(response.headers?.get("x-ratelimit-remaining"));
    if (Number.isFinite(limit) && Number.isFinite(remaining)) rateLimit = { limit, remaining };
    if (!response.ok) throw new Error(`Unsplash request failed: ${response.status}`);
    return await response.json() as T;
  };

  return {
    getRateLimit(): UnsplashRateLimit | null {
      return rateLimit;
    },

    async searchPhotos(query: string, page = 1, perPage = 12): Promise<UnsplashSearchResponse> {
      const params = new URLSearchParams({ query: query.trim(), page: String(page), per_page: String(perPage) });
      const result = await request<UnsplashSearchResponse>(`/search/photos?${params}`);
      if (!result || !Array.isArray(result.results)) throw new Error("Invalid Unsplash search response");
      result.results.forEach(assertPhoto);
      return result;
    },

    async getRandomPhotos(count = 12): Promise<UnsplashApiPhoto[]> {
      const params = new URLSearchParams({ count: String(count) });
      const result = await request<UnsplashApiPhoto[]>(`/photos/random?${params}`);
      if (!Array.isArray(result)) throw new Error("Invalid Unsplash random response");
      result.forEach(assertPhoto);
      return result;
    },

    async trackDownload(downloadLocation: string): Promise<void> {
      await request<unknown>(downloadLocation);
    },
  };
}