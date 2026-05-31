'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Mic, MicOff, Play, Pause, Download, RotateCcw, Users, Edit2, Trash2, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';

// ── Constants (SSOT) ─────────────────────────────────────────────────────────

const MAX_SECONDS = 300;

// ── Types (discriminated unions for exhaustive error handling) ─────────────────

interface Segment {
  id: number;
  speaker: 'A' | 'B';
  text: string;
  timestamp: number;
}

type RecordingError = 'permission_denied' | 'not_supported' | 'mime_unsupported' | 'unknown';
type SttError = 'stt_unsupported' | 'stt_failed';
type CopiedTarget = 'verbatim' | 'corrected' | null;

// ── Pure utilities ────────────────────────────────────────────────────────────────

function correctGrammar(text: string): string {
  let out = text.replace(/\bi\b/g, 'I').replace(/\s+/g, ' ').trim();
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (!/[.?!]$/.test(out)) out += '.';
  return out;
}

function formatTimestamp(seconds: number): string {
  return format(new Date(seconds * 1000), 'mm:ss');
}

function recordingErrorMessage(err: RecordingError): string {
  switch (err) {
    case 'permission_denied': return 'Microphone access was denied. Allow it in your browser settings.';
    case 'not_supported': return 'Audio recording is not supported in this browser.';
    case 'mime_unsupported': return 'No supported audio format found. Try Chrome or Firefox.';
    default: return 'Could not start recording. Please try again.';
  }
}

function sttErrorMessage(err: SttError): string {
  switch (err) {
    case 'stt_unsupported': return 'Live transcription requires Chrome or Edge.';
    default: return 'Speech recognition stopped unexpectedly. Try again.';
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
      className="bg-zinc-900 rounded-3xl px-12 py-6 text-center border border-zinc-800"
    >
      <div aria-hidden="true" className="text-7xl font-mono font-semibold tabular-nums">
        {mm}:{ss}
      </div>
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

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-6 px-6 py-4 bg-red-950 border border-red-700 rounded-2xl text-red-300 text-sm text-center">
      {message}
    </div>
  );
}

interface SegmentRowProps {
  seg: Segment;
  isEditing: boolean;
  editText: string;
  onEditChange: (val: string) => void;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
}

function SegmentRow({
  seg, isEditing, editText, onEditChange, onEditStart, onEditSave, onEditCancel, onDelete,
}: SegmentRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  return (
    <div className="flex gap-4 group rounded-lg p-1 -m-1 focus-within:ring-1 focus-within:ring-violet-500/30">
      <SpeakerAvatar speaker={seg.speaker} />
      <div className="flex-1">
        <div className="text-xs text-zinc-500 mb-1">
          <span className="sr-only">Speaker </span>
          {seg.speaker} &bull; {formatTimestamp(seg.timestamp)}
        </div>

        {isEditing ? (
          <div className="flex gap-2" role="group" aria-label="Edit segment text">
            <input
              ref={inputRef}
              type="text"
              value={editText}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onEditSave();
                if (e.key === 'Escape') onEditCancel();
              }}
              aria-label="Segment text"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={onEditSave}
              aria-label="Save edit"
              className="px-4 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm"
            >
              Save
            </button>
            <button
              onClick={onEditCancel}
              aria-label="Cancel edit"
              className="px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="text-zinc-100 leading-relaxed pr-2">{seg.text}</div>
        )}
      </div>

      {/* group-focus-within keeps buttons reachable for keyboard users */}
      {!isEditing && (
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button
            onClick={onEditStart}
            aria-label={`Edit segment from speaker ${seg.speaker}`}
            className="p-2 hover:bg-zinc-800 rounded"
          >
            <Edit2 className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={onDelete}
            aria-label={`Delete segment from speaker ${seg.speaker}`}
            className="p-2 hover:bg-red-950 text-red-400 rounded"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Hook: recording with pause / resume ───────────────────────────────────────

function useRecorder(onStop: (url: string) => void) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeLeftRef = useRef(MAX_SECONDS);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState(MAX_SECONDS);
  const [error, setError] = useState<RecordingError | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsPaused(false);
  }, [clearTimer]);

  const startTimer = useCallback((onExpire: () => void) => {
    clearTimer();
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      if (timeLeftRef.current <= 0) {
        onExpire();
        setTimeLeft(0);
      } else {
        setTimeLeft(timeLeftRef.current);
      }
    }, 1000);
  }, [clearTimer]);

  const start = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'permission_denied' : 'unknown');
      return;
    }

    const mimeType = ['audio/webm', 'audio/ogg', 'audio/mp4'].find(
      (t) => MediaRecorder.isTypeSupported(t),
    );
    if (!mimeType) {
      stream.getTracks().forEach((t) => t.stop());
      setError('mime_unsupported');
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    audioChunksRef.current = [];
    timeLeftRef.current = MAX_SECONDS;

    recorder.ondataavailable = (e) => { audioChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      onStop(URL.createObjectURL(blob));
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start();
    setIsRecording(true);
    setIsPaused(false);
    setTimeLeft(MAX_SECONDS);
    startTimer(stop);
  }, [onStop, stop, startTimer]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      clearTimer();
      setIsPaused(true);
    }
  }, [clearTimer]);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      startTimer(stop);
    }
  }, [stop, startTimer]);

  const reset = useCallback(() => {
    stop();
    setTimeLeft(MAX_SECONDS);
    timeLeftRef.current = MAX_SECONDS;
    setError(null);
  }, [stop]);

  return { isRecording, isPaused, timeLeft, timeLeftRef, error, start, stop, pause, resume, reset };
}

// ── Hook: speech recognition (stale-closure safe via callback ref) ───────────

function useSpeechRecognition(
  onFinalTranscript: React.MutableRefObject<(text: string) => void>,
) {
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<SttError | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const API = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!API) return;

    const rec = new API();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event: any) => {
      // Use the LAST result in continuous mode — not results[0]
      const last = event.results[event.results.length - 1];
      if (last.isFinal) onFinalTranscript.current(last[0].transcript);
    };
    rec.onerror = () => { setError('stt_failed'); setIsListening(false); };
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
  }, [onFinalTranscript]);

  const startStt = useCallback(() => {
    if (!recognitionRef.current) { setError('stt_unsupported'); return; }
    setError(null);
    recognitionRef.current.start();
    setIsListening(true);
  }, []);

  const stopStt = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stopStt(); else startStt();
  }, [isListening, startStt, stopStt]);

  return { isListening, error, toggle, stop: stopStt };
}

// ── Organism ───────────────────────────────────────────────────────────────────

export default function VerbaFix() {
  const [currentSpeaker, setCurrentSpeaker] = useState<'A' | 'B'>('A');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [copied, setCopied] = useState<CopiedTarget>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleStop = useCallback((url: string) => setAudioUrl(url), []);
  const {
    isRecording, isPaused, timeLeft, timeLeftRef, error: recError,
    start, stop, pause, resume, reset,
  } = useRecorder(handleStop);

  // Stable ref so the STT onresult handler always calls the latest addSegment
  const addSegmentRef = useRef<(text: string) => void>(() => {});

  const addSegment = useCallback((text: string) => {
    if (!text?.trim()) return;
    setSegments((prev) => [
      ...prev,
      {
        id: Date.now(),
        speaker: currentSpeaker,
        text: text.trim(),
        timestamp: MAX_SECONDS - timeLeftRef.current,
      },
    ]);
  }, [currentSpeaker, timeLeftRef]);

  useEffect(() => { addSegmentRef.current = addSegment; }, [addSegment]);

  const { isListening, error: sttError, toggle: toggleStt, stop: stopStt } = useSpeechRecognition(addSegmentRef);

  const stopAll = useCallback(() => {
    stop();
    stopStt();
  }, [stop, stopStt]);

  // Memoised derived values — recompute only when segments change
  const verbatim = useMemo(
    () => segments.map((s) => `Speaker ${s.speaker} (${formatTimestamp(s.timestamp)}): ${s.text}`).join('\n\n'),
    [segments],
  );

  const corrected = useMemo(
    () => segments.map((s) => `Speaker ${s.speaker}: ${correctGrammar(s.text)}`).join('\n\n'),
    [segments],
  );

  const copyToClipboard = useCallback((text: string, target: 'verbatim' | 'corrected') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(target);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  const startEditing = useCallback((seg: Segment) => {
    setEditingId(seg.id);
    setEditText(seg.text);
  }, []);

  const saveEdit = useCallback(() => {
    if (editingId === null) return;
    setSegments((prev) =>
      prev.map((s) => (s.id === editingId ? { ...s, text: editText.trim() } : s)),
    );
    setEditingId(null);
    setEditText('');
  }, [editingId, editText]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  const deleteSegment = useCallback((id: number) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const exportTxt = useCallback(() => {
    const content =
      `VERBAFIX TRANSCRIPT\n${new Date().toLocaleString()}\n\n` +
      `=== VERBATIM ===\n${verbatim}\n\n` +
      `=== GRAMMATICALLY CORRECTED ===\n${corrected}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verbafix-${Date.now()}.txt`;
    a.click();
  }, [verbatim, corrected]);

  const toggleSpeaker = useCallback(() => {
    setCurrentSpeaker((s) => (s === 'A' ? 'B' : 'A'));
  }, []);

  const resetAll = useCallback(() => {
    reset();
    setSegments([]);
    setAudioUrl(null);
    setEditingId(null);
    setEditText('');
  }, [reset]);

  const handleManualInput = useCallback(() => {
    const text = prompt('What did the current speaker say?');
    if (text) addSegment(text);
  }, [addSegment]);

  const activeError = recError
    ? recordingErrorMessage(recError)
    : sttError
    ? sttErrorMessage(sttError)
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-2 text-center bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
          VerbaFix
        </h1>
        <p className="text-center text-zinc-400 mb-10">
          5-minute conversation dictator with live transcription
        </p>

        {/* Inline errors — no alert() */}
        {activeError && <ErrorBanner message={activeError} />}

        {/* Timer */}
        <div className="flex justify-center mb-8">
          <TimerDisplay seconds={timeLeft} />
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 justify-center mb-8">
          <button
            onClick={isRecording ? (isPaused ? resume : pause) : start}
            aria-label={isRecording ? (isPaused ? 'Resume recording' : 'Pause recording') : 'Start recording'}
            aria-pressed={isRecording && !isPaused}
            className={`px-8 py-4 rounded-2xl flex items-center gap-3 text-lg font-medium transition-all ${
              isRecording ? 'bg-amber-600 hover:bg-amber-700' : 'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {isRecording
              ? isPaused
                ? <Play className="w-6 h-6" aria-hidden="true" />
                : <Pause className="w-6 h-6" aria-hidden="true" />
              : <Mic className="w-6 h-6" aria-hidden="true" />}
            {isRecording ? (isPaused ? 'Resume' : 'Pause') : 'Start Recording'}
          </button>

          {isRecording && (
            <button
              onClick={stopAll}
              aria-label="Stop recording"
              className="px-8 py-4 bg-red-600 hover:bg-red-700 rounded-2xl flex items-center gap-3 text-lg font-medium"
            >
              <MicOff className="w-6 h-6" aria-hidden="true" /> Stop
            </button>
          )}

          <button
            onClick={toggleSpeaker}
            aria-label={`Switch speaker, currently ${currentSpeaker}`}
            className="px-6 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl flex items-center gap-3"
          >
            <Users className="w-6 h-6" aria-hidden="true" />
            Speaker {currentSpeaker}
          </button>

          <button
            onClick={toggleStt}
            disabled={!isRecording}
            aria-pressed={isListening}
            aria-label={isListening ? 'Stop live transcription' : 'Start live transcription'}
            className={`px-6 py-4 rounded-2xl flex items-center gap-3 transition-all ${
              isListening ? 'bg-emerald-600' : 'bg-zinc-800 hover:bg-zinc-700'
            } disabled:opacity-50`}
          >
            <Mic className="w-6 h-6" aria-hidden="true" />
            {isListening ? 'STT On' : 'Live STT'}
          </button>
        </div>

        {/* Manual add */}
        <div className="text-center mb-8">
          <button
            onClick={handleManualInput}
            disabled={!isRecording}
            aria-label="Manually add what the current speaker just said"
            className="text-sm px-5 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-full"
          >
            Add what was just said &rarr;
          </button>
        </div>

        {/* Transcript */}
        <section
          aria-label="Live transcript"
          className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-8 min-h-[420px]"
        >
          <div className="flex justify-between mb-6">
            <h2 className="text-xl font-semibold">Transcript</h2>
            <div aria-live="polite" aria-atomic="true" className="text-sm text-zinc-400">
              {segments.length} {segments.length === 1 ? 'segment' : 'segments'}
            </div>
          </div>

          <div
            className="space-y-6 max-h-[520px] overflow-auto pr-4"
            aria-live="polite"
            aria-relevant="additions"
          >
            {segments.length === 0 ? (
              <p className="text-center text-zinc-500 py-24">
                Start recording and add segments manually or use Live STT
              </p>
            ) : (
              segments.map((seg) => (
                <SegmentRow
                  key={seg.id}
                  seg={seg}
                  isEditing={editingId === seg.id}
                  editText={editText}
                  onEditChange={setEditText}
                  onEditStart={() => startEditing(seg)}
                  onEditSave={saveEdit}
                  onEditCancel={cancelEdit}
                  onDelete={() => deleteSegment(seg.id)}
                />
              ))
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
              <div className="flex justify-between mb-4">
                <h3 className="font-semibold">Verbatim</h3>
                <button
                  onClick={() => copyToClipboard(verbatim, 'verbatim')}
                  aria-label={copied === 'verbatim' ? 'Copied!' : 'Copy verbatim transcript'}
                  className="text-violet-400 hover:text-violet-300 transition-colors"
                >
                  {copied === 'verbatim'
                    ? <Check className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                    : <Copy className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
              <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-mono leading-relaxed">
                {verbatim}
              </pre>
            </section>

            <section
              aria-label="Grammatically corrected transcript"
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"
            >
              <div className="flex justify-between mb-4">
                <h3 className="font-semibold">Grammatically Corrected</h3>
                <button
                  onClick={() => copyToClipboard(corrected, 'corrected')}
                  aria-label={copied === 'corrected' ? 'Copied!' : 'Copy corrected transcript'}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  {copied === 'corrected'
                    ? <Check className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                    : <Copy className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
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
            aria-label="Start a new session"
            className="flex items-center gap-3 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl"
          >
            <RotateCcw className="w-5 h-5" aria-hidden="true" /> New Session
          </button>
        </div>

        <audio ref={audioRef} src={audioUrl || undefined} className="hidden" />
      </main>
    </div>
  );
}
