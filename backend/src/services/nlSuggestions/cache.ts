import type { NlSuggestionCacheEntry } from './types.js';

const suggestionCache = new Map<string, NlSuggestionCacheEntry>();

export function getCacheEntry(key: string): NlSuggestionCacheEntry | undefined {
  return suggestionCache.get(key);
}

export function setCacheEntry(key: string, entry: NlSuggestionCacheEntry): void {
  suggestionCache.set(key, entry);
}

export function clearCache(): void {
  suggestionCache.clear();
}
