import { ROSARY_PHRASES, type RosaryPhrase } from './guided-sessions';

export const NAME_COPYING_ROUND_SIZE = 108;
export const NAME_COPYING_MANTRA_LEGACY_LABELS = ['Om Mani Pad Me Hum', 'Om Mani PAD ME HUM'];
type RosaryName = Extract<RosaryPhrase, `Nam mô ${string}`>;
export type NameCopyingPhrase = RosaryName | 'Ôm Ma Ni Pát Mê Hùm';
export const NAME_COPYING_PHRASES: NameCopyingPhrase[] = [
  ...ROSARY_PHRASES.filter((phrase): phrase is RosaryName => phrase.startsWith('Nam mô ')),
  'Ôm Ma Ni Pát Mê Hùm'
];

export function matchesNameCopyingPhrase(line: string, phrase: NameCopyingPhrase): boolean {
  const normalize = (text: string) => text.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleUpperCase('vi-VN');
  return normalize(line) === normalize(phrase);
}
