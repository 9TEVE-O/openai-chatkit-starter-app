import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const audio = formData.get('audio');
  if (!audio || !(audio instanceof Blob)) {
    return NextResponse.json({ error: 'audio blob required' }, { status: 400 });
  }

  // Determine file extension from MIME type for Whisper compatibility
  const ext = audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : 'webm';

  const outForm = new FormData();
  outForm.append('file', audio, `recording.${ext}`);
  outForm.append('model', 'whisper-1');
  outForm.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: outForm,
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `OpenAI Whisper error: ${text}` }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json({ text: data.text ?? '' });
}
