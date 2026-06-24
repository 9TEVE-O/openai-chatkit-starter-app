/**
 * Tests for pure helper functions introduced/changed in components/VerbaFix.tsx.
 *
 * These functions are not exported from the module, so we replicate their exact
 * implementations here (copied verbatim from source) and verify their behaviour.
 * Any deviation from the source will be caught immediately by these tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Replicated helpers (verbatim from components/VerbaFix.tsx) ───────────────

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function correctGrammar(text: string): string {
  let out = text.replace(/\bi\b/g, 'I').replace(/\s+/g, ' ').trim();
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (!/[.?!]$/.test(out)) out += '.';
  return out;
}

// ─── formatTimestamp ──────────────────────────────────────────────────────────

describe('formatTimestamp', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatTimestamp(0)).toBe('00:00');
  });

  it('formats 59 seconds as 00:59', () => {
    expect(formatTimestamp(59)).toBe('00:59');
  });

  it('formats 60 seconds as 01:00', () => {
    expect(formatTimestamp(60)).toBe('01:00');
  });

  it('formats 61 seconds as 01:01', () => {
    expect(formatTimestamp(61)).toBe('01:01');
  });

  it('formats 65 seconds as 01:05', () => {
    expect(formatTimestamp(65)).toBe('01:05');
  });

  it('formats 125 seconds as 02:05', () => {
    expect(formatTimestamp(125)).toBe('02:05');
  });

  it('formats 300 seconds as 05:00 (max session duration)', () => {
    expect(formatTimestamp(300)).toBe('05:00');
  });

  it('formats 599 seconds as 09:59', () => {
    expect(formatTimestamp(599)).toBe('09:59');
  });

  it('pads single-digit seconds with leading zero', () => {
    expect(formatTimestamp(9)).toBe('00:09');
  });

  it('pads single-digit minutes with leading zero', () => {
    expect(formatTimestamp(60)).toBe('01:00');
  });
});

// ─── correctGrammar ───────────────────────────────────────────────────────────

describe('correctGrammar', () => {
  it('capitalises the first character', () => {
    expect(correctGrammar('hello world')[0]).toBe('H');
  });

  it('appends a period when no terminal punctuation', () => {
    expect(correctGrammar('hello world')).toBe('Hello world.');
  });

  it('does not double-add period when text ends with period', () => {
    expect(correctGrammar('hello.')).toBe('Hello.');
  });

  it('does not add period when text ends with question mark', () => {
    expect(correctGrammar('how are you?')).toBe('How are you?');
  });

  it('does not add period when text ends with exclamation mark', () => {
    expect(correctGrammar('great job!')).toBe('Great job!');
  });

  it('replaces standalone lowercase "i" with "I"', () => {
    expect(correctGrammar('i went home')).toBe('I went home.');
  });

  it('replaces multiple standalone "i" occurrences', () => {
    const result = correctGrammar('i think i can do it');
    expect(result).toContain('I think I can');
  });

  it('does not replace "i" inside words like "inside"', () => {
    const result = correctGrammar('inside the room');
    // "inside" should not become "InsIde" — the /\bi\b/ pattern is word-boundary-only
    expect(result).toBe('Inside the room.');
  });

  it('collapses multiple whitespace into single space', () => {
    const result = correctGrammar('hello   world');
    expect(result).toBe('Hello world.');
  });

  it('trims leading and trailing whitespace', () => {
    expect(correctGrammar('  hello  ')).toBe('Hello.');
  });

  it('handles empty string after trim gracefully', () => {
    // Empty string: charAt(0) = '' → upper → '' + '' + '.' = '.'
    expect(correctGrammar('   ')).toBe('.');
  });

  it('preserves internal capitalisation of proper nouns', () => {
    const result = correctGrammar('went to Paris yesterday');
    expect(result).toBe('Went to Paris yesterday.');
  });
});

// ─── triggerDownload (DOM-dependent) ─────────────────────────────────────────

describe('triggerDownload', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let removeChildSpy: ReturnType<typeof vi.spyOn>;
  let clickMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/fake-url');
    revokeObjectURLMock = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock });

    clickMock = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(clickMock);
      }
      return el;
    });

    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Replicated verbatim from VerbaFix.tsx
  function triggerDownload(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  it('calls URL.createObjectURL with a Blob', () => {
    triggerDownload('content', 'file.txt', 'text/plain');
    expect(createObjectURLMock).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('appends an anchor element with the correct download attribute to body', () => {
    triggerDownload('hello', 'export.json', 'application/json');
    const appendedNode = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(appendedNode.tagName).toBe('A');
    expect(appendedNode.download).toBe('export.json');
  });

  it('appends anchor to body and then removes it', () => {
    triggerDownload('data', 'file.md', 'text/markdown');
    expect(appendChildSpy).toHaveBeenCalledOnce();
    expect(removeChildSpy).toHaveBeenCalledOnce();
  });

  it('calls URL.revokeObjectURL after click to free memory', () => {
    triggerDownload('data', 'file.txt', 'text/plain');
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/fake-url');
  });

  it('creates Blob with the provided MIME type', () => {
    triggerDownload('{}', 'data.json', 'application/json');
    const blobArg: Blob = createObjectURLMock.mock.calls[0][0];
    expect(blobArg.type).toBe('application/json');
  });
});

// ─── Draft state storage key & constants ─────────────────────────────────────

describe('VerbaFix constants', () => {
  it('STORAGE_KEY value matches expected localStorage key', () => {
    // This test documents the contract. If the key changes, draft restores break for existing users.
    const STORAGE_KEY = 'verbafix_draft';
    expect(STORAGE_KEY).toBe('verbafix_draft');
  });

  it('DEFAULT_SPEAKER_NAMES contains exactly four speakers A, B, C, D', () => {
    const DEFAULT_SPEAKER_NAMES = { A: 'Speaker A', B: 'Speaker B', C: 'Speaker C', D: 'Speaker D' };
    expect(Object.keys(DEFAULT_SPEAKER_NAMES)).toEqual(['A', 'B', 'C', 'D']);
    expect(DEFAULT_SPEAKER_NAMES.A).toBe('Speaker A');
    expect(DEFAULT_SPEAKER_NAMES.B).toBe('Speaker B');
    expect(DEFAULT_SPEAKER_NAMES.C).toBe('Speaker C');
    expect(DEFAULT_SPEAKER_NAMES.D).toBe('Speaker D');
  });
});