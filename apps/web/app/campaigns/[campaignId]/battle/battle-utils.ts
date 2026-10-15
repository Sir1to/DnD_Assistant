import type { BattleToken } from '@fog-of-lore/contracts';

const defaultTokenColors = [
  '#7c5cff',
  '#ef5350',
  '#42a5f5',
  '#66bb6a',
  '#ffa726',
  '#ab47bc',
  '#26c6da',
  '#ec407a',
  '#d4e157',
  '#8d6e63',
  '#29b6f6',
  '#ff7043',
  '#26a69a',
  '#ffca28',
  '#5c6bc0',
  '#9ccc65',
  '#f06292',
  '#78909c',
];

export function nextUnusedTokenColor(tokens: Pick<BattleToken, 'color'>[]): string {
  const used = new Set(tokens.map(({ color }) => color.toLowerCase()));
  const available = defaultTokenColors.find((color) => !used.has(color));
  if (available) return available;

  for (let hue = 0; hue < 360; hue += 1) {
    const color = hslToHex(hue, 72, 58);
    if (!used.has(color)) return color;
  }

  return '#ffffff';
}

export function cellStyle(
  x: number,
  y: number,
  width: number,
  columns: number,
  rows: number,
  height = width,
) {
  return {
    left: `${(x / columns) * 100}%`,
    top: `${(y / rows) * 100}%`,
    width: `${(width / columns) * 100}%`,
    height: `${(height / rows) * 100}%`,
  };
}

export function drawnRectangle(start: { x: number; y: number }, end: { x: number; y: number }) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x) + 1,
    height: Math.abs(end.y - start.y) + 1,
  };
}

export function initials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function formatSaveDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [r, g, b] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return `#${[r, g, b]
    .map((value) =>
      Math.round((value + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
