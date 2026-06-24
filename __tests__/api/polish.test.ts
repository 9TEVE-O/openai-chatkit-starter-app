import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/polish/route';

function makeRequest(body: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/polish', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

function makeBadJsonRequest(): NextRequest {
  return new NextRequest('http://localhost/api/polish', {
    method: 'POST',
    body: 'not-valid-json{{{',
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_SEGMENTS = [
  { speaker: 'A', text: 'Hello there', timestamp: 5 },
  { speaker: 'B', text: 'Hi back', timestamp: 12 },
];

const VALID_ANTHROPIC_RESPONSE = {
  content: [
    {
      text: JSON.stringify({
        corrected: 'Speaker A [00:05]: Hello there.\nSpeaker B [00:12]: Hi back.',
        summary: 'Two speakers exchanged greetings.',
      }),
    },
  ],
};

describe('POST /api/polish', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('API key validation', () => {
    it('returns 500 when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const req = makeRequest({ segments: VALID_SEGMENTS });
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('ANTHROPIC_API_KEY not configured');
    });

    it('returns 500 when ANTHROPIC_API_KEY is empty string', async () => {
      process.env.ANTHROPIC_API_KEY = '';
      const req = makeRequest({ segments: VALID_SEGMENTS });
      const res = await POST(req);

      expect(res.status).toBe(500);
    });
  });

  describe('request body validation', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    });

    it('returns 400 when body is invalid JSON', async () => {
      const req = makeBadJsonRequest();
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid JSON body');
    });

    it('returns 400 when segments is missing from body', async () => {
      const req = makeRequest({ notSegments: [] });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('segments array required');
    });

    it('returns 400 when segments is an empty array', async () => {
      const req = makeRequest({ segments: [] });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('segments array required');
    });

    it('returns 400 when segments is not an array (string)', async () => {
      const req = makeRequest({ segments: 'not an array' });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('segments array required');
    });

    it('returns 400 when segments is not an array (object)', async () => {
      const req = makeRequest({ segments: { speaker: 'A', text: 'hi', timestamp: 0 } });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('segments array required');
    });

    it('returns 400 when segments is null', async () => {
      const req = makeRequest({ segments: null });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });
  });

  describe('Anthropic API interaction', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test123';
    });

    it('calls Anthropic API with correct headers and model', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => VALID_ANTHROPIC_RESPONSE,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const req = makeRequest({ segments: VALID_SEGMENTS });
      await POST(req);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(init.method).toBe('POST');
      expect(init.headers['x-api-key']).toBe('sk-ant-test123');
      expect(init.headers['anthropic-version']).toBe('2023-06-01');
      expect(init.headers['content-type']).toBe('application/json');
    });

    it('sends correct model and max_tokens in request body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => VALID_ANTHROPIC_RESPONSE,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const req = makeRequest({ segments: VALID_SEGMENTS });
      await POST(req);

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.model).toBe('claude-haiku-4-5-20251001');
      expect(sentBody.max_tokens).toBe(2048);
      expect(sentBody.messages).toHaveLength(1);
      expect(sentBody.messages[0].role).toBe('user');
    });

    it('includes formatted transcript in the prompt', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => VALID_ANTHROPIC_RESPONSE,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const req = makeRequest({ segments: VALID_SEGMENTS });
      await POST(req);

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const prompt: string = sentBody.messages[0].content;
      // Each segment should appear formatted with speaker and timestamp
      expect(prompt).toContain('Speaker A [00:05]: Hello there');
      expect(prompt).toContain('Speaker B [00:12]: Hi back');
    });

    it('returns 502 when Anthropic API returns non-ok status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        text: async () => 'Internal Server Error',
      }));

      const req = makeRequest({ segments: VALID_SEGMENTS });
      const res = await POST(req);

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toContain('Anthropic API error');
      expect(body.error).toContain('Internal Server Error');
    });
  });

  describe('response parsing', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test123';
    });

    it('returns corrected and summary from valid Anthropic JSON response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => VALID_ANTHROPIC_RESPONSE,
        text: async () => '',
      }));

      const req = makeRequest({ segments: VALID_SEGMENTS });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.corrected).toBe('Speaker A [00:05]: Hello there.\nSpeaker B [00:12]: Hi back.');
      expect(body.summary).toBe('Two speakers exchanged greetings.');
    });

    it('extracts JSON from response wrapped in markdown fences', async () => {
      const rawText = '```json\n{"corrected":"Clean text.","summary":"A summary."}\n```';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ text: rawText }] }),
        text: async () => '',
      }));

      const req = makeRequest({ segments: VALID_SEGMENTS });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.corrected).toBe('Clean text.');
      expect(body.summary).toBe('A summary.');
    });

    it('extracts JSON from response with leading text before opening brace', async () => {
      const rawText = 'Here is the result: {"corrected":"Fixed text.","summary":"Short summary."}';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ text: rawText }] }),
        text: async () => '',
      }));

      const req = makeRequest({ segments: VALID_SEGMENTS });
      const res = await POST(req);

      const body = await res.json();
      expect(body.corrected).toBe('Fixed text.');
      expect(body.summary).toBe('Short summary.');
    });

    it('falls back to rawText when response is not parseable JSON', async () => {
      const rawText = 'This is not JSON at all.';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ text: rawText }] }),
        text: async () => '',
      }));

      const req = makeRequest({ segments: VALID_SEGMENTS });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.corrected).toBe(rawText);
      expect(body.summary).toBe('');
    });

    it('falls back to rawText when corrected field is not a string', async () => {
      const rawText = JSON.stringify({ corrected: 42, summary: 'ok' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ text: rawText }] }),
        text: async () => '',
      }));

      const req = makeRequest({ segments: VALID_SEGMENTS });
      const res = await POST(req);

      const body = await res.json();
      expect(body.corrected).toBe(rawText);
    });

    it('returns empty string for summary when summary field is not a string', async () => {
      const rawText = JSON.stringify({ corrected: 'Clean text.', summary: 99 });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ text: rawText }] }),
        text: async () => '',
      }));

      const req = makeRequest({ segments: VALID_SEGMENTS });
      const res = await POST(req);

      const body = await res.json();
      expect(body.summary).toBe('');
    });

    it('handles missing content array in Anthropic response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [] }),
        text: async () => '',
      }));

      const req = makeRequest({ segments: VALID_SEGMENTS });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      // rawText will be '' (undefined ?? ''), which is not valid JSON
      expect(body.corrected).toBe('');
      expect(body.summary).toBe('');
    });
  });

  describe('formatTimestamp helper (via prompt content)', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test123';
    });

    it('formats zero seconds as 00:00', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => VALID_ANTHROPIC_RESPONSE,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const req = makeRequest({ segments: [{ speaker: 'A', text: 'hi', timestamp: 0 }] });
      await POST(req);

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.messages[0].content).toContain('[00:00]');
    });

    it('formats 65 seconds as 01:05', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => VALID_ANTHROPIC_RESPONSE,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const req = makeRequest({ segments: [{ speaker: 'B', text: 'test', timestamp: 65 }] });
      await POST(req);

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.messages[0].content).toContain('[01:05]');
    });

    it('formats 300 seconds as 05:00', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => VALID_ANTHROPIC_RESPONSE,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const req = makeRequest({ segments: [{ speaker: 'C', text: 'test', timestamp: 300 }] });
      await POST(req);

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.messages[0].content).toContain('[05:00]');
    });

    it('formats 90 seconds as 01:30', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => VALID_ANTHROPIC_RESPONSE,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const req = makeRequest({ segments: [{ speaker: 'A', text: 'test', timestamp: 90 }] });
      await POST(req);

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.messages[0].content).toContain('[01:30]');
    });
  });

  describe('verbatim prompt construction', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test123';
    });

    it('joins multiple segments with newlines in the prompt', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => VALID_ANTHROPIC_RESPONSE,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const req = makeRequest({
        segments: [
          { speaker: 'A', text: 'First line', timestamp: 0 },
          { speaker: 'B', text: 'Second line', timestamp: 10 },
          { speaker: 'A', text: 'Third line', timestamp: 20 },
        ],
      });
      await POST(req);

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const prompt: string = sentBody.messages[0].content;
      const lines = prompt.split('\n').filter((l: string) => l.startsWith('Speaker'));
      expect(lines).toHaveLength(3);
    });

    it('uses "Speaker X [mm:ss]: text" format for each segment', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => VALID_ANTHROPIC_RESPONSE,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const req = makeRequest({
        segments: [{ speaker: 'D', text: 'Example text', timestamp: 125 }],
      });
      await POST(req);

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.messages[0].content).toContain('Speaker D [02:05]: Example text');
    });
  });
});