import { NextRequest, NextResponse } from 'next/server';

interface InSegment {
  speaker: string;
  text: string;
  timestamp: number;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  let segments: InSegment[];
  try {
    const body = await req.json();
    segments = body.segments;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(segments) || segments.length === 0) {
    return NextResponse.json({ error: 'segments array required' }, { status: 400 });
  }

  const verbatim = segments
    .map((s) => `Speaker ${s.speaker} [${formatTimestamp(s.timestamp)}]: ${s.text}`)
    .join('\n');

  const prompt = `You are a professional conversation editor. Given the verbatim transcript below, return ONLY a valid JSON object with exactly two keys:

"corrected": the transcript with grammar corrected, filler words removed, run-on sentences fixed, proper punctuation applied, and each speaker on its own line with their label and timestamp preserved.
"summary": a concise 2-3 sentence summary of what was discussed.

Return pure JSON only. No markdown fences, no explanation.

Transcript:
${verbatim}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Anthropic API error: ${text}` }, { status: 502 });
  }

  const data = await res.json();
  const rawText: string = data.content?.[0]?.text ?? '';

  try {
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');
    const jsonText = jsonStart !== -1 && jsonEnd !== -1 ? rawText.slice(jsonStart, jsonEnd + 1) : rawText;
    const parsed = JSON.parse(jsonText);
    return NextResponse.json({
      corrected: typeof parsed.corrected === 'string' ? parsed.corrected : rawText,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    });
  } catch {
    return NextResponse.json({ corrected: rawText, summary: '' });
  }
}
