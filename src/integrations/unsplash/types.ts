import type { ImageProvenance } from "../../utils/imageResource";

export interface UnsplashApiPhoto {
  id: string;
  width: number;
  height: number;
  description: string | null;
  alt_description: string | null;
  user: {
    name: string;
    username: string;
    portfolio_url: string | null;
    instagram_username: string | null;
    twitter_username: string | null;
    links: { html: string };
  };
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  links: {
    html: string;
    download: string;
    download_location: string;
  };
}

export interface UnsplashSearchResponse {
  total: number;
  total_pages: number;
  results: UnsplashApiPhoto[];
}

export interface UnsplashImageSelection {
  src: string;
  fileName: string;
  description: string;
  width: number;
  height: number;
  provenance: ImageProvenance;
}