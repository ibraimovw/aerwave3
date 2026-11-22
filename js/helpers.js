export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'className') {
      node.className = v;
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(node.style, v);
    } else if (k === 'dataset' && typeof v === 'object') {
      Object.assign(node.dataset, v);
    } else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) {
      node.setAttribute(k, '');
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

export function setChildren(parent, ...children) {
  if (!parent) return;
  const nodes = [];
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      nodes.push(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      nodes.push(child);
    }
  }
  parent.replaceChildren(...nodes);
}

export function attachSpotlight(node) {
  node.classList.add('glass-spotlight');
  node.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    node.style.setProperty('--my', `${e.clientY - rect.top}px`);
    node.style.setProperty('--spotlight-opacity', '1');
  });
  node.addEventListener('pointerleave', () => {
    node.style.setProperty('--spotlight-opacity', '0');
  });
  return node;
}

export function initMagneticButtons() {
  if (typeof window === 'undefined') return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  const selector =
    '.btn-primary, .btn-subtle, .btn-icon, .btn-theme-circle, .seg-btn, .preset-btn, .chip-btn, .sidebar-toggle-btn, .nav-btn';
  let activeEl = null;

  const resetActive = () => {
    if (!activeEl) return;
    activeEl.style.setProperty('--mag-x', '0px');
    activeEl.style.setProperty('--mag-y', '0px');
    activeEl = null;
  };

  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const target = e.target instanceof Element ? e.target.closest(selector) : null;
      if (!target || target.disabled) {
        resetActive();
        return;
      }
      if (activeEl && activeEl !== target) {
        activeEl.style.setProperty('--mag-x', '0px');
        activeEl.style.setProperty('--mag-y', '0px');
      }
      activeEl = target;
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      const pull = target.classList.contains('btn-primary') ? 5.5 : 3.5;
      target.style.setProperty('--mag-x', `${(nx * pull).toFixed(2)}px`);
      target.style.setProperty('--mag-y', `${(ny * pull).toFixed(2)}px`);
    },
    {passive: true}
  );

  document.addEventListener('pointerleave', resetActive, true);
  window.addEventListener('blur', resetActive);
}

export function convertTemp(tempC, unit) {
  return unit === 'F' ? Math.round((tempC * 9) / 5 + 32) : Math.round(tempC);
}

export function convertTempExact(tempC, unit) {
  return unit === 'F' ? (tempC * 9) / 5 + 32 : tempC;
}

export function formatTemp(tempC, unit) {
  return `${convertTemp(tempC, unit)}°`;
}

export function getWeatherMood(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  return 'rain';
}

export function getCityLocalClock(timezone, nowMs = Date.now()) {
  try {
    const d = new Date(nowMs);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));
    return {
      dateStr: `${get('year')}-${get('month')}-${get('day')}`,
      minutesOfDay: hour * 60 + minute,
      formattedTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
  } catch {
    const d = new Date(nowMs);
    return {
      dateStr: d.toISOString().slice(0, 10),
      minutesOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
      formattedTime: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
    };
  }
}

