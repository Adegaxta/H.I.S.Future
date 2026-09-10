import assert from "node:assert/strict";
import { createServer } from "vite";

let currentImage;
globalThis.document = {
  createElement() {
    const image = { dataset: {}, source: "", altText: "" };
    Object.defineProperties(image, {
      src: { set(value) { image.source = value; } },
      alt: { set(value) { image.altText = value; } },
      outerHTML: { get() {
        currentImage = image;
        return `<img src="${image.source}" alt="${image.altText}">`;
      } },
    });
    return image;
  },
};
globalThis.DOMParser = class {
  parseFromString() {
    return {
      querySelector() {
        if (!currentImage) return null;
        return {
          dataset: currentImage.dataset,
          getAttribute(name) {
            return name === "src" ? currentImage.source : null;
          },
        };
      },
    };
  }
};

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});
try {
  const resources = await server.ssrLoadModule("/src/utils/imageResource.ts");
  const normalize = await server.ssrLoadModule("/src/integrations/unsplash/normalize.ts");
  const clientModule = await server.ssrLoadModule("/src/integrations/unsplash/client.ts");
  const photo = {
    id: "abc123",
    width: 1600,
    height: 1000,
    description: "A quiet room",
    alt_description: "a quiet room with a window",
    user: {
      name: "Ada Example",
      username: "ada",
      portfolio_url: "https://ada.example/",
      instagram_username: "ada",
      twitter_username: "ada",
      links: { html: "https://unsplash.com/@ada" },
    },
    urls: {
      raw: "https://images.unsplash.com/photo-abc?ixid=keep-me",
      full: "https://images.unsplash.com/photo-abc?ixid=keep-me&fm=jpg",
      regular: "https://images.unsplash.com/photo-abc?ixid=keep-me&fm=jpg&w=1080",
      small: "https://images.unsplash.com/photo-abc?ixid=keep-me&w=400",
      thumb: "https://images.unsplash.com/photo-abc?ixid=keep-me&w=200",
    },
    links: {
      html: "https://unsplash.com/photos/abc123",
      download: "https://unsplash.com/photos/abc123/download",
      download_location: "https://api.unsplash.com/photos/abc123/download?ixid=keep-me",
    },
  };
  const selection = normalize.toUnsplashImageSelection(photo, "hisfuture-test");
  assert.equal(selection.src, photo.urls.regular);
  assert.equal(selection.provenance.downloadLocation, photo.links.download_location);
  assert.match(selection.provenance.resourceUrl, /utm_source=hisfuture-test/);
  assert.match(selection.provenance.creatorUrl, /utm_medium=referral/);
  assert.equal(selection.provenance.resourceUrl.includes("download"), false);

  const content = resources.createImageContent(selection.src, selection.fileName, null, null, selection.description, selection.provenance);
  const parsed = resources.getImageResourceInfo(content, "fallback.jpg");
  assert.equal(parsed.provenance.resourceId, "abc123");
  assert.equal(parsed.fileSize, null);
  assert.equal(parsed.src, selection.src);

  const calls = [];
  const client = clientModule.createUnsplashClient({ accessKey: "test-key", apiBaseUrl: "https://api.test", fetcher: async (url, init) => {
    calls.push({ url, init });
    const headers = { get(name) { return name.toLowerCase() === "x-ratelimit-limit" ? "50" : name.toLowerCase() === "x-ratelimit-remaining" ? "49" : null; } };
    if (url.includes("/photos/random")) return { ok: true, headers, json: async () => [photo] };
    return { ok: true, headers, json: async () => ({ total: 0, total_pages: 0, results: [] }) };
  } });
  await client.searchPhotos("rooms", 2, 24);
  assert.deepEqual(client.getRateLimit(), { limit: 50, remaining: 49 });
  await client.getRandomPhotos(12);
  await client.trackDownload(selection.provenance.downloadLocation);
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /search\/photos\?query=rooms/);
  assert.match(calls[0].url, /page=2/);
  assert.match(calls[0].url, /per_page=24/);
  assert.match(calls[1].url, /photos\/random\?count=12/);
  assert.equal(calls[2].url, photo.links.download_location);
  assert.equal(calls[2].init.headers.Authorization, "Client-ID test-key");
  assert.equal(calls[2].url.includes("ixid=keep-me"), true);
} finally {
  await server.close();
}

console.log("Unsplash tests passed");