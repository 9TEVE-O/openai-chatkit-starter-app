'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Mic, MicOff, Play, Download, RotateCcw, Users } from 'lucide-react';
import { format } from 'date-fns';

// ── Constants (SSOT) ─────────────────────────────────────────────────────────

const MAX_SECONDS = 300;

// ── Types (type safety: discriminated union for errors) ───────────────────────

interface Segment {
  id: number;
  speaker: 'A' | 'B';
  text: string;
  timestamp: number;
}

type RecordingError = 'permission_denied' | 'not_supported' | 'unknown';

// ── Pure utilities (single responsibility, SSOT) ──────────────────────────────

function correctGrammar(text: string): string {
  let out = text.replace(/\bi\b/g, 'I').replace(/\s+/g, ' ').trim();
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (!/[.?!]$/.test(out)) out += '.';
  return out;
}

function formatTimestamp(seconds: number): string {
  return format(new Date(seconds * 1000), 'mm:ss');
}

function errorMessage(err: RecordingError): string {
  switch (err) {
    case 'permission_denied':
      return 'Microphone access was denied. Please allow access in your browser settings.';
    case 'not_supported':
      return 'Your browser does not support audio recording.';
    default:
      return 'Could not start recording. Please try again.';
  }
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function TimerDisplay({ seconds }: { seconds: number }) {
  const mm = Math.floor(seconds / 60).toString();
  const ss = (seconds % 60).toString().padStart(2, '0');
  return (
    <div
      role="timer"
      aria-label={`${mm} minutes and ${ss} seconds remaining`}
      className="bg-zinc-900 rounded-3xl px-10 py-6 text-center border border-zinc-800"
    >
      <div aria-hidden="true" className="text-7xl font-mono font-semibold tabular-nums">
        {mm}:{ss}
      </div>
      <p className="text-xs text-zinc-500 mt-1">MAX 5 MINUTES</p>
    </div>
  );
}

function SpeakerAvatar({ speaker }: { speaker: 'A' | 'B' }) {
  return (
    <div
      aria-hidden="true"
      className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-bold flex-shrink-0 mt-1"
    >
      {speaker}
    </div>
  );
}

// ── Molecules ─────────────────────────────────────────────────────────────────

function TranscriptSegment({ seg }: { seg: Segment }) {
  return (
    <div className="flex gap-4">
      <SpeakerAvatar speaker={seg.speaker} />
      <div>
        <div className="text-xs text-zinc-500">
          <span className="sr-only">Speaker </span>
          {seg.speaker} &bull; {formatTimestamp(seg.timestamp)}
        </div>
        <div className="text-zinc-100 leading-relaxed">{seg.text}</div>
      </div>
    </div>
  );
}

function ErrorBanner({ err }: { err: RecordingError }) {
  return (
    <div
      role="alert"
      className="mb-6 px-6 py-4 bg-red-950 border border-red-700 rounded-2xl text-red-300 text-sm text-center"
    >
      {errorMessage(err)}
    </div>
  );
}

// ── Custom hook (single responsibility: recording logic isolated from UI) ──────

function useRecorder(onStop: (url: string) => void) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeLeftRef = useRef(MAX_SECONDS);

  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(MAX_SECONDS);
  const [error, setError] = useState<RecordingError | null>(null);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') setError('permission_denied');
        else if (err.name === 'NotSupportedError') setError('not_supported');
        else setError('unknown');
      } else {
        setError('unknown');
      }
      return;
    }

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    audioChunksRef.current = [];
    timeLeftRef.current = MAX_SECONDS;

    recorder.ondataavailable = (e) => { audioChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      onStop(URL.createObjectURL(blob));
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start();
    setIsRecording(true);
    setTimeLeft(MAX_SECONDS);

    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      if (timeLeftRef.current <= 0) {
        stop();
        setTimeLeft(0);
      } else {
        setTimeLeft(timeLeftRef.current);
      }
    }, 1000);
  }, [onStop, stop]);

  const reset = useCallback(() => {
    stop();
    setTimeLeft(MAX_SECONDS);
    timeLeftRef.current = MAX_SECONDS;
    setError(null);
  }, [stop]);

  return { isRecording, timeLeft, timeLeftRef, error, start, stop, reset };
}

// ── Organism (VerbaFix page) ──────────────────────────────────────────────────

