export interface KnownMentionMatch {
  start: number;
  end: number;
  raw: string;
  name: string;
  normalizedName: string;
}

const WORDLIKE_MENTION_CHAR_RE = /[\w.-]/;

function isMentionBoundaryBefore(value: string, index: number): boolean {
  return index === 0 || /\s/.test(value[index - 1]);
}

function isMentionBoundaryAfter(value: string, index: number): boolean {
  return index >= value.length || !WORDLIKE_MENTION_CHAR_RE.test(value[index]);
}

export function findKnownMentionMatches(
  value: string,
  knownMentionNames: Iterable<string>
): KnownMentionMatch[] {
  const normalizedNames = Array.from(
    new Set(Array.from(knownMentionNames, (name) => name.toLowerCase()))
  ).sort((left, right) => right.length - left.length);

  if (normalizedNames.length === 0 || value.length === 0) {
    return [];
  }

  const lowerValue = value.toLowerCase();
  const matches: KnownMentionMatch[] = [];

  for (let index = 0; index < value.length; index++) {
    if (value[index] !== '@' || !isMentionBoundaryBefore(value, index)) {
      continue;
    }

    const matchedName = normalizedNames.find((name) => {
      const end = index + 1 + name.length;
      return lowerValue.startsWith(name, index + 1) && isMentionBoundaryAfter(value, end);
    });

    if (!matchedName) {
      continue;
    }

    const end = index + 1 + matchedName.length;
    matches.push({
      start: index,
      end,
      raw: value.slice(index, end),
      name: value.slice(index + 1, end),
      normalizedName: matchedName,
    });
    index = end - 1;
  }

  return matches;
}
