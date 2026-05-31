'use client';

import React, { useState, useRef } from 'react';
import { Mic, MicOff, Play, Download, RotateCcw, Users } from 'lucide-react';
import { format } from 'date-fns';

interface Segment {
  id: number;
  speaker: 'A' | 'B';
  text: string;
  timestamp: number;
}

export default function VerbaFix() {
  const [isRecording, setIsRecording] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<'A' | 'B'>('A');
  const [timeLeft, setTimeLeft] = useState(300);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeLeftRef = useRef(300);

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTimeLeft(300);
      timeLeftRef.current = 300;

      timerRef.current = setInterval(() => {
        timeLeftRef.current -= 1;
        if (timeLeftRef.current <= 0) {
          stopRecording();
          setTimeLeft(0);
        } else {
          setTimeLeft(timeLeftRef.current);
        }
      }, 1000);

    } catch (err) {
      alert('Microphone access denied or not available.');
    }
  };

  const addSegment = (text: string) => {
    if (!text.trim()) return;
    setSegments(prev => [...prev, {
      id: Date.now(),
      speaker: currentSpeaker,
      text: text.trim(),
      timestamp: 300 - timeLeftRef.current,
    }]);
  };

  const correctGrammar = (text: string): string => {
    let corrected = text
      .replace(/\bi\b/g, 'I')
      .replace(/\s+/g, ' ')
      .trim();

    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);

    if (!corrected.endsWith('.') && !corrected.endsWith('?') && !corrected.endsWith('!')) {
      corrected += '.';
    }
    return corrected;
  };

  const getFullVerbatim = () => segments.map(s =>
    `Speaker ${s.speaker} (${format(new Date(s.timestamp * 1000), 'mm:ss')}): ${s.text}`
  ).join('\n\n');

  const getCorrectedVersion = () => segments.map(s =>
    `Speaker ${s.speaker}: ${correctGrammar(s.text)}`
  ).join('\n\n');

  const exportTxt = () => {
    const content = `VERBAFIX TRANSCRIPT\n${new Date().toLocaleString()}\n\n` +
      `=== VERBATIM ===\n${getFullVerbatim()}\n\n` +
      `=== GRAMMATICALLY CORRECTED ===\n${getCorrectedVersion()}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${Date.now()}.txt`;
    a.click();
  };

  const resetApp = () => {
    stopRecording();
    setSegments([]);
    setAudioUrl(null);
    setTimeLeft(300);
    timeLeftRef.current = 300;
  };

  const handleManualInput = () => {
    const text = prompt('What did the current speaker say? (This will be added verbatim)');
    if (text) addSegment(text);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-2 text-center bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
          VerbaFix
        </h1>
        <p className="text-center text-zinc-400 mb-10">5-minute conversation dictator • Verbatim + Grammar Fixed</p>

        {/* Timer & Controls */}
        <div className="flex justify-center mb-8">
          <div className="bg-zinc-900 rounded-3xl px-10 py-6 text-center border border-zinc-800">
            <div className="text-7xl font-mono font-semibold tabular-nums">
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
            <p className="text-xs text-zinc-500 mt-1">MAX 5 MINUTES</p>
          </div>
        </div>

        <div className="flex gap-4 justify-center mb-8">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-8 py-4 rounded-2xl flex items-center gap-3 text-lg font-medium transition-all ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-600 hover:bg-violet-700'}`}
          >
            {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>

          <button
            onClick={() => setCurrentSpeaker(currentSpeaker === 'A' ? 'B' : 'A')}
            className="px-6 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl flex items-center gap-3"
          >
            <Users className="w-6 h-6" />
            Speaker {currentSpeaker}
          </button>
        </div>

        {/* Quick Add Segment */}
        <div className="text-center mb-8">
          <button
            onClick={handleManualInput}
            disabled={!isRecording}
            className="text-sm px-5 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-full"
          >
            Add what was just said →
          </button>
          <p className="text-xs text-zinc-500 mt-2">Switch speaker then tap to log</p>
        </div>

        {/* Transcript */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 min-h-[400px] mb-8">
          <div className="flex justify-between mb-6">
            <h2 className="text-xl font-semibold">Live Transcript</h2>
            <div className="text-sm text-zinc-400">
              {segments.length} segments
            </div>
          </div>

          <div className="space-y-6 max-h-[500px] overflow-auto pr-4">
            {segments.length === 0 && (
              <p className="text-center text-zinc-500 py-20">
                Recording will appear here...<br />
                Switch speakers and add segments
              </p>
            )}

            {segments.map((seg) => (
              <div key={seg.id} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-bold flex-shrink-0 mt-1">
                  {seg.speaker}
                </div>
                <div>
                  <div className="text-xs text-zinc-500">
                    Speaker {seg.speaker} • {format(new Date(seg.timestamp * 1000), 'mm:ss')}
                  </div>
                  <div className="text-zinc-100 leading-relaxed">{seg.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Final Output */}
        {segments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h3 className="font-semibold mb-4">Verbatim</h3>
              <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-mono leading-relaxed">
                {getFullVerbatim()}
              </pre>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h3 className="font-semibold mb-4">Grammatically Corrected</h3>
              <pre className="whitespace-pre-wrap text-sm text-emerald-300 font-mono leading-relaxed">
                {getCorrectedVersion()}
              </pre>
            </div>
          </div>
        )}

        {/* Export & Playback */}
        <div className="flex flex-wrap gap-4 justify-center">
          {audioUrl && (
            <button
              onClick={() => audioRef.current?.play()}
              className="flex items-center gap-3 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl"
            >
              <Play className="w-5 h-5" /> Play Recording
            </button>
          )}

          <button
            onClick={exportTxt}
            disabled={segments.length === 0}
            className="flex items-center gap-3 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-2xl"
          >
            <Download className="w-5 h-5" /> Export TXT
          </button>

          <button
            onClick={resetApp}
            className="flex items-center gap-3 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl"
          >
            <RotateCcw className="w-5 h-5" /> New Conversation
          </button>
        </div>

        <audio ref={audioRef} src={audioUrl || undefined} className="hidden" />
      </div>
    </div>
  );
}
