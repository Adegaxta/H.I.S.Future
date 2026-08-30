// @ts-nocheck
// @hyperide-preview-schema:fallback-props-v15
import React from 'react';

type InstanceEntry = { x?: number; y?: number; props?: Record<string, unknown> };
type PreviewComponent = React.ComponentType<Record<string, unknown>>;

function toPreviewComponent<P>(component: React.ComponentType<P>): PreviewComponent {
  return component as unknown as PreviewComponent;
}

import App from './App';
import AppWorkspace from './components\\AppWorkspace';
import ContextMenu from './components\\ContextMenu';
import DragPreview from './components\\DragPreview';
import GraphView from './components\\GraphView';
import NodePanels from './components\\NodePanels';
import RichTextEditor from './components\\RichTextEditor';
import SidebarTree from './components\\SidebarTree';
import HomeScreen from './screens\\HomeScreen';

const componentRegistry: Record<string, PreviewComponent> = {
  'src\\App.tsx': toPreviewComponent(App),
  'src\\components\\AppWorkspace.tsx': toPreviewComponent(AppWorkspace),
  'src\\components\\ContextMenu.tsx': toPreviewComponent(ContextMenu),
  'src\\components\\DragPreview.tsx': toPreviewComponent(DragPreview),
  'src\\components\\GraphView.tsx': toPreviewComponent(GraphView),
  'src\\components\\NodePanels.tsx': toPreviewComponent(NodePanels),
  'src\\components\\RichTextEditor.tsx': toPreviewComponent(RichTextEditor),
  'src\\components\\SidebarTree.tsx': toPreviewComponent(SidebarTree),
  'src\\screens\\HomeScreen.tsx': toPreviewComponent(HomeScreen),
};

const appEntrySet = new Set<string>([
]);

const sampleRenderMap: Record<string, React.FC> = {
};

const componentExportsMap: Record<string, string[]> = {
};

const declaredPropNamesMap: Record<string, string[]> = {
  'src\\components\\AppWorkspace.tsx': ["projectKey", "projectName"],
  'src\\components\\ContextMenu.tsx': ["menu", "onCreate", "onDelete", "onClose"],
  'src\\components\\DragPreview.tsx': ["node", "nodeType", "position"],
  'src\\components\\GraphView.tsx': ["nodes", "onSelectNode", "onOpenNode", "projectKey"],
  'src\\components\\NodePanels.tsx': ["panel", "nodes", "recentNodes", "selectedId", "onSelect"],
  'src\\components\\RichTextEditor.tsx': ["node", "nodes", "editorRef", "onContentChange", "setSelectedId", "setExpanded", "pendingNodeDrop", "onNodeDropHandled", "readOnly", "style"],
  'src\\screens\\HomeScreen.tsx': ["busy", "error", "onCreateProject", "onLoadProject"],
};

const sampleRenderersMap: Record<string, Record<string, React.FC>> = {
  'src\\App.tsx': {},
  'src\\components\\AppWorkspace.tsx': {},
  'src\\components\\ContextMenu.tsx': {},
  'src\\components\\DragPreview.tsx': {},
  'src\\components\\GraphView.tsx': {},
  'src\\components\\NodePanels.tsx': {},
  'src\\components\\RichTextEditor.tsx': {},
  'src\\components\\SidebarTree.tsx': {},
  'src\\screens\\HomeScreen.tsx': {},
};

const callbackStubs = {
  onClick: () => console.log('[Preview] onClick'),
  onChange: (e: React.SyntheticEvent) => console.log('[Preview] onChange', (e?.target as HTMLInputElement)?.value),
  onSubmit: (e: React.SyntheticEvent) => { e?.preventDefault?.(); console.log('[Preview] onSubmit'); },
  onBlur: () => console.log('[Preview] onBlur'),
  onFocus: () => console.log('[Preview] onFocus'),
  onNavChange: (value: unknown) => console.log('[Preview] onNavChange', value),
  onNavigate: (value: unknown) => console.log('[Preview] onNavigate', value),
  onNext: () => console.log('[Preview] onNext'),
  onOpen: (value: unknown) => console.log('[Preview] onOpen', value),
  onClose: (value: unknown) => console.log('[Preview] onClose', value),
  onAddToCart: (...args: unknown[]) => console.log('[Preview] onAddToCart', args),
  onCreateEvent: () => console.log('[Preview] onCreateEvent'),
  onDateSelect: (value: unknown) => console.log('[Preview] onDateSelect', value),
  onFilterChange: (value: unknown) => console.log('[Preview] onFilterChange', value),
  onFiltersChange: (value: unknown) => console.log('[Preview] onFiltersChange', value),
  onPlayPause: () => console.log('[Preview] onPlayPause'),
  onPlayAll: () => console.log('[Preview] onPlayAll'),
  onPlaySong: (value: unknown) => console.log('[Preview] onPlaySong', value),
  onPrevious: () => console.log('[Preview] onPrevious'),
  onPress: (value: unknown) => console.log('[Preview] onPress', value),
  onQuickView: (value: unknown) => console.log('[Preview] onQuickView', value),
  onSearchChange: (value: unknown) => console.log('[Preview] onSearchChange', value),
  onSeek: (value: unknown) => console.log('[Preview] onSeek', value),
  onSectionChange: (value: unknown) => console.log('[Preview] onSectionChange', value),
  onSelect: (value: unknown) => console.log('[Preview] onSelect', value),
  onToggleCalendar: (value: unknown) => console.log('[Preview] onToggleCalendar', value),
  onVolumeChange: (value: unknown) => console.log('[Preview] onVolumeChange', value),
  onViewChange: (value: unknown) => console.log('[Preview] onViewChange', value),
};

const previewSong = {
  id: "preview-song",
  title: "Preview Song",
  artist: "Preview Artist",
  album: "Preview Album",
  duration: "3:24",
  durationSeconds: 204,
  coverUrl: "https://picsum.photos/seed/hyper-preview-song/96/96",
};

const previewPlaylist = {
  id: "preview-playlist",
  name: "Preview Playlist",
  description: "Preview playlist for isolated component rendering.",
  coverUrl: "https://picsum.photos/seed/hyper-preview-playlist/300/300",
  songs: [previewSong],
};

const previewFileItem = {
  id: "preview-folder",
  name: "Preview Folder",
  type: "folder",
  modified: "Today",
  owner: "Preview",
  starred: false,
  shared: false,
  parentId: null,
};

const previewLocation = { id: "preview-location", name: "Preview Location", address: "1 Preview St" };
const previewRideType = { id: "preview-ride", name: "Preview Ride", eta: 4, price: "$12.00" };
const previewTrip = {
  id: "preview-trip",
  pickup: previewLocation,
  destination: { ...previewLocation, id: "preview-destination", name: "Preview Destination" },
  rideType: previewRideType,
};

const previewListing = {
  id: "preview-listing",
  title: "Preview Stay",
  location: "Preview City",
  country: "Preview Country",
  distance: "1 km away",
  dates: "Apr 24-29",
  price: 120,
  currency: "USD",
  rating: 4.9,
  reviewCount: 12,
  images: ["#B7D5E8", "#D5E8B7"],
  isFavorite: false,
  isGuestFavorite: true,
  guests: 2,
  bedrooms: 1,
  beds: 1,
  baths: 1,
  description: "Preview listing description.",
  amenities: ["Wifi", "Kitchen"],
  host: { name: "Preview Host", avatar: "#82A8C4", isSuperhost: true, joinedDate: "2024" },
  reviews: [{ id: "preview-review", author: "Preview Guest", avatar: "#A8C482", date: "Today", rating: 5, comment: "Preview review." }],
  category: "Preview",
};

const previewProduct = {
  id: "1",
  name: "Preview Product",
  price: 29.99,
  originalPrice: 39.99,
  category: "sale",
  image: "#B7D5E8",
  rating: 4.5,
  reviewCount: 24,
  description: "Preview product description.",
  sizes: ["M"],
  colors: ["Blue"],
  brand: "Preview Brand",
  onSale: true,
};

const previewFilters = {
  search: "",
  status: "all",
  device: "all",
  country: "all",
  selectedBrands: [],
  selectedColor: null,
  priceRange: [0, 100],
};

const previewProject = {
  id: "preview-project",
  title: "Preview Project",
  description: "Preview project description.",
  tags: ["React", "TypeScript"],
  image: "#B7D5E8",
  url: "https://example.com",
};

const previewChartData = [
  { date: "Mon", pageViews: 1000, uniqueVisitors: 700, bounceRate: 32, avgSessionDuration: 180, conversions: 24, revenue: 1200 },
  { date: "Tue", pageViews: 1200, uniqueVisitors: 840, bounceRate: 30, avgSessionDuration: 190, conversions: 28, revenue: 1500 },
];

const previewData = previewChartData.map((row, index) => ({
  ...row,
  id: "preview-row-" + (index + 1),
  title: row.date,
  name: row.date,
  label: row.date,
  value: row.pageViews,
  status: "active",
  items: [],
  children: [],
}));

const previewWeatherDetails = {
  uvIndex: 4,
  uvLabel: "Moderate",
  windSpeed: 12,
  windDirection: "NW",
  humidity: 55,
  dewPoint: 8,
  pressure: 1013,
  visibility: 10,
};

const previewDate = new Date("2026-04-24T09:00:00Z");
const previewCalendars = [
  { type: "work", label: "Work", color: "#4285F4", enabled: true },
  { type: "personal", label: "Personal", color: "#0B8043", enabled: true },
  { type: "birthdays", label: "Birthdays", color: "#F4511E", enabled: true },
  { type: "holidays", label: "Holidays", color: "#F6BF26", enabled: true },
];

const _storeStubs: Record<string, unknown> = {};
const _stateStubs: Record<string, unknown> = {};
const previewFallbackProps: Record<string, unknown> = {
  ...callbackStubs,
  activeNav: "dashboard",
  activeSection: "dashboard",
  count: 1,
  chartData: previewChartData,
  calendars: previewCalendars,
  currentDate: previewDate,
  data: previewData,
  description: "Preview description",
  details: previewWeatherDetails,
  driver: { id: "preview-driver", name: "Preview Driver", rating: 4.9, vehicle: "Preview Car" },
  events: previewChartData,
  files: [previewFileItem],
  filters: previewFilters,
  headings: [],
  hours: previewChartData,
  index: 1,
  items: [],
  label: "Preview",
  listing: previewListing,
  listings: [previewListing],
  currentSongId: "preview-song",
  navigation: {
    navigate: (...args: unknown[]) => console.log('[Preview] navigation.navigate', args),
    goBack: () => console.log('[Preview] navigation.goBack'),
    back: () => console.log('[Preview] navigation.back'),
    push: (...args: unknown[]) => console.log('[Preview] navigation.push', args),
    popTo: (...args: unknown[]) => console.log('[Preview] navigation.popTo', args),
    reset: (value: unknown) => console.log('[Preview] navigation.reset', value),
    replace: (...args: unknown[]) => console.log('[Preview] navigation.replace', args),
    setOptions: (options: unknown) => console.log('[Preview] navigation.setOptions', options),
    dispatch: (action: unknown) => console.log('[Preview] navigation.dispatch', action),
  },
  path: [previewFileItem],
  playerState: { currentSong: previewSong, isPlaying: false, progress: 0.25, volume: 0.8 },
  playlist: previewPlaylist,
  playlists: [previewPlaylist],
  product: previewProduct,
  products: [previewProduct],
  project: previewProject,
  projects: [previewProject],
  rows: [],
  route: {
    key: "preview-route",
    name: "Preview",
    params: {
      id: "preview-id",
      activityId: "preview-activity",
      contactId: "preview-contact",
      conversationId: "preview-conversation",
      destination: { ...previewLocation, id: "preview-destination", name: "Preview Destination" },
      itemId: "preview-item",
      menuItemId: "preview-menu-item",
      pickup: previewLocation,
      restaurantId: "preview-restaurant",
      rideType: previewRideType,
      transactionId: "preview-transaction",
      trip: previewTrip,
    },
  },
  searchQuery: "",
  selectedDate: previewDate,
  song: previewSong,
  songs: [previewSong],
  tags: ["React", "TypeScript"],
  title: "Preview",
  value: "Preview",
  block: { id: "preview-block", type: "paragraph", content: "Preview block", checked: false },
  page: {
    id: "preview-page",
    title: "Preview Page",
    icon: "Preview",
    coverGradient: "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)",
    parentId: null,
    isFavorite: false,
    lastEdited: "Preview",
    blocks: [{ id: "preview-block", type: "paragraph", content: "Preview block" }],
  },
  metric: { label: "Preview", value: "1,024", change: "+12%", trend: "up" },
  row: { id: "preview-row", name: "Preview row", status: "Done", priority: "Medium", date: "2026-01-01" },
  store: new Proxy({}, {
    get: (target, prop) => {
      if (typeof prop !== 'string') return Reflect.get(target, prop);
      if (/^(?:set|toggle|on|add|remove|update|clear|reset|open|close)[A-Z]/.test(prop)) {
        return (_storeStubs[prop] ??= () => {});
      }
      if (['issues', 'items', 'rows', 'tags', 'users', 'comments', 'messages', 'notifications', 'cards', 'columns', 'tasks', 'lists', 'projects', 'labels', 'filters', 'priorities', 'statuses'].includes(prop)) return (_storeStubs[prop] ??= []);
      if (prop === 'issuesByStatus') return { backlog: [], todo: [], in_progress: [], done: [], cancelled: [] };
      if (prop === 'commandPaletteOpen' || prop === 'isOpen' || prop === 'isLoading' || prop === 'isError') return false;
      return Reflect.get(target, prop);
    },
  }),
  dispatch: () => {},
  reducer: () => {},
  state: new Proxy({}, {
    get: (target, prop) => {
      if (typeof prop !== 'string') return Reflect.get(target, prop);
      if (/^(?:set|toggle|on|add|remove|update|clear|reset|open|close)[A-Z]/.test(prop)) {
        return (_stateStubs[prop] ??= () => {});
      }
      if (['issues', 'items', 'rows', 'tags', 'users', 'comments', 'messages', 'notifications', 'cards', 'columns', 'tasks', 'lists', 'projects', 'labels', 'filters', 'priorities', 'statuses'].includes(prop)) return (_stateStubs[prop] ??= []);
      if (prop === 'issuesByStatus') return { backlog: [], todo: [], in_progress: [], done: [], cancelled: [] };
      if (prop === 'commandPaletteOpen' || prop === 'isOpen' || prop === 'isLoading' || prop === 'isError') return false;
      return Reflect.get(target, prop);
    },
  }),
  theme: new Proxy({ colors: {}, spacing: {}, fontSizes: {}, shadows: {}, breakpoints: {} }, {
    get: (target, prop) => {
      if (typeof prop !== 'string') return undefined;
      if (prop in target) return (target as Record<string, unknown>)[prop];
      return {};
    },
  }),
  i18n: { t: (key: string) => key, language: 'en', changeLanguage: () => {} },
  session: { user: null, isAuthenticated: false, sessionId: 'preview-session' },
  auth: { user: null, isAuthenticated: false, sessionId: 'preview-session' },
  query: { data: undefined, isLoading: false, isError: false, error: null, refetch: () => {} },
  mutation: { mutate: () => {}, mutateAsync: async () => {}, isPending: false, isError: false },
  fetcher: { submit: () => {}, load: () => {}, data: undefined, state: 'idle' },
  intl: { formatMessage: (m: { defaultMessage?: string }) => m?.defaultMessage ?? '', locale: 'en' },
};

function filterFallback(path: string): Record<string, unknown> {
  const declared = declaredPropNamesMap[path];
  if (!declared) return previewFallbackProps;
  const out: Record<string, unknown> = {};
  for (const k of declared) {
    if (Object.prototype.hasOwnProperty.call(previewFallbackProps, k)) out[k] = previewFallbackProps[k];
  }
  return out;
}

class ComponentErrorBoundary extends React.Component<
  { children: React.ReactNode; componentPath: string; propsReady?: boolean },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode; componentPath: string; propsReady?: boolean }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    window.parent.postMessage({
      type: 'hypercanvas:componentError',
      componentPath: this.props.componentPath,
      error: error.message,
    }, '*');
  }
  override componentDidUpdate(prevProps: { componentPath: string; propsReady?: boolean }) {
    // HYP-649: componentPath changes are handled by the errorBoundaryKey remount
    // (key includes componentPath), so the only in-place reset left here is the
    // generated-props-arrived case (#210). Keeping a componentPath clause too would
    // double-reset and race the key remount.
    const propsJustArrived = !prevProps.propsReady && this.props.propsReady === true;
    if (propsJustArrived && this.state.error) {
      this.setState({ error: null });
    }
  }
  override render() {
    if (this.state.error) {
      return null;
    }
    return this.props.children;
  }
}

function _ComponentSuccessSignal({ componentPath }: { componentPath: string }) {
  React.useEffect(() => {
    window.parent.postMessage({ type: 'hypercanvas:componentRenderSucceeded', componentPath }, '*');
  }, [componentPath]);
  return null;
}

function _ComponentMissingSignal({ componentPath }: { componentPath: string }) {
  React.useEffect(() => {
    window.parent.postMessage({ type: 'hypercanvas:componentMissing', componentPath }, '*');
  }, [componentPath]);
  return null;
}

function _hyperNavStrategy(): string {
  // CACHE the strategy on first read. _driveInitialAppRoute navigates immediately and DROPS the
  // query string (the boot route has no `?nav=`), so a later read of window.location.search
  // would lose `nav=` and wrongly fall back to history-bridge — breaking e.g. a basename router
  // on the second navigation. Memoize on a window global so it survives the history rewrite.
  const w = window as unknown as { __hyperNavStrategy?: string };
  if (w.__hyperNavStrategy) return w.__hyperNavStrategy;
  // Whitelist + default MUST match the bridge (server/proxy-path-bridge.js VALID_NAV) so a bogus
  // `nav=` is normalized the same on both sides — otherwise the bridge prefixes history while we
  // navigate unprefixed (or vice-versa) and the app's own <Link> breaks the no-basename router.
  const VALID: Record<string, number> = { basename: 1, "history-bridge": 1, "src-swap": 1 };
  let strategy = "history-bridge";
  try {
    const raw = new URLSearchParams(window.location.search).get('nav');
    // Object.prototype.hasOwnProperty (not a bare VALID[raw] lookup) so `nav=toString` etc.
    // can't pass as valid via an inherited key — must match the bridge's Object.hasOwn check.
    strategy = raw && Object.prototype.hasOwnProperty.call(VALID, raw) ? raw : "history-bridge";
  } catch { /* malformed search — keep default */ }
  w.__hyperNavStrategy = strategy;
  return strategy;
}

function _hyperApplyRoute(route: string): void {
  // route is an UNPREFIXED in-app path (e.g. "/settings"). Push it so the app router matches.
  const target = route.startsWith('/') ? route : '/' + route;
  const w = window as unknown as {
    __hyperOriginalPushState?: (s: unknown, t: string, u: string) => void;
    __hyperPreviewProxyPrefix?: string;
  };
  const strategy = _hyperNavStrategy();
  if (strategy === "basename") {
    // Router has basename=<prefix> → it wants the PREFIXED path. The PATCHED pushState
    // prefixes for us; the router strips the basename back off to match. Compare path AND
    // search AND hash so a query/hash-only change (/settings?tab=1 or /settings#x → /settings)
    // is not dropped as a no-op (stale query/hash would linger).
    const cur = window.location.pathname.replace(w.__hyperPreviewProxyPrefix || "", "") + window.location.search + window.location.hash;
    if (cur !== target) {
      window.history.pushState({}, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    return;
  }
  // history-bridge / src-swap boot: put the UNPREFIXED path into location WITHOUT re-prefixing,
  // using the bridge-exposed original pushState when present (SaaS), else plain (ext).
  const push = w.__hyperOriginalPushState || window.history.pushState.bind(window.history);
  if (window.location.pathname + window.location.search + window.location.hash !== target) {
    push({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

// Report the app's CURRENT route to the host so the address bar stays in sync when the user
// navigates INSIDE the preview (clicks an app <Link>, browser back/forward), not just via the bar.
// The route is reported UNPREFIXED (strip the proxy prefix) since that is what the bar shows.

// Snapshot the EXACT bootstrap URL (raw pathname + search) at mount. Route reporting cleans the
// preview query ONLY while the URL is STILL byte-for-byte this bootstrap entry (no app navigation
// yet) — distinguishing the preview bootstrap from later APP-OWNED URLs by TIME, not by guessing
// which params the harness injected. Once the app navigates (pushState → a different path, query
// dropped), the URL differs and we report it VERBATIM, so every real app param survives (a real
// `/gallery?mode=multi`, `/feed?app=1`, or duplicate `?a=1&a=2` is never touched).
// SSR-safe: this module is imported by SSR-capable preview routes (Next/Remix/Astro) where there
// is no `window` at module load — guard the access so importing the module never crashes (the
// value is only ever READ in the browser-only `_reportRouteToHost`).
const _hyperBootHref = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
// One-shot BOOT PHASE flag (a plain boolean — SSR-safe). Active ONLY when the module first loads
// at a HARNESS MOUNT — the mount PATH (root `/`, or `/test-preview`, after stripping any
// `/project-preview/<id>` proxy prefix) AND the injected `component` param. So a module that
// (re)loads directly on a real app URL — `/gallery?mode=multi` (no component) OR even
// `/gallery?component=hero` (non-mount path) — never enters boot phase and is reported verbatim.
// The flag flips FALSE forever on the first navigation away from the bootstrap href, so navigating
// away and BACK to the exact mount URL is a real route (verbatim) too.
let _hyperInBootPhase = (function () {
  if (typeof window === 'undefined') return false;
  const _p = window.location.pathname.replace(/^\/project-preview\/[a-fA-F0-9-]+/, '') || '/';
  const _isMountPath = _p === '/' || _p.indexOf('/test-preview') === 0;
  return _isMountPath && new URLSearchParams(window.location.search).has('component');
})();

function _reportRouteToHost() {
  try {
    const w = window as unknown as { __hyperPreviewProxyPrefix?: string };
    const prefix = w.__hyperPreviewProxyPrefix || "";
    let path = window.location.pathname;
    if (prefix && path.startsWith(prefix)) path = path.slice(prefix.length) || "/";
    if (path.indexOf("/test-preview") === 0) return; // still on the mount path — not a real route
    // Leave the boot phase FOREVER the first time the URL differs from the bootstrap href.
    const _href = window.location.pathname + window.location.search;
    if (_href !== _hyperBootHref) _hyperInBootPhase = false;
    // Only the UNTOUCHED bootstrap entry (still in boot phase) has an all-harness query → report
    // just the path (`/`). Every real navigation reports its search VERBATIM (real app params).
    const _onBootstrap = _hyperInBootPhase && _href === _hyperBootHref;
    const _search = _onBootstrap ? "" : window.location.search;
    // Keep the hash so `<Link to="/settings#billing">` reports the full address.
    const full = path + _search + window.location.hash;
    window.parent.postMessage({ type: 'hypercanvas:appRouteChanged', route: full }, '*');
  } catch { /* no parent / cross-origin — nothing to report */ }
}

function _installPersistentRouteListener() {
  const w = window as unknown as { __hyperRouteNavInstalled?: boolean };
  if (w.__hyperRouteNavInstalled) return;
  w.__hyperRouteNavInstalled = true;
  window.addEventListener("message", function (e: MessageEvent) {
    if (e.source !== window.parent) return;
    if (e.data?.type !== 'hypercanvas:navigateRoute') return;
    const route = typeof e.data.route === 'string' ? e.data.route : null;
    if (!route) return;
    try { _hyperApplyRoute(route); }
    catch { /* malformed address — free text is allowed but may not parse */ }
  });
  // Report app-initiated navigation back to the host. popstate covers back/forward; we also wrap
  // pushState/replaceState (React Router <Link> calls those WITHOUT firing popstate) to report.
  window.addEventListener('popstate', function () { _reportRouteToHost(); });
  const hist = window.history as unknown as { pushState: (...a: unknown[]) => void; replaceState: (...a: unknown[]) => void };
  const origPush = hist.pushState.bind(window.history);
  const origReplace = hist.replaceState.bind(window.history);
  hist.pushState = function (...args: unknown[]) { const r = origPush(...args); _reportRouteToHost(); return r; };
  hist.replaceState = function (...args: unknown[]) { const r = origReplace(...args); _reportRouteToHost(); return r; };
}

function _driveInitialAppRoute() {
  try {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('route');
    if (requested && requested.startsWith("/")) { _hyperApplyRoute(requested); return; }
    // No explicit ?route=. Only drive OFF the `/test-preview` mount path (or an unprefixed root)
    // to "/". If the app is ALREADY on a real route — e.g. the user navigated to "/settings" and
    // the preview later remounts (HMR / sample switch / retry) and reruns this bridge — do NOT
    // shove it back to "/" (that would fight the address bar, which still shows /settings).
    const w = window as unknown as { __hyperPreviewProxyPrefix?: string };
    const prefix = w.__hyperPreviewProxyPrefix || "";
    const path = prefix && window.location.pathname.startsWith(prefix)
      ? (window.location.pathname.slice(prefix.length) || "/")
      : window.location.pathname;
    const onMountPath = path === "/" || path === "" || path.indexOf("/test-preview") === 0;
    if (onMountPath) _hyperApplyRoute("/");
  } catch { /* app has no history router — nothing to drive */ }
}

function _AppModeBridge() {
  React.useEffect(() => {
    _installPersistentRouteListener();
    _driveInitialAppRoute();
  }, []);
  return null;
}

function _AppRouteDriver() {
  return (<>
    <_AppModeBridge />
    <div style={{ padding: 20, fontFamily: 'sans-serif', color: '#888' }}>Loading app…</div>
  </>);
}

interface CanvasPreviewProps {
  component?: string | null;
  mode?: 'single' | 'multi' | 'app' | null;
}

export default function CanvasPreview({ component: componentProp, mode: modeProp }: CanvasPreviewProps = {}) {
  const [componentPath, setComponentPath] = React.useState<string | null>(componentProp ?? null);
  const [mode, setMode] = React.useState<'single' | 'multi' | 'app'>(modeProp ?? 'single');

  const [generatedPropsMap, setGeneratedPropsMap] = React.useState<Record<string, Record<string, unknown>>>({});
  React.useEffect(() => {
    function onGeneratedProps(e: MessageEvent) {
      if (e.data?.type !== 'hypercanvas:setGeneratedProps') return;
      const path = typeof e.data.componentPath === "string" ? e.data.componentPath : null;
      if (!path) return;
      const values = e.data.values && typeof e.data.values === "object" ? e.data.values : {};
      setGeneratedPropsMap((prev) => ({ ...prev, [path]: values as Record<string, unknown> }));
    }
    window.addEventListener('message', onGeneratedProps);
    return () => window.removeEventListener('message', onGeneratedProps);
  }, []);

  const [retryCount, setRetryCount] = React.useState(0);
  React.useEffect(() => {
    function onRetryRender(e: MessageEvent) {
      if (e.data?.type === 'hypercanvas:retryRender') {
        setRetryCount((c) => c + 1);
      }
    }
    window.addEventListener('message', onRetryRender);
    return () => window.removeEventListener('message', onRetryRender);
  }, []);

  React.useEffect(() => {
    function onNavigateRoute(e: MessageEvent) {
      // Only the embedding host (the preview panel / canvas) may drive the app router.
      // Reject messages from any other sender (a nested iframe, an injected script) so an
      // embedded page in the previewed app cannot pushState the top-level app around.
      if (e.source !== window.parent) return;
      if (e.data?.type !== 'hypercanvas:navigateRoute') return;
      const route = typeof e.data.route === 'string' ? e.data.route : null;
      if (!route) return;
      try { _hyperApplyRoute(route); }
      catch { /* ignore malformed addresses — free text is allowed but may not parse */ }
    }
    window.addEventListener('message', onNavigateRoute);
    return () => window.removeEventListener('message', onNavigateRoute);
  }, []);

  React.useEffect(() => {
    if (componentProp != null) setComponentPath(componentProp);
  }, [componentProp]);

  React.useEffect(() => {
    if (componentProp != null) return;
    const params = new URLSearchParams(window.location.search);
    const urlComponent = params.get('component');
    if (urlComponent) setComponentPath(urlComponent);
    const urlMode = params.get('mode');
    if (urlMode === 'single' || urlMode === 'multi' || urlMode === 'app') setMode(urlMode);
    if (params.get('app') === '1') setMode('app');
  }, []);

  React.useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'hypercanvas:setComponent' && e.data.component) {
        setComponentPath(e.data.component);
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('component', e.data.component);
          window.history.replaceState(null, '', url.toString());
        } catch { /* ignore */ }
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!componentPath) {
    return <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h2>Loading preview...</h2>
      <p>Waiting for component selection</p>
    </div>;
  }

  const Component = componentRegistry[componentPath];
  const sampleRenderers = sampleRenderersMap[componentPath] || {};
  const generatedProps = generatedPropsMap[componentPath] ?? {};
  const generatedPropsReady = Object.prototype.hasOwnProperty.call(generatedPropsMap, componentPath);
  // HYP-649: re-keying the ErrorBoundary on retryCount (or componentPath) remounts
  // it with fresh state, clearing a stale error after the source is fixed.
  const errorBoundaryKey = `${componentPath}-${retryCount}`;

  if (mode === 'app') {
    // App-mode A — registerable entry root (router via RouterProvider / createBrowserRouter,
    // or a clean App.tsx whose router lives in main.tsx): render it RAW. Its own router +
    // providers run, so the address bar drives them via the route-navigation effect above.
    // No provider wrap, no prop injection, no sample, full-bleed.
    if (appEntrySet.has(componentPath) && Component) {
      return (
        <ComponentErrorBoundary key={errorBoundaryKey} componentPath={componentPath}>
          <_AppModeBridge />
          <Component />
          <_ComponentSuccessSignal componentPath={componentPath} />
        </ComponentErrorBoundary>
      );
    }
    // App-mode B — the entry root is the vite-spa-jsx-router file the patcher injected this
    // very `/test-preview` route into, so it can't be rendered raw (nested router). But the
    // PATCHED app is already mounted around us. Drive its OWN router off `/test-preview` to a
    // real route (the address, default `/`); the app then renders its real page, unmounting
    // this preview. The route-navigation effect handles subsequent address-bar navigation.
    return <_AppRouteDriver />;
  }

  if (mode !== 'multi') {
    const SampleDefault = sampleRenderMap[componentPath];
    if (!SampleDefault && !Component) {
      const detectedExports = componentExportsMap[componentPath] ?? [];
      return (
        <div style={{ padding: 20, fontFamily: "sans-serif", color: "#666" }}>
          <_ComponentMissingSignal componentPath={componentPath} />
          <h2 style={{ margin: 0, fontSize: 16, color: "#333" }}>No sample for this component</h2>
          <p style={{ marginTop: 8 }}>{componentPath}</p>
          {detectedExports.length > 0 ? (
            <p style={{ marginTop: 8 }}>Detected exports: {detectedExports.join(", ")}</p>
          ) : (
            <p style={{ marginTop: 8 }}>Generating sample…</p>
          )}
        </div>
      );
    }
    return <ComponentErrorBoundary key={errorBoundaryKey} componentPath={componentPath} propsReady={generatedPropsReady}><div style={{ padding: 20 }}>{SampleDefault ? <SampleDefault /> : <Component {...filterFallback(componentPath)} {...generatedProps} />}<_ComponentSuccessSignal componentPath={componentPath} /></div></ComponentErrorBoundary>;
  }

  const instances = ((window.parent as unknown) as { __CANVAS_INSTANCES__?: Record<string, InstanceEntry> }).__CANVAS_INSTANCES__ || {};

  return (
    <ComponentErrorBoundary key={errorBoundaryKey} componentPath={componentPath}>
    <div style={{ position: 'relative', width: 10000, height: 10000 }}>
      {Object.entries(instances).map(([id, instance]: [string, InstanceEntry]) => {
        const { x = 0, y = 0, props } = instance;

        if (props && Object.keys(props).length > 0 && Component) {
          const mergedProps = { ...filterFallback(componentPath), ...props };
          return (
            <div key={id} data-canvas-instance-id={id}
                 style={{ position: 'absolute', left: x, top: y }}>
              <Component {...mergedProps} />
            </div>
          );
        }

        const SampleComponent = sampleRenderers[id] || sampleRenderMap[componentPath];
        if (!SampleComponent) {
          if (Component) {
            return (
              <div key={id} data-canvas-instance-id={id}
                   style={{ position: 'absolute', left: x, top: y }}>
                <Component {...filterFallback(componentPath)} />
              </div>
            );
          }
          return null;
        }

        return (
          <div key={id} data-canvas-instance-id={id}
               style={{ position: 'absolute', left: x, top: y }}>
            <SampleComponent />
          </div>
        );
      })}
      <_ComponentSuccessSignal componentPath={componentPath} />
    </div>
    </ComponentErrorBoundary>
  );
}

