import type { CSSProperties, ElementType, ReactNode } from 'react';

export type ThemeTokens = {
  appBackground: string;
  surface: string;
  surfaceRaised: string;
  surfaceInset: string;
  surfaceHover: string;
  text: string;
  textMuted: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentHover: string;
  accentContrast: string;
  success: string;
  warning: string;
  danger: string;
  focus: string;
  canvasGrid: string;
  shadow: string;
  shadowStrong: string;
  fontSans: string;
  fontSerif: string;
  radiusSmall: string;
  radiusMedium: string;
  radiusLarge: string;
};

export type ThemeOverrides = Partial<ThemeTokens>;
export type ObjectThemeOverrides = Record<string, ThemeOverrides>;

export type ThemeDefinition = {
  id: string;
  extends?: string;
  tokens?: ThemeOverrides;
  objects?: ObjectThemeOverrides;
};

export const baseTheme: ThemeDefinition = {
  id: 'base',
  tokens: {
    appBackground: '#16120f',
    surface: '#201a15',
    surfaceRaised: '#2a211a',
    surfaceInset: '#120f0d',
    surfaceHover: '#35291f',
    text: '#f1e5cf',
    textMuted: '#c0af95',
    line: '#514132',
    lineStrong: '#725b43',
    accent: '#c69a54',
    accentHover: '#e2bb73',
    accentContrast: '#1b130d',
    success: '#71ad73',
    warning: '#d5a759',
    danger: '#c96855',
    focus: '#efd082',
    canvasGrid: 'color-mix(in srgb, #d7b979 8%, transparent)',
    shadow: '0 16px 40px rgba(0, 0, 0, 0.26)',
    shadowStrong: '0 24px 70px rgba(0, 0, 0, 0.42)',
    fontSans: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    fontSerif: "Georgia, 'Times New Roman', serif",
    radiusSmall: '8px',
    radiusMedium: '12px',
    radiusLarge: '20px',
  },
};

export const tavernTheme: ThemeDefinition = {
  id: 'tavern',
  extends: 'base',
  tokens: {
    appBackground: '#17120f',
    surface: '#211a15',
    surfaceRaised: '#2c231b',
    surfaceInset: '#13100d',
    surfaceHover: '#392c21',
    text: '#f3e7d0',
    textMuted: '#c7b69d',
    line: '#564534',
    lineStrong: '#806549',
    accent: '#cda15c',
    accentHover: '#e6bf78',
    success: '#78b47a',
    warning: '#d9aa59',
    danger: '#cf6b58',
    focus: '#f0d382',
  },
  objects: {
    'board.canvas': {
      surfaceInset: '#18120f',
    },
    'widget.combat': {
      accent: '#ce755e',
    },
    'lore.reader': {
      surfaceRaised: '#d8c39b',
      text: '#34261a',
      textMuted: '#66523b',
      line: '#a88b5d',
    },
  },
};

export const daylightTheme: ThemeDefinition = {
  id: 'daylight',
  extends: 'base',
  tokens: {
    appBackground: '#f3efe6',
    surface: '#fbf8f1',
    surfaceRaised: '#ffffff',
    surfaceInset: '#e9e3d7',
    surfaceHover: '#f0eadf',
    text: '#28231e',
    textMuted: '#716a60',
    line: '#d3c9ba',
    lineStrong: '#b9aa95',
    accent: '#8f5c2e',
    accentHover: '#70431d',
    accentContrast: '#fffaf2',
    success: '#39754b',
    warning: '#a66d18',
    danger: '#a6483d',
    focus: '#9d622a',
    canvasGrid: 'color-mix(in srgb, #8f5c2e 10%, transparent)',
    shadow: '0 10px 30px rgba(58, 43, 26, 0.12)',
    shadowStrong: '0 20px 52px rgba(58, 43, 26, 0.18)',
  },
  objects: {
    'board.canvas': {
      surfaceInset: '#eee8dc',
    },
    'lore.reader': {
      surfaceRaised: '#fffdf8',
      text: '#2d271f',
      textMuted: '#716757',
      line: '#d2c4ac',
    },
  },
};

