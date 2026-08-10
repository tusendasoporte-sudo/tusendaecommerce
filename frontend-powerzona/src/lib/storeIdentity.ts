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

export function getStoreOrderPrefix(value: unknown, fallback = 'MT') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/([a-z])(\p{Lu})/gu, '$1 $2')
    .toUpperCase();
  const words = normalized.split(/[^A-Z]+/).filter(Boolean);
  const prefix = words.length >= 2
    ? words.slice(0, 2).map((word) => word[0]).join('')
    : String(words[0] || '').slice(0, 2);
  const safeFallback = String(fallback || 'MT').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  return prefix || safeFallback || 'MT';
}