export function parseIsoMinutes(isoStr) {
  const m = /T(\d{2}):(\d{2})/.exec(isoStr || '');
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatIsoTime(isoStr) {
  const m = /T(\d{2}:\d{2})/.exec(isoStr || '');
  return m ? m[1] : '--:--';
}

export function computeDayPhase(timezone, sunriseIso, sunsetIso, nowMs = Date.now()) {
  const {minutesOfDay} = getCityLocalClock(timezone, nowMs);
  const sunrise = sunriseIso ? parseIsoMinutes(sunriseIso) : 6 * 60 + 30;
  const sunset = sunsetIso ? parseIsoMinutes(sunsetIso) : 18 * 60 + 30;
  if (minutesOfDay >= sunrise - 45 && minutesOfDay < sunrise + 75) return 'dawn';
  if (minutesOfDay >= sunrise + 75 && minutesOfDay < sunset - 75) return 'day';
  if (minutesOfDay >= sunset - 75 && minutesOfDay < sunset + 45) return 'dusk';
  return 'night';
}

function fmtMins(mins) {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function computeSunProgress(timezone, sunriseIso, sunsetIso, nowMs = Date.now()) {
  const {minutesOfDay} = getCityLocalClock(timezone, nowMs);
  const sunrise = parseIsoMinutes(sunriseIso);
  const sunset = parseIsoMinutes(sunsetIso);
  const span = Math.max(60, sunset - sunrise);
  const daylightHours = Math.floor(span / 60);
  const daylightMinutes = span % 60;
  const goldenMorning = `${fmtMins(sunrise)}–${fmtMins(sunrise + 50)}`;
  const goldenEvening = `${fmtMins(sunset - 50)}–${fmtMins(sunset)}`;

  if (minutesOfDay < sunrise) {
    return {progress: 0, state: 'before', daylightHours, daylightMinutes, goldenMorning, goldenEvening};
  }
  if (minutesOfDay > sunset) {
    return {progress: 1, state: 'after', daylightHours, daylightMinutes, goldenMorning, goldenEvening};
  }
  return {
    progress: Math.min(1, Math.max(0, (minutesOfDay - sunrise) / span)),
    state: 'during',
    daylightHours,
    daylightMinutes,
    goldenMorning,
    goldenEvening,
  };
}

export function computeMoonPhase(nowMs = Date.now(), lang = 'ru') {
  const synodicDays = 29.53058867;
  const knownNewMoonMs = Date.UTC(2000, 0, 6, 18, 14, 0);
  const daysSince = (nowMs - knownNewMoonMs) / 86400000;
  const phase = (((daysSince / synodicDays) % 1) + 1) % 1;
  const illumination = Math.round(((1 - Math.cos(phase * Math.PI * 2)) / 2) * 100);

  let name = '';
  if (phase < 0.04 || phase >= 0.96) name = lang === 'ru' ? 'Новолуние' : 'New Moon';
  else if (phase < 0.21) name = lang === 'ru' ? 'Растущий серп' : 'Waxing Crescent';
  else if (phase < 0.29) name = lang === 'ru' ? 'Первая четверть' : 'First Quarter';
  else if (phase < 0.46) name = lang === 'ru' ? 'Растущая луна' : 'Waxing Gibbous';
  else if (phase < 0.54) name = lang === 'ru' ? 'Полнолуние' : 'Full Moon';
  else if (phase < 0.71) name = lang === 'ru' ? 'Убывающая луна' : 'Waning Gibbous';
  else if (phase < 0.79) name = lang === 'ru' ? 'Последняя четверть' : 'Last Quarter';
  else name = lang === 'ru' ? 'Старая луна' : 'Waning Crescent';

  return {name, illumination};
}

export function computePressureTrend(weather) {
  const {dateStr, minutesOfDay} = getCityLocalClock(weather.timezone);
  const currentIsoHour = `${dateStr}T${String(Math.floor(minutesOfDay / 60)).padStart(2, '0')}:00`;
  const idx = weather.hourly.findIndex((h) => h.time >= currentIsoHour);
  if (idx <= 2) return 'steady';
  const prev = weather.hourly[Math.max(0, idx - 3)]?.pressure ?? weather.current.pressure;
  const diff = weather.current.pressure - prev;
  if (diff >= 1.5) return 'rising';
  if (diff <= -1.5) return 'falling';
  return 'steady';
}

export function getNext24Hours(weather) {
  const {dateStr, minutesOfDay} = getCityLocalClock(weather.timezone);
  const currentIsoHour = `${dateStr}T${String(Math.floor(minutesOfDay / 60)).padStart(2, '0')}:00`;
  const idx = weather.hourly.findIndex((h) => h.time >= currentIsoHour);
  const start = idx >= 0 ? idx : 0;
  return weather.hourly.slice(start, start + 24);
}

export function formatDateLabel(dateStr, lang, style = 'short') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  if (style === 'weekday') {
    return new Intl.DateTimeFormat(locale, {weekday: 'short', timeZone: 'UTC'}).format(utcDate);
  }
  if (style === 'full') {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(utcDate);
  }
  return new Intl.DateTimeFormat(locale, {day: 'numeric', month: 'short', timeZone: 'UTC'}).format(utcDate);
}

export function getWindDirectionLabel(deg, labels) {
  const norm = ((deg % 360) + 360) % 360;
  return labels[Math.round(norm / 45) % 8] ?? labels[0];
}

export function getUvCategory(uv, uvLevels) {
  if (uv < 3) return uvLevels.low;
  if (uv < 6) return uvLevels.moderate;
  if (uv < 8) return uvLevels.high;
  if (uv < 11) return uvLevels.veryHigh;
  return uvLevels.extreme;
}

export function generateHeroDailySummary(weather, unit, lang) {
  const today = weather.daily[0];
  const next24 = getNext24Hours(weather);
  const wetHour = next24.find((h) => h.precipProb >= 55 || h.precipitation >= 0.4);
  const maxWind24 = Math.max(weather.current.windGusts, ...next24.map((h) => h.windGusts || h.windSpeed));
  const tMin = today ? formatTemp(today.tempMin, unit) : formatTemp(weather.current.temperature, unit);
  const tMax = today ? formatTemp(today.tempMax, unit) : formatTemp(weather.current.temperature, unit);

  if (lang === 'ru') {
    const precipText = wetHour
      ? `осадки вероятны около ${formatIsoTime(wetHour.time)}`
      : 'в ближайшие 24 ч без существенных осадков';
    const windText =
      maxWind24 >= 35 ? `, порывы ветра до ${Math.round(maxWind24)} км/ч` : ', ветер умеренный';
    return `Сегодня от ${tMin} до ${tMax}, ${precipText}${windText}.`;
  }
  const precipText = wetHour
    ? `precipitation likely around ${formatIsoTime(wetHour.time)}`
    : 'mostly dry over the next 24 hours';
  const windText =
    maxWind24 >= 35 ? `, wind gusts up to ${Math.round(maxWind24)} km/h` : ', gentle breeze';
  return `Today ranges from ${tMin} to ${tMax}, with ${precipText}${windText}.`;
}

export function generateWeatherAlerts(weather, lang) {
  const alerts = [];
  const next24 = getNext24Hours(weather);
  const maxGust = Math.max(weather.current.windGusts, ...next24.map((h) => h.windGusts || 0));
  const minTemp24 = Math.min(weather.current.temperature, ...next24.map((h) => h.temperature));
  const hasStorm = [95, 96, 99, 65, 82].includes(weather.current.weatherCode);

  if (hasStorm) {
    alerts.push({
      title: lang === 'ru' ? 'Шторм / интенсивные осадки' : 'Storm & Heavy Rain Warning',
      description:
        lang === 'ru'
          ? 'Возможны сильные ливни или гроза. Избегайте открытых пространств и низин.'
          : 'Heavy rain or thunderstorm activity expected. Seek shelter if outdoors.',
    });
  }
  if (maxGust >= 48) {
    alerts.push({
      title: lang === 'ru' ? `Сильные порывы до ${Math.round(maxGust)} км/ч` : `Strong Gusts (${Math.round(maxGust)} km/h)`,
      description:
        lang === 'ru'
          ? 'Ожидается усиление ветра в ближайшие 24 часа.'
          : 'Strong wind gusts expected over the next 24 hours.',
    });
  }
  if (minTemp24 <= 1 && next24.some((h) => h.precipitation > 0.1)) {
    alerts.push({
      title: lang === 'ru' ? 'Риск гололедицы' : 'Black Ice Risk',
      description:
        lang === 'ru'
          ? 'Температура около или ниже 0° при осадках — на дорогах возможен лёд.'
          : 'Sub-freezing temperatures combined with moisture may create slick surfaces.',
    });
  }
  if ((weather.airQuality?.europeanAqi ?? 0) >= 60) {
    alerts.push({
      title: lang === 'ru' ? `Пониженное качество воздуха (AQI ${weather.airQuality.europeanAqi})` : `Elevated Air Pollution (AQI ${weather.airQuality.europeanAqi})`,
      description:
        lang === 'ru'
          ? `Повышенная концентрация частиц PM2.5 (${weather.airQuality.pm25} мкг/м³).`
          : `Elevated PM2.5 concentration (${weather.airQuality.pm25} µg/m³).`,
    });
  }
  return alerts;
}

export function generateWeatherInsights(weather, unit, lang) {
  const insights = [];
  const next24 = getNext24Hours(weather);
  const {current} = weather;

  if (current.temperature <= 0) {
    insights.push({
      severity: 'notice',
      title: lang === 'ru' ? 'Гардероб: зимняя защита' : 'Wardrobe: Sub-zero Layering',
      description:
        lang === 'ru'
          ? 'Тёплый пуховик, шарф и перчатки обязательны при температуре ниже нуля.'
          : 'Insulated winter coat, gloves, and warm layers recommended.',
    });
  } else if (current.temperature <= 12) {
    insights.push({
      severity: 'info',
      title: lang === 'ru' ? 'Гардероб: многослойность' : 'Wardrobe: Layered Outerwear',
      description:
        lang === 'ru'
          ? 'Подойдут ветровка, пальто или плотный трикотаж.'
          : 'A windproof jacket or layered sweater fits current temperatures.',
    });
  } else {
    insights.push({
      severity: 'info',
      title: lang === 'ru' ? 'Гардероб: комфортно' : 'Wardrobe: Light & Breathable',
      description:
        lang === 'ru'
          ? 'Достаточно лёгкой одежды без тяжёлого утепления.'
          : 'Breathable casual wear is comfortable right now.',
    });
  }

  const rainPeak = next24.find((h) => h.precipProb >= 45 || h.precipitation >= 0.3);
  if (rainPeak) {
    insights.push({
      severity: rainPeak.precipProb >= 70 ? 'alert' : 'notice',
      title: lang === 'ru' ? `Осадки около ${formatIsoTime(rainPeak.time)}` : `Rain Window ~${formatIsoTime(rainPeak.time)}`,
      description:
        lang === 'ru'
          ? `Вероятность ${Math.round(rainPeak.precipProb)}% — возьмите зонт или непромокаемую куртку.`
          : `${Math.round(rainPeak.precipProb)}% precipitation chance — bring an umbrella.`,
    });
  } else {
    insights.push({
      severity: 'info',
      title: lang === 'ru' ? 'Сухое окно 24 ч' : 'Dry 24-Hour Window',
      description:
        lang === 'ru'
          ? 'Существенных осадков не ожидается — комфортно для прогулок и поездок.'
          : 'No significant rain expected — ideal conditions for outdoor plans.',
    });
  }

  const diff = current.temperature - current.apparentTemperature;
  if (Math.abs(diff) >= 3) {
    insights.push({
      severity: 'notice',
      title:
        diff > 0
          ? lang === 'ru'
            ? `Ощущается холоднее на ${Math.round(diff)}°`
            : `Feels ${Math.round(diff)}° Colder`
          : lang === 'ru'
            ? `Ощущается теплее на ${Math.round(-diff)}°`
            : `Feels ${Math.round(-diff)}° Warmer`,
      description:
        lang === 'ru'
          ? `По ощущениям ${formatTemp(current.apparentTemperature, unit)} из-за ветра и влажности.`
          : `Wind and humidity shift perceived temperature to ${formatTemp(current.apparentTemperature, unit)}.`,
    });
  }

  const maxWind = Math.max(current.windSpeed, ...next24.map((h) => h.windSpeed));
  insights.push({
    severity: maxWind >= 35 ? 'alert' : 'info',
    title:
      lang === 'ru'
        ? `Ветер ${Math.round(current.windSpeed)} км/ч · порывы ${Math.round(current.windGusts)}`
        : `Wind ${Math.round(current.windSpeed)} km/h · gusts ${Math.round(current.windGusts)}`,
    description:
      maxWind >= 35
        ? lang === 'ru'
          ? 'Ветреная погода — учитывайте порывы при поездках.'
          : 'Gusty conditions ahead — plan outdoor activities accordingly.'
        : lang === 'ru'
          ? 'Спокойная ветровая обстановка в течение суток.'
          : 'Calm to moderate breeze through the day.',
  });

  return insights.slice(0, 4);
}
