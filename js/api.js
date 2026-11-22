const WEATHER_CACHE_KEY = 'aerwave_vanilla_weather_v7';
const CITY_I18N_KEY = 'aerwave_vanilla_city_i18n_v7';
const PANORAMA_KEY = 'aerwave_vanilla_panoramas_v7';
const PANORAMA_MEM = new Map();

export const DEFAULT_CITIES = [
  {
    id: '524901',
    name: 'Москва',
    country: 'Россия',
    admin1: 'Москва',
    latitude: 55.7522,
    longitude: 37.6156,
    timezone: 'Europe/Moscow',
    localized: {
      ru: {name: 'Москва', country: 'Россия', admin1: 'Москва'},
      en: {name: 'Moscow', country: 'Russia', admin1: 'Moscow'},
    },
  },
  {
    id: '1850147',
    name: 'Токио',
    country: 'Япония',
    admin1: 'Токио',
    latitude: 35.6895,
    longitude: 139.6917,
    timezone: 'Asia/Tokyo',
    localized: {
      ru: {name: 'Токио', country: 'Япония', admin1: 'Токио'},
      en: {name: 'Tokyo', country: 'Japan', admin1: 'Tokyo'},
    },
  },
  {
    id: '2643743',
    name: 'Лондон',
    country: 'Великобритания',
    admin1: 'Англия',
    latitude: 51.5085,
    longitude: -0.1257,
    timezone: 'Europe/London',
    localized: {
      ru: {name: 'Лондон', country: 'Великобритания', admin1: 'Англия'},
      en: {name: 'London', country: 'United Kingdom', admin1: 'England'},
    },
  },
  {
    id: '5128581',
    name: 'Нью-Йорк',
    country: 'США',
    admin1: 'Нью-Йорк',
    latitude: 40.7143,
    longitude: -74.006,
    timezone: 'America/New_York',
    localized: {
      ru: {name: 'Нью-Йорк', country: 'США', admin1: 'Нью-Йорк'},
      en: {name: 'New York', country: 'United States', admin1: 'New York'},
    },
  },
  {
    id: '3413829',
    name: 'Рейкьявик',
    country: 'Исландия',
    admin1: 'Столичный регион',
    latitude: 64.1355,
    longitude: -21.8954,
    timezone: 'Atlantic/Reykjavik',
    localized: {
      ru: {name: 'Рейкьявик', country: 'Исландия', admin1: 'Столичный регион'},
      en: {name: 'Reykjavik', country: 'Iceland', admin1: 'Capital Region'},
    },
  },
];

export function cityKey(city) {
  return `${city.latitude.toFixed(2)},${city.longitude.toFixed(2)}`;
}

function readJson(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function getLocalizedCityDisplay(city, lang) {
  const direct = city.localized?.[lang];
  if (direct?.name) return direct;
  const store = readJson(CITY_I18N_KEY);
  const stored = store[cityKey(city)]?.[lang];
  if (stored?.name) return stored;
  return {name: city.name, country: city.country || '', admin1: city.admin1 || ''};
}

export async function searchCities(query, lang, signal) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', trimmed);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', lang);
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString(), {signal});
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);
  const json = await res.json();
  if (!json.results) return [];

  const i18nStore = readJson(CITY_I18N_KEY);
  const mapped = json.results.map((item) => {
    const loc = {name: item.name, country: item.country ?? '', admin1: item.admin1 ?? ''};
    const k = cityKey({latitude: item.latitude, longitude: item.longitude});
    i18nStore[k] = {...(i18nStore[k] ?? {}), [lang]: loc};
    return {
      id: String(item.id),
      name: item.name,
      country: item.country ?? '',
      admin1: item.admin1 ?? '',
      latitude: item.latitude,
      longitude: item.longitude,
      timezone: item.timezone,
      localized: {[lang]: loc},
    };
  });
  writeJson(CITY_I18N_KEY, i18nStore);
  return mapped;
}

export async function resolveCityLocalization(city, targetLang, signal) {
  if (city.localized?.[targetLang]?.name) return city;
  const k = cityKey(city);
  const store = readJson(CITY_I18N_KEY);
  if (store[k]?.[targetLang]?.name) {
    return {...city, localized: {...city.localized, [targetLang]: store[k][targetLang]}};
  }

  try {
    const query = city.localized?.en?.name ?? city.localized?.ru?.name ?? city.name;
    const candidates = await searchCities(query, targetLang, signal);
    const match = candidates.find(
      (c) => Math.abs(c.latitude - city.latitude) < 0.35 && Math.abs(c.longitude - city.longitude) < 0.35
    );
    if (match) {
      const loc = {name: match.name, country: match.country, admin1: match.admin1};
      store[k] = {...(store[k] ?? {}), [targetLang]: loc};
      writeJson(CITY_I18N_KEY, store);
      return {...city, localized: {...city.localized, [targetLang]: loc}};
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }

  try {
    const nom = new URL('https://nominatim.openstreetmap.org/reverse');
    nom.searchParams.set('format', 'jsonv2');
    nom.searchParams.set('lat', city.latitude.toFixed(4));
    nom.searchParams.set('lon', city.longitude.toFixed(4));
    nom.searchParams.set('zoom', '10');
    nom.searchParams.set('accept-language', targetLang);
    const res = await fetch(nom.toString(), {signal});
    if (res.ok) {
      const d = await res.json();
      const name = d.address?.city ?? d.address?.town ?? d.address?.village ?? d.name;
      if (name) {
        const loc = {name, country: d.address?.country ?? city.country, admin1: d.address?.state ?? city.admin1};
        store[k] = {...(store[k] ?? {}), [targetLang]: loc};
        writeJson(CITY_I18N_KEY, store);
        return {...city, localized: {...city.localized, [targetLang]: loc}};
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }
  return city;
}

export function getCachedWeather(city) {
  const store = readJson(WEATHER_CACHE_KEY);
  const entry = store[cityKey(city)];
  if (!entry) return null;
  return {...entry, isCached: true, cachedAt: entry.fetchedAt};
}

export async function fetchAirQuality(city, signal) {
  try {
    const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    url.searchParams.set('latitude', city.latitude.toFixed(4));
    url.searchParams.set('longitude', city.longitude.toFixed(4));
    url.searchParams.set('current', 'european_aqi,us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone');
    const res = await fetch(url.toString(), {signal});
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.current) return null;
    return {
      europeanAqi: Math.round(json.current.european_aqi ?? 0),
      usAqi: Math.round(json.current.us_aqi ?? 0),
      pm25: Number((json.current.pm2_5 ?? 0).toFixed(1)),
      pm10: Number((json.current.pm10 ?? 0).toFixed(1)),
      no2: Number((json.current.nitrogen_dioxide ?? 0).toFixed(1)),
      ozone: Number((json.current.ozone ?? 0).toFixed(1)),
    };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return null;
  }
}

export async function fetchCityWeather(city, signal) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', city.latitude.toFixed(4));
  url.searchParams.set('longitude', city.longitude.toFixed(4));
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,dew_point_2m,uv_index'
  );
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_gusts_10m,visibility,uv_index,cloud_cover,is_day,dew_point_2m'
  );
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max'
  );
  url.searchParams.set('forecast_days', '16');
  url.searchParams.set('timezone', 'auto');

  const [res, airQuality] = await Promise.all([fetch(url.toString(), {signal}), fetchAirQuality(city, signal)]);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  const raw = await res.json();

  const hourly = raw.hourly.time.map((time, i) => ({
    time,
    temperature: raw.hourly.temperature_2m[i] ?? 0,
    humidity: raw.hourly.relative_humidity_2m[i] ?? 0,
    apparentTemperature: raw.hourly.apparent_temperature[i] ?? 0,
    precipProb: raw.hourly.precipitation_probability[i] ?? 0,
    precipitation: raw.hourly.precipitation[i] ?? 0,
    weatherCode: raw.hourly.weather_code[i] ?? 0,
    pressure: raw.hourly.pressure_msl[i] ?? 1013,
    windSpeed: raw.hourly.wind_speed_10m[i] ?? 0,
    windGusts: raw.hourly.wind_gusts_10m?.[i] ?? raw.hourly.wind_speed_10m[i] ?? 0,
    visibility: raw.hourly.visibility[i] ?? 10000,
    uvIndex: raw.hourly.uv_index[i] ?? 0,
    cloudCover: raw.hourly.cloud_cover[i] ?? 0,
    isDay: (raw.hourly.is_day[i] ?? 1) === 1,
    dewPoint: raw.hourly.dew_point_2m[i] ?? 0,
  }));

  const dailyBuckets = new Map();
  for (const h of hourly) {
    const dayKey = h.time.slice(0, 10);
    const list = dailyBuckets.get(dayKey) ?? [];
    list.push(h);
    dailyBuckets.set(dayKey, list);
  }

  const daily = raw.daily.time.map((date, i) => {
    const bucket = dailyBuckets.get(date) ?? [];
    const avg = (arr) =>
      arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    return {
      date,
      weatherCode: raw.daily.weather_code[i] ?? 0,
      tempMax: raw.daily.temperature_2m_max[i] ?? 0,
      tempMin: raw.daily.temperature_2m_min[i] ?? 0,
      feelsMax: raw.daily.apparent_temperature_max[i] ?? 0,
      feelsMin: raw.daily.apparent_temperature_min[i] ?? 0,
      sunrise: raw.daily.sunrise[i] ?? '',
      sunset: raw.daily.sunset[i] ?? '',
      uvMax: raw.daily.uv_index_max[i] ?? 0,
      precipSum: raw.daily.precipitation_sum[i] ?? 0,
      precipProbMax: raw.daily.precipitation_probability_max[i] ?? 0,
      windMax: raw.daily.wind_speed_10m_max[i] ?? 0,
      humidityMean: bucket.length > 0 ? avg(bucket.map((b) => b.humidity)) : Math.round(raw.current.relative_humidity_2m),
      pressureMean: bucket.length > 0 ? avg(bucket.map((b) => b.pressure)) : Math.round(raw.current.pressure_msl),
      cloudCoverMean: bucket.length > 0 ? avg(bucket.map((b) => b.cloudCover)) : Math.round(raw.current.cloud_cover),
    };
  });

  const data = {
    city,
    timezone: raw.timezone || city.timezone || 'UTC',
    current: {
      temperature: raw.current.temperature_2m,
      apparentTemperature: raw.current.apparent_temperature,
      humidity: raw.current.relative_humidity_2m,
      windSpeed: raw.current.wind_speed_10m,
      windGusts: raw.current.wind_gusts_10m ?? raw.current.wind_speed_10m,
      windDirection: raw.current.wind_direction_10m,
      pressure: raw.current.pressure_msl,
      visibility: raw.current.visibility ?? hourly[0]?.visibility ?? 10000,
      uvIndex: raw.current.uv_index ?? hourly[0]?.uvIndex ?? 0,
      dewPoint: raw.current.dew_point_2m ?? hourly[0]?.dewPoint ?? 0,
      cloudCover: raw.current.cloud_cover,
      precipitation: raw.current.precipitation,
      weatherCode: raw.current.weather_code,
      isDay: raw.current.is_day === 1,
    },
    airQuality: airQuality ?? undefined,
    hourly,
    daily,
    fetchedAt: Date.now(),
    isCached: false,
  };

  const cacheStore = readJson(WEATHER_CACHE_KEY);
  cacheStore[cityKey(city)] = data;
  const trimmed = Object.fromEntries(
    Object.entries(cacheStore)
      .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
      .slice(0, 15)
  );
  writeJson(WEATHER_CACHE_KEY, trimmed);
  return data;
}

export async function fetchMapGrid(bounds, signal) {
  const latSpan = Math.max(0.5, bounds.north - bounds.south);
  const lonSpan = Math.max(0.5, bounds.east - bounds.west);
  const coords = [];
  for (let r = 0; r < 3; r++) {
    const lat = bounds.south + ((r + 0.5) / 3) * latSpan;
    for (let c = 0; c < 4; c++) {
      let lon = bounds.west + ((c + 0.5) / 4) * lonSpan;
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
      coords.push({lat: Math.max(-85, Math.min(85, lat)), lon});
    }
  }
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', coords.map((p) => p.lat.toFixed(3)).join(','));
  url.searchParams.set('longitude', coords.map((p) => p.lon.toFixed(3)).join(','));
  url.searchParams.set('current', 'temperature_2m,precipitation,wind_speed_10m,cloud_cover');
  const res = await fetch(url.toString(), {signal});
  if (!res.ok) throw new Error(`Map grid error: ${res.status}`);
  const json = await res.json();
  const list = Array.isArray(json) ? json : [json];
  return list.map((item, idx) => ({
    lat: item.latitude ?? coords[idx].lat,
    lon: item.longitude ?? coords[idx].lon,
    temperature: item.current?.temperature_2m ?? 0,
    precipitation: item.current?.precipitation ?? 0,
    windSpeed: item.current?.wind_speed_10m ?? 0,
    cloudCover: item.current?.cloud_cover ?? 0,
  }));
}

