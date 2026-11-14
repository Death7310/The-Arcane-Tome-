// Crests for the species: a picture for each (an Aasimar's halo and wings, an Elf's leaf, a
// Drow's crescent, a Dwarf's hammer and mountain…), coloured for its lineage (a Red Dragonborn
// red, a Frost Goliath ice-blue). Mixed heritage shows both, split down the middle. Plain SVG
// text, so a crest can be drawn inline or saved as a portrait.

interface Look {
  bg: string;
  fg: string;
  /** SVG shapes on a 100 × 100 crest, drawn in the foreground colour. */
  art: string;
}

const DRAGON: Record<string, [string, string]> = {
  'black-dragon': ['#26262b', '#b9c26a'],
  'blue-dragon': ['#28509a', '#cfe3ff'],
  'brass-dragon': ['#a8812f', '#fff1c9'],
  'bronze-dragon': ['#7c5428', '#f3d6a6'],
  'copper-dragon': ['#a5552f', '#ffe0c7'],
  'gold-dragon': ['#c79a1f', '#fff6d2'],
  'green-dragon': ['#2b7044', '#d5f3c8'],
  'red-dragon': ['#a52b24', '#ffd9c2'],
  'silver-dragon': ['#8995a3', '#f6f9fc'],
  'white-dragon': ['#dfe8ee', '#4b6a80'],
};
const GIANT: Record<string, [string, string]> = {
  'cloud-giant': ['#6f86a3', '#f1f6ff'],
  'fire-giant': ['#a83f24', '#ffd9a8'],
  'frost-giant': ['#5f9fc4', '#f2fbff'],
  'hill-giant': ['#6f7e42', '#f2f0d0'],
  'stone-giant': ['#6d6962', '#ece8e0'],
  'storm-giant': ['#3f4587', '#d9ddff'],
};
const LEGACY: Record<string, [string, string]> = {
  abyssal: ['#55286a', '#f0d6ff'],
  chthonic: ['#27383a', '#c9f0e6'],
  infernal: ['#86261c', '#ffd2b8'],
};

