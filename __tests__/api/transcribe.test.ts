// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/transcribe/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAudioBlob(mimeType: string): Blob {
  // Minimal blob representing an audio file
  return new Blob(['fake-audio-data'], { type: mimeType });
}

function makeFormDataRequest(audioBlob?: Blob, fieldName = 'audio'): NextRequest {
  const form = new FormData();
  if (audioBlob !== undefined) {
    form.append(fieldName, audioBlob, 'recording.webm');
  }
  return new NextRequest('http://localhost/api/transcribe', {
    method: 'POST',
    body: form,
  });
}

function makeMalformedRequest(): NextRequest {
  // Send a plain JSON body so formData() will throw
  return new NextRequest('http://localhost/api/transcribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ audio: 'not-a-form' }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/transcribe', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-test-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // ── Missing API key ──────────────────────────────────────────────────────

  it('returns 500 when OPENAI_API_KEY is not set', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const res = await POST(makeFormDataRequest(makeAudioBlob('audio/webm')));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/OPENAI_API_KEY not configured/);
  });

  it('returns 500 when OPENAI_API_KEY is undefined', async () => {
    vi.unstubAllEnvs();
    delete process.env.OPENAI_API_KEY;
    const res = await POST(makeFormDataRequest(makeAudioBlob('audio/webm')));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/OPENAI_API_KEY/);
  });

  // ── Invalid / missing audio field ────────────────────────────────────────

  it('returns 400 when audio field is missing from form data', async () => {
    const form = new FormData();
    // Intentionally no 'audio' field
    const req = new NextRequest('http://localhost/api/transcribe', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/audio blob required/);
  });

  it('returns 400 when audio field is a plain string, not a Blob', async () => {
    const form = new FormData();
    form.append('audio', 'not-a-blob');
    const req = new NextRequest('http://localhost/api/transcribe', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/audio blob required/);
  });

  // ── OpenAI Whisper API errors ────────────────────────────────────────────

  it('returns 502 when OpenAI Whisper API returns non-ok status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve('Invalid API key'),
    });

    const res = await POST(makeFormDataRequest(makeAudioBlob('audio/webm')));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/OpenAI Whisper error/);
    expect(data.error).toMatch(/Invalid API key/);
  });

  it('returns 502 with full Whisper error body', async () => {
    const errorBody = JSON.stringify({ error: { code: 'invalid_api_key', message: 'Incorrect key.' } });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve(errorBody),
    });

    const res = await POST(makeFormDataRequest(makeAudioBlob('audio/webm')));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain(errorBody);
  });

  // ── Successful transcription ──────────────────────────────────────────────

  it('returns transcript text on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'Hello from Whisper.' }),
    });

    const res = await POST(makeFormDataRequest(makeAudioBlob('audio/webm')));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toBe('Hello from Whisper.');
  });

  it('returns empty string when Whisper response has no text field', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const res = await POST(makeFormDataRequest(makeAudioBlob('audio/webm')));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toBe('');
  });

  // ── MIME type → file extension mapping ────────────────────────────────────

  it('uses webm extension for audio/webm MIME type', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'test' }),
    });

    await POST(makeFormDataRequest(makeAudioBlob('audio/webm')));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    const file = body.get('file') as File;
    expect(file.name).toBe('recording.webm');
  });

  it('uses mp4 extension for audio/mp4 MIME type', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'test' }),
    });

    await POST(makeFormDataRequest(makeAudioBlob('audio/mp4')));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    const file = body.get('file') as File;
    expect(file.name).toBe('recording.mp4');
  });

  it('uses ogg extension for audio/ogg MIME type', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'test' }),
    });

    await POST(makeFormDataRequest(makeAudioBlob('audio/ogg')));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    const file = body.get('file') as File;
    expect(file.name).toBe('recording.ogg');
  });

  it('falls back to webm extension for unknown MIME type', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'test' }),
    });

    await POST(makeFormDataRequest(makeAudioBlob('audio/unknown')));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    const file = body.get('file') as File;
    expect(file.name).toBe('recording.webm');
  });

  // ── Request shape to OpenAI ───────────────────────────────────────────────

  it('sends POST request to correct OpenAI endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'test' }),
    });

    await POST(makeFormDataRequest(makeAudioBlob('audio/webm')));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.method).toBe('POST');
  });

  it('includes Bearer authorization header', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'test' }),
    });

    await POST(makeFormDataRequest(makeAudioBlob('audio/webm')));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-openai-test-key');
  });

  it('sends model=whisper-1 and response_format=json', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'test' }),
    });

    await POST(makeFormDataRequest(makeAudioBlob('audio/webm')));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.get('model')).toBe('whisper-1');
    expect(body.get('response_format')).toBe('json');
  });

  // ── Regression: video/mp4 MIME includes mp4 ──────────────────────────────

  it('uses mp4 extension for video/mp4 MIME type (contains mp4)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'test' }),
    });

    await POST(makeFormDataRequest(makeAudioBlob('video/mp4')));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    const file = body.get('file') as File;
    expect(file.name).toBe('recording.mp4');
  });
});