import { useEffect, useRef, useState } from "react";
import refreshIcon from "../../assets/third-party/google-material/icons/refresh.svg";
import { useLocale } from "../../i18n/LocaleContext";
import { openWebUrl } from "../../nodes/viewPrimitives";
import { safeLocalStorageSet } from "../../workspace/safeStorage";
import { createUnsplashClient } from "./client";
import type { UnsplashRateLimit } from "./client";
import { toUnsplashImageSelection } from "./normalize";
import type { UnsplashImageSelection } from "./types";

interface UnsplashImagePickerProps {
  onSelect: (selection: UnsplashImageSelection) => void | Promise<void>;
}

const SEARCH_PAGE_SIZE = 24;
const RANDOM_BATCH_SIZE = 12;
const PERSISTED_PICKER_KEY = "hisfuture.unsplash.last-loaded.v1";
const PERSISTED_RESULT_LIMIT = 60;

interface SearchCacheEntry {
  results: UnsplashImageSelection[];
  page: number;
  totalPages: number;
}

interface PersistedPickerState {
  mode: "random" | "search";
  query: string;
  page: number;
  totalPages: number;
  hasMore: boolean;
  results: UnsplashImageSelection[];
  rateLimit?: UnsplashRateLimit | null;
}

const sessionCache: {
  random: UnsplashImageSelection[];
  searches: Map<string, SearchCacheEntry>;
  trackedDownloads: Set<string>;
  rateLimit: UnsplashRateLimit | null;
} = {
  random: [],
  searches: new Map(),
  trackedDownloads: new Set(),
  rateLimit: null,
};

function mergeSelections(current: UnsplashImageSelection[], incoming: UnsplashImageSelection[]) {
  const knownIds = new Set(current.map((selection) => selection.provenance.resourceId));
  return [...current, ...incoming.filter((selection) => !knownIds.has(selection.provenance.resourceId))];
}

function isImageSelection(value: unknown): value is UnsplashImageSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as UnsplashImageSelection;
  return typeof selection.src === "string" &&
    typeof selection.fileName === "string" &&
    typeof selection.description === "string" &&
    typeof selection.width === "number" &&
    typeof selection.height === "number" &&
    Boolean(selection.provenance) &&
    typeof selection.provenance.resourceId === "string";
}

function isRateLimit(value: unknown): value is UnsplashRateLimit {
  if (!value || typeof value !== "object") return false;
  const rateLimit = value as UnsplashRateLimit;
  return Number.isFinite(rateLimit.limit) && rateLimit.limit > 0 &&
    Number.isFinite(rateLimit.remaining) && rateLimit.remaining >= 0;
}

function readPersistedPickerState(): PersistedPickerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PERSISTED_PICKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedPickerState>;
    const results = Array.isArray(parsed.results) ? parsed.results.filter(isImageSelection).slice(0, PERSISTED_RESULT_LIMIT) : [];
    if (!results.length || (parsed.mode !== "random" && parsed.mode !== "search")) return null;
    const page = typeof parsed.page === "number" && parsed.page > 0 ? parsed.page : 1;
    const hasMore = parsed.hasMore === true;
    return {
      mode: parsed.mode,
      query: typeof parsed.query === "string" ? parsed.query : "",
      page,
      totalPages: typeof parsed.totalPages === "number" && parsed.totalPages >= page ? parsed.totalPages : page + (hasMore ? 1 : 0),
      hasMore,
      results,
      rateLimit: isRateLimit(parsed.rateLimit) ? parsed.rateLimit : null,
    };
  } catch {
    return null;
  }
}

