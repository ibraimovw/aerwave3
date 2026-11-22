const SVG_NS = 'http://www.w3.org/2000/svg';

function makeSvg(pathsMarkup, className = 'icon') {
  const wrap = document.createElement('span');
  wrap.className = `icon-wrap ${className}`;
  wrap.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = pathsMarkup;
  wrap.appendChild(svg);
  return wrap;
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/>',
  forecast: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  map: '<circle cx="12" cy="12" r="9"/><polygon points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9 16.2 7.8"/>',
  star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.7 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  collapse: '<path d="M5 5v14"/><path d="m14 8-4 4 4 4"/><path d="m19 8-4 4 4 4"/>',
  expand: '<path d="M5 5v14"/><path d="m10 8 4 4-4 4"/><path d="m15 8 4 4-4 4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  droplets: '<path d="M12 2.7C8 7 6 10 6 13.5a6 6 0 0 0 12 0C18 10 16 7 12 2.7Z"/>',
  wind: '<path d="M17.7 7.7A2.5 2.5 0 1 1 19 12H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  thermometer: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/>',
  alert: '<path d="m21.7 18-8.6-15a1.2 1.2 0 0 0-2.2 0L2.3 18A1.2 1.2 0 0 0 3.4 20h17.2a1.2 1.2 0 0 0 1.1-2Z"/><path d="M12 9v4M12 17h.01"/>',
  arrowRight: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  arrowUp: '<path d="m18 15-6-6-6 6"/>',
  arrowDown: '<path d="m6 9 6 6 6-6"/>',
  arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
  arrowDownRight: '<path d="m7 7 10 10M17 7v10H7"/>',
  minus: '<path d="M5 12h14"/>',
  sparkles: '<path d="m12 3-1.9 5.8L4.3 10.7l5.8 1.9L12 18.4l1.9-5.8 5.8-1.9-5.8-1.9Z"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  compare: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 13a10 10 0 0 1 5.2-2.7"/><path d="M16.2 10.7A10 10 0 0 1 19 13"/><path d="M12 20h.01"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>',
  rain: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M8 19v2M12 19v2M16 19v2"/>',
  snow: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M8 19h.01M12 20h.01M16 19h.01"/>',
  storm: '<path d="M6 16.3A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 .5 8.9"/><path d="m13 11-3 5h4l-2 5"/>',
  fog: '<path d="M4 14h16M6 18h12M3 10h18"/>',
};

export function createIcon(name, className = '') {
  return makeSvg(ICONS[name] ?? ICONS.cloud, className);
}

export function createWeatherIcon(code, isDay = true, className = 'w-icon') {
  if (code === 0 || code === 1) {
    return makeSvg(isDay ? ICONS.sun : ICONS.moon, `${className} ${isDay ? 'c-pink' : 'c-blue'}`);
  }
  if (code === 2 || code === 3) {
    return makeSvg(ICONS.cloud, `${className} c-sky`);
  }
  if (code === 45 || code === 48) {
    return makeSvg(ICONS.fog, `${className} c-muted`);
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return makeSvg(ICONS.snow, `${className} c-sky`);
  }
  if ([95, 96, 99].includes(code)) {
    return makeSvg(ICONS.storm, `${className} c-pink`);
  }
  return makeSvg(ICONS.rain, `${className} c-sky`);
}
