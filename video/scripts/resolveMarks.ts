import { FPS } from "../config/fps";

export type MarkRef = { mark: string };
export type AfterRef = { after: string; offset?: number };

export type AlignmentBlock = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type ResolvedMarks = Record<string, number>;

/**
 * Walk the raw script with an index, skipping `{{MARK}}` tokens. When a
 * mark is entered, snapshot the current `strippedPos` — the index of the
 * next char in the stripped text. Return `[strippedText, marks]` where
 * `marks[name] = strippedPos` (in USV/code-point count, matching the
 * alignment.characters array).
 *
 * Uses Array.from for code-point iteration so multi-byte UTF-8 chars
 * increment stripped position by exactly 1 each — matching ElevenLabs'
 * per-character alignment model. Note: characters outside the BMP are
 * single USVs here but a single "character" in the alignment array, so
 * this stays in lockstep.
 */
const walkScript = (
  rawScript: string,
): { strippedText: string; marks: Record<string, number> } => {
  const codepoints = Array.from(rawScript);
  const stripped: string[] = [];
  const marks: Record<string, number> = {};
  let i = 0;
  while (i < codepoints.length) {
    // Detect `{{` — both chars are ASCII so safe to compare as code points.
    if (
      codepoints[i] === "{" &&
      i + 1 < codepoints.length &&
      codepoints[i + 1] === "{"
    ) {
      // Find closing `}}`.
      let j = i + 2;
      while (j + 1 < codepoints.length) {
        if (codepoints[j] === "}" && codepoints[j + 1] === "}") break;
        j += 1;
      }
      if (j + 1 >= codepoints.length) {
        // Unterminated `{{` — treat as literal text so we don't silently
        // swallow content.
        stripped.push(...codepoints.slice(i));
        break;
      }
      const name = codepoints.slice(i + 2, j).join("");
      marks[name] = stripped.length;
      i = j + 2; // skip past `}}`
      continue;
    }
    stripped.push(codepoints[i] as string);
    i += 1;
  }
  return { strippedText: stripped.join(""), marks };
};

/**
 * Resolves {{MARK}} tokens in a raw script to absolute frame offsets.
 *
 * Algorithm:
 *   1. Walk the raw script char-by-char, tracking the current position in the
 *      stripped-text coordinate (i.e., skipping characters that belong to
 *      {{MARK}} tokens).
 *   2. When a {{MARK}} token starts, snapshot the current stripped-position —
 *      that's the index of the NEXT non-mark character in the stripped text.
 *   3. Read character_start_times_seconds[position] → that's the time (in
 *      seconds) at which that character begins being spoken.
 *   4. Convert to frame: Math.round(seconds * fps).
 *
 * Edge cases (covered by tests):
 *   - Mark at end of script → clamps to last-character end time.
 *   - Two consecutive marks {{A}}{{B}} → both resolve to same position.
 *   - Mark name with special chars like {{A-B}} or {{AGENTICALLY!}}.
 *   - Multi-byte UTF-8 content: the `characters` array is split by Unicode
 *     Scalar Value not by UTF-8 bytes, so the position walk indexes by
 *     code points (via Array.from). The alignment block's `characters`
 *     array length is the authoritative length.
 */
export function resolveMarks(
  rawScript: string,
  alignment: AlignmentBlock,
  fps: number = FPS,
): ResolvedMarks {
  const { strippedText, marks } = walkScript(rawScript);
  const strippedLen = Array.from(strippedText).length;
  const alignLen = alignment.characters.length;

  if (strippedLen !== alignLen) {
    throw new Error(
      `resolveMarks: stripped text length (${strippedLen}) does not match alignment.characters length (${alignLen}). ` +
        `The script may have been modified after synthesis, or the API normalized whitespace.`,
    );
  }

  const resolved: ResolvedMarks = {};
  for (const [name, pos] of Object.entries(marks)) {
    if (pos >= alignLen) {
      // Mark sits past the last character — clamp to last char's END time
      // so it fires after the voice finishes.
      const last = alignLen - 1;
      if (last < 0) {
        resolved[name] = 0;
        continue;
      }
      const sec = alignment.character_end_times_seconds[last] ?? 0;
      resolved[name] = Math.round(sec * fps);
    } else {
      const sec = alignment.character_start_times_seconds[pos] ?? 0;
      resolved[name] = Math.round(sec * fps);
    }
  }
  return resolved;
}
