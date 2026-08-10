export function getStoreInitials(value: unknown, fallback = 'TS') {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2')
    .trim();
  const words = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  if (words.length >= 2) {
    return words.slice(0, 2).map((word) => Array.from(word)[0]).join('').toLocaleUpperCase('es');
  }

  const firstWord = Array.from(words[0] || '').slice(0, 2).join('').toLocaleUpperCase('es');
  return firstWord || fallback;
}