const REJECT_RE =
  /flag|coat_of_arms|coat-of-arms|arms|seal|emblem|logo|locator|location_map|location-map|map|diagram|chart|graph|metro_map|stamp|coin|portrait|signature|icon|symbol|banner|ambox|shackle|statistical|art_project|painting|fresco/i;

function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validPhoto(title, w, h, url) {
  if (!/\.(jpe?g|png|webp)(\?|$)/i.test(url)) return false;
  const file = url.split('?')[0]?.split('/').pop() ?? '';
  if (REJECT_RE.test(title) || REJECT_RE.test(file)) return false;
  if (w < 700 || h < 350) return false;
  const ratio = w / h;
  return ratio >= 1.15 && ratio <= 4.2;
}

export async function fetchCityPanorama(city, signal) {
  const k = cityKey(city);
  if (PANORAMA_MEM.has(k)) return PANORAMA_MEM.get(k);

  const stored = readJson(PANORAMA_KEY);
  if (stored[k]?.data && Date.now() - stored[k].savedAt < 7 * 86400000) {
    PANORAMA_MEM.set(k, stored[k].data);
    return stored[k].data;
  }

  const enName = city.localized?.en?.name ?? (/^[\x20-\x7E]+$/.test(city.name) ? city.name : '');
  const ruName = city.localized?.ru?.name ?? city.name;
  const candidates = [];
  if (enName) {
    candidates.push({sub: 'en', title: enName});
    if (!/\bcity\b/i.test(enName)) candidates.push({sub: 'en', title: `${enName} City`});
  }
  if (ruName) candidates.push({sub: 'ru', title: ruName});

  try {
    for (const c of candidates) {
      const slug = encodeURIComponent(c.title.trim().replace(/\s+/g, '_'));
      const res = await fetch(`https://${c.sub}.wikipedia.org/api/rest_v1/page/summary/${slug}`, {signal});
      if (!res.ok) continue;
      const d = await res.json();
      if (d.type === 'disambiguation') continue;
      if (d.coordinates && haversineKm(city.latitude, city.longitude, d.coordinates.lat, d.coordinates.lon) > 150) continue;
      const img = d.originalimage ?? d.thumbnail;
      if (img?.source && validPhoto(d.title ?? c.title, img.width, img.height, img.source)) {
        const result = {url: img.source, title: d.title ?? c.title, sourceUrl: d.content_urls?.desktop?.page};
        PANORAMA_MEM.set(k, result);
        stored[k] = {data: result, savedAt: Date.now()};
        writeJson(PANORAMA_KEY, stored);
        return result;
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }

  PANORAMA_MEM.set(k, null);
  return null;
}
