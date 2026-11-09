export const QUOTE_CARD_THEMES = [
  { id: 'lotus-dawn', dark: false },
  { id: 'lotus-pink', dark: false },
  { id: 'lotus-sunrise', dark: false },
  { id: 'lotus-moon', dark: true },
  { id: 'sky-clouds', dark: false },
  { id: 'sky-sunset', dark: false },
  { id: 'sky-pastel', dark: false },
  { id: 'sky-stars', dark: true },
] as const;

export type QuoteThemeKey = (typeof QUOTE_CARD_THEMES)[number]['id'];