export default function VerbaFix() {
  const [currentSpeaker, setCurrentSpeaker] = useState<'A' | 'B'>('A');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleStop = useCallback((url: string) => setAudioUrl(url), []);
  const { isRecording, timeLeft, timeLeftRef, error, start, stop, reset } = useRecorder(handleStop);

  const addSegment = useCallback((text: string) => {
    if (!text.trim()) return;
    setSegments((prev) => [
      ...prev,
      { id: Date.now(), speaker: currentSpeaker, text: text.trim(), timestamp: MAX_SECONDS - timeLeftRef.current },
    ]);
  }, [currentSpeaker, timeLeftRef]);

  // Memoised derived output — avoids recomputing on every render
  const verbatim = useMemo(
    () => segments.map((s) => `Speaker ${s.speaker} (${formatTimestamp(s.timestamp)}): ${s.text}`).join('\n\n'),
    [segments],
  );

  const corrected = useMemo(
    () => segments.map((s) => `Speaker ${s.speaker}: ${correctGrammar(s.text)}`).join('\n\n'),
    [segments],
  );

  const exportTxt = useCallback(() => {
    const content =
      `VERBAFIX TRANSCRIPT\n${new Date().toLocaleString()}\n\n` +
      `=== VERBATIM ===\n${verbatim}\n\n` +
      `=== GRAMMATICALLY CORRECTED ===\n${corrected}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${Date.now()}.txt`;
    a.click();
  }, [verbatim, corrected]);

  const handleManualInput = useCallback(() => {
    const text = prompt('What did the current speaker say? (This will be added verbatim)');
    if (text) addSegment(text);
  }, [addSegment]);

  const toggleSpeaker = useCallback(() => {
    setCurrentSpeaker((s) => (s === 'A' ? 'B' : 'A'));
  }, []);

  const resetAll = useCallback(() => {
    reset();
    setSegments([]);
    setAudioUrl(null);
  }, [reset]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-2 text-center bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
          VerbaFix
        </h1>
        <p className="text-center text-zinc-400 mb-10">
          5-minute conversation dictator &bull; Verbatim + Grammar Fixed
        </p>

        {/* Inline error — role=alert, no alert() calls */}
        {error && <ErrorBanner err={error} />}

        {/* Timer */}
        <div className="flex justify-center mb-8">
          <TimerDisplay seconds={timeLeft} />
        </div>

        {/* Controls */}
        <div className="flex gap-4 justify-center mb-8">
          <button
            onClick={isRecording ? stop : start}
            aria-pressed={isRecording}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            className={`px-8 py-4 rounded-2xl flex items-center gap-3 text-lg font-medium transition-all ${
              isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {isRecording
              ? <MicOff className="w-6 h-6" aria-hidden="true" />
              : <Mic className="w-6 h-6" aria-hidden="true" />}
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>

          <button
            onClick={toggleSpeaker}
            aria-label={`Switch speaker (currently ${currentSpeaker})`}
            className="px-6 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl flex items-center gap-3"
          >
            <Users className="w-6 h-6" aria-hidden="true" />
            Speaker {currentSpeaker}
          </button>
        </div>

        {/* Quick add */}
        <div className="text-center mb-8">
          <button
            onClick={handleManualInput}
            disabled={!isRecording}
            aria-label="Add what the current speaker just said"
            className="text-sm px-5 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-full"
          >
            Add what was just said &rarr;
          </button>
          <p className="text-xs text-zinc-500 mt-2">Switch speaker then tap to log</p>
        </div>

        {/* Transcript */}
        <section
          aria-label="Live transcript"
          className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 min-h-[400px] mb-8"
        >
          <div className="flex justify-between mb-6">
            <h2 className="text-xl font-semibold">Live Transcript</h2>
            <div
              aria-live="polite"
              aria-atomic="true"
              className="text-sm text-zinc-400"
            >
              {segments.length} {segments.length === 1 ? 'segment' : 'segments'}
            </div>
          </div>

          <div
            className="space-y-6 max-h-[500px] overflow-auto pr-4"
            aria-live="polite"
            aria-relevant="additions"
          >
            {segments.length === 0 ? (
              <p className="text-center text-zinc-500 py-20">
                Recording will appear here&hellip;<br />
                Switch speakers and add segments
              </p>
            ) : (
              segments.map((seg) => <TranscriptSegment key={seg.id} seg={seg} />)
            )}
          </div>
        </section>

        {/* Output panels */}
        {segments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <section
              aria-label="Verbatim transcript"
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"
            >
              <h3 className="font-semibold mb-4">Verbatim</h3>
              <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-mono leading-relaxed">
                {verbatim}
              </pre>
            </section>

            <section
              aria-label="Grammatically corrected transcript"
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"
            >
              <h3 className="font-semibold mb-4">Grammatically Corrected</h3>
              <pre className="whitespace-pre-wrap text-sm text-emerald-300 font-mono leading-relaxed">
                {corrected}
              </pre>
            </section>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-4 justify-center">
          {audioUrl && (
            <button
              onClick={() => audioRef.current?.play()}
              aria-label="Play back the recording"
              className="flex items-center gap-3 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl"
            >
              <Play className="w-5 h-5" aria-hidden="true" /> Play Recording
            </button>
          )}

          <button
            onClick={exportTxt}
            disabled={segments.length === 0}
            aria-label="Export transcript as a text file"
            className="flex items-center gap-3 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-2xl"
          >
            <Download className="w-5 h-5" aria-hidden="true" /> Export TXT
          </button>

          <button
            onClick={resetAll}
            aria-label="Start a new conversation"
            className="flex items-center gap-3 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl"
          >
            <RotateCcw className="w-5 h-5" aria-hidden="true" /> New Conversation
          </button>
        </div>

        <audio ref={audioRef} src={audioUrl || undefined} className="hidden" />
      </main>
    </div>
  );
}