/** Points of a regular star or cog, as an SVG path, centred on (50, 50). */
function ring(points: number, outer: number, inner: number, rotate = 0): string {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = ((Math.PI * i) / points) + rotate - Math.PI / 2;
    out.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${out.join(' L')} Z`;
}

/** A cog: teeth round a wheel, with a hole. */
function cog(): string {
  const teeth = 8;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const r = i % 4 < 2 ? 30 : 23;
    const a = (Math.PI * 2 * (i + 0.5)) / (teeth * 4);
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `<path fill-rule="evenodd" d="M${pts.join(' L')} Z M50 40 A10 10 0 1 0 50 60 A10 10 0 1 0 50 40 Z"/>`;
}

const ART: Record<string, string> = {
  aasimar:
    '<ellipse cx="50" cy="24" rx="17" ry="5.5" fill="none" stroke-width="3.5" stroke="currentColor"/>' +
    '<path d="M50 58 C40 49 26 45 12 49 C20 53 25 57 29 59 C22 61 18 66 16 71 C29 71 42 66 50 62 Z"/>' +
    '<path d="M50 58 C60 49 74 45 88 49 C80 53 75 57 71 59 C78 61 82 66 84 71 C71 71 58 66 50 62 Z"/>' +
    '<path d="M50 36 L55 48 L50 68 L45 48 Z"/>',
  elf: '<path d="M50 16 C72 33 72 63 50 84 C28 63 28 33 50 16 Z"/><path d="M50 26 L50 77 M50 44 L40 36 M50 54 L61 45 M50 64 L41 57" stroke-width="2.5" stroke="var(--crest-bg)" fill="none"/>',
  drow: '<circle cx="45" cy="52" r="29"/><circle cx="58" cy="45" r="25" fill="var(--crest-bg)"/><circle cx="70" cy="62" r="2.8"/><circle cx="77" cy="50" r="2.2"/><circle cx="74" cy="72" r="1.7"/>',
  dwarf:
    '<path d="M12 78 L36 42 L48 58 L62 36 L88 78 Z" opacity="0.45"/>' +
    '<rect x="33" y="20" width="34" height="14" rx="2.5"/><rect x="46.5" y="31" width="7" height="45" rx="2"/>',
  gnome: cog(),
  goliath:
    '<path d="M8 78 L33 34 L45 52 L60 24 L92 78 Z"/>' +
    '<path d="M33 34 L27 45 L33 42 L39 46 Z M60 24 L52 38 L60 34 L67 39 Z" fill="var(--crest-bg)" opacity="0.85"/>',
  halfling:
    '<path d="M28 46 C28 30 72 30 72 46 Z"/><rect x="47.5" y="22" width="5" height="11" rx="2"/>' +
    '<path d="M33 46 C33 66 46 78 50 81 C54 78 67 66 67 46 Z" opacity="0.8"/>' +
    '<path d="M54 26 C62 18 72 20 74 26 C66 28 60 28 54 26 Z"/>',
  human: `<path d="${ring(8, 34, 12)}"/><circle cx="50" cy="50" r="7" fill="var(--crest-bg)"/>`,
  orc:
    '<path d="M24 40 C36 30 64 30 76 40" fill="none" stroke-width="4.5" stroke="currentColor" stroke-linecap="round"/>' +
    '<path d="M37 78 C29 62 31 48 40 40 C40 54 42 65 47 75 Z"/><path d="M63 78 C71 62 69 48 60 40 C60 54 58 65 53 75 Z"/>',
  tiefling:
    '<path d="M45 52 C30 48 21 33 30 16 C32 30 38 38 49 43 Z"/><path d="M55 52 C70 48 79 33 70 16 C68 30 62 38 51 43 Z"/>' +
    '<path d="M50 54 C50 68 62 70 64 80" fill="none" stroke-width="3.5" stroke="currentColor" stroke-linecap="round"/><path d="M59 79 L72 86 L68 73 Z"/>',
  dragonborn:
    '<path d="M50 22 L66 34 L62 62 L50 80 L38 62 L34 34 Z"/>' +
    '<path d="M38 31 L22 13 L33 33 Z M62 31 L78 13 L67 33 Z"/>' +
    '<path d="M40 44 L47 47 L41 49 Z M60 44 L53 47 L59 49 Z" fill="var(--crest-bg)"/>' +
    '<circle cx="46" cy="66" r="1.8" fill="var(--crest-bg)"/><circle cx="54" cy="66" r="1.8" fill="var(--crest-bg)"/>',
};

/** A species' (and lineage's) look: its colours and its picture. */
export function lookOf(species: string, lineage = ''): Look {
  if (species === 'elf' && lineage === 'drow') return { bg: '#33204a', fg: '#dcd3f2', art: ART.drow };
  if (species === 'dragonborn') {
    const [bg, fg] = DRAGON[lineage] ?? ['#8a3a2a', '#ffe6cf'];
    return { bg, fg, art: ART.dragonborn };
  }
  if (species === 'goliath') {
    const [bg, fg] = GIANT[lineage] ?? ['#6d6962', '#ece8e0'];
    return { bg, fg, art: ART.goliath };
  }
  if (species === 'tiefling') {
    const [bg, fg] = LEGACY[lineage] ?? ['#7a2840', '#ffd6e0'];
    return { bg, fg, art: ART.tiefling };
  }
  const base: Record<string, [string, string]> = {
    aasimar: ['#263c6e', '#f2dc8c'],
    elf: lineage === 'wood-elf' ? ['#356b36', '#e4f5d2'] : ['#2c5f8c', '#e6f1fb'],
    dwarf: ['#6b5641', '#f3e3c8'],
    gnome: lineage === 'forest-gnome' ? ['#3f6b3a', '#eaf6d6'] : ['#8a5a33', '#fde8cf'],
    halfling: ['#6d5e30', '#fbf0c8'],
    human: ['#7d5f2e', '#fff1cf'],
    orc: ['#435f33', '#eef7da'],
  };
  const [bg, fg] = base[species] ?? ['#4b4b58', '#ececf4'];
  return { bg, fg, art: ART[species] ?? `<path d="${ring(5, 30, 13)}"/>` };
}

const frame = (inner: string, label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${label.replace(/"/g, '')}">${inner}<circle cx="50" cy="50" r="46.5" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="3"/></svg>`;

/** One species' crest, as SVG text. */
export function emblemSvg(species: string, lineage = '', label = species): string {
  const k = lookOf(species, lineage);
  return frame(`<g style="--crest-bg:${k.bg}"><circle cx="50" cy="50" r="48" fill="${k.bg}"/><g fill="${k.fg}" color="${k.fg}">${k.art}</g></g>`, label);
}

/** Mixed heritage's crest: the left half one side's, the right half the other's. */
export function mixedEmblemSvg(a: { species: string; lineage: string }, b: { species: string; lineage: string }, label = 'Mixed heritage', id = 'm'): string {
  const ka = lookOf(a.species, a.lineage);
  const kb = lookOf(b.species, b.lineage);
  // Each half has its own colour and its side's whole picture, smaller.
  const half = (k: Look, clip: string, dx: number) =>
    `<g clip-path="url(#${clip})" style="--crest-bg:${k.bg}"><circle cx="50" cy="50" r="48" fill="${k.bg}"/><g fill="${k.fg}" color="${k.fg}" transform="translate(${dx} 22.5) scale(0.55)">${k.art}</g></g>`;
  return frame(
    `<defs><clipPath id="${id}L"><rect x="0" y="0" width="50" height="100"/></clipPath><clipPath id="${id}R"><rect x="50" y="0" width="50" height="100"/></clipPath></defs>` +
      half(ka, `${id}L`, -1.5) +
      half(kb, `${id}R`, 46.5) +
      '<line x1="50" y1="3" x2="50" y2="97" stroke="#000" stroke-opacity="0.3" stroke-width="1.5"/>',
    label,
  );
}

/** A crest as an image address, for a portrait. */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
