// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/polish/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/polish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeMalformedRequest(): NextRequest {
  return new NextRequest('http://localhost/api/polish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not-valid-json{{{',
  });
}

const SAMPLE_SEGMENTS = [
  { speaker: 'A', text: 'hello world', timestamp: 0 },
  { speaker: 'B', text: 'how are you doing today', timestamp: 65 },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/polish', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // ── Missing API key ──────────────────────────────────────────────────────

  it('returns 500 when ANTHROPIC_API_KEY is not set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const res = await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/ANTHROPIC_API_KEY not configured/);
  });

  it('returns 500 when ANTHROPIC_API_KEY is undefined', async () => {
    vi.unstubAllEnvs();
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  // ── Invalid request body ──────────────────────────────────────────────────

  it('returns 400 for malformed JSON body', async () => {
    const res = await POST(makeMalformedRequest());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid JSON body/);
  });

  it('returns 400 when segments is missing from body', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/segments array required/);
  });

  it('returns 400 when segments is null', async () => {
    const res = await POST(makeRequest({ segments: null }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/segments array required/);
  });

  it('returns 400 when segments is an empty array', async () => {
    const res = await POST(makeRequest({ segments: [] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/segments array required/);
  });

  it('returns 400 when segments is a string, not an array', async () => {
    const res = await POST(makeRequest({ segments: 'not-an-array' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/segments array required/);
  });

  // ── Anthropic API errors ──────────────────────────────────────────────────

  it('returns 502 when Anthropic API returns a non-ok status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve('Rate limit exceeded'),
    });
    const res = await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/Anthropic API error/);
    expect(data.error).toMatch(/Rate limit exceeded/);
  });

  it('returns 502 with the full Anthropic error text', async () => {
    const anthropicErrorBody = JSON.stringify({ error: { type: 'authentication_error' } });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve(anthropicErrorBody),
    });
    const res = await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain(anthropicErrorBody);
  });

  // ── Successful responses ──────────────────────────────────────────────────

  it('returns corrected and summary when Anthropic returns valid JSON', async () => {
    const anthropicResponse = {
      content: [
        {
          text: JSON.stringify({
            corrected: 'Speaker A [00:00]: Hello world.\nSpeaker B [01:05]: How are you doing today?',
            summary: 'A short conversation between Speaker A and B.',
          }),
        },
      ],
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(anthropicResponse),
    });

    const res = await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.corrected).toContain('Speaker A');
    expect(data.summary).toBe('A short conversation between Speaker A and B.');
  });

  it('extracts JSON when Anthropic wraps response in markdown fences', async () => {
    const corrected = 'Speaker A [00:00]: Hello world.';
    const summary = 'Brief discussion.';
    const anthropicResponse = {
      content: [
        {
          text: `\`\`\`json\n${JSON.stringify({ corrected, summary })}\n\`\`\``,
        },
      ],
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(anthropicResponse),
    });

    const res = await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.corrected).toBe(corrected);
    expect(data.summary).toBe(summary);
  });

  it('falls back to rawText when Anthropic returns non-JSON text', async () => {
    const rawText = 'This is not JSON at all.';
    const anthropicResponse = {
      content: [{ text: rawText }],
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(anthropicResponse),
    });

    const res = await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.corrected).toBe(rawText);
    expect(data.summary).toBe('');
  });

  it('falls back to rawText when parsed JSON lacks corrected field', async () => {
    const anthropicResponse = {
      content: [
        {
          text: JSON.stringify({ summary: 'Only summary present' }),
        },
      ],
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(anthropicResponse),
    });

    const res = await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));
    expect(res.status).toBe(200);
    const data = await res.json();
    // corrected is not a string → falls back to rawText
    expect(data.corrected).toEqual(expect.any(String));
  });

  it('returns empty summary when Anthropic response has no content', async () => {
    const anthropicResponse = { content: [] };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(anthropicResponse),
    });

    const res = await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));
    expect(res.status).toBe(200);
    const data = await res.json();
    // rawText is empty string → corrected = '', summary = ''
    expect(data.corrected).toBe('');
    expect(data.summary).toBe('');
  });

  // ── Transcript formatting ─────────────────────────────────────────────────

  it('sends correct verbatim transcript to Anthropic with MM:SS timestamps', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ text: JSON.stringify({ corrected: 'ok', summary: 'ok' }) }],
        }),
    });

    const segments = [
      { speaker: 'A', text: 'First utterance', timestamp: 0 },
      { speaker: 'B', text: 'Second utterance', timestamp: 125 },
    ];
    await POST(makeRequest({ segments }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const promptContent: string = body.messages[0].content;

    expect(promptContent).toContain('Speaker A [00:00]: First utterance');
    expect(promptContent).toContain('Speaker B [02:05]: Second utterance');
  });

  it('calls Anthropic with correct model and max_tokens', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ text: JSON.stringify({ corrected: 'ok', summary: '' }) }],
        }),
    });

    await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.max_tokens).toBe(2048);
  });

  it('includes x-api-key and anthropic-version headers', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ text: JSON.stringify({ corrected: 'ok', summary: '' }) }],
        }),
    });

    await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  // ── formatTimestamp edge cases (internal helper, tested via prompt content) ──

  it('formats 0 seconds as 00:00', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ text: JSON.stringify({ corrected: 'ok', summary: '' }) }],
        }),
    });

    await POST(makeRequest({ segments: [{ speaker: 'A', text: 'hi', timestamp: 0 }] }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content).toContain('[00:00]');
  });

  it('formats 59 seconds as 00:59', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ text: JSON.stringify({ corrected: 'ok', summary: '' }) }],
        }),
    });

    await POST(makeRequest({ segments: [{ speaker: 'A', text: 'hi', timestamp: 59 }] }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content).toContain('[00:59]');
  });

  it('formats 300 seconds as 05:00', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ text: JSON.stringify({ corrected: 'ok', summary: '' }) }],
        }),
    });

    await POST(makeRequest({ segments: [{ speaker: 'A', text: 'hi', timestamp: 300 }] }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content).toContain('[05:00]');
  });

  // ── Regression: JSON with surrounding text ────────────────────────────────

  it('extracts JSON object surrounded by preamble text', async () => {
    const corrected = 'Speaker A: Hello.';
    const summary = 'They said hello.';
    const rawText = `Here is the result:\n${JSON.stringify({ corrected, summary })}\nEnd.`;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: rawText }] }),
    });

    const res = await POST(makeRequest({ segments: SAMPLE_SEGMENTS }));
    const data = await res.json();
    expect(data.corrected).toBe(corrected);
    expect(data.summary).toBe(summary);
  });
});