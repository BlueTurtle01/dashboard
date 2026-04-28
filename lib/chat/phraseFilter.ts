import { BannedPhrase, PhraseCheckResult } from './types';

export function checkPhrase(content: string, phrases: BannedPhrase[]): PhraseCheckResult {
  if (!phrases || phrases.length === 0) {
    return { allowed: true };
  }

  const lowerContent = content.toLowerCase();

  for (const phrase of phrases) {
    if (!phrase.is_active) continue;

    const lowerPhrase = phrase.phrase.toLowerCase();

    if (containsPhrase(lowerContent, lowerPhrase)) {
      return {
        allowed: phrase.severity === 'flag',
        severity: phrase.severity,
        matchedPhrase: phrase.phrase,
      };
    }
  }

  return { allowed: true };
}

function containsPhrase(text: string, phrase: string): boolean {
  const words = phrase.split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) return false;

  if (words.length === 1) {
    return text.includes(words[0]);
  }

  const pattern = words.map(escapeRegex).join('\\s+');
  const regex = new RegExp(pattern, 'i');
  return regex.test(text);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
