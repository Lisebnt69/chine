/* ───────────────────────────────────────────────────────────────
   Icônes Chine 2026 : jeu SVG dessiné pour l'app (grille 24, trait 1.75).
   - Remplace à l'affichage chaque emoji connu par l'icône correspondante.
     Les données (Supabase, cache, saisies) gardent leurs emojis d'origine,
     seul le rendu change. Les champs de saisie ne sont jamais modifiés.
   - window.ic('pin') renvoie le HTML d'une icône, pour le code neuf.
   ─────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* ── 1. Les dessins ─────────────────────────────────────────── */
  const D = {
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16 9.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    bed: '<path d="M3 18.5V6.5M3 14h18v4.5M21 14v-2.5A3.5 3.5 0 0 0 17.5 8H11v6"/><circle cx="7" cy="10.8" r="1.8"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><circle cx="12" cy="15.5" r="1" fill="currentColor" stroke="none"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    bowl: '<path d="M3.5 12h17a8.5 8.5 0 0 1-17 0z"/><path d="M9 21h6M8.5 8.5c0-1.3 1-1.4 1-2.7M12 8.5c0-1.3 1-1.4 1-2.7M15.5 8.5c0-1.3 1-1.4 1-2.7"/>',
    train: '<rect x="5" y="3.5" width="14" height="14" rx="4"/><path d="M5 11h14M9 21l2-3.5M15 21l-2-3.5"/><circle cx="9" cy="14.2" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="14.2" r=".9" fill="currentColor" stroke="none"/>',
    bus: '<rect x="4.5" y="3.5" width="15" height="14.5" rx="3.5"/><path d="M4.5 10.5h15M7.5 21v-3M16.5 21v-3"/><circle cx="8.5" cy="14.5" r=".9" fill="currentColor" stroke="none"/><circle cx="15.5" cy="14.5" r=".9" fill="currentColor" stroke="none"/>',
    walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M12.5 8l-2.5 5 3 2.5 1 5.5M10 13l-1.5 5.5L6 21M12.5 8l3.5 3 3 .8M12.5 8l-4 1.6L7 13"/>',
    metro: '<rect x="6" y="3.5" width="12" height="14" rx="3"/><path d="M9 14V8l3 3.5L15 8v6M9 21l1.5-3.5M15 21l-1.5-3.5"/>',
    cable: '<path d="M3 5l18 4M12 7v4"/><rect x="6" y="11" width="12" height="9" rx="2.5"/><path d="M6 15.5h12M12 11v4.5"/>',
    car: '<path d="M4 15.5l1.6-5.2A2.5 2.5 0 0 1 8 8.5h8a2.5 2.5 0 0 1 2.4 1.8l1.6 5.2V19h-3v-2H7v2H4z"/><circle cx="8" cy="13.2" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="13.2" r=".9" fill="currentColor" stroke="none"/>',
    ship: '<path d="M3.500 15.500h17L18 20H6zM7 15.500V10h10v5.500M10 10V6h4v4M3 3.500"/>',
    plane: '<path d="M12 2.8c1 0 1.6.8 1.6 1.9v5.4l7.4 4.6v2.4l-7.4-2.3v4.4l2 1.6v1.7L12 21l-3.6 1.1v-1.7l2-1.6v-4.4L3 16.7v-2.4l7.4-4.6V4.7c0-1.1.6-1.9 1.6-1.9z"/>',
    cup: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1.300 1.200 1.200 1.200 2.500M12 3.500c0 1.300 1.200 1.200 1.200 2.500"/>',
    pencil: '<path d="M4 20l1-4.5L16.500 4a2.100 2.100 0 0 1 3 3L8 18.500z"/><path d="M14.500 6l3.500 3.500"/>',
    bulb: '<path d="M9 17.500h6M10 20.500h4M12 3.500a6 6 0 0 0-3.600 10.800c.6.500 1 1.200 1 2v.700h5.200v-.700c0-.800.400-1.500 1-2A6 6 0 0 0 12 3.500z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.500"/><path d="M15.500 15.500L21 21"/>',
    map: '<path d="M3 6.500l6-2.500 6 2.500 6-2.500v13.500l-6 2.500-6-2.500-6 2.500z"/><path d="M9 4v13.500M15 6.500V20"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.800 8.200l-2 5.600-5.600 2 2-5.600z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.500 20.500a7.500 7.500 0 0 1 15 0"/>',
    users: '<circle cx="9" cy="8.500" r="3.500"/><path d="M2.500 20a6.500 6.500 0 0 1 13 0M16 5.300a3.500 3.500 0 0 1 0 6.400M18 14a6.500 6.500 0 0 1 3.500 6"/>',
    coins: '<ellipse cx="12" cy="6.500" rx="7" ry="3"/><path d="M5 6.500v5c0 1.700 3.100 3 7 3s7-1.300 7-3v-5M5 11.500v5c0 1.700 3.100 3 7 3s7-1.300 7-3v-5"/>',
    banknote: '<rect x="2.500" y="6" width="19" height="12" rx="3"/><circle cx="12" cy="12" r="2.700"/><path d="M6 12h.01M18 12h.01"/>',
    star: '<path d="M12 3.500l2.600 5.500 6 .8-4.400 4.100 1.100 6-5.300-2.900-5.300 2.900 1.100-6L3.400 9.800l6-.8z"/>',
    'star-fill': '<path d="M12 3.500l2.600 5.500 6 .8-4.400 4.100 1.100 6-5.300-2.900-5.300 2.900 1.100-6L3.400 9.800l6-.8z" fill="currentColor"/>',
    sparkle: '<path d="M11 3l1.800 5.200L18 10l-5.200 1.800L11 17l-1.800-5.200L4 10l5.200-1.800zM19 15l.8 2.200L22 18l-2.200.8L19 21l-.8-2.200L16 18l2.200-.8z"/>',
    thumb: '<path d="M7.500 10.500V20h-3v-9.500zM7.500 11l3.500-7c1.600 0 2.500 1.200 2.200 2.800L12.600 10H18a2.500 2.500 0 0 1 2.400 3.100l-1.400 5.500a2.500 2.500 0 0 1-2.400 1.900H7.500"/>',
    lantern: '<path d="M9 3.500h6M12 2v1.500"/><path d="M7.500 6h9c1.900 3.200 1.900 7.800 0 11h-9c-1.900-3.200-1.900-7.800 0-11z" fill="currentColor" fill-opacity=".14"/><path d="M8.300 10h7.400M8.300 13h7.400M9.500 17v2h5v-2M12 19v3"/>',
    chart: '<path d="M5.500 20v-7M12 20V5M18.500 20V10"/>',
    moon: '<path d="M20 14.500A8.500 8.500 0 1 1 9.500 4a6.800 6.800 0 0 0 10.500 10.500z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.600 2.600 0 0 1 5 .8c0 1.700-2.500 2-2.500 3.700M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    hourglass: '<path d="M6.500 3.500h11M6.500 20.500h11M7.500 3.500c0 4 4.500 5 4.500 8.500s-4.500 4.500-4.500 8.500M16.500 3.500c0 4-4.500 5-4.500 8.500s4.500 4.500 4.500 8.500"/>',
    trash: '<path d="M4 6.500h16M9.500 6.500V4h5v2.500M6.500 6.500l.8 13a1.500 1.500 0 0 0 1.500 1.400h6.400a1.500 1.500 0 0 0 1.500-1.400l.8-13M10 11v6M14 11v6"/>',
    warning: '<path d="M12 3.500l9.500 16.500h-19z"/><path d="M12 10v4.500M12 17.200h.01"/>',
    camera: '<path d="M3.500 8.500a2 2 0 0 1 2-2h2l1.600-2.200h5.800l1.600 2.200h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.800"/>',
    image: '<rect x="3.500" y="4.500" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.800"/><path d="M4 17.500l5-4.500 4 3.500 3-2.500 4 3.500"/>',
    pill: '<rect x="3" y="8.500" width="18" height="7" rx="3.500" transform="rotate(-45 12 12)"/><path d="M9.500 9.500l5 5"/>',
    city: '<path d="M3 21h18M5 21V10l5-2.500V21M10 21V4l8 3v14M13.500 9h1M13.500 12.500h1M13.500 16h1M7 13h.01M7 16.500h.01"/>',
    phone: '<rect x="6.500" y="2.500" width="11" height="19" rx="3"/><path d="M11 18.500h2"/>',
    'phone-off': '<rect x="6.500" y="2.500" width="11" height="19" rx="3"/><path d="M11 18.500h2M3.500 3.500l17 17"/>',
    sunrise: '<path d="M3 19h18M6.500 19a5.500 5.500 0 0 1 11 0M12 6v3M4.500 11.500l1.800 1.200M19.500 11.500l-1.800 1.200M9.500 4.500L12 2l2.500 2.500"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800"/>',
    cloud: '<path d="M7.500 19a4.500 4.500 0 0 1-.4-9 6 6 0 0 1 11.400 1.800A3.600 3.600 0 0 1 17.500 19z"/>',
    'cloud-sun': '<circle cx="8.500" cy="8.500" r="3"/><path d="M8.500 2.500v1M2.500 8.500h1M4.300 4.300l.7.7M12.700 4.300l-.7.7"/><path d="M9.500 20a3.800 3.800 0 0 1-.3-7.600 5 5 0 0 1 9.500 1.500 3 3 0 0 1-.7 6.100z"/>',
    rain: '<path d="M7.500 15a4 4 0 0 1-.3-8 5.500 5.500 0 0 1 10.600 1.600A3.200 3.200 0 0 1 17 15z"/><path d="M8.500 18l-1 2.500M12.500 18l-1 2.500M16.500 18l-1 2.500"/>',
    fog: '<path d="M4 8h13M7 12h13M4 16h10M16 16h4"/>',
    shower: '<path d="M6 11a6 6 0 0 1 12 0zM12 5V3M8 14l-1 2M12 14l-1 2M16 14l-1 2M9 19l-1 2M13 19l-1 2"/>',
    party: '<path d="M4 20l4-12 10 10zM9 14l3 3M13 5.500l.5-2M17 8.500l2-1M18.500 12.500l2 .5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    chat: '<path d="M4 6.500A2.500 2.500 0 0 1 6.500 4h11A2.500 2.500 0 0 1 20 6.500v7a2.500 2.500 0 0 1-2.500 2.500H11l-4.500 4v-4A2.500 2.500 0 0 1 4 13.500z"/>',
    bolt: '<path d="M13 2.500L5 13.500h6l-1 8 8-11h-6z"/>',
    panda: '<circle cx="12" cy="13" r="7.500"/><circle cx="6.500" cy="6.500" r="2.500" fill="currentColor"/><circle cx="17.500" cy="6.500" r="2.500" fill="currentColor"/><ellipse cx="9" cy="12.500" rx="1.600" ry="2.200" fill="currentColor" transform="rotate(20 9 12.500)"/><ellipse cx="15" cy="12.500" rx="1.600" ry="2.200" fill="currentColor" transform="rotate(-20 15 12.500)"/><path d="M11 16.500h2"/>',
    mountain: '<path d="M2.500 19.500L9 8l4 6.500 2.500-4 6 9z"/><path d="M7.200 11.200L9 8l1.800 3"/>',
    flower: '<circle cx="12" cy="12" r="2"/><g><ellipse cx="12" cy="6.300" rx="2.300" ry="3.200"/><ellipse cx="12" cy="6.300" rx="2.300" ry="3.200" transform="rotate(72 12 12)"/><ellipse cx="12" cy="6.300" rx="2.300" ry="3.200" transform="rotate(144 12 12)"/><ellipse cx="12" cy="6.300" rx="2.300" ry="3.200" transform="rotate(216 12 12)"/><ellipse cx="12" cy="6.300" rx="2.300" ry="3.200" transform="rotate(288 12 12)"/></g>',
    'arrow-up': '<path d="M12 20V5M6 11l6-6 6 6"/>',
    'arrow-down': '<path d="M12 4v15M6 13l6 6 6-6"/>',
    utensils: '<path d="M7 3v8M4.500 3v5a2.500 2.500 0 0 0 5 0V3M7 11v10M17.500 21V3c-2.200 1.500-3 4.500-3 8h3"/>',
    luggage: '<rect x="5.500" y="7.500" width="13" height="13" rx="3"/><path d="M9.500 7.500V5a1.500 1.500 0 0 1 1.500-1.500h2A1.500 1.500 0 0 1 14.500 5v2.500M9.500 11v6M14.500 11v6"/>',
    bottle: '<path d="M10 3h4v3h-4zM8.500 9a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v10.500a1.500 1.500 0 0 1-1.500 1.500h-4a1.500 1.500 0 0 1-1.500-1.500z"/><path d="M8.500 13h7"/>',
    shirt: '<path d="M8.500 3.500l-5 3.500 2.200 3.500 2.300-1.300v10.800h9V9.200l2.300 1.300 2.200-3.500-5-3.500a3.500 3.500 0 0 1-7 0z"/>',
    backpack: '<rect x="5.500" y="7" width="13" height="14" rx="4.500"/><path d="M9 7V5.500a3 3 0 0 1 6 0V7M9 15h6M5.500 12h13"/>',
    bag: '<path d="M5 8h14l-1 12.500H6zM9 8V6.500a3 3 0 0 1 6 0V8"/>',
    door: '<path d="M6 21V4.500A1.500 1.500 0 0 1 7.500 3h9A1.500 1.500 0 0 1 18 4.500V21M3.500 21h17M14 12h.01"/>',
    file: '<path d="M6.500 3h7l4.500 4.500V19a2 2 0 0 1-2 2H6.500a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M13.500 3v4.500H18M8.500 12.500h7M8.500 16h5"/>',
    clipboard: '<rect x="5" y="4.500" width="14" height="17" rx="3"/><path d="M9 4.500V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5M9 11h6M9 15h4"/>',
    save: '<path d="M5 4h11l3 3v11.500a1.500 1.500 0 0 1-1.500 1.500h-11A1.500 1.500 0 0 1 4 18.500V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    printer: '<path d="M7 9V3.500h10V9M7 17.500H5a1.500 1.500 0 0 1-1.500-1.500v-5A2 2 0 0 1 5.500 9h13a2 2 0 0 1 2 2v5a1.500 1.500 0 0 1-1.500 1.500h-2"/><rect x="7" y="14" width="10" height="6.500" rx="1"/>',
    plug: '<path d="M9 3v5M15 3v5M6.500 8h11v3a5.500 5.500 0 0 1-11 0zM12 16.500V21"/>',
    tag: '<path d="M3.500 12.500V4.500a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8" cy="8" r="1.300"/>',
    cocktail: '<path d="M4 4h16l-8 9.500zM12 13.500V20M8 20h8"/>',
    apple: '<path d="M12 7.500c-2-1.500-6-1-6 4 0 4.500 3 9.500 6 9 3 .5 6-4.500 6-9 0-5-4-5.500-6-4zM12 7.500C12 5 13 3.500 15 3"/>',
    robot: '<rect x="4.500" y="8" width="15" height="11.500" rx="4"/><path d="M12 8V4.500M12 4.500h.01M9 13.500h.01M15 13.500h.01M2.500 13v2.500M21.500 13v2.500M10 17h4"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1.500 5.200A3 3 0 0 0 9 20a2 2 0 0 0 3-1.700V5.500A2 2 0 0 0 9 4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1.500 5.200A3 3 0 0 1 15 20a2 2 0 0 1-3-1.700V5.500A2 2 0 0 1 15 4z"/>',
    speaker: '<path d="M4 9.500h3.500L12 5.500v13l-4.500-4H4zM15.500 9a4 4 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11"/>',
    heart: '<path d="M12 20.500S3.500 15 3.500 9a4.500 4.500 0 0 1 8.500-2 4.500 4.500 0 0 1 8.500 2c0 6-8.500 11.500-8.500 11.500z"/>',
    flag: '<path d="M5 21V4M5 4h13l-2.500 4.500L18 13H5"/>',
    fire: '<path d="M12 21a6.500 6.500 0 0 0 6.500-6.500c0-3.500-2.500-5.500-3.500-8.500-2 1-3 3-3 5-1-.5-1.500-1.500-1.500-3C8 9 5.500 11 5.500 14.500A6.500 6.500 0 0 0 12 21z"/>',
    rocket: '<path d="M12 2.500c3 2.500 4.500 6 4.500 10V16h-9v-3.500c0-4 1.500-7.500 4.500-10zM7.500 13.500L5 17.500l2.500-.5M16.500 13.500l2.500 4-2.500-.5M10 19h4l-2 3z"/><circle cx="12" cy="9.500" r="1.800"/>',
    cross: '<rect x="4" y="4" width="16" height="16" rx="4.500"/><path d="M12 8.500v7M8.500 12h7"/>',
    siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6M4.500 18h15v3h-15zM12 3v1.500M4.500 6.500l1.200 1M19.500 6.500l-1.200 1"/>',
    'phone-call': '<path d="M5 4h3.500l1.500 4-2 1.500a11 11 0 0 0 5.500 5.500L15 13l4 1.500V18a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    wind: '<path d="M3 9h11a2.500 2.500 0 1 0-2.500-2.500M3 14h15a2.500 2.500 0 1 1-2.500 2.500M3 19h7"/>',
    music: '<path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z"/>',
    mask: '<path d="M4 5h16v7a8 8 0 0 1-16 0z"/><path d="M8.500 10h.01M15.500 10h.01M8.500 14.500a4.500 4.500 0 0 0 7 0"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.500 14a4.500 4.500 0 0 0 7 0M9 9.500h.01M15 9.500h.01"/>',
    sad: '<circle cx="12" cy="12" r="9"/><path d="M8.500 16a4.500 4.500 0 0 1 7 0M9 9.500h.01M15 9.500h.01"/>',
    wow: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="15.500" r="1.800"/><path d="M9 9.500h.01M15 9.500h.01"/>',
    dot: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.500-4M4 5v4h4M4 13a8 8 0 0 0 14.500 4M20 19v-4h-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    ticket: '<path d="M3.500 7h17v3.200a2.100 2.100 0 0 0 0 4.200V17.500h-17v-3.200a2.100 2.100 0 0 0 0-4.200z"/><path d="M14.500 7v2M14.500 11v2M14.500 15v2.500"/>',
    tile: '<rect x="4.500" y="3" width="15" height="18" rx="3.500"/><rect x="8" y="8" width="8" height="6.500" rx="1"/><path d="M12 6v11"/>',
    gift: '<rect x="3.500" y="8.500" width="17" height="4" rx="1.500"/><path d="M5 12.500V19a1.500 1.500 0 0 0 1.500 1.500h11A1.500 1.500 0 0 0 19 19v-6.500M12 8.500v12M12 8.500C10 8.500 7.500 7.800 7.500 5.800a2 2 0 0 1 3.600-1.200L12 8.500zM12 8.500c2 0 4.500-.7 4.500-2.700a2 2 0 0 0-3.600-1.200z"/>',
    skewer: '<path d="M4.500 19.500L19.500 4.500"/><circle cx="9" cy="15" r="2.300"/><circle cx="12.500" cy="11.500" r="2.300"/><circle cx="16" cy="8" r="2.300"/>',
    burger: '<path d="M4.500 11a7.500 6 0 0 1 15 0z"/><path d="M3.500 14.500h2.500l1.500 1.500 2-1.500 2 1.500 2-1.500 2 1.500 1.500-1.500h3"/><path d="M4.500 18h15v.5a2.500 2.500 0 0 1-2.500 2.500H7a2.500 2.500 0 0 1-2.500-2.500z"/>',
    boba: '<path d="M6 8.500h12l-1.300 11a1.600 1.600 0 0 1-1.600 1.400H8.900a1.600 1.600 0 0 1-1.600-1.400z"/><path d="M5 8.500h14M13.500 8.500L15 3h2.500"/><circle cx="10" cy="18" r=".95" fill="currentColor" stroke="none"/><circle cx="13.800" cy="18.300" r=".95" fill="currentColor" stroke="none"/><circle cx="12" cy="15.300" r=".95" fill="currentColor" stroke="none"/>',
    icecream: '<path d="M7.500 11.500a4.500 4.500 0 1 1 9 0z"/><path d="M8 11.500l4 9.500 4-9.500"/><path d="M10 14l3 .8M11 17.300l2.400.6"/>',
    chili: '<path d="M16.500 5c0-1.200 1.500-2 2.800-1M16.500 5C16.500 10.500 13.500 16 4.500 19.500c1.300 1.200 4.500 1.500 7.200-.4 5-3.500 7-8.700 5.700-13.800z"/>',
    sprout: '<path d="M12 21v-9M12 12c0-4 2.500-6.500 7-6.500 0 4-2.500 6.500-7 6.500zM12 15c0-3-2-5-5.500-5C6.500 13 8.500 15 12 15z"/>',
    home: '<path d="M2.500 11.500L12 4l9.500 7.500M5.500 10.500V20h13v-9.500M10 20v-5.500h4V20"/>',
    'arrow-right': '<path d="M4 12h15M13 5.500l6.500 6.500-6.500 6.500"/>',
    swap: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>'
  };

  /* ── 2. Emoji → icône (clé = premier code point sans sélecteur) ── */
  const MAP = {};
  function reg(name, cls, list) { list.split(' ').forEach(function (e) { MAP[e] = [name, cls || '']; }); }
  reg('pin', '', '📍 📌');
  reg('check', '', '✔ ✓ ☑');
  reg('check-circle', 'gi-ok', '✅');
  reg('x', '', '✖ ✕ ✗ ✘');
  reg('x-circle', 'gi-no', '❌ ❎');
  reg('calendar', '', '📅 📆 🗓 🗒');
  reg('bed', '', '🏨 🛏 🏩');
  reg('lock', '', '🔒 🔐 🔑 🔓');
  reg('eye', '', '👁 👀');
  reg('target', '', '🎯');
  reg('bowl', '', '🍜 🍲 🥢 🍚');
  reg('train', '', '🚄 🚅 🚆 🚇 🚂 🚈 🚝');
  reg('bus', '', '🚌 🚍');
  reg('car', '', '🚗 🚕 🚖 🚙');
  reg('ship', '', '🚢 ⛴');
  reg('plane', '', '✈ 🛫 🛬');
  reg('cup', '', '☕ 🍵');
  reg('pencil', '', '✏ ✍ 📝 ✎');
  reg('bulb', '', '💡');
  reg('search', '', '🔍 🔎');
  reg('map', '', '🗺');
  reg('compass', '', '🧭');
  reg('user', '', '👤 🧑 👨 👩 🙂');
  reg('users', '', '👥 👫');
  reg('coins', '', '💰 💵 🪙');
  reg('banknote', '', '💸 💱 💴 💶');
  reg('star', '', '⭐ 🌟 ☆');
  reg('star-fill', '', '★');
  reg('sparkle', '', '✨ 🌠');
  reg('thumb', '', '👍');
  reg('lantern', 'gi-brand', '🏮');
  reg('chart', '', '📊 📈');
  reg('moon', '', '🌙 🌛');
  reg('help', '', '🤷 🤔 ❓ ❔');
  reg('clock', '', '⏱ ⏰ ⏲ 🕐 🕑 🕒 🕓 🕔 🕕 🕖 🕗 🕘 🕙 🕚 🕛');
  reg('hourglass', '', '⏳ ⌛');
  reg('trash', '', '🗑');
  reg('warning', 'gi-warn', '⚠ 🚧');
  reg('camera', '', '📸 📷 🎥');
  reg('image', '', '🖼 🏞');
  reg('pill', '', '💊');
  reg('city', '', '🏙 🌆 🌃 🏢 🏬');
  reg('phone', '', '📱');
  reg('phone-off', '', '📵');
  reg('sunrise', '', '🌅 🌄');
  reg('sun', '', '☀ 🌞 🔆');
  reg('cloud', '', '☁');
  reg('cloud-sun', '', '⛅ 🌤 🌥 🌦');
  reg('tile', '', '🀄');
  reg('rain', '', '🌧 ☔');
  reg('fog', '', '🌫 🌁');
  reg('shower', '', '🚿');
  reg('party', '', '🎉 🎊');
  reg('globe', '', '🌐 🌍 🌎 🌏');
  reg('chat', '', '💬 🗨');
  reg('bolt', '', '⚡');
  reg('panda', '', '🐼');
  reg('mountain', '', '🏔 ⛰ 🗻');
  reg('flower', '', '🌸 🌺 🌷');
  reg('arrow-up', '', '⬆ ☝ ⬆');
  reg('arrow-down', '', '⬇ 👇');
  reg('utensils', '', '🍽 🍴');
  reg('luggage', '', '🧳');
  reg('bottle', '', '🧴');
  reg('shirt', '', '👔 👕');
  reg('backpack', '', '🎒');
  reg('bag', '', '🛍 🛒');
  reg('door', '', '🚪');
  reg('file', '', '📄 📃');
  reg('clipboard', '', '📋');
  reg('save', '', '💾');
  reg('printer', '', '🖨');
  reg('plug', '', '🔌');
  reg('tag', '', '🏷');
  reg('cocktail', '', '🍸 🍹 🍺');
  reg('apple', '', '🍎');
  reg('robot', '', '🤖');
  reg('brain', '', '🧠');
  reg('speaker', '', '🔊 🔉 🔈');
  reg('heart', 'gi-heart', '❤ 💚 💙 💜 🧡 💛');
  reg('flag', '', '🏁 🚩');
  reg('fire', '', '🔥');
  reg('rocket', '', '🚀');
  reg('cross', '', '🏥');
  reg('siren', '', '🚨 🚑 🚓');
  reg('phone-call', '', '📞 ☎');
  reg('sliders', '', '⚙');
  reg('menu', '', '☰');
  reg('wind', '', '💨');
  reg('music', '', '🎵 🎶');
  reg('mask', '', '🎭');
  reg('smile', '', '😊 😂 😀 🙂 😁 😄');
  reg('sad', '', '😢 😭 😞');
  reg('wow', '', '😮 😲');
  reg('refresh', '', '🔃 🔄 ↻');
  reg('plus', '', '➕');
  reg('ticket', '', '🎫');
  reg('gift', '', '🎁');
  reg('home', '', '🏠 🏡');
  MAP['🔴'] = ['dot', 'gi-red']; MAP['🟡'] = ['dot', 'gi-yellow']; MAP['🟢'] = ['dot', 'gi-green']; MAP['🔵'] = ['dot', 'gi-blue'];
  reg('pin', '', '📍');

  /* ── 3. Sprite ───────────────────────────────────────────────── */
  const NS = 'http://www.w3.org/2000/svg';
  function injectSprite() {
    if (document.getElementById('ic-sprite') || !document.body) return;
    let s = '<svg id="ic-sprite" xmlns="' + NS + '" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>';
    Object.keys(D).forEach(function (k) { s += '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + D[k] + '</symbol>'; });
    s += '</defs></svg>';
    const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
    document.body.insertBefore(document.importNode(doc.documentElement, true), document.body.firstChild);
  }

  /* ── 4. Helpers publics ──────────────────────────────────────── */
  function ic(name, cls) {
    if (!D[name]) return '';
    return '<svg class="gi' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }
  window.ic = ic;
  window.ICONS = D;

  /* ── 5. Remplacement des emojis affichés ─────────────────────── */
  const RX = /(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}|[✓✕✔✖✗✘★☆])(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
  const QUICK = /[©®‼-㊙\u{1F000}-\u{1FAFF}]/u;
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, TITLE: 1, NOSCRIPT: 1 };

  function makeIcon(entry) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', entry[1] ? 'gi ' + entry[1] : 'gi');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#i-' + entry[0]);
    svg.appendChild(use);
    return svg;
  }

  function skipNode(node) {
    for (let el = node.parentNode; el && el.nodeType === 1; el = el.parentNode) {
      if (SKIP[el.nodeName] || el.isContentEditable || el.hasAttribute('data-noic')) return true;
      if (el.namespaceURI === NS && el.nodeName !== 'text') return true; // dedans un SVG : on ne touche pas
    }
    return false;
  }

  const STRIP = /\s*(?:\p{Extended_Pictographic}|[✓✕✔✖])(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*\s*/gu;

  // Une liste déroulante ne peut pas contenir de SVG : on retire l'emoji de l'affichage
  // mais on fige la valeur d'origine, pour que les données enregistrées ne changent pas.
  function convertOption(node) {
    const opt = node.parentNode, txt = node.nodeValue;
    if (!opt.hasAttribute('value')) opt.setAttribute('value', opt.textContent);
    node.nodeValue = txt.replace(STRIP, ' ').trim();
  }

  function convertText(node) {
    const txt = node.nodeValue;
    if (!txt || !node.parentNode || !QUICK.test(txt)) return;
    if (node.parentNode.nodeName === 'OPTION') { STRIP.lastIndex = 0; if (/\p{Extended_Pictographic}/u.test(txt)) convertOption(node); return; }
    if (skipNode(node)) return;
    RX.lastIndex = 0;
    let last = 0, m, frag = null;
    while ((m = RX.exec(txt))) {
      const key = m[0].replace(/️/g, '').codePointAt(0);
      const entry = (key >= 0x1F1E6 && key <= 0x1F1FF) ? MAP['🏁'] : MAP[String.fromCodePoint(key)]; // drapeau pays → icône drapeau
      if (!entry || !D[entry[0]]) continue;
      if (!frag) frag = document.createDocumentFragment();
      if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
      frag.appendChild(makeIcon(entry));
      last = m.index + m[0].length;
    }
    if (!frag) return;
    if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { convertText(root); return; }
    if (root.nodeType !== 1 || root.nodeName === 'SCRIPT' || root.nodeName === 'STYLE' || root.nodeName === 'TEXTAREA') return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const list = [];
    while (tw.nextNode()) list.push(tw.currentNode);
    list.forEach(convertText);
  }

  const mo = new MutationObserver(function (records) {
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.type === 'characterData') convertText(r.target);
      else for (let j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  function ready() { injectSprite(); walk(document.body); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
