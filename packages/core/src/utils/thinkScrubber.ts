/**
 * Stateful and static scrubbers for reasoning/thinking blocks in assistant text.
 * 
 * Many open-weight and proprietary models (DeepSeek-R1, Mistral, Ollama models) emit
 * reasoning blocks enclosed in `<think>...</think>`, `<reasoning>...</reasoning>`, or
 * `<thought>...</thought>`.
 * 
 * When streaming SSE deltas, simple regex replacement per-chunk fails when tags are
 * split across boundaries (e.g., chunk 1: `<thi`, chunk 2: `nk>...`).
 * 
 * `StreamingThinkScrubber` maintains tag-suppression state across chunks so partial tags
 * are buffered and reasoning text is discarded cleanly.
 */

const OPEN_TAG_NAMES = ['think', 'thinking', 'reasoning', 'thought', 'REASONING_SCRATCHPAD'];
const OPEN_TAGS = OPEN_TAG_NAMES.map(name => `<${name}>`);
const CLOSE_TAGS = OPEN_TAG_NAMES.map(name => `</${name}>`);
const MAX_TAG_LEN = Math.max(...[...OPEN_TAGS, ...CLOSE_TAGS].map(t => t.length));

const PRESERVED_PLATFORMS = new Set(['dashboard', 'desktop', 'web', 'gui']);

/**
 * Returns a safe end-index for slicing `str` at `end`, ensuring we never
 * cut in the middle of a UTF-16 surrogate pair (which would corrupt 4-byte emoji).
 */
function safeSliceEnd(str: string, end: number): number {
  if (end <= 0 || end >= str.length) return end;
  const c = str.charCodeAt(end - 1);
  // If the last kept char is a HIGH surrogate (U+D800–U+DBFF), step back one
  if (c >= 0xD800 && c <= 0xDBFF) return end - 1;
  return end;
}

/**
 * Static helper to clean a complete, non-streaming string of any reasoning blocks,
 * unless the target platform is dashboard or desktop (where collapsible UI is rendered).
 */
export function stripThinkBlocks(text: string, platform?: string): string {
  if (!text) return '';
  if (platform && PRESERVED_PLATFORMS.has(platform.toLowerCase())) {
    return text;
  }
  let cleaned = text;

  // 1. Strip closed pairs: <tag>...</tag> (case-insensitive, non-greedy)
  for (const name of OPEN_TAG_NAMES) {
    const regex = new RegExp(`<${name}>[\\s\\S]*?<\\/${name}>`, 'gi');
    cleaned = cleaned.replace(regex, '');
  }

  // 2. Strip unterminated open tag at the start or after newline
  for (const name of OPEN_TAG_NAMES) {
    const openRegex = new RegExp(`(^|\\n)\\s*<${name}>[\\s\\S]*$`, 'i');
    cleaned = cleaned.replace(openRegex, '$1');
  }

  // 3. Strip orphan close tags
  for (const name of OPEN_TAG_NAMES) {
    const closeRegex = new RegExp(`<\\/${name}>[\\s\\t\\r\\n]*`, 'gi');
    cleaned = cleaned.replace(closeRegex, '');
  }

  // 4. Strip Gemini bracket-style meta-planning labels that leak into visible output.
  // e.g. "[Self-Correction] ...", "[Action] ...", "[User provided details] ..."
  // These are internal monologue markers the model emits in its text instead of using <think> tags.
  // Match a line that starts with [LABEL] where LABEL is a known internal planning word.
  const LEAKED_LABEL_RE = /^\s*\[(Self-Correction|Action|User provided details|User Details|Reasoning|Internal Thought|Thought|Planning|Analysis|Reflection|SYSTEM NUDGE[^\]]*)\][^\n]*/gim;
  cleaned = cleaned.replace(LEAKED_LABEL_RE, '').replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Stateful scrubber for streaming chunk deltas.
 */
export class StreamingThinkScrubber {
  private inBlock: boolean = false;
  private buf: string = '';
  private lastEmittedEndedNewline: boolean = true;

  constructor(private platform?: string) {}

  public reset(): void {
    this.inBlock = false;
    this.buf = '';
    this.lastEmittedEndedNewline = true;
  }

  public feed(text: string): string {
    if (!text) return '';
    if (this.platform && PRESERVED_PLATFORMS.has(this.platform.toLowerCase())) {
      return text;
    }
    let buf = this.buf + text;
    this.buf = '';
    const out: string[] = [];

    while (buf.length > 0) {
      if (this.inBlock) {
        const [closeIdx, closeLen] = this.findFirstTag(buf, CLOSE_TAGS);
        if (closeIdx === -1) {
          // Hold back potential partial close tag prefix
          const held = this.maxPartialSuffix(buf, CLOSE_TAGS);
          this.buf = held > 0 ? buf.slice(-held) : '';
          return out.join('');
        }
        // Found close tag -> discard block + tag and continue
        buf = buf.slice(closeIdx + closeLen);
        this.inBlock = false;
      } else {
        // Priority 1: closed pair <tag>...</tag> anywhere in buf
        const pair = this.findEarliestClosedPair(buf);
        // Priority 2: unterminated open tag at block boundary
        const [openIdx, openLen] = this.findOpenAtBoundary(buf, out);

        if (pair !== null && (openIdx === -1 || pair[0] <= openIdx)) {
          const [startIdx, endIdx] = pair;
          let preceding = buf.slice(0, startIdx);
          if (preceding) {
            preceding = this.stripOrphanCloseTags(preceding);
            if (preceding) {
              out.push(preceding);
              this.lastEmittedEndedNewline = preceding.endsWith('\n');
            }
          }
          buf = buf.slice(endIdx);
          continue;
        }

        if (openIdx !== -1) {
          let preceding = buf.slice(0, openIdx);
          if (preceding) {
            preceding = this.stripOrphanCloseTags(preceding);
            if (preceding) {
              out.push(preceding);
              this.lastEmittedEndedNewline = preceding.endsWith('\n');
            }
          }
          this.inBlock = true;
          buf = buf.slice(openIdx + openLen);
          continue;
        }

        // No complete tag found. Hold back partial prefix at tail
        const heldOpen = this.maxPartialSuffix(buf, OPEN_TAGS);
        const heldClose = this.maxPartialSuffix(buf, CLOSE_TAGS);
        const held = Math.max(heldOpen, heldClose);

        if (held > 0) {
          // safeSliceEnd prevents cutting in the middle of a surrogate pair,
          // which would turn 4-byte emoji (🎯 🚨 etc.) into U+FFFD replacement chars.
          const safeEnd = safeSliceEnd(buf, buf.length - held);
          const emitText = buf.slice(0, safeEnd);
          this.buf = buf.slice(safeEnd);
          if (emitText) {
            const scrubbed = this.stripOrphanCloseTags(emitText);
            if (scrubbed) {
              out.push(scrubbed);
              this.lastEmittedEndedNewline = scrubbed.endsWith('\n');
            }
          }
        } else {
          const scrubbed = this.stripOrphanCloseTags(buf);
          if (scrubbed) {
            out.push(scrubbed);
            this.lastEmittedEndedNewline = scrubbed.endsWith('\n');
          }
          this.buf = '';
        }
        return out.join('');
      }
    }

    return out.join('');
  }

  public flush(): string {
    if (this.platform && PRESERVED_PLATFORMS.has(this.platform.toLowerCase())) {
      const tail = this.buf;
      this.buf = '';
      return tail;
    }
    if (this.inBlock) {
      this.buf = '';
      this.inBlock = false;
      return '';
    }
    const tail = this.buf;
    this.buf = '';
    if (!tail) return '';
    const scrubbed = this.stripOrphanCloseTags(tail);
    if (scrubbed) {
      this.lastEmittedEndedNewline = scrubbed.endsWith('\n');
    }
    return scrubbed;
  }

  private findFirstTag(buf: string, tags: string[]): [number, number] {
    const bufLower = buf.toLowerCase();
    let bestIdx = -1;
    let bestLen = 0;
    for (const tag of tags) {
      const idx = bufLower.indexOf(tag.toLowerCase());
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx;
        bestLen = tag.length;
      }
    }
    return [bestIdx, bestLen];
  }

  private findEarliestClosedPair(buf: string): [number, number] | null {
    const bufLower = buf.toLowerCase();
    let best: [number, number] | null = null;
    for (let i = 0; i < OPEN_TAGS.length; i++) {
      const openLower = OPEN_TAGS[i].toLowerCase();
      const closeLower = CLOSE_TAGS[i].toLowerCase();
      const openIdx = bufLower.indexOf(openLower);
      if (openIdx === -1) continue;
      const closeIdx = bufLower.indexOf(closeLower, openIdx + openLower.length);
      if (closeIdx === -1) continue;
      const endIdx = closeIdx + closeLower.length;
      if (best === null || openIdx < best[0]) {
        best = [openIdx, endIdx];
      }
    }
    return best;
  }

  private findOpenAtBoundary(buf: string, alreadyEmitted: string[]): [number, number] {
    const bufLower = buf.toLowerCase();
    let bestIdx = -1;
    let bestLen = 0;
    for (const tag of OPEN_TAGS) {
      const tagLower = tag.toLowerCase();
      let searchStart = 0;
      while (true) {
        const idx = bufLower.indexOf(tagLower, searchStart);
        if (idx === -1) break;
        if (this.isBlockBoundary(buf, idx, alreadyEmitted)) {
          if (bestIdx === -1 || idx < bestIdx) {
            bestIdx = idx;
            bestLen = tag.length;
          }
          break;
        }
        searchStart = idx + 1;
      }
    }
    return [bestIdx, bestLen];
  }

  private isBlockBoundary(buf: string, idx: number, alreadyEmitted: string[]): boolean {
    if (idx === 0) {
      if (alreadyEmitted.length > 0) {
        return alreadyEmitted[alreadyEmitted.length - 1].endsWith('\n');
      }
      return this.lastEmittedEndedNewline;
    }
    const preceding = buf.slice(0, idx);
    const lastNl = preceding.lastIndexOf('\n');
    if (lastNl === -1) {
      const priorNewline =
        alreadyEmitted.length > 0
          ? alreadyEmitted[alreadyEmitted.length - 1].endsWith('\n')
          : this.lastEmittedEndedNewline;
      return priorNewline && preceding.trim() === '';
    }
    return preceding.slice(lastNl + 1).trim() === '';
  }

  private maxPartialSuffix(buf: string, tags: string[]): number {
    if (!buf) return 0;
    const bufLower = buf.toLowerCase();
    const maxCheck = Math.min(bufLower.length, MAX_TAG_LEN - 1);
    for (let i = maxCheck; i > 0; i--) {
      const suffix = bufLower.slice(-i);
      for (const tag of tags) {
        if (tag.length > i && tag.toLowerCase().startsWith(suffix)) {
          return i;
        }
      }
    }
    return 0;
  }

  private stripOrphanCloseTags(text: string): string {
    if (!text.includes('</')) return text;
    let result = text;
    for (const tag of CLOSE_TAGS) {
      const regex = new RegExp(`${tag}[\\s\\t\\n\\r]*`, 'gi');
      result = result.replace(regex, '');
    }
    return result;
  }
}