export const builtInThemes = {
  base: baseTheme,
  tavern: tavernTheme,
  daylight: daylightTheme,
} as const;

export type BuiltInThemeId = keyof typeof builtInThemes;

const cssVariableByToken: Record<keyof ThemeTokens, `--${string}`> = {
  appBackground: '--background',
  surface: '--surface',
  surfaceRaised: '--surface-raised',
  surfaceInset: '--surface-inset',
  surfaceHover: '--surface-hover',
  text: '--text',
  textMuted: '--muted',
  line: '--line',
  lineStrong: '--line-strong',
  accent: '--accent',
  accentHover: '--accent-hover',
  accentContrast: '--accent-contrast',
  success: '--success',
  warning: '--warning',
  danger: '--danger',
  focus: '--focus',
  canvasGrid: '--canvas-grid',
  shadow: '--shadow',
  shadowStrong: '--shadow-strong',
  fontSans: '--font-sans',
  fontSerif: '--font-serif',
  radiusSmall: '--radius-small',
  radiusMedium: '--radius-medium',
  radiusLarge: '--radius-large',
};

function resolveDefinition(
  definition: ThemeDefinition,
  registry: Record<string, ThemeDefinition>,
  visited = new Set<string>(),
): ThemeTokens {
  if (visited.has(definition.id)) {
    throw new Error(`Theme inheritance cycle detected at ${definition.id}`);
  }

  visited.add(definition.id);
  const parent = definition.extends ? registry[definition.extends] : undefined;
  if (definition.extends && !parent) {
    throw new Error(`Theme ${definition.id} extends an unknown theme: ${definition.extends}`);
  }

  const inherited = parent ? resolveDefinition(parent, registry, visited) : undefined;
  const tokens = { ...(inherited ?? {}), ...(definition.tokens ?? {}) };
  const missing = Object.keys(baseTheme.tokens ?? {}).filter(
    (token) => tokens[token as keyof ThemeTokens] === undefined,
  );

  if (missing.length > 0) {
    throw new Error(`Theme ${definition.id} is missing tokens: ${missing.join(', ')}`);
  }

  return tokens as ThemeTokens;
}

export function resolveTheme(
  theme: ThemeDefinition | BuiltInThemeId = 'tavern',
  additionalThemes: ThemeDefinition[] = [],
): ThemeTokens {
  const registry: Record<string, ThemeDefinition> = {
    ...builtInThemes,
    ...Object.fromEntries(additionalThemes.map((definition) => [definition.id, definition])),
  };
  const definition = typeof theme === 'string' ? registry[theme] : theme;

  if (!definition) {
    throw new Error(`Unknown theme: ${theme}`);
  }

  return resolveDefinition(definition, registry);
}

export function resolveObjectTheme(
  theme: ThemeDefinition | BuiltInThemeId,
  objectType: string,
  overrides: ThemeOverrides = {},
): ThemeTokens {
  const definition = typeof theme === 'string' ? builtInThemes[theme] : theme;
  return {
    ...resolveTheme(theme),
    ...(definition?.objects?.[objectType] ?? {}),
    ...overrides,
  };
}

export function themeStyle(tokens: ThemeTokens): CSSProperties {
  return Object.fromEntries(
    Object.entries(tokens).map(([token, value]) => [
      cssVariableByToken[token as keyof ThemeTokens],
      value,
    ]),
  ) as CSSProperties;
}

export function ThemeScope({
  as: Component = 'div',
  children,
  objectType,
  overrides,
  theme = 'tavern',
}: {
  as?: ElementType;
  children: ReactNode;
  objectType?: string;
  overrides?: ThemeOverrides;
  theme?: ThemeDefinition | BuiltInThemeId;
}) {
  const tokens = objectType
    ? resolveObjectTheme(theme, objectType, overrides)
    : { ...resolveTheme(theme), ...overrides };

  return (
    <Component
      data-object-type={objectType}
      data-theme={typeof theme === 'string' ? theme : theme.id}
      style={themeStyle(tokens)}
    >
      {children}
    </Component>
  );
}