export default function UnsplashImagePicker({ onSelect }: UnsplashImagePickerProps) {
  const { t } = useLocale();
  const clientRef = useRef(createUnsplashClient());
  const persistedStateRef = useRef(readPersistedPickerState());
  const persistedState = persistedStateRef.current;
  const initialLoadRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const [query, setQuery] = useState(persistedState?.query || "");
  const [loadedQuery, setLoadedQuery] = useState(persistedState?.mode === "search" ? persistedState.query : "");
  const [results, setResults] = useState<UnsplashImageSelection[]>(persistedState?.results || []);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"random" | "search">(persistedState?.mode || "random");
  const [page, setPage] = useState(persistedState?.page || 1);
  const [hasMore, setHasMore] = useState(persistedState?.hasMore ?? true);
  const [rateLimit, setRateLimit] = useState<UnsplashRateLimit | null>(
    () => persistedState?.rateLimit || sessionCache.rateLimit || clientRef.current.getRateLimit(),
  );

  const appName = import.meta.env.VITE_UNSPLASH_APP_NAME || "hisfuture";

  const appendSelections = (selections: UnsplashImageSelection[]) => {
    setResults((current) => mergeSelections(current, selections));
  };

  const startRequest = () => {
    if (requestInFlightRef.current) return false;
    requestInFlightRef.current = true;
    setLoading(true);
    return true;
  };

  const finishRequest = () => {
    requestInFlightRef.current = false;
    setLoading(false);
  };

  const rememberRateLimit = (next: UnsplashRateLimit | null) => {
    if (!next) return;
    sessionCache.rateLimit = next;
    setRateLimit(next);
  };

  const loadRandom = async (replace = true, force = false) => {
    if (!startRequest()) return;
    setError(null);
    try {
      if (replace && !force && sessionCache.random.length > 0) {
        setResults(sessionCache.random);
      } else {
        const photos = await clientRef.current.getRandomPhotos(RANDOM_BATCH_SIZE);
        rememberRateLimit(clientRef.current.getRateLimit());
        const selections = photos.map((photo) => toUnsplashImageSelection(photo, appName));
        sessionCache.random = replace ? selections : mergeSelections(sessionCache.random, selections);
        if (replace) setResults(selections);
        else appendSelections(selections);
      }
      setQuery("");
      setLoadedQuery("");
      setMode("random");
      setPage(1);
      setHasMore(true);
    } catch {
      if (replace) setResults([]);
      setError(t("page.unsplash.error"));
    } finally {
      finishRequest();
    }
  };

  const search = async () => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || !startRequest()) return;
    setError(null);
    try {
      const cacheKey = normalizedQuery.toLocaleLowerCase();
      const cached = sessionCache.searches.get(cacheKey);
      if (cached) {
        setResults(cached.results);
        setPage(cached.page);
        setHasMore(cached.page < cached.totalPages);
      } else {
        const response = await clientRef.current.searchPhotos(normalizedQuery, 1, SEARCH_PAGE_SIZE);
        rememberRateLimit(clientRef.current.getRateLimit());
        const selections = response.results.map((photo) => toUnsplashImageSelection(photo, appName));
        const entry = { results: selections, page: 1, totalPages: response.total_pages };
        sessionCache.searches.set(cacheKey, entry);
        setResults(selections);
        setPage(entry.page);
        setHasMore(entry.page < entry.totalPages);
      }
      setLoadedQuery(normalizedQuery);
      setMode("search");
    } catch {
      setResults([]);
      setError(t("page.unsplash.error"));
    } finally {
      finishRequest();
    }
  };

  const loadMore = async () => {
    if (!hasMore || !startRequest()) return;
    setError(null);
    try {
      if (mode === "random") {
        const photos = await clientRef.current.getRandomPhotos(RANDOM_BATCH_SIZE);
        rememberRateLimit(clientRef.current.getRateLimit());
        const selections = photos.map((photo) => toUnsplashImageSelection(photo, appName));
        sessionCache.random = mergeSelections(sessionCache.random, selections);
        appendSelections(selections);
      } else {
        const normalizedQuery = loadedQuery || query.trim();
        const nextPage = page + 1;
        const response = await clientRef.current.searchPhotos(normalizedQuery, nextPage, SEARCH_PAGE_SIZE);
        rememberRateLimit(clientRef.current.getRateLimit());
        const selections = response.results.map((photo) => toUnsplashImageSelection(photo, appName));
        const cacheKey = normalizedQuery.toLocaleLowerCase();
        const cached = sessionCache.searches.get(cacheKey);
        const nextResults = mergeSelections(cached?.results || [], selections);
        sessionCache.searches.set(cacheKey, { results: nextResults, page: nextPage, totalPages: response.total_pages });
        setResults(nextResults);
        setPage(nextPage);
        setHasMore(nextPage < response.total_pages);
      }
    } catch {
      setError(t("page.unsplash.error"));
    } finally {
      finishRequest();
    }
  };

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    if (persistedState?.results.length) {
      if (persistedState.mode === "random") sessionCache.random = persistedState.results;
      else sessionCache.searches.set(persistedState.query.toLocaleLowerCase(), {
        results: persistedState.results,
        page: persistedState.page,
        totalPages: persistedState.totalPages,
      });
      return;
    }
    void loadRandom();
  }, []);

  useEffect(() => {
    if (!results.length) return;
    const snapshot: PersistedPickerState = {
      mode,
      query: loadedQuery,
      page,
      totalPages: mode === "search" ? page + (hasMore ? 1 : 0) : page,
      hasMore,
      results: results.slice(0, PERSISTED_RESULT_LIMIT),
      rateLimit,
    };
    safeLocalStorageSet(PERSISTED_PICKER_KEY, JSON.stringify(snapshot));
  }, [hasMore, loadedQuery, mode, page, rateLimit, results]);

  const handleResultsScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 120) void loadMore();
  };

  const select = async (selection: UnsplashImageSelection) => {
    if (selecting) return;
    setSelecting(selection.provenance.resourceId);
    const downloadLocation = selection.provenance.downloadLocation;
    if (downloadLocation && !sessionCache.trackedDownloads.has(downloadLocation)) {
      sessionCache.trackedDownloads.add(downloadLocation);
      void clientRef.current.trackDownload(downloadLocation).catch(() => {
        sessionCache.trackedDownloads.delete(downloadLocation);
      }).finally(() => rememberRateLimit(clientRef.current.getRateLimit()));
    }
    try {
      await onSelect(selection);
    } finally {
      setSelecting(null);
    }
  };

  return (
    <div className="unsplash-picker">
      <div className="unsplash-picker__quota" aria-live="polite">
        {rateLimit ? t("page.unsplash.quota", { remaining: rateLimit.remaining, limit: rateLimit.limit }) : t("page.unsplash.quotaUnknown")}
      </div>
      <form className="unsplash-picker__search" onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("page.unsplash.searchPlaceholder")}
          aria-label={t("page.unsplash.search")}
        />
        <button type="submit" disabled={loading || !query.trim()}>{loading ? t("page.unsplash.searching") : t("page.unsplash.search")}</button>
        <button
          type="button"
          className="unsplash-picker__randomize"
          onClick={() => void loadRandom(true, true)}
          disabled={loading}
          title={t("page.unsplash.randomize")}
          aria-label={t("page.unsplash.randomize")}
        >
          <img src={refreshIcon} alt="" aria-hidden="true" />
        </button>
      </form>
      {error && <div className="unsplash-picker__error">{error}</div>}
      <div className="unsplash-picker__results" onScroll={handleResultsScroll} aria-busy={loading}>
        {results.length > 0 && (
          <>
            <div className="unsplash-picker__hint">{t(mode === "random" ? "page.unsplash.recommended" : "page.unsplash.results")}</div>
            <div className="unsplash-picker__gallery">
              {results.map((selection) => (
                <div className="unsplash-picker__card" key={selection.provenance.resourceId}>
                  <button
                    type="button"
                    onClick={() => void select(selection)}
                    disabled={Boolean(selecting)}
                    title={selection.description}
                  >
                    <img src={selection.src} alt={selection.description} />
                  </button>
                  <button type="button" className="unsplash-picker__attribution" onClick={() => void openWebUrl(selection.provenance.creatorUrl)}>
                    {selection.provenance.creatorName} · {t("image.unsplash")}
                  </button>
                </div>
              ))}
            </div>
            <div className="unsplash-picker__more">
              {hasMore ? (
                <button type="button" onClick={() => void loadMore()} disabled={loading}>
                  {loading ? t("page.unsplash.searching") : t("page.unsplash.loadMore")}
                </button>
              ) : (
                <span>{t("page.unsplash.end")}</span>
              )}
            </div>
          </>
        )}
        </div>
      {!loading && !error && query && results.length === 0 && <div className="page-image-picker__empty">{t("page.unsplash.empty")}</div>}
    </div>
  );
}