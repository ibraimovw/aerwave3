import {
  DEFAULT_CITIES,
  fetchCityPanorama,
  fetchCityWeather,
  getCachedWeather,
  getLocalizedCityDisplay,
  resolveCityLocalization,
  searchCities,
} from './api.js';
import {createSparkline, startWeatherCanvas} from './atmosphere.js';
import {
  attachSpotlight,
  computeDayPhase,
  computeMoonPhase,
  computePressureTrend,
  computeSunProgress,
  convertTempExact,
  el,
  formatDateLabel,
  formatIsoTime,
  formatTemp,
  generateHeroDailySummary,
  generateWeatherAlerts,
  generateWeatherInsights,
  getCityLocalClock,
  getNext24Hours,
  getUvCategory,
  getWeatherMood,
  getWindDirectionLabel,
  initMagneticButtons,
  setChildren,
} from './helpers.js';
import {TRANSLATIONS} from './i18n.js';
import {createIcon, createWeatherIcon} from './icons.js';
import {createWeatherMapView} from './map.js';

/* ============================================================================
 * Constants & State Persistence
 * ========================================================================== */

const SETTINGS_KEY = 'aerwave_vanilla_settings_v7';
const FAVORITES_KEY = 'aerwave_vanilla_favorites_v7';
const MAX_FAVORITES = 10;

const DEFAULT_METRICS = [
  'temperature',
  'precipProb',
  'windSpeed',
  'humidity',
  'pressure',
];

const ALL_METRICS = [
  'temperature',
  'feelsLike',
  'precipProb',
  'precipSum',
  'humidity',
  'windSpeed',
  'pressure',
  'uvIndex',
  'cloudCover',
];

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        lang: p.lang === 'en' ? 'en' : 'ru',
        unit: p.unit === 'F' ? 'F' : 'C',
        theme: p.theme === 'light' ? 'light' : 'dark',
        city: p.city?.latitude ? p.city : DEFAULT_CITIES[0],
        sidebarCollapsed: Boolean(p.sidebarCollapsed),
        metrics: Array.isArray(p.metrics) && p.metrics.length ? p.metrics : DEFAULT_METRICS,
      };
    }
  } catch {}
  return {
    lang: 'ru',
    unit: 'C',
    theme: 'dark',
    city: DEFAULT_CITIES[0],
    sidebarCollapsed: false,
    metrics: DEFAULT_METRICS,
  };
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, MAX_FAVORITES);
    }
  } catch {}
  return DEFAULT_CITIES.slice(0, 3);
}

function sameCity(a, b) {
  if (a.id && b.id && a.id === b.id) return true;
  return (
    Math.abs(a.latitude - b.latitude) < 0.04 &&
    Math.abs(a.longitude - b.longitude) < 0.04
  );
}

const initial = loadSettings();

const state = {
  lang: initial.lang,
  unit: initial.unit,
  theme: initial.theme,
  city: initial.city,
  sidebarCollapsed: initial.sidebarCollapsed,
  metrics: initial.metrics,
  favorites: loadFavorites(),
  section: 'home',
  preset: 'now',
  weather: getCachedWeather(initial.city),
  cityImage: null,
  isLoading: true,
  loadError: false,
  isOnline: navigator.onLine,
  mobileMenuOpen: false,
  compareMode: false,
  compareIds: [],
  favWeatherMap: {},
  favoriteNotice: null,
  expandedDate: null,
  minHintVisible: false,
  deferredPrompt: null,
  isStandalone:
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true,
  isIOS: /iphone|ipad|ipod/i.test(navigator.userAgent),
};

const refs = {
  sidebar: document.getElementById('sidebar'),
  topbar: document.getElementById('topbar'),
  banners: document.getElementById('status-banners'),
  main: document.getElementById('main-content'),
  footer: document.getElementById('app-footer'),
  dock: document.getElementById('mobile-dock'),
  drawer: document.getElementById('mobile-drawer'),
  iosModal: document.getElementById('ios-modal'),
  scrollBtn: document.getElementById('scroll-top-btn'),
  glow: document.getElementById('cursor-glow'),
};

const canvasEngine = startWeatherCanvas(document.getElementById('weather-canvas'));
let activeMapController = null;
let weatherAbort = null;
let searchAbort = null;
let lockedScrollY = 0;

function saveSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        lang: state.lang,
        unit: state.unit,
        theme: state.theme,
        city: state.city,
        sidebarCollapsed: state.sidebarCollapsed,
        metrics: state.metrics,
      })
    );
  } catch {}
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
  } catch {}
}

/* ============================================================================
 * Atmosphere, Scroll Lock & PWA Helpers
 * ========================================================================== */

function syncAtmosphere() {
  const tz = state.weather?.timezone ?? state.city.timezone ?? 'UTC';
  const today = state.weather?.daily[0];
  const dayPhase = computeDayPhase(tz, today?.sunrise, today?.sunset);
  const mood = state.weather
    ? getWeatherMood(state.weather.current.weatherCode)
    : 'clear';

  document.documentElement.lang = state.lang;
  document.body.classList.toggle('light-theme', state.theme === 'light');
  document.body.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
  document.body.setAttribute('data-dayphase', dayPhase);
  document.body.setAttribute('data-weather', mood);

  canvasEngine.update({
    mood,
    dayPhase,
    windSpeed: state.weather?.current.windSpeed ?? 6,
    theme: state.theme,
  });

  return {dayPhase, mood};
}

function lockBodyScroll(lock) {
  if (lock) {
    lockedScrollY = window.scrollY;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  } else {
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(0, lockedScrollY);
  }
}

function setMobileMenu(open) {
  if (state.mobileMenuOpen === open) return;
  state.mobileMenuOpen = open;
  lockBodyScroll(open);
  renderDrawer();
}

function makeInstallButton(compact = false) {
  const t = TRANSLATIONS[state.lang];
  if (state.isStandalone) return null;

  if (state.deferredPrompt) {
    return el(
      'button',
      {
        type: 'button',
        className: 'btn-primary',
        style: compact ? {width: '40px', height: '40px', padding: '0'} : {width: '100%'},
        title: t.pwa.installBtn,
        onClick: async () => {
          await state.deferredPrompt.prompt();
          await state.deferredPrompt.userChoice;
          state.deferredPrompt = null;
          renderChrome();
        },
      },
      createIcon('download', 'sm'),
      !compact && el('span', {}, t.pwa.installShort)
    );
  }

  if (state.isIOS) {
    return el(
      'button',
      {
        type: 'button',
        className: 'btn-subtle',
        style: compact ? {width: '40px', height: '40px', padding: '0'} : {width: '100%'},
        title: t.pwa.installBtn,
        onClick: () => showIOSModal(),
      },
      createIcon('download', 'sm c-pink'),
      !compact && el('span', {}, t.pwa.installShort)
    );
  }

  return null;
}

function showIOSModal() {
  const t = TRANSLATIONS[state.lang];
  setChildren(
    refs.iosModal,
    el(
      'div',
      {className: 'glass-panel-elevated ios-card'},
      el('h3', {className: 'section-title'}, t.pwa.iosTitle),
      el(
        'ol',
        {className: 'muted-sub', style: {paddingLeft: '18px', margin: '0', lineHeight: '1.6'}},
        el('li', {}, t.pwa.iosStep1),
        el('li', {}, t.pwa.iosStep2)
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'btn-primary',
          onClick: () => {
            refs.iosModal.hidden = true;
          },
        },
        t.pwa.close
      )
    )
  );
  refs.iosModal.hidden = false;
}

/* ============================================================================
 * Navigation Chrome (Sidebar, TopBar, Mobile Dock, Drawer, Footer)
 * ========================================================================== */

function renderSidebar() {
  const t = TRANSLATIONS[state.lang];
  const collapsed = state.sidebarCollapsed;
  refs.sidebar.classList.toggle('collapsed', collapsed);

  const navItems = [
    {id: 'home', label: t.nav.home, icon: 'home'},
    {id: 'forecast', label: t.nav.forecast, icon: 'forecast'},
    {id: 'map', label: t.nav.map, icon: 'map'},
    {id: 'favorites', label: t.nav.favorites, icon: 'star', count: state.favorites.length},
  ];

  const installBtn = makeInstallButton(collapsed);

  setChildren(
    refs.sidebar,
    el('div', {className: 'sidebar-top-edge', 'aria-hidden': 'true'}),
    el(
      'div',
      {className: 'sidebar-head'},
      el(
        'button',
        {type: 'button', className: 'brand-btn', onClick: () => navigate('home')},
        el('img', {src: './assets/logo.svg', alt: t.brandName, className: 'brand-logo'}),
        !collapsed &&
          el(
            'div',
            {style: {minWidth: '0'}},
            el(
              'div',
              {className: 'brand-lockup'},
              el('span', {className: 'aer-brand-mark'}, 'AER'),
              el('span', {className: 'brand-lockup-wave'}, '.wave')
            ),
            el('div', {className: 'brand-slogan'}, t.slogan)
          )
      ),
      !collapsed &&
        el(
          'button',
          {
            type: 'button',
            className: 'sidebar-toggle-btn',
            'aria-label': t.nav.collapseSidebar,
            title: t.nav.collapseSidebar,
            onClick: () => {
              state.sidebarCollapsed = true;
              saveSettings();
              syncAtmosphere();
              renderSidebar();
            },
          },
          createIcon('collapse', 'sm')
        )
    ),
    collapsed &&
      el(
        'button',
        {
          type: 'button',
          className: 'sidebar-toggle-btn expanded-handle',
          'aria-label': t.nav.expandSidebar,
          title: t.nav.expandSidebar,
          onClick: () => {
            state.sidebarCollapsed = false;
            saveSettings();
            syncAtmosphere();
            renderSidebar();
          },
        },
        createIcon('expand', 'sm')
      ),
    el(
      'nav',
      {className: 'sidebar-nav'},
      navItems.map((item) =>
        el(
          'button',
          {
            type: 'button',
            className: `nav-btn ${state.section === item.id ? 'active' : ''}`,
            title: collapsed ? item.label : undefined,
            onClick: () => navigate(item.id),
          },
          el(
            'span',
            {className: 'nav-left'},
            createIcon(item.icon, state.section === item.id ? 'c-pink' : ''),
            !collapsed && el('span', {}, item.label)
          ),
          !collapsed &&
            typeof item.count === 'number' &&
            el('span', {className: 'mono muted-xs'}, String(item.count))
        )
      )
    ),
    el(
      'div',
      {className: 'sidebar-foot'},
      installBtn,
      el(
        'div',
        {className: 'version-row'},
        !collapsed && el('span', {className: 'version-brand'}, t.brandName),
        el('span', {className: 'mono c-pink', style: {fontWeight: '600'}}, collapsed ? 'v7' : t.version)
      )
    )
  );
}

function renderTopBar() {
  const t = TRANSLATIONS[state.lang];
  const isFav = state.favorites.some((f) => sameCity(f, state.city));
  syncAtmosphere();

  const searchInput = el('input', {
    type: 'text',
    className: 'search-input',
    placeholder: t.topbar.searchPlaceholder,
    'aria-label': t.topbar.searchPlaceholder,
  });
  const dropdown = el('div', {className: 'search-dropdown glass-panel-elevated', hidden: true});
  const clearBtn = el(
    'button',
    {
      type: 'button',
      className: 'search-clear',
      hidden: true,
      'aria-label': 'Clear',
      onClick: () => {
        searchInput.value = '';
        clearBtn.hidden = true;
        dropdown.hidden = true;
        results = [];
        highlightIdx = -1;
      },
    },
    createIcon('close', 'sm')
  );

  let timer = null;
  let results = [];
  let highlightIdx = -1;

  const paintResults = () => {
    setChildren(
      dropdown,
      results.map((c, idx) =>
        el(
          'button',
          {
            type: 'button',
            className: `search-item ${idx === highlightIdx ? 'highlighted' : ''}`,
            onClick: () => {
              dropdown.hidden = true;
              searchInput.value = '';
              clearBtn.hidden = true;
              results = [];
              highlightIdx = -1;
              selectCity(c);
            },
          },
          el(
            'div',
            {style: {minWidth: '0'}},
            el('div', {style: {fontWeight: '500', fontSize: '14px'}}, c.name),
            el(
              'div',
              {className: 'search-sub'},
              [c.admin1, c.country].filter(Boolean).join(' · ')
            )
          ),
          el(
            'span',
            {className: 'mono muted-xs', style: {fontSize: '11px', flexShrink: '0'}},
            `${c.latitude.toFixed(1)}°, ${c.longitude.toFixed(1)}°`
          )
        )
      )
    );
  };

  searchInput.addEventListener('keydown', (e) => {
    if (dropdown.hidden || results.length === 0) {
      if (e.key === 'Escape') dropdown.hidden = true;
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIdx = (highlightIdx + 1) % results.length;
      paintResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = (highlightIdx - 1 + results.length) % results.length;
      paintResults();
    } else if (e.key === 'Enter' && highlightIdx >= 0 && results[highlightIdx]) {
      e.preventDefault();
      const picked = results[highlightIdx];
      dropdown.hidden = true;
      searchInput.value = '';
      clearBtn.hidden = true;
      results = [];
      selectCity(picked);
    } else if (e.key === 'Escape') {
      dropdown.hidden = true;
    }
  });

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    clearBtn.hidden = !searchInput.value;
    if (q.length < 2) {
      searchAbort?.abort();
      dropdown.hidden = true;
      results = [];
      highlightIdx = -1;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(async () => {
      searchAbort?.abort();
      searchAbort = new AbortController();
      setChildren(
        dropdown,
        el('div', {className: 'search-sub', style: {padding: '10px 12px'}}, t.topbar.searching)
      );
      dropdown.hidden = false;
      try {
        const list = await searchCities(q, state.lang, searchAbort.signal);
        if (searchAbort.signal.aborted) return;
        results = list;
        highlightIdx = list.length > 0 ? 0 : -1;
        if (list.length === 0) {
          setChildren(
            dropdown,
            el('div', {className: 'search-sub', style: {padding: '10px 12px'}}, t.topbar.noResults)
          );
          return;
        }
        paintResults();
      } catch (err) {
        if (err.name !== 'AbortError') {
          results = [];
          setChildren(
            dropdown,
            el(
              'div',
              {className: 'c-pink', style: {padding: '10px 12px', fontSize: '12px'}},
              t.topbar.searchError
            )
          );
        }
      }
    }, 260);
  });

  setChildren(
    refs.topbar,
    el(
      'div',
      {className: 'topbar-left'},
      el('img', {src: './assets/logo.svg', alt: t.brandName, className: 'mobile-logo'}),
      el(
        'div',
        {className: 'search-wrap'},
        createIcon('search', 'search-icon sm'),
        searchInput,
        clearBtn,
        dropdown
      )
    ),
    el(
      'div',
      {className: 'topbar-right'},
      el(
        'button',
        {
          type: 'button',
          className: `btn-icon ${isFav ? 'fav-active' : ''}`,
          title: isFav ? t.topbar.removeFavorite : t.topbar.addFavorite,
          'aria-label': isFav ? t.topbar.removeFavorite : t.topbar.addFavorite,
          onClick: toggleCurrentFavorite,
        },
        createIcon('star', 'sm')
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'btn-theme-circle desktop-only-ctrl',
          title: state.theme === 'dark' ? t.topbar.themeLight : t.topbar.themeDark,
          'aria-label': state.theme === 'dark' ? t.topbar.themeLight : t.topbar.themeDark,
          onClick: toggleTheme,
        },
        createIcon(state.theme === 'dark' ? 'sun' : 'moon', 'sm')
      ),
      el(
        'div',
        {className: 'seg-group', role: 'group', 'aria-label': t.topbar.langLabel},
        el('span', {className: 'seg-label mono'}, t.topbar.langLabel),
        ['ru', 'en'].map((code) =>
          el(
            'button',
            {
              type: 'button',
              className: `seg-btn ${state.lang === code ? 'active' : ''}`,
              onClick: () => setLang(code),
            },
            code.toUpperCase()
          )
        )
      ),
      el(
        'div',
        {className: 'seg-group', role: 'group', 'aria-label': t.topbar.unitLabel},
        el('span', {className: 'seg-label mono'}, t.topbar.unitLabel),
        ['C', 'F'].map((u) =>
          el(
            'button',
            {
              type: 'button',
              className: `seg-btn ${state.unit === u ? 'active' : ''}`,
              onClick: () => setUnit(u),
            },
            `°${u}`
          )
        )
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'btn-icon mobile-menu-trigger',
          'aria-label': t.nav.menu,
          onClick: () => setMobileMenu(true),
        },
        createIcon('menu', 'sm')
      )
    ),
    state.favoriteNotice &&
      el('div', {className: 'glass-panel-elevated fav-toast'}, state.favoriteNotice)
  );
}

function renderDock() {
  const t = TRANSLATIONS[state.lang];
  const items = [
    {id: 'home', label: t.nav.home, icon: 'home'},
    {id: 'forecast', label: t.nav.forecast, icon: 'forecast'},
    {id: 'map', label: t.nav.map, icon: 'map'},
    {id: 'favorites', label: t.nav.favorites, icon: 'star'},
  ];

  setChildren(
    refs.dock,
    items.map((item) =>
      el(
        'button',
        {
          type: 'button',
          className: `dock-btn ${state.section === item.id ? 'active' : ''}`,
          onClick: () => navigate(item.id),
        },
        createIcon(item.icon),
        el('span', {}, item.label)
      )
    )
  );
}

function renderDrawer() {
  const t = TRANSLATIONS[state.lang];
  if (!state.mobileMenuOpen) {
    refs.drawer.hidden = true;
    refs.drawer.setAttribute('aria-hidden', 'true');
    return;
  }

  syncAtmosphere();
  const disp = getLocalizedCityDisplay(state.city, state.lang);
  const installBtn = makeInstallButton(false);

  const items = [
    {id: 'home', label: t.nav.home, icon: 'home'},
    {id: 'forecast', label: t.nav.forecast, icon: 'forecast'},
    {id: 'map', label: t.nav.map, icon: 'map'},
    {id: 'favorites', label: t.nav.favorites, icon: 'star'},
  ];

  setChildren(
    refs.drawer,
    el(
      'div',
      {},
      el(
        'div',
        {className: 'drawer-head'},
        el(
          'div',
          {style: {display: 'flex', alignItems: 'center', gap: '10px'}},
          el('img', {src: './assets/logo.svg', alt: t.brandName, className: 'brand-logo'}),
          el(
            'div',
            {},
            el(
              'div',
              {className: 'brand-title'},
              el('span', {className: 'aer-brand-mark'}, 'AER'),
              '.wave ',
              el('span', {className: 'mono c-pink', style: {fontSize: '11px'}}, t.version)
            ),
            el(
              'div',
              {className: 'muted-xs'},
              [disp.name, disp.country].filter(Boolean).join(' · ')
            )
          )
        ),
        el(
          'button',
          {
            type: 'button',
            className: 'btn-icon',
            'aria-label': t.pwa.close,
            onClick: () => setMobileMenu(false),
          },
          createIcon('close', 'sm')
        )
      ),
      el(
        'nav',
        {className: 'drawer-nav'},
        items.map((item) =>
          el(
            'button',
            {
              type: 'button',
              className: `drawer-link ${state.section === item.id ? 'active' : ''}`,
              onClick: () => {
                setMobileMenu(false);
                navigate(item.id);
              },
            },
            createIcon(item.icon, state.section === item.id ? 'c-pink' : 'c-muted'),
            el('span', {className: state.section === item.id ? 'aer-grad-text' : ''}, item.label)
          )
        )
      )
    ),
    el(
      'div',
      {className: 'drawer-foot'},
      el(
        'div',
        {className: 'drawer-grid'},
        el(
          'button',
          {type: 'button', className: 'btn-subtle drawer-theme-btn', onClick: toggleTheme},
          createIcon(state.theme === 'dark' ? 'sun' : 'moon', 'sm c-pink'),
          el('span', {}, state.theme === 'dark' ? t.topbar.themeLight : t.topbar.themeDark)
        ),
        el(
          'div',
          {className: 'seg-group', style: {width: '100%', height: '44px'}},
          ['ru', 'en'].map((code) =>
            el(
              'button',
              {
                type: 'button',
                className: `seg-btn ${state.lang === code ? 'active' : ''}`,
                style: {flex: '1', height: '34px'},
                onClick: () => setLang(code),
              },
              code.toUpperCase()
            )
          )
        ),
        el(
          'div',
          {className: 'seg-group', style: {width: '100%', height: '44px'}},
          ['C', 'F'].map((u) =>
            el(
              'button',
              {
                type: 'button',
                className: `seg-btn ${state.unit === u ? 'active' : ''}`,
                style: {flex: '1', height: '34px'},
                onClick: () => setUnit(u),
              },
              `°${u}`
            )
          )
        )
      ),
      installBtn
    )
  );

  refs.drawer.hidden = false;
  refs.drawer.setAttribute('aria-hidden', 'false');
}

function renderBanners() {
  const t = TRANSLATIONS[state.lang];
  const nodes = [];

  if (!state.isOnline) {
    nodes.push(
      el(
        'div',
        {className: 'glass-panel banner-box'},
        el(
          'span',
          {style: {display: 'flex', alignItems: 'center', gap: '8px'}},
          createIcon('wifiOff', 'sm c-pink'),
          t.pwa.offlineBadge
        )
      )
    );
  }

  if (state.weather?.isCached) {
    nodes.push(
      el(
        'div',
        {className: 'glass-panel banner-box'},
        el('span', {}, `${t.cacheBanner.offlineTitle}. ${t.cacheBanner.offlineDesc}`),
        el(
          'button',
          {type: 'button', className: 'btn-subtle', onClick: () => loadCity(state.city)},
          t.cacheBanner.retry
        )
      )
    );
  }

  setChildren(refs.banners, nodes);
}

/* ============================================================================
 * Home View
 * ========================================================================== */

function renderHomeView() {
  const t = TRANSLATIONS[state.lang];
  const w = state.weather;
  const disp = getLocalizedCityDisplay(w.city, state.lang);
  const {dayPhase} = syncAtmosphere();
  const clock = getCityLocalClock(w.timezone);
  const today = w.daily[0];
  const tomorrow = w.daily[1];
  const weekend = w.daily
    .filter((d) => {
      const [y, m, day] = d.date.split('-').map(Number);
      const dow = new Date(Date.UTC(y, m - 1, day, 12)).getUTCDay();
      return dow === 0 || dow === 6;
    })
    .slice(0, 2);

  // Hero background media + warm berry-obsidian fallback gradient
  const heroBg = el('div', {className: 'hero-bg'});
  let heroImgEl = null;
  const fallbackGrad =
    dayPhase === 'dawn'
      ? 'radial-gradient(circle at 22% 24%, rgba(244,63,94,0.34), transparent 48%), radial-gradient(circle at 78% 72%, rgba(251,146,60,0.24), transparent 52%), #0c0710'
      : dayPhase === 'day'
        ? 'radial-gradient(circle at 22% 24%, rgba(251,113,133,0.30), transparent 50%), radial-gradient(circle at 78% 72%, rgba(56,189,248,0.28), transparent 52%), #0a0912'
        : dayPhase === 'dusk'
          ? 'radial-gradient(circle at 24% 24%, rgba(225,29,72,0.34), transparent 48%), radial-gradient(circle at 80% 70%, rgba(129,140,248,0.30), transparent 54%), #0c0711'
          : 'radial-gradient(circle at 25% 25%, rgba(244,63,94,0.26), transparent 48%), radial-gradient(circle at 78% 74%, rgba(129,140,248,0.24), transparent 54%), #08060b';

  const fallbackEl = el('div', {className: 'hero-fallback-grad', style: {background: fallbackGrad}});
  if (state.cityImage?.url) {
    heroImgEl = el('img', {
      src: state.cityImage.url,
      alt: `${disp.name} panorama`,
      className: 'hero-img',
      referrerpolicy: 'no-referrer',
    });
    heroImgEl.addEventListener('error', () => {
      heroImgEl.replaceWith(fallbackEl);
      heroImgEl = null;
    });
    heroBg.appendChild(heroImgEl);
  } else {
    heroBg.appendChild(fallbackEl);
  }
  heroBg.appendChild(el('div', {className: 'hero-scrim'}));

  const presets = ['now', 'today', 'tomorrow', 'weekend'];
  const presetBar = el(
    'div',
    {className: 'preset-bar', role: 'group', 'aria-label': 'Forecast presets'},
    presets.map((p) =>
      el(
        'button',
        {
          type: 'button',
          className: `preset-btn ${state.preset === p ? 'active' : ''}`,
          onClick: () => {
            state.preset = p;
            renderMain();
          },
        },
        t.home.presets[p]
      )
    )
  );

  let heroBody;
  if (state.preset === 'tomorrow' && tomorrow) {
    heroBody = el(
      'div',
      {
        className: 'glass-subtle card-pad row-between gap-md',
        style: {
          background: 'rgba(255,255,255,0.12)',
          borderColor: 'rgba(255,255,255,0.24)',
          backdropFilter: 'blur(12px)',
        },
      },
      el(
        'div',
        {style: {display: 'flex', alignItems: 'center', gap: '16px'}},
        createWeatherIcon(tomorrow.weatherCode, true, 'xl'),
        el(
          'div',
          {},
          el(
            'div',
            {
              className: 'muted-xs',
              style: {textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f8e9ef'},
            },
            `${t.home.presetTomorrowLabel} · ${formatDateLabel(tomorrow.date, state.lang, 'full')}`
          ),
          el(
            'div',
            {className: 'font-display', style: {fontSize: '22px', fontWeight: '700', marginTop: '3px'}},
            t.wmo[tomorrow.weatherCode] ?? ''
          )
        )
      ),
      el(
        'div',
        {className: 'mono', style: {display: 'flex', gap: '20px', flexWrap: 'wrap'}},
        el(
          'span',
          {className: 'aer-grad-text', style: {fontSize: '20px', fontWeight: '700'}},
          `${formatTemp(tomorrow.tempMax, state.unit)} / ${formatTemp(tomorrow.tempMin, state.unit)}`
        ),
        el('span', {}, `${Math.round(tomorrow.precipProbMax)}%`),
        el('span', {}, `${Math.round(tomorrow.windMax)} ${t.home.units.kmh}`)
      )
    );
  } else if (state.preset === 'weekend' && weekend.length > 0) {
    heroBody = el(
      'div',
      {className: 'grid-2'},
      weekend.map((day) =>
        el(
          'div',
          {
            className: 'glass-subtle card-pad row-between gap-md',
            style: {
              background: 'rgba(255,255,255,0.12)',
              borderColor: 'rgba(255,255,255,0.24)',
              backdropFilter: 'blur(12px)',
            },
          },
          el(
            'div',
            {style: {display: 'flex', alignItems: 'center', gap: '12px'}},
            createWeatherIcon(day.weatherCode, true, 'lg'),
            el(
              'div',
              {},
              el('div', {className: 'muted-xs', style: {color: '#f8e9ef'}}, formatDateLabel(day.date, state.lang, 'full')),
              el('div', {style: {fontWeight: '600'}}, t.wmo[day.weatherCode] ?? '')
            )
          ),
          el(
            'div',
            {className: 'mono', style: {textAlign: 'right'}},
            el(
              'div',
              {className: 'aer-grad-text', style: {fontWeight: '700', fontSize: '18px'}},
              `${formatTemp(day.tempMax, state.unit)} / ${formatTemp(day.tempMin, state.unit)}`
            ),
            el(
              'div',
              {className: 'muted-xs', style: {color: '#f8e9ef'}},
              `${Math.round(day.precipProbMax)}% · ${Math.round(day.windMax)} ${t.home.units.kmh}`
            )
          )
        )
      )
    );
  } else {
    const tempVal = state.preset === 'today' && today ? today.tempMax : w.current.temperature;
    const code = state.preset === 'today' && today ? today.weatherCode : w.current.weatherCode;
    const creditLabel = [
      t.home.photoCredit,
      state.cityImage?.artist ? `· ${state.cityImage.artist}` : '',
      state.cityImage?.license ? `(${state.cityImage.license})` : '',
    ]
      .filter(Boolean)
      .join(' ');

    heroBody = el(
      'div',
      {className: 'row-between gap-md', style: {alignItems: 'flex-end'}},
      el(
        'div',
        {},
        el(
          'div',
          {className: 'hero-temp-row'},
          el('div', {className: 'hero-temp aer-grad-text mono'}, formatTemp(tempVal, state.unit)),
          el(
            'div',
            {},
            el(
              'div',
              {className: 'hero-cond'},
              createWeatherIcon(code, state.preset === 'now' ? w.current.isDay : true, 'lg'),
              el('span', {}, t.wmo[code] ?? '')
            ),
            el(
              'div',
              {className: 'mono', style: {fontSize: '13.5px', color: 'rgba(248,238,242,0.9)', marginTop: '6px'}},
              `${t.home.feelsLike} ${formatTemp(w.current.apparentTemperature, state.unit)}` +
                (today
                  ? ` · ${t.home.high} ${formatTemp(today.tempMax, state.unit)} / ${t.home.low} ${formatTemp(today.tempMin, state.unit)}`
                  : '')
            )
          )
        ),
        el('p', {className: 'hero-summary'}, generateHeroDailySummary(w, state.unit, state.lang))
      ),
      state.cityImage &&
        (state.cityImage.sourceUrl
          ? el(
              'a',
              {href: state.cityImage.sourceUrl, target: '_blank', rel: 'noreferrer', className: 'hero-credit'},
              creditLabel
            )
          : el('span', {className: 'hero-credit'}, creditLabel))
    );
  }

  const regionLine = [disp.admin1, disp.country].filter(Boolean).join(', ');
  const hero = attachSpotlight(
    el(
      'section',
      {className: 'glass-panel-elevated aer-top-accent hero-card'},
      el('div', {className: 'aer-corner tl', 'aria-hidden': 'true'}),
      el('div', {className: 'aer-corner tr', 'aria-hidden': 'true'}),
      el('div', {className: 'aer-corner bl', 'aria-hidden': 'true'}),
      el('div', {className: 'aer-corner br', 'aria-hidden': 'true'}),
      heroBg,
      el(
        'div',
        {className: 'hero-top'},
        el(
          'div',
          {},
          regionLine &&
            el(
              'div',
              {className: 'hero-meta'},
              el('span', {className: 'aer-eyebrow-line'}),
              createIcon('pin', 'sm c-pink'),
              el('span', {}, regionLine)
            ),
          el('h1', {className: 'hero-city'}, disp.name)
        ),
        el(
          'div',
          {className: 'hero-clock-box'},
          el(
            'div',
            {},
            el(
              'div',
              {style: {fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(243,226,232,0.82)'}},
              t.home.localTime
            ),
            el('div', {className: 'hero-clock mono'}, clock.formattedTime)
          ),
          presetBar
        )
      ),
      el('div', {className: 'hero-bottom'}, heroBody)
    )
  );

  const canUsePointerMotion =
    window.matchMedia('(pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (canUsePointerMotion) {
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;

      const rect = hero.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;

      hero.style.transform = `perspective(1200px) rotateX(${(-ny * 1.8).toFixed(2)}deg) rotateY(${(nx * 1.8).toFixed(2)}deg)`;
      if (heroImgEl) {
        heroImgEl.style.transform = `translate3d(${(nx * -12).toFixed(1)}px, ${(ny * -9).toFixed(1)}px, 0) scale(1.06)`;
      }
    });

    hero.addEventListener('pointerleave', () => {
      hero.style.transform = '';
      if (heroImgEl) heroImgEl.style.transform = 'scale(1.06)';
    });
  }

  const stack = el('div', {className: 'view-stack'}, hero);

  // Compact live status: next-hour precipitation and source freshness.
  const nextHourForecast = getNext24Hours(w);
  const nextHour = nextHourForecast[1] ?? nextHourForecast[0];
  const updatedAt = w.fetchedAt ? new Date(w.fetchedAt) : null;
  const updatedTime = updatedAt
    ? new Intl.DateTimeFormat(state.lang === 'ru' ? 'ru-RU' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: w.timezone || 'UTC',
      }).format(updatedAt)
    : '--:--';

  stack.appendChild(
    el(
      'section',
      {className: 'live-weather-strip glass-panel'},
      el(
        'div',
        {className: 'live-weather-item'},
        createIcon('droplets', 'sm c-sky'),
        el(
          'div',
          {},
          el('span', {className: 'live-weather-label'}, t.home.nextHour),
          el(
            'strong',
            {className: 'live-weather-value mono'},
            nextHour ? `${Math.round(nextHour.precipProb)}%` : '—'
          ),
          el(
            'span',
            {className: 'live-weather-detail'},
            `${t.home.precipitationChance} · ${nextHour ? formatIsoTime(nextHour.time) : '--:--'}`
          )
        )
      ),
      el(
        'div',
        {className: 'live-weather-item live-weather-updated'},
        createIcon('clock', 'sm c-violet'),
        el(
          'div',
          {},
          el('span', {className: 'live-weather-label'}, w.isCached ? t.home.cachedData : t.home.lastUpdated),
          el('strong', {className: 'live-weather-value mono'}, updatedTime),
          el('span', {className: 'live-weather-detail'}, t.home.updateSource)
        )
      )
    )
  );

  // Weather alerts (when active)
  const alerts = generateWeatherAlerts(w, state.lang);
  if (alerts.length > 0) {
    stack.appendChild(
      el(
        'section',
        {className: 'glass-panel card-pad', style: {borderColor: 'rgba(251,113,133,0.45)'}},
        el(
          'div',
          {
            className: 'c-pink font-ibr',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '12px',
            },
          },
          createIcon('alert', 'sm'),
          t.home.alertsTitle
        ),
        el(
          'div',
          {className: 'grid-2'},
          alerts.map((a) =>
            el(
              'div',
              {className: 'glass-subtle metric-box'},
              el('strong', {style: {fontSize: '14px'}}, a.title),
              el('p', {className: 'muted-sub', style: {margin: 0}}, a.description)
            )
          )
        )
      )
    );
  }

  // 01 · Insights & lifestyle guidance
  const insights = generateWeatherInsights(w, state.unit, state.lang);
  stack.appendChild(
    attachSpotlight(
      el(
        'section',
        {className: 'glass-panel aer-top-accent card-pad'},
        el(
          'div',
          {className: 'section-head'},
          el(
            'div',
            {className: 'sec-head-left'},
            el('span', {className: 'sec-num'}, '01'),
            el('h2', {className: 'section-title'}, t.home.insightsTitle)
          ),
          el('span', {className: 'muted-xs'}, t.home.insightsSubtitle)
        ),
        el(
          'div',
          {className: 'grid-4'},
          insights.map((ins) => {
            const cls =
              ins.severity === 'alert'
                ? 'c-pink'
                : ins.severity === 'notice'
                  ? 'c-violet'
                  : 'c-sky';
            return el(
              'div',
              {className: 'glass-subtle metric-box'},
              el('div', {className: cls, style: {fontWeight: '600', fontSize: '14px'}}, ins.title),
              el('p', {className: 'muted-sub', style: {margin: 0}}, ins.description)
            );
          })
        )
      )
    )
  );

  // 02 · Key metrics + Air quality + Sun & Moon
  const trend = computePressureTrend(w);
  const sun = today
    ? computeSunProgress(w.timezone, today.sunrise, today.sunset)
    : {
        progress: 0.5,
        state: 'during',
        daylightHours: 12,
        daylightMinutes: 0,
        goldenEvening: '18:00–18:50',
      };
  const moon = computeMoonPhase(Date.now(), state.lang);
  const windDir = getWindDirectionLabel(w.current.windDirection, t.windDirs);
  const uvCat = getUvCategory(w.current.uvIndex, t.uvLevels);
  const getAqiCls = (aqi) =>
    aqi <= 20
      ? 'c-emerald'
      : aqi <= 40
        ? 'c-sky'
        : aqi <= 60
          ? 'c-amber'
          : aqi <= 80
            ? 'c-orange'
            : 'c-pink';
  const getAqiLabel = (aqi) =>
    aqi <= 20
      ? t.home.aqi.levels.good
      : aqi <= 40
        ? t.home.aqi.levels.fair
        : aqi <= 60
          ? t.home.aqi.levels.moderate
          : aqi <= 80
            ? t.home.aqi.levels.poor
            : t.home.aqi.levels.veryPoor;

  const metricsPanel = attachSpotlight(
    el(
      'section',
      {className: 'glass-panel card-pad', style: {display: 'flex', flexDirection: 'column', gap: '18px'}},
      el(
        'div',
        {className: 'sec-head-left'},
        el('span', {className: 'sec-num'}, '02'),
        el('h2', {className: 'section-title'}, t.home.metricsTitle)
      ),
      el(
        'div',
        {className: 'grid-3'},
        el(
          'div',
          {className: 'glass-subtle metric-box'},
          el(
            'div',
            {className: 'muted-xs', style: {display: 'flex', gap: '8px', alignItems: 'center'}},
            createIcon('droplets', 'sm c-sky'),
            t.home.metrics.humidity
          ),
          el('div', {className: 'metric-val mono'}, `${Math.round(w.current.humidity)}%`)
        ),
        el(
          'div',
          {className: 'glass-subtle metric-box'},
          el(
            'div',
            {className: 'muted-xs', style: {display: 'flex', gap: '8px', alignItems: 'center'}},
            createIcon('wind', 'sm c-blue'),
            t.home.metrics.wind
          ),
          el(
            'div',
            {},
            el(
              'div',
              {className: 'metric-val mono'},
              `${Math.round(w.current.windSpeed)} `,
              el('span', {className: 'muted-xs'}, `${t.home.units.kmh} · ${windDir}`)
            ),
            el(
              'div',
              {className: 'muted-xs mono', style: {marginTop: '3px', fontSize: '11px'}},
              `${t.home.metrics.gusts} ${Math.round(w.current.windGusts)} ${t.home.units.kmh}`
            )
          )
        ),
        el(
          'div',
          {className: 'glass-subtle metric-box'},
          el(
            'div',
            {className: 'muted-xs', style: {display: 'flex', gap: '8px', alignItems: 'center'}},
            createIcon('gauge', 'sm c-violet'),
            t.home.metrics.pressure
          ),
          el(
            'div',
            {},
            el(
              'div',
              {className: 'metric-val mono'},
              `${Math.round(w.current.pressure)} `,
              el('span', {className: 'muted-xs'}, t.home.units.hpa)
            ),
            el(
              'div',
              {
                className: 'muted-xs',
                style: {display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', fontSize: '11px'},
              },
              createIcon(
                trend === 'rising'
                  ? 'arrowUpRight'
                  : trend === 'falling'
                    ? 'arrowDownRight'
                    : 'minus',
                `sm ${trend === 'rising' ? 'c-emerald' : trend === 'falling' ? 'c-pink' : 'c-sky'}`
              ),
              t.home.pressureTrend[trend]
            )
          )
        ),
        el(
          'div',
          {className: 'glass-subtle metric-box'},
          el(
            'div',
            {className: 'muted-xs', style: {display: 'flex', gap: '8px', alignItems: 'center'}},
            createIcon('eye', 'sm c-sky'),
            t.home.metrics.visibility
          ),
          el(
            'div',
            {className: 'metric-val mono'},
            `${(w.current.visibility / 1000).toFixed(1)} `,
            el('span', {className: 'muted-xs'}, t.home.units.km)
          )
        ),
        el(
          'div',
          {className: 'glass-subtle metric-box'},
          el(
            'div',
            {className: 'muted-xs', style: {display: 'flex', gap: '8px', alignItems: 'center'}},
            createIcon('sun', 'sm c-pink'),
            t.home.metrics.uvIndex
          ),
          el(
            'div',
            {className: 'metric-val mono'},
            `${w.current.uvIndex.toFixed(1)} `,
            el('span', {className: 'muted-xs'}, uvCat)
          )
        ),
        el(
          'div',
          {className: 'glass-subtle metric-box'},
          el(
            'div',
            {className: 'muted-xs', style: {display: 'flex', gap: '8px', alignItems: 'center'}},
            createIcon('thermometer', 'sm c-violet'),
            t.home.metrics.dewPoint
          ),
          el('div', {className: 'metric-val mono'}, formatTemp(w.current.dewPoint, state.unit))
        )
      ),
      w.airQuality &&
        el(
          'div',
          {className: 'glass-subtle aqi-row'},
          el(
            'div',
            {},
            el('div', {className: 'muted-xs'}, `${t.home.aqi.title} · ${t.home.aqi.european}`),
            el(
              'div',
              {className: 'metric-val mono', style: {marginTop: '4px'}},
              String(w.airQuality.europeanAqi),
              ' ',
              el(
                'span',
                {className: getAqiCls(w.airQuality.europeanAqi), style: {fontSize: '14px'}},
                getAqiLabel(w.airQuality.europeanAqi)
              )
            )
          ),
          el(
            'div',
            {className: 'aqi-subs mono'},
            el(
              'div',
              {},
              el('div', {className: 'muted-xs'}, t.home.aqi.pm25),
              el('div', {style: {marginTop: '2px'}}, `${w.airQuality.pm25} ${t.home.units.ugm3}`)
            ),
            el(
              'div',
              {},
              el('div', {className: 'muted-xs'}, t.home.aqi.pm10),
              el('div', {style: {marginTop: '2px'}}, `${w.airQuality.pm10} ${t.home.units.ugm3}`)
            ),
            el(
              'div',
              {},
              el('div', {className: 'muted-xs'}, t.home.aqi.no2),
              el('div', {style: {marginTop: '2px'}}, `${w.airQuality.no2} ${t.home.units.ugm3}`)
            ),
            el(
              'div',
              {},
              el('div', {className: 'muted-xs'}, t.home.aqi.ozone),
              el('div', {style: {marginTop: '2px'}}, `${w.airQuality.ozone} ${t.home.units.ugm3}`)
            )
          )
        )
    )
  );

  // Sun trajectory SVG card
  const sunT = sun.progress;
  const sunX = (1 - sunT) * (1 - sunT) * 20 + 2 * (1 - sunT) * sunT * 140 + sunT * sunT * 260;
  const sunY = (1 - sunT) * (1 - sunT) * 96 + 2 * (1 - sunT) * sunT * 12 + sunT * sunT * 96;
  const sunDotColor = sun.state === 'during' ? '#fde68a' : 'var(--muted)';
  const sunSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sunSvg.setAttribute('viewBox', '0 0 280 118');
  sunSvg.style.width = '100%';
  sunSvg.style.height = '112px';
  sunSvg.style.overflow = 'visible';
  sunSvg.innerHTML = `<defs><linearGradient id="vSunG" x1="20" y1="96" x2="260" y2="96" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fff1f2"/><stop offset="52%" stop-color="#fb7185"/><stop offset="100%" stop-color="#818cf8"/></linearGradient></defs><line x1="12" y1="96" x2="268" y2="96" stroke="var(--line-strong)" stroke-dasharray="4 4"/><path d="M 20 96 Q 140 12 260 96" fill="none" stroke="var(--line)" stroke-width="2.5"/><path d="M 20 96 Q 140 12 260 96" fill="none" stroke="url(#vSunG)" stroke-width="3" stroke-dasharray="300" stroke-dashoffset="${300 - 300 * sunT}" stroke-linecap="round"/><circle cx="${sunX}" cy="${sunY}" r="7" fill="${sunDotColor}" stroke="var(--surface)" stroke-width="2.5"/>`;

  const sunCard = attachSpotlight(
    el(
      'section',
      {
        className: 'glass-panel card-pad',
        style: {display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px'},
      },
      el(
        'div',
        {},
        el(
          'div',
          {className: 'row-between mb-md'},
          el('h2', {className: 'section-title'}, t.home.sunTitle),
          el(
            'span',
            {className: 'mono muted-xs'},
            `${sun.daylightHours}h ${String(sun.daylightMinutes).padStart(2, '0')}m`
          )
        ),
        sunSvg
      ),
      el(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            paddingTop: '10px',
            borderTop: '1px solid var(--line)',
          },
        },
        el(
          'div',
          {className: 'row-between'},
          el(
            'div',
            {},
            el('div', {className: 'muted-xs'}, t.home.sunrise),
            el(
              'div',
              {className: 'mono', style: {fontWeight: '600', fontSize: '16px', marginTop: '2px'}},
              today ? formatIsoTime(today.sunrise) : '--:--'
            )
          ),
          el(
            'div',
            {style: {textAlign: 'right'}},
            el('div', {className: 'muted-xs'}, t.home.sunset),
            el(
              'div',
              {className: 'mono', style: {fontWeight: '600', fontSize: '16px', marginTop: '2px'}},
              today ? formatIsoTime(today.sunset) : '--:--'
            )
          )
        ),
        el(
          'div',
          {className: 'glass-subtle row-between', style: {padding: '10px 12px', fontSize: '12px'}},
          el(
            'span',
            {className: 'muted-xs', style: {display: 'flex', alignItems: 'center', gap: '8px'}},
            createIcon('sparkles', 'sm c-pink'),
            t.home.goldenHour
          ),
          el('span', {className: 'mono'}, sun.goldenEvening)
        ),
        el(
          'div',
          {className: 'glass-subtle row-between', style: {padding: '10px 12px', fontSize: '12px'}},
          el(
            'span',
            {className: 'muted-xs', style: {display: 'flex', alignItems: 'center', gap: '8px'}},
            createIcon('moon', 'sm c-blue'),
            t.home.moonPhase
          ),
          el(
            'span',
            {style: {fontWeight: '500'}},
            `${moon.name} · `,
            el('span', {className: 'mono'}, `${moon.illumination}%`)
          )
        )
      )
    )
  );

  stack.appendChild(el('div', {className: 'split-12'}, metricsPanel, sunCard));

  // Short-term atmospheric trends use the same hourly forecast source.
  const trendHours = getNext24Hours(w).slice(0, 12);
  const trendPanel = el(
    'section',
    {className: 'glass-panel card-pad atmospheric-trends'},
    el(
      'div',
      {className: 'sec-head-left'},
      el('span', {className: 'sec-num'}, '03'),
      el('h2', {className: 'section-title'}, t.home.trendsTitle)
    ),
    el(
      'div',
      {className: 'grid-2'},
      createSparkline({
        title: t.home.humidityTrend,
        unitSuffix: '%',
        points: trendHours.map((hour, index) => ({
          label: index === 0 ? t.home.now : formatIsoTime(hour.time),
          value: hour.humidity,
        })),
      }),
      createSparkline({
        title: t.home.pressureTrendChart,
        unitSuffix: ' hPa',
        points: trendHours.map((hour, index) => ({
          label: index === 0 ? t.home.now : formatIsoTime(hour.time),
          value: hour.pressure,
        })),
      })
    )
  );
  stack.appendChild(trendPanel);

  // 04 · 24-hour forecast
  const next24 = getNext24Hours(w);
  stack.appendChild(
    attachSpotlight(
      el(
        'section',
        {className: 'glass-panel card-pad'},
        el(
          'div',
          {className: 'section-head'},
          el(
            'div',
            {className: 'sec-head-left'},
            el('span', {className: 'sec-num'}, '03'),
            el('h2', {className: 'section-title'}, t.home.hourlyTitle)
          ),
          el('span', {className: 'mono muted-xs'}, `${next24.length}h`)
        ),
        createSparkline({
          title: t.home.hourlySparklineTitle,
          points: next24.map((h, i) => ({
            label: i === 0 ? t.home.now : formatIsoTime(h.time),
            value: convertTempExact(h.temperature, state.unit),
          })),
        }),
        el(
          'div',
          {className: 'hourly-strip'},
          next24.map((h, i) =>
            el(
              'div',
              {className: `hour-pill ${i === 0 ? 'now' : ''}`},
              el(
                'span',
                {className: 'mono muted-xs'},
                i === 0 ? t.home.now : formatIsoTime(h.time)
              ),
              createWeatherIcon(h.weatherCode, h.isDay),
              el(
                'span',
                {className: 'mono', style: {fontWeight: '600', fontSize: '15px'}},
                formatTemp(h.temperature, state.unit)
              ),
              el(
                'span',
                {className: 'mono c-sky', style: {fontSize: '11px'}},
                `${Math.round(h.precipProb)}%`
              )
            )
          )
        )
      )
    )
  );

  // 05 · 8-day forecast + Map preview
  const daily8 = w.daily.slice(0, 8);
  const wMin = Math.min(...daily8.map((d) => d.tempMin));
  const wMax = Math.max(...daily8.map((d) => d.tempMax));
  const span = Math.max(1, wMax - wMin);

  const dailyCard = attachSpotlight(
    el(
      'section',
      {className: 'glass-panel card-pad'},
      el(
        'div',
        {className: 'section-head'},
        el(
          'div',
          {className: 'sec-head-left'},
          el('span', {className: 'sec-num'}, '04'),
          el('h2', {className: 'section-title'}, t.home.daily8Title)
        ),
        el(
          'button',
          {type: 'button', className: 'btn-primary', onClick: () => navigate('forecast')},
          t.home.open16Days,
          createIcon('arrowRight', 'sm')
        )
      ),
      el(
        'div',
        {style: {marginBottom: '16px'}},
        createSparkline({
          title: t.home.daily8SparklineTitle,
          showSecondary: true,
          height: 76,
          points: daily8.map((d, i) => ({
            label: i === 0 ? t.home.today : formatDateLabel(d.date, state.lang, 'short'),
            value: convertTempExact(d.tempMax, state.unit),
            secondaryValue: convertTempExact(d.tempMin, state.unit),
          })),
        })
      ),
      el(
        'div',
        {className: 'daily-list'},
        daily8.map((d, i) => {
          const left = ((d.tempMin - wMin) / span) * 100;
          const width = Math.max(8, ((d.tempMax - d.tempMin) / span) * 100);
          return el(
            'div',
            {className: 'daily-row'},
            el(
              'span',
              {style: {width: '108px', fontWeight: '500'}},
              i === 0 ? t.home.today : formatDateLabel(d.date, state.lang, 'full')
            ),
            el(
              'span',
              {style: {display: 'flex', alignItems: 'center', gap: '8px', width: '64px'}},
              createWeatherIcon(d.weatherCode, true, 'sm'),
              d.precipProbMax >= 15
                ? el('span', {className: 'mono c-sky', style: {fontSize: '12px'}}, `${Math.round(d.precipProbMax)}%`)
                : ''
            ),
            el(
              'span',
              {
                className: 'mono',
                style: {width: '36px', textAlign: 'right', fontSize: '12px', color: 'var(--spark-min)', fontWeight: '500'},
              },
              formatTemp(d.tempMin, state.unit)
            ),
            el(
              'div',
              {className: 'daily-bar-track'},
              el('div', {className: 'daily-bar-fill', style: {left: `${left}%`, width: `${width}%`}})
            ),
            el(
              'span',
              {className: 'mono', style: {width: '36px', fontWeight: '600', fontSize: '12px'}},
              formatTemp(d.tempMax, state.unit)
            )
          );
        })
      )
    )
  );

  const mapPreview = attachSpotlight(
    el(
      'section',
      {
        className: 'glass-panel card-pad',
        style: {display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '18px'},
      },
      el(
        'div',
        {},
        el(
          'div',
          {className: 'row-between mb-xs'},
          el('h2', {className: 'section-title'}, t.home.mapPreviewTitle),
          createIcon('map', 'c-pink')
        ),
        el('p', {className: 'muted-sub'}, t.home.mapPreviewDesc)
      ),
      el(
        'div',
        {className: 'map-preview-box'},
        el('div', {className: 'map-preview-glow'}),
        el(
          'div',
          {
            className: 'row-between',
            style: {fontSize: '12px', position: 'relative', zIndex: 2, color: '#f8e9ef'},
          },
          el('span', {}, disp.name),
          el(
            'span',
            {className: 'mono c-pink'},
            `${w.city.latitude.toFixed(2)}°, ${w.city.longitude.toFixed(2)}°`
          )
        ),
        el(
          'div',
          {className: 'radar-center'},
          el('div', {className: 'radar-ring-outer'}),
          el('div', {className: 'radar-ring-inner'}),
          el('span', {className: 'radar-dot'})
        ),
        el(
          'div',
          {
            className: 'row-between mono',
            style: {fontSize: '11px', color: 'rgba(248,238,242,0.9)', position: 'relative', zIndex: 2},
          },
          el('span', {}, `${t.map.layers.temp}: ${formatTemp(w.current.temperature, state.unit)}`),
          el('span', {}, `${t.map.layers.clouds}: ${Math.round(w.current.cloudCover)}%`)
        )
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'btn-subtle',
          style: {width: '100%', height: '44px'},
          onClick: () => navigate('map'),
        },
        t.home.openMap,
        createIcon('arrowRight', 'sm c-pink')
      )
    )
  );

  stack.appendChild(el('div', {className: 'split-12'}, dailyCard, mapPreview));
  return stack;
}

/* ============================================================================
 * 16-Day Forecast View
 * ========================================================================== */

function renderForecastView() {
  const t = TRANSLATIONS[state.lang];
  const w = state.weather;
  const disp = getLocalizedCityDisplay(w.city, state.lang);

  if (!state.expandedDate && w.daily[0]?.date) {
    state.expandedDate = w.daily[0].date;
  }

  const metricCell = (d, m) => {
    switch (m) {
      case 'temperature':
        return `${formatTemp(d.tempMax, state.unit)} / ${formatTemp(d.tempMin, state.unit)}`;
      case 'feelsLike':
        return `${formatTemp(d.feelsMax, state.unit)} / ${formatTemp(d.feelsMin, state.unit)}`;
      case 'precipProb':
        return `${Math.round(d.precipProbMax)}%`;
      case 'precipSum':
        return `${d.precipSum.toFixed(1)} ${t.home.units.mm}`;
      case 'humidity':
        return `${d.humidityMean}%`;
      case 'windSpeed':
        return `${Math.round(d.windMax)} ${t.home.units.kmh}`;
      case 'pressure':
        return `${d.pressureMean} ${t.home.units.hpa}`;
      case 'uvIndex':
        return d.uvMax.toFixed(1);
      case 'cloudCover':
        return `${d.cloudCoverMean}%`;
    }
  };

  return el(
    'div',
    {className: 'view-stack'},
    attachSpotlight(
      el(
        'section',
        {className: 'glass-panel aer-top-accent card-pad'},
        el('div', {className: 'eyebrow'}, el('span', {className: 'aer-eyebrow-line'}), el('span', {}, disp.name)),
        el(
          'div',
          {className: 'row-between mb-md'},
          el(
            'div',
            {},
            el('h1', {className: 'page-title'}, t.forecast.title),
            el('p', {className: 'muted-sub'}, t.forecast.subtitle)
          ),
          el('span', {className: 'mono c-pink', style: {fontSize: '12px', fontWeight: '600'}}, `${w.daily.length}d`)
        ),
        createSparkline({
          title: t.forecast.sparklineTitle,
          height: 96,
          showSecondary: true,
          points: w.daily.map((d, i) => ({
            label: i === 0 ? t.home.today : formatDateLabel(d.date, state.lang, 'short'),
            value: convertTempExact(d.tempMax, state.unit),
            secondaryValue: convertTempExact(d.tempMin, state.unit),
          })),
        })
      )
    ),
    el(
      'section',
      {className: 'glass-panel card-pad'},
      el(
        'div',
        {className: 'row-between mb-md'},
        el('span', {className: 'muted-xs', style: {fontWeight: '500'}}, t.forecast.parametersLabel),
        state.minHintVisible &&
          el('span', {className: 'c-pink', style: {fontSize: '12px', fontWeight: '500'}}, t.forecast.minOneParamHint)
      ),
      el(
        'div',
        {className: 'pill-group'},
        ALL_METRICS.map((m) =>
          el(
            'button',
            {
              type: 'button',
              className: `chip-btn ${state.metrics.includes(m) ? 'active' : ''}`,
              'aria-pressed': String(state.metrics.includes(m)),
              onClick: () => {
                if (state.metrics.includes(m)) {
                  if (state.metrics.length <= 1) {
                    state.minHintVisible = true;
                    renderMain();
                    setTimeout(() => {
                      state.minHintVisible = false;
                      if (state.section === 'forecast') renderMain();
                    }, 2400);
                    return;
                  }
                  state.metrics = state.metrics.filter((x) => x !== m);
                } else {
                  state.metrics = [...state.metrics, m];
                }
                state.minHintVisible = false;
                saveSettings();
                renderMain();
              },
            },
            t.forecast.metrics[m]
          )
        )
      )
    ),
    el(
      'section',
      {className: 'glass-panel table-scroll forecast-desktop'},
      el(
        'table',
        {className: 'forecast-table'},
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', {}, t.forecast.dateCol),
            el('th', {}, t.forecast.conditionCol),
            state.metrics.map((m) => el('th', {}, t.forecast.metrics[m]))
          )
        ),
        el(
          'tbody',
          {},
          w.daily.map((d, i) =>
            el(
              'tr',
              {},
              el(
                'td',
                {style: {fontWeight: '500'}},
                i === 0 ? t.home.today : formatDateLabel(d.date, state.lang, 'full')
              ),
              el(
                'td',
                {},
                el(
                  'span',
                  {style: {display: 'inline-flex', alignItems: 'center', gap: '10px', minWidth: '160px'}},
                  createWeatherIcon(d.weatherCode, true, 'sm'),
                  el('span', {style: {color: 'var(--text-secondary)'}}, t.wmo[d.weatherCode] ?? '')
                )
              ),
              state.metrics.map((m) => el('td', {className: 'mono'}, metricCell(d, m)))
            )
          )
        )
      )
    ),
    el(
      'section',
      {className: 'forecast-mobile'},
      w.daily.map((d, i) => {
        const isExpanded = state.expandedDate === d.date;
        return el(
          'article',
          {className: 'glass-panel', style: {overflow: 'hidden'}},
          el(
            'button',
            {
              type: 'button',
              className: 'm-day-toggle',
              'aria-expanded': String(isExpanded),
              onClick: () => {
                state.expandedDate = isExpanded ? null : d.date;
                renderMain();
              },
            },
            el(
              'div',
              {className: 'row-between', style: {gap: '12px'}},
              el(
                'div',
                {style: {display: 'flex', alignItems: 'center', gap: '12px', minWidth: '0'}},
                createWeatherIcon(d.weatherCode, true, 'lg'),
                el(
                  'div',
                  {style: {minWidth: '0'}},
                  el(
                    'div',
                    {style: {fontWeight: '600', fontSize: '14px'}},
                    i === 0 ? t.home.today : formatDateLabel(d.date, state.lang, 'full')
                  ),
                  el('div', {className: 'muted-xs'}, t.wmo[d.weatherCode] ?? '')
                )
              ),
              el(
                'div',
                {style: {display: 'flex', alignItems: 'center', gap: '10px', flexShrink: '0'}},
                el('span', {className: 'mono', style: {fontWeight: '600', fontSize: '14px'}}, formatTemp(d.tempMax, state.unit)),
                el('span', {className: 'mono muted-xs', style: {fontSize: '14px'}}, formatTemp(d.tempMin, state.unit)),
                createIcon(isExpanded ? 'arrowUp' : 'arrowDown', 'sm c-muted')
              )
            ),
            el(
              'div',
              {className: 'm-day-chips'},
              state.metrics.map((m) =>
                el(
                  'div',
                  {className: 'm-day-chip'},
                  el('span', {className: 'muted-xs', style: {fontSize: '11px'}}, t.forecast.metrics[m]),
                  el('span', {className: 'mono', style: {fontSize: '12px', fontWeight: '500'}}, metricCell(d, m))
                )
              )
            )
          ),
          isExpanded &&
            el(
              'div',
              {className: 'm-day-details'},
              el('div', {}, el('div', {className: 'muted-xs'}, t.forecast.sunriseLabel), el('div', {className: 'mono', style: {marginTop: '2px'}}, formatIsoTime(d.sunrise))),
              el('div', {}, el('div', {className: 'muted-xs'}, t.forecast.sunsetLabel), el('div', {className: 'mono', style: {marginTop: '2px'}}, formatIsoTime(d.sunset))),
              el('div', {}, el('div', {className: 'muted-xs'}, t.forecast.metrics.feelsLike), el('div', {className: 'mono', style: {marginTop: '2px'}}, metricCell(d, 'feelsLike'))),
              el('div', {}, el('div', {className: 'muted-xs'}, t.forecast.metrics.pressure), el('div', {className: 'mono', style: {marginTop: '2px'}}, metricCell(d, 'pressure'))),
              el('div', {}, el('div', {className: 'muted-xs'}, t.forecast.metrics.uvIndex), el('div', {className: 'mono', style: {marginTop: '2px'}}, metricCell(d, 'uvIndex'))),
              el('div', {}, el('div', {className: 'muted-xs'}, t.forecast.metrics.cloudCover), el('div', {className: 'mono', style: {marginTop: '2px'}}, metricCell(d, 'cloudCover')))
            )
        );
      })
    )
  );
}

/* ============================================================================
 * Favorites & Comparison View
 * ========================================================================== */

function renderFavoritesView() {
  const t = TRANSLATIONS[state.lang];
  const stack = el(
    'div',
    {className: 'view-stack'},
    el(
      'section',
      {className: 'glass-panel aer-top-accent card-pad row-between gap-md'},
      el(
        'div',
        {},
        el('div', {className: 'eyebrow'}, el('span', {className: 'aer-eyebrow-line'}), t.brandName),
        el('h1', {className: 'page-title'}, t.favorites.title),
        el('p', {className: 'muted-sub'}, t.favorites.subtitle)
      ),
      el(
        'div',
        {style: {display: 'flex', gap: '10px', alignItems: 'center'}},
        state.favorites.length >= 2 &&
          el(
            'button',
            {
              type: 'button',
              className: state.compareMode ? 'btn-primary' : 'btn-subtle',
              onClick: () => {
                state.compareMode = !state.compareMode;
                if (!state.compareMode) state.compareIds = [];
                renderMain();
              },
            },
            createIcon('compare', 'sm'),
            t.favorites.compareToggle
          ),
        el(
          'div',
          {className: 'glass-subtle mono', style: {padding: '8px 14px', fontSize: '13px', fontWeight: '700'}},
          el('span', {className: 'c-pink'}, String(state.favorites.length)),
          ` ${t.favorites.counterSuffix}`
        )
      )
    )
  );

  // Lazy-load weather for saved cities
  state.favorites.forEach((fav) => {
    if (!state.favWeatherMap[fav.id]) {
      const cached = getCachedWeather(fav);
      if (cached) state.favWeatherMap[fav.id] = cached;
      void fetchCityWeather(fav)
        .then((data) => {
          state.favWeatherMap[fav.id] = data;
          if (state.section === 'favorites') renderMain();
        })
        .catch(() => {});
    }
  });

  if (state.compareMode) {
    const pair = state.compareIds
      .map((id) => ({
        city: state.favorites.find((c) => c.id === id),
        weather: state.favWeatherMap[id],
      }))
      .filter((x) => x.city && x.weather);

    stack.appendChild(
      el(
        'section',
        {className: 'glass-panel card-pad', style: {borderColor: 'rgba(251,113,133,0.45)'}},
        el(
          'div',
          {className: 'row-between mb-md'},
          el('strong', {}, pair.length === 2 ? t.favorites.compareTitle : t.favorites.compareSelectHint),
          state.compareIds.length > 0 &&
            el(
              'button',
              {
                type: 'button',
                className: 'c-pink',
                onClick: () => {
                  state.compareIds = [];
                  renderMain();
                },
              },
              t.favorites.clearCompare
            )
        ),
        pair.length === 2 &&
          el(
            'div',
            {className: 'grid-2'},
            pair.map(({city, weather}) => {
              const disp = getLocalizedCityDisplay(city, state.lang);
              const clk = getCityLocalClock(weather.timezone);
              return el(
                'div',
                {className: 'glass-subtle metric-box'},
                el(
                  'div',
                  {className: 'row-between'},
                  el(
                    'div',
                    {},
                    el('strong', {style: {fontSize: '18px'}}, disp.name),
                    el('div', {className: 'muted-xs'}, `${disp.country} · ${clk.formattedTime}`)
                  ),
                  el(
                    'div',
                    {className: 'aer-grad-text mono', style: {fontSize: '24px', fontWeight: '700'}},
                    formatTemp(weather.current.temperature, state.unit)
                  )
                ),
                el(
                  'div',
                  {className: 'mono muted-xs'},
                  `${t.home.metrics.wind}: ${Math.round(weather.current.windSpeed)} ${t.home.units.kmh} · ${t.home.metrics.humidity}: ${Math.round(weather.current.humidity)}% · ${t.home.metrics.pressure}: ${Math.round(weather.current.pressure)} ${t.home.units.hpa}`
                )
              );
            })
          )
      )
    );
  }

  if (state.favorites.length === 0) {
    stack.appendChild(
      el(
        'section',
        {className: 'glass-panel card-pad'},
        el('h2', {className: 'section-title'}, t.favorites.emptyTitle),
        el('p', {className: 'muted-sub mb-md'}, t.favorites.emptyDesc),
        el(
          'div',
          {className: 'pill-group'},
          DEFAULT_CITIES.map((c) =>
            el(
              'button',
              {
                type: 'button',
                className: 'btn-subtle',
                onClick: () => {
                  state.favorites.unshift(c);
                  saveFavorites();
                  renderChrome();
                  renderMain();
                },
              },
              `+ ${getLocalizedCityDisplay(c, state.lang).name}`
            )
          )
        )
      )
    );
    return stack;
  }

  stack.appendChild(
    el(
      'div',
      {className: 'fav-grid'},
      state.favorites.map((city, idx) => {
        const disp = getLocalizedCityDisplay(city, state.lang);
        const w = state.favWeatherMap[city.id];
        const phase = w
          ? computeDayPhase(w.timezone, w.daily[0]?.sunrise, w.daily[0]?.sunset)
          : 'night';
        const clk = w ? getCityLocalClock(w.timezone) : null;
        const compared = state.compareIds.includes(city.id);

        return attachSpotlight(
          el(
            'article',
            {
              className: 'glass-panel aer-top-accent fav-card',
              style: compared ? {borderColor: 'var(--pink)'} : {},
            },
            el(
              'div',
              {className: 'row-between', style: {alignItems: 'flex-start'}},
              el(
                'div',
                {},
                el(
                  'div',
                  {className: 'mono muted-xs'},
                  clk ? `${clk.formattedTime} · ${t.dayPhases[phase]}` : t.dayPhases[phase]
                ),
                el('h2', {className: 'section-title', style: {marginTop: '4px'}}, disp.name),
                el('div', {className: 'muted-xs'}, [disp.admin1, disp.country].filter(Boolean).join(' · '))
              ),
              w
                ? el(
                    'div',
                    {style: {display: 'flex', alignItems: 'center', gap: '10px'}},
                    createWeatherIcon(w.current.weatherCode, w.current.isDay, 'lg'),
                    el(
                      'div',
                      {style: {textAlign: 'right'}},
                      el(
                        'div',
                        {className: 'aer-grad-text mono', style: {fontSize: '24px', fontWeight: '700'}},
                        formatTemp(w.current.temperature, state.unit)
                      ),
                      el(
                        'div',
                        {className: 'muted-xs mono'},
                        `${formatTemp(w.daily[0]?.tempMax ?? w.current.temperature, state.unit)} / ${formatTemp(w.daily[0]?.tempMin ?? w.current.temperature, state.unit)}`
                      )
                    )
                  )
                : el('span', {className: 'muted-xs'}, t.favorites.loadingWeather)
            ),
            w && el('div', {className: 'muted-xs'}, t.wmo[w.current.weatherCode] ?? ''),
            el(
              'div',
              {className: 'fav-actions'},
              state.compareMode
                ? el(
                    'button',
                    {
                      type: 'button',
                      className: compared ? 'btn-primary' : 'btn-subtle',
                      onClick: () => {
                        if (compared) {
                          state.compareIds = state.compareIds.filter((x) => x !== city.id);
                        } else {
                          state.compareIds =
                            state.compareIds.length >= 2
                              ? [state.compareIds[1], city.id]
                              : [...state.compareIds, city.id];
                        }
                        renderMain();
                      },
                    },
                    t.favorites.compareToggle
                  )
                : el(
                    'div',
                    {style: {display: 'flex', gap: '8px'}},
                    el(
                      'button',
                      {
                        type: 'button',
                        className: 'btn-primary',
                        onClick: () => {
                          selectCity(city);
                          navigate('home');
                        },
                      },
                      t.favorites.openCity
                    ),
                    el(
                      'button',
                      {
                        type: 'button',
                        className: 'btn-subtle',
                        onClick: () => {
                          selectCity(city);
                          navigate('map');
                        },
                      },
                      t.favorites.showOnMap
                    )
                  ),
              el(
                'div',
                {style: {display: 'flex', gap: '4px'}},
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'btn-icon',
                    style: {width: '30px', height: '30px'},
                    disabled: idx === 0,
                    'aria-label': t.favorites.moveUp,
                    onClick: () => moveFav(idx, -1),
                  },
                  createIcon('arrowUp', 'sm')
                ),
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'btn-icon',
                    style: {width: '30px', height: '30px'},
                    disabled: idx === state.favorites.length - 1,
                    'aria-label': t.favorites.moveDown,
                    onClick: () => moveFav(idx, 1),
                  },
                  createIcon('arrowDown', 'sm')
                ),
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'btn-icon',
                    style: {width: '30px', height: '30px'},
                    'aria-label': t.favorites.removeCity,
                    onClick: () => {
                      state.favorites = state.favorites.filter((f) => !sameCity(f, city));
                      saveFavorites();
                      renderChrome();
                      renderMain();
                    },
                  },
                  createIcon('trash', 'sm c-pink')
                )
              )
            )
          )
        );
      })
    )
  );
  return stack;
}

/* ============================================================================
 * Main View Orchestration, Footer & State Actions
 * ========================================================================== */

function renderMain() {
  activeMapController?.destroy();
  activeMapController = null;
  const t = TRANSLATIONS[state.lang];

  if (state.loadError && !state.weather) {
    setChildren(
      refs.main,
      el(
        'div',
        {className: 'glass-panel card-pad', style: {textAlign: 'center'}},
        el('h2', {className: 'section-title'}, t.errors.loadFailedTitle),
        el('p', {className: 'muted-sub mb-md'}, t.errors.loadFailedDesc),
        el(
          'button',
          {type: 'button', className: 'btn-primary', onClick: () => loadCity(state.city)},
          t.errors.retry
        )
      )
    );
    return;
  }

  if (!state.weather) {
    setChildren(
      refs.main,
      el('div', {className: 'glass-panel card-pad', style: {height: '280px'}})
    );
    return;
  }

  try {
    if (state.section === 'home') {
      setChildren(refs.main, renderHomeView());
    } else if (state.section === 'forecast') {
      setChildren(refs.main, renderForecastView());
    } else if (state.section === 'favorites') {
      setChildren(refs.main, renderFavoritesView());
    } else if (state.section === 'map') {
      const disp = getLocalizedCityDisplay(state.city, state.lang);
      activeMapController = createWeatherMapView({
        city: state.city,
        cityName: disp.name,
        unit: state.unit,
        t,
      });
      setChildren(refs.main, activeMapController.el);
    }
  } catch (err) {
    console.error('AER.wave render error:', err);
    setChildren(
      refs.main,
      el(
        'div',
        {className: 'glass-panel card-pad', style: {textAlign: 'center'}},
        el('h2', {className: 'section-title'}, t.errors.loadFailedTitle),
        el('p', {className: 'muted-sub mb-md'}, String(err?.message || t.errors.loadFailedDesc)),
        el(
          'button',
          {type: 'button', className: 'btn-primary', onClick: () => loadCity(state.city)},
          t.errors.retry
        )
      )
    );
  }
}

function renderFooter() {
  if (!refs.footer) return;
  const t = TRANSLATIONS[state.lang];
  setChildren(
    refs.footer,
    el(
      'div',
      {className: 'footer-brand'},
      el('span', {className: 'aer-brand-mark', style: {fontSize: '14px', lineHeight: '1'}}, 'AER'),
      el('span', {className: 'font-ibr', style: {fontWeight: '600', color: 'var(--text)'}}, '.wave'),
      el('span', {'aria-hidden': 'true'}, '·'),
      el('span', {}, t.slogan)
    ),
    el('div', {className: 'footer-credit'}, 'CREATED BY IBRAIMOVW AMIR, 2026')
  );
}

function renderChrome() {
  syncAtmosphere();
  renderSidebar();
  renderTopBar();
  renderDock();
  renderBanners();
  renderDrawer();
  renderFooter();
}

function navigate(sec) {
  state.section = sec;
  renderChrome();
  renderMain();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  saveSettings();
  renderChrome();
}

function setLang(code) {
  state.lang = code;
  saveSettings();
  void resolveAllLocalizations();
  renderChrome();
  renderMain();
}

function setUnit(u) {
  state.unit = u;
  saveSettings();
  renderChrome();
  renderMain();
}

function toggleCurrentFavorite() {
  const exists = state.favorites.some((f) => sameCity(f, state.city));
  if (exists) {
    state.favorites = state.favorites.filter((f) => !sameCity(f, state.city));
    state.favoriteNotice = null;
  } else if (state.favorites.length >= MAX_FAVORITES) {
    state.favoriteNotice = TRANSLATIONS[state.lang].topbar.favoriteLimitReached;
    renderTopBar();
    setTimeout(() => {
      state.favoriteNotice = null;
      renderTopBar();
    }, 2600);
    return;
  } else {
    state.favorites = [state.city, ...state.favorites];
    state.favoriteNotice = null;
  }
  saveFavorites();
  renderChrome();
  if (state.section === 'favorites') renderMain();
}

function moveFav(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= state.favorites.length) return;
  const copy = [...state.favorites];
  const [moved] = copy.splice(idx, 1);
  copy.splice(target, 0, moved);
  state.favorites = copy;
  saveFavorites();
  renderMain();
}

function selectCity(city) {
  state.city = city;
  saveSettings();
  if (state.section === 'favorites') state.section = 'home';
  loadCity(city);
}

async function resolveAllLocalizations() {
  const lang = state.lang;
  if (!state.city.localized?.[lang]) {
    const updated = await resolveCityLocalization(state.city, lang).catch(() => null);
    if (updated?.localized?.[lang] && sameCity(state.city, updated)) {
      state.city = {...state.city, localized: {...state.city.localized, ...updated.localized}};
      if (state.weather) state.weather.city = state.city;
      saveSettings();
      renderChrome();
      renderMain();
    }
  }
  await Promise.allSettled(
    state.favorites.map(async (f, i) => {
      if (f.localized?.[lang]) return;
      const u = await resolveCityLocalization(f, lang);
      if (u.localized?.[lang]) state.favorites[i] = u;
    })
  );
  saveFavorites();
  if (state.section === 'favorites') renderMain();
}

function loadCity(city) {
  weatherAbort?.abort();
  weatherAbort = new AbortController();
  const signal = weatherAbort.signal;

  const cached = getCachedWeather(city);
  if (cached) state.weather = cached;
  state.isLoading = true;
  state.loadError = false;
  renderChrome();
  renderMain();

  void Promise.allSettled([
    fetchCityWeather(city, signal),
    fetchCityPanorama(city, signal),
  ]).then(([wRes, imgRes]) => {
    if (signal.aborted) return;
    if (wRes.status === 'fulfilled') {
      state.weather = wRes.value;
      state.loadError = false;
    } else {
      const fb = getCachedWeather(city);
      state.weather = fb;
      state.loadError = !fb;
    }
    state.cityImage = imgRes.status === 'fulfilled' ? imgRes.value : null;
    state.isLoading = false;
    renderChrome();
    renderMain();
    void resolveAllLocalizations();
  });
}

/* ============================================================================
 * Global Listeners & Application Boot
 * ========================================================================== */

window.addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType !== 'mouse' || !refs.glow) return;
    refs.glow.style.left = `${e.clientX}px`;
    refs.glow.style.top = `${e.clientY}px`;
  },
  {passive: true}
);

window.addEventListener(
  'scroll',
  () => {
    refs.scrollBtn.hidden = window.scrollY < 400;
    document.documentElement.style.setProperty(
      '--scroll-depth',
      `${Math.min(window.scrollY, 900)}px`
    );
  },
  {passive: true}
);

refs.scrollBtn.appendChild(createIcon('arrowUp', 'sm'));
refs.scrollBtn.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.mobileMenuOpen) setMobileMenu(false);
});

document.addEventListener('click', (e) => {
  if (!refs.topbar.contains(e.target)) {
    const dd = refs.topbar.querySelector('.search-dropdown');
    if (dd) dd.hidden = true;
  }
});

window.addEventListener('online', () => {
  state.isOnline = true;
  renderBanners();
});

window.addEventListener('offline', () => {
  state.isOnline = false;
  renderBanners();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.deferredPrompt = e;
  renderChrome();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

initMagneticButtons();
loadCity(state.city);
