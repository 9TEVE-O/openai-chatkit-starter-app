import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/transcribe/route';

/**
 * Create a NextRequest whose formData() resolves to the provided FormData.
 * This avoids multipart encoding/decoding issues in jsdom where Blob instances
 * from FormData may not survive the NextRequest body serialization round-trip.
 */
function makeRequestWithFormData(fd: FormData): NextRequest {
  const req = new NextRequest('http://localhost/api/transcribe', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
  });
  // Override formData() to return our controlled FormData
  vi.spyOn(req, 'formData').mockResolvedValue(fd);
  return req;
}

function makeAudioFormData(blob: Blob, fieldName = 'audio'): FormData {
  const form = new FormData();
  form.append(fieldName, blob, 'recording.webm');
  return form;
}

function makeBadFormDataRequest(): NextRequest {
  // Simulate a request where formData() throws
  const req = new NextRequest('http://localhost/api/transcribe', {
    method: 'POST',
    body: '{"not":"formdata"}',
    headers: { 'content-type': 'application/json' },
  });
  vi.spyOn(req, 'formData').mockRejectedValue(new Error('Invalid form data'));
  return req;
}

describe('POST /api/transcribe', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('API key validation', () => {
    it('returns 500 when OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;
      const form = makeAudioFormData(new Blob(['audio'], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('OPENAI_API_KEY not configured');
    });

    it('returns 500 when OPENAI_API_KEY is empty string', async () => {
      process.env.OPENAI_API_KEY = '';
      const form = makeAudioFormData(new Blob(['audio'], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      const res = await POST(req);

      expect(res.status).toBe(500);
    });
  });

  describe('form data validation', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-test-openai';
    });

    it('returns 400 when formData() throws', async () => {
      const req = makeBadFormDataRequest();
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid form data');
    });

    it('returns 400 when audio field is missing from form data', async () => {
      const form = new FormData();
      form.append('other_field', 'value');
      const req = makeRequestWithFormData(form);
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('audio blob required');
    });

    it('returns 400 when audio field is a string (not a Blob)', async () => {
      const form = new FormData();
      form.append('audio', 'not-a-blob');
      const req = makeRequestWithFormData(form);
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('audio blob required');
    });
  });

  describe('MIME type extension detection', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-test-openai';
    });

    it('uses mp4 extension for audio/mp4 MIME type', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Hello world' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/mp4' }));
      const req = makeRequestWithFormData(form);
      await POST(req);

      expect(mockFetch).toHaveBeenCalledOnce();
      const sentForm: FormData = mockFetch.mock.calls[0][1].body;
      const file = sentForm.get('file') as File;
      expect(file.name).toBe('recording.mp4');
    });

    it('uses ogg extension for audio/ogg MIME type', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Hello world' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/ogg' }));
      const req = makeRequestWithFormData(form);
      await POST(req);

      const sentForm: FormData = mockFetch.mock.calls[0][1].body;
      const file = sentForm.get('file') as File;
      expect(file.name).toBe('recording.ogg');
    });

    it('uses webm extension for audio/webm MIME type', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Hello world' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      await POST(req);

      const sentForm: FormData = mockFetch.mock.calls[0][1].body;
      const file = sentForm.get('file') as File;
      expect(file.name).toBe('recording.webm');
    });

    it('defaults to webm extension for unknown MIME type', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Hello world' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/unknown' }));
      const req = makeRequestWithFormData(form);
      await POST(req);

      const sentForm: FormData = mockFetch.mock.calls[0][1].body;
      const file = sentForm.get('file') as File;
      expect(file.name).toBe('recording.webm');
    });

    it('uses mp4 extension when MIME type contains mp4 (e.g. video/mp4)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Hello world' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const form = makeAudioFormData(new Blob(['data'], { type: 'video/mp4' }));
      const req = makeRequestWithFormData(form);
      await POST(req);

      const sentForm: FormData = mockFetch.mock.calls[0][1].body;
      const file = sentForm.get('file') as File;
      expect(file.name).toBe('recording.mp4');
    });
  });

  describe('OpenAI Whisper API interaction', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-openai-key-123';
    });

    it('calls OpenAI Whisper endpoint with correct URL and method', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Transcribed text' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      await POST(req);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
      expect(init.method).toBe('POST');
    });

    it('sends Authorization header with Bearer token', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Test' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      await POST(req);

      const init = mockFetch.mock.calls[0][1];
      expect(init.headers.Authorization).toBe('Bearer sk-openai-key-123');
    });

    it('includes model=whisper-1 and response_format=json in form data', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Test' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      await POST(req);

      const sentForm: FormData = mockFetch.mock.calls[0][1].body;
      expect(sentForm.get('model')).toBe('whisper-1');
      expect(sentForm.get('response_format')).toBe('json');
    });

    it('returns 502 when OpenAI API returns non-ok status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        text: async () => 'Service Unavailable',
      }));

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      const res = await POST(req);

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toContain('OpenAI Whisper error');
      expect(body.error).toContain('Service Unavailable');
    });

    it('returns transcribed text from OpenAI response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'This is the transcribed content.' }),
        text: async () => '',
      }));

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.text).toBe('This is the transcribed content.');
    });

    it('returns empty string when text is missing from OpenAI response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ other: 'data' }),
        text: async () => '',
      }));

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.text).toBe('');
    });

    it('returns empty string when text is null in OpenAI response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: null }),
        text: async () => '',
      }));

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      const res = await POST(req);

      const body = await res.json();
      expect(body.text).toBe('');
    });
  });

  describe('boundary and regression cases', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-test';
    });

    it('handles a zero-byte audio Blob (edge case)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: '' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const form = makeAudioFormData(new Blob([], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      const res = await POST(req);

      // Route should still forward to OpenAI regardless of blob size
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(res.status).toBe(200);
    });

    it('passes the audio Blob as the file field to OpenAI', async () => {
      const audioContent = 'fake-audio-binary-data';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'result' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const form = makeAudioFormData(new Blob([audioContent], { type: 'audio/ogg' }));
      const req = makeRequestWithFormData(form);
      await POST(req);

      const sentForm: FormData = mockFetch.mock.calls[0][1].body;
      const file = sentForm.get('file') as File;
      expect(file).toBeInstanceOf(Blob);
      expect(file.name).toBe('recording.ogg');
      const text = await file.text();
      expect(text).toBe(audioContent);
    });

    it('error message contains the raw OpenAI error text in 502 response', async () => {
      const rawError = 'Rate limit exceeded: please retry after 60s';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        text: async () => rawError,
      }));

      const form = makeAudioFormData(new Blob(['data'], { type: 'audio/webm' }));
      const req = makeRequestWithFormData(form);
      const res = await POST(req);

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe(`OpenAI Whisper error: ${rawError}`);
    });
  });
});