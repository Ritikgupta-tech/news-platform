const WORDS_PER_MINUTE = 220;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function readingMinutes(plainText: string): number {
  return Math.max(1, Math.ceil(countWords(plainText) / WORDS_PER_MINUTE));
}
