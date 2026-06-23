'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ─── Constants
const MAX_SECONDS = 300;
const STORAGE_KEY = 'verbafix_draft';
const SPEAKERS = ['A', 'B', 'C', 'D'] as const;
type Speaker = typeof SPEAKERS[number];
type SpeakerNames = Record<Speaker, string>;
const DEFAULT_SPEAKER_NAMES: SpeakerNames = { A: 'Speaker A', B: 'Speaker B', C: 'Speaker C', D: 'Speaker D' };

// ─── Types
type RecordingError = 'permission_denied' | 'not_supported' | 'mime_unsupported' | 'unknown';
type SttError = 'stt_unsupported' | 'stt_failed';
type ApiError = 'polish_failed' | 'transcribe_failed';
type CopiedTarget = 'verbatim' | 'corrected' | 'whisper' | null;
type ExportFormat = 'txt' | 'md' | 'json';

interface Segment {
  id: string;
  speaker: Speaker;
  text: string;
  timestamp: number;
  editing?: boolean;
}

interface DraftState {
  segments: Segment[];
  secondsElapsed: number;
  aiCorrected: string | null;
  summary: string | null;
  speakerNames?: SpeakerNames;
}

// ─── Design Tokens
const STYLES = `
  :root {
    --void: #07070A;
    --base: #0E0E13;
    --raised: #141419;
    --elevated: #1A1A22;
    --float: #20202A;
    --border-faint: rgba(255,255,255,0.05);
    --border-soft: rgba(255,255,255,0.09);
    --border-mid: rgba(255,255,255,0.14);
    --border-sharp: rgba(255,255,255,0.22);
    --text-primary: #EEEEF4;
    --text-secondary: rgba(238,238,244,0.52);
    --text-tertiary: rgba(238,238,244,0.28);
    --text-hint: rgba(238,238,244,0.16);
    --accent: #7C7CF8;
    --accent-glow: rgba(124,124,248,0.18);
    --accent-soft: rgba(124,124,248,0.08);
    --record: #E879A0;
    --record-glow: rgba(232,121,160,0.20);
    --live: #34D399;
    --live-glow: rgba(52,211,153,0.16);
    --amber: #F59E0B;
    --red: #F87171;
    --red-glow: rgba(248,113,113,0.20);
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 16px;
    --radius-xl: 22px;
  }

  .vf-root *, .vf-root *::before, .vf-root *::after { box-sizing: border-box; }

  .vf-root {
    position: relative;
    min-height: 100vh;
    background: var(--void);
    color: var(--text-primary);
    font-family: -apple-system, 'SF Pro Display', 'Inter', BlinkMacSystemFont, sans-serif;
    overflow-x: hidden;
  }

  .vf-ambient { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
  .vf-orb { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.12; }
  .vf-orb-1 {
    width: 600px; height: 600px;
    background: radial-gradient(circle, var(--accent) 0%, transparent 70%);
    top: -200px; right: -100px;
    animation: ambient-drift 18s ease-in-out infinite;
  }
  .vf-orb-2 {
    width: 500px; height: 500px;
    background: radial-gradient(circle, var(--record) 0%, transparent 70%);
    bottom: -150px; left: -100px;
    animation: ambient-drift 24s ease-in-out infinite reverse;
  }

  .vf-content { position: relative; z-index: 1; max-width: 680px; margin: 0 auto; padding: 40px 24px 80px; }

  .vf-card {
    background: var(--raised);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-xl);
    position: relative;
    transition: box-shadow 0.2s ease;
  }
  .vf-card::before {
    content: '';
    position: absolute; top: 0; left: 16px; right: 16px; height: 1px;
    background: linear-gradient(90deg, transparent, var(--border-mid), transparent);
    border-radius: 50%;
  }
  .vf-card:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.4); }

  .vf-draft-banner {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    background: var(--accent-soft);
    border: 1px solid var(--accent-glow);
    border-radius: var(--radius-md);
    font-size: 13px;
    color: var(--accent);
    gap: 12px;
  }

  .btn-physical {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    border: none; cursor: pointer; font-family: inherit; font-weight: 500; letter-spacing: 0.01em;
    position: relative;
    transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.15s ease;
    user-select: none; -webkit-tap-highlight-color: transparent; white-space: nowrap;
  }
  .btn-physical::after {
    content: ''; position: absolute; inset: 0; border-radius: inherit;
    background: linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 50%);
    pointer-events: none;
  }
  .btn-physical:not(:disabled):hover { transform: translateY(-1px); }
  .btn-physical:not(:disabled):active { transform: translateY(1px) scale(0.995); }
  .btn-physical:disabled { opacity: 0.38; cursor: not-allowed; }

  .btn-sm { height: 34px; padding: 0 14px; font-size: 13px; border-radius: var(--radius-md); }
  .btn-md { height: 42px; padding: 0 20px; font-size: 14px; border-radius: var(--radius-lg); }
  .btn-lg { height: 52px; padding: 0 28px; font-size: 15px; border-radius: 14px; }

  .btn-primary { background: linear-gradient(160deg,#8A8AFF 0%,#6C6CF0 50%,#5858E0 100%); color:#fff; box-shadow:0 2px 8px rgba(92,92,220,0.35),0 1px 2px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.15); }
  .btn-primary:not(:disabled):hover { box-shadow:0 4px 16px rgba(92,92,220,0.5),0 2px 4px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.15); }

  .btn-record { background:linear-gradient(160deg,#F090B8 0%,#E879A0 50%,#D45A88 100%); color:#fff; box-shadow:0 2px 8px var(--record-glow),0 1px 2px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.15); animation:record-ring 2s ease-in-out infinite; }
  .btn-record:not(:disabled):hover { box-shadow:0 4px 20px var(--record-glow),0 2px 4px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.15); }

  .btn-stop { background:linear-gradient(160deg,#FF8080 0%,#F87171 50%,#E05555 100%); color:#fff; box-shadow:0 2px 8px var(--red-glow),0 1px 2px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.15); }

  .btn-ghost { background:var(--elevated); color:var(--text-secondary); border:1px solid var(--border-soft); box-shadow:0 1px 3px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.04); }
  .btn-ghost:not(:disabled):hover { color:var(--text-primary); background:var(--float); border-color:var(--border-mid); box-shadow:0 2px 6px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.06); }
  .btn-ghost.active { background:var(--accent-soft); border-color:var(--accent-glow); color:var(--accent); }

  .btn-signal { background:linear-gradient(160deg,rgba(52,211,153,0.15) 0%,rgba(52,211,153,0.08) 100%); color:var(--live); border:1px solid rgba(52,211,153,0.25); box-shadow:0 1px 3px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.03); }
  .btn-signal.active { background:rgba(52,211,153,0.18); border-color:rgba(52,211,153,0.4); box-shadow:0 0 0 1px rgba(52,211,153,0.2),0 2px 8px var(--live-glow); }

  .vf-status-pill { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 10px; border-radius:20px; font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; }
  .vf-status-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .status-idle { background:rgba(255,255,255,0.06); color:var(--text-tertiary); }
  .status-idle .vf-status-dot { background:var(--text-hint); }
  .status-recording { background:var(--record-glow); color:var(--record); }
  .status-recording .vf-status-dot { background:var(--record); animation:dot-pulse 1s ease-in-out infinite; }
  .status-paused { background:rgba(245,158,11,0.12); color:var(--amber); }
  .status-paused .vf-status-dot { background:var(--amber); }
  .status-live { background:var(--live-glow); color:var(--live); }
  .status-live .vf-status-dot { background:var(--live); animation:dot-pulse 1.4s ease-in-out infinite; }
  .status-processing { background:var(--accent-soft); color:var(--accent); }
  .status-processing .vf-status-dot { background:var(--accent); animation:dot-pulse 0.8s ease-in-out infinite; }

  .vf-segment-row { animation:segment-in 0.3s ease both; border-radius:var(--radius-md); padding:10px 12px; transition:background 0.15s; }
  .vf-segment-row:hover { background:var(--elevated); }
  .vf-speaker-badge { width:28px; height:28px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; letter-spacing:0.02em; }
  .vf-segment-actions { opacity:0; transition:opacity 0.15s; }
  .vf-segment-row:hover .vf-segment-actions,
  .vf-segment-row:focus-within .vf-segment-actions { opacity:1; }

  .vf-timer-ring { transition:stroke-dashoffset 1s linear; }

  .vf-transcript-scroll { overflow-y:auto; max-height:280px; scrollbar-width:thin; scrollbar-color:var(--border-mid) transparent; }
  .vf-transcript-scroll::-webkit-scrollbar { width:4px; }
  .vf-transcript-scroll::-webkit-scrollbar-track { background:transparent; }
  .vf-transcript-scroll::-webkit-scrollbar-thumb { background:var(--border-mid); border-radius:2px; }

  .vf-output-text { background:var(--elevated); border:1px solid var(--border-faint); border-radius:var(--radius-md); padding:14px; font-size:13.5px; line-height:1.65; color:var(--text-secondary); min-height:80px; white-space:pre-wrap; word-break:break-word; }
  .vf-output-shimmer { background:linear-gradient(90deg,var(--elevated) 25%,var(--float) 50%,var(--elevated) 75%); background-size:200% 100%; animation:shimmer 1.4s ease-in-out infinite; }

  .vf-ai-chip { display:inline-flex; align-items:center; height:18px; padding:0 7px; background:var(--accent-soft); border:1px solid var(--accent-glow); border-radius:4px; font-size:10px; font-weight:700; color:var(--accent); letter-spacing:0.08em; text-transform:uppercase; }
  .vf-whisper-chip { display:inline-flex; align-items:center; height:18px; padding:0 7px; background:var(--live-glow); border:1px solid rgba(52,211,153,0.3); border-radius:4px; font-size:10px; font-weight:700; color:var(--live); letter-spacing:0.08em; text-transform:uppercase; }

  .vf-error-banner { display:flex; align-items:center; gap:10px; padding:12px 16px; background:rgba(248,113,113,0.08); border:1px solid rgba(248,113,113,0.2); border-radius:var(--radius-md); font-size:13px; color:var(--red); }
  .vf-divider { height:1px; background:var(--border-faint); border:none; margin:0; }

  @keyframes breathe { 0%,100%{opacity:0.9;transform:scale(1)}50%{opacity:1;transform:scale(1.03)} }
  @keyframes ambient-drift { 0%,100%{transform:translate(0,0)scale(1)}33%{transform:translate(8px,-6px)scale(1.02)}66%{transform:translate(-4px,4px)scale(0.98)} }
  @keyframes record-ring {
    0%,100%{box-shadow:0 2px 8px var(--record-glow),0 1px 2px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.15)}
    50%{box-shadow:0 2px 8px var(--record-glow),0 0 0 4px var(--record-glow),0 1px 2px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.15)}
  }
  @keyframes dot-pulse { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)} }
  @keyframes segment-in { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
  @keyframes shimmer { 0%{background-position:200% center}100%{background-position:-200% center} }
  @keyframes spin { to{transform:rotate(360deg)} }
`;

// ─── Helpers
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

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const SPEAKER_STYLES: Record<Speaker, { background: string; color: string }> = {
  A: { background: 'linear-gradient(135deg,#7C7CF8,#5A5AE0)', color: '#fff' },
  B: { background: 'linear-gradient(135deg,#E879A0,#C45580)', color: '#fff' },
  C: { background: 'linear-gradient(135deg,#34D399,#1FAD78)', color: '#fff' },
  D: { background: 'linear-gradient(135deg,#F59E0B,#D07A00)', color: '#fff' },
};

// ─── Atoms
function BrandMark({ size = 32, isRecording = false, isLive = false }: { size?: number; isRecording?: boolean; isLive?: boolean }) {
  const color = isRecording ? 'var(--record)' : isLive ? 'var(--live)' : 'var(--accent)';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true"
      style={{ animation: 'breathe 4s ease-in-out infinite', flexShrink: 0 }}>
      {[0, 90, 180, 270].map((r) => (
        <g key={r} transform={`rotate(${r}, 50, 50)`}>
          <path d="M 50 50 C 54 43, 62 38, 62 29 C 62 21, 55 18, 50 22 C 45 26, 46 35, 50 50 Z" fill={color} opacity={0.9} />
        </g>
      ))}
      <circle cx="50" cy="50" r="4" fill={color} opacity={0.7} />
      <circle cx="50" cy="50" r="45" stroke={color} strokeWidth="0.5" opacity={0.15} />
    </svg>
  );
}

function StatusPill({ isRecording, isPaused, isLive, isProcessing }: {
  isRecording: boolean; isPaused: boolean; isLive: boolean; isProcessing: boolean;
}) {
  const [status, label] = isProcessing ? ['processing', 'Processing']
    : isRecording && isPaused ? ['paused', 'Paused']
    : isRecording ? ['recording', 'Recording']
    : isLive ? ['live', 'Live']
    : ['idle', 'Idle'];
  return (
    <span className={`vf-status-pill status-${status}`}>
      <span className="vf-status-dot" />{label}
    </span>
  );
}

function Spinner() {
  return <span style={{ display:'inline-block',width:12,height:12,border:'2px solid var(--border-mid)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'spin 0.7s linear infinite',flexShrink:0 }} />;
}

function TimerDisplay({ seconds, isRecording, isPaused }: { seconds: number; isRecording: boolean; isPaused: boolean }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - seconds / MAX_SECONDS);
  const stroke = isPaused ? 'var(--amber)' : isRecording ? 'var(--record)' : 'var(--border-mid)';
  return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:8 }}>
      <div style={{ position:'relative',width:128,height:128 }}>
        <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform:'rotate(-90deg)' }}>
          <circle cx="64" cy="64" r={r} fill="none" stroke="var(--border-faint)" strokeWidth="2" />
          <circle cx="64" cy="64" r={r} fill="none" stroke={stroke} strokeWidth="2"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            className="vf-timer-ring" style={{ opacity: isRecording ? 1 : 0.3 }} />
        </svg>
        <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center' }}>
          <span style={{ fontSize:36,fontWeight:300,letterSpacing:'-0.02em',color:isPaused?'var(--amber)':isRecording?'var(--record)':'var(--text-secondary)',fontVariantNumeric:'tabular-nums',lineHeight:1 }}>
            {formatTimestamp(seconds)}
          </span>
          <span style={{ fontSize:10,color:'var(--text-hint)',marginTop:4,letterSpacing:'0.05em' }}>
            {isRecording ? `${formatTimestamp(MAX_SECONDS - seconds)} left` : 'max 5 min'}
          </span>
        </div>
      </div>
    </div>
  );
}

function PhysicalButton({ onClick, disabled=false, variant='ghost', size='md', active=false, children, ariaLabel }: {
  onClick: () => void; disabled?: boolean;
  variant?: 'primary'|'record'|'stop'|'ghost'|'signal';
  size?: 'sm'|'md'|'lg'; active?: boolean;
  children: React.ReactNode; ariaLabel?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      className={`btn-physical btn-${variant} btn-${size}${active?' active':''}`}>
      {children}
    </button>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="vf-card" style={style}>{children}</div>;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="vf-error-banner" role="alert">
      <span style={{ width:8,height:8,borderRadius:'50%',background:'var(--red)',flexShrink:0 }} />
      {message}
    </div>
  );
}

function SegmentRow({ segment, index, speakerName, onEdit, onDelete, onSave, onCancelEdit }: {
  segment: Segment; index: number; speakerName: string;
  onEdit: (id: string) => void; onDelete: (id: string) => void;
  onSave: (id: string, text: string) => void; onCancelEdit: (id: string) => void;
}) {
  const [draft, setDraft] = useState(segment.text);
  const badge = SPEAKER_STYLES[segment.speaker];
  return (
    <div className="vf-segment-row"
      style={{ display:'flex',gap:10,alignItems:'flex-start',animationDelay:`${index*40}ms` }}>
      <div className="vf-speaker-badge" style={{ ...badge,marginTop:2 }} aria-label={speakerName}>
        {segment.speaker}
      </div>
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:3 }}>
          <span style={{ fontSize:11,color:'var(--text-hint)',fontVariantNumeric:'tabular-nums' }}>
            {formatTimestamp(segment.timestamp)}
          </span>
        </div>
        {segment.editing ? (
          <div style={{ display:'flex',gap:6 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if(e.key==='Enter') onSave(segment.id,draft); if(e.key==='Escape') onCancelEdit(segment.id); }}
              autoFocus
              style={{ flex:1,background:'var(--elevated)',border:'1px solid var(--border-mid)',borderRadius:6,padding:'4px 8px',color:'var(--text-primary)',fontSize:13,fontFamily:'inherit',outline:'none' }}
            />
            <button onClick={() => onSave(segment.id,draft)}
              style={{ background:'var(--accent)',color:'#fff',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:12 }}>Save</button>
            <button onClick={() => onCancelEdit(segment.id)}
              style={{ background:'var(--elevated)',color:'var(--text-secondary)',border:'1px solid var(--border-soft)',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:12 }}>Cancel</button>
          </div>
        ) : (
          <span style={{ fontSize:13.5,color:'var(--text-primary)',lineHeight:1.55 }}>{segment.text}</span>
        )}
      </div>
      {!segment.editing && (
        <div className="vf-segment-actions" style={{ display:'flex',gap:4,flexShrink:0,marginTop:2 }}>
          <button onClick={() => onEdit(segment.id)} aria-label="Edit segment"
            style={{ background:'var(--elevated)',border:'1px solid var(--border-soft)',borderRadius:5,width:26,height:26,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-tertiary)',fontSize:12 }}>✎</button>
          <button onClick={() => onDelete(segment.id)} aria-label="Delete segment"
            style={{ background:'var(--elevated)',border:'1px solid var(--border-soft)',borderRadius:5,width:26,height:26,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-tertiary)',fontSize:12 }}>×</button>
        </div>
      )}
    </div>
  );
}

// ─── Custom Hooks
function useRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<RecordingError | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const start = useCallback(async () => {
    setError(null); setAudioBlob(null);
    if (!navigator.mediaDevices?.getUserMedia) { setError('not_supported'); return false; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setError('permission_denied'); return false; }
    const mimeType = ['audio/webm','audio/ogg','audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) { setError('mime_unsupported'); return false; }
    mimeTypeRef.current = mimeType;
    const mr = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setAudioBlob(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setIsRecording(true); setIsPaused(false);
    return true;
  }, []);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.pause(); setIsPaused(true); }
  }, []);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') { mediaRecorderRef.current.resume(); setIsPaused(false); }
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false); setIsPaused(false);
  }, []);

  return { isRecording, isPaused, error, audioBlob, start, pause, resume, stop };
}

function useSpeechRecognition(onFinal: (text: string) => void, onInterim: (text: string) => void) {
  const recognitionRef = useRef<any>(null);
  const [isLive, setIsLive] = useState(false);
  const [sttError, setSttError] = useState<SttError | null>(null);
  const onFinalRef = useRef(onFinal);
  const onInterimRef = useRef(onInterim);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);

  const start = useCallback(() => {
    const SR = typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) { setSttError('stt_unsupported'); return; }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    rec.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) onFinalRef.current(last[0].transcript);
      else onInterimRef.current(last[0].transcript);
    };
    rec.onerror = () => setSttError('stt_failed');
    rec.onend = () => setIsLive(false);
    rec.start();
    recognitionRef.current = rec;
    setIsLive(true); setSttError(null);
  }, []);

  const stop = useCallback(() => { recognitionRef.current?.stop(); setIsLive(false); }, []);
  return { isLive, sttError, start, stop };
}

// ─── Error messages
const ERROR_MESSAGES: Record<RecordingError | SttError | ApiError, string> = {
  permission_denied: 'Microphone access was denied. Please allow mic access and try again.',
  not_supported: 'Audio recording is not supported in this browser.',
  mime_unsupported: 'No supported audio format found in this browser.',
  unknown: 'An unexpected error occurred.',
  stt_unsupported: 'Live transcription is not supported in this browser.',
  stt_failed: 'Live transcription encountered an error.',
  polish_failed: 'Claude could not polish the transcript. Showing regex-corrected version.',
  transcribe_failed: 'Whisper transcription failed. Check your OPENAI_API_KEY.',
};

// ─── Main Organism
export default function VerbaFix() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker>('A');
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [interim, setInterim] = useState('');
  const [copied, setCopied] = useState<CopiedTarget>(null);
  const [manualText, setManualText] = useState('');
  const [polishing, setPolishing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [aiCorrected, setAiCorrected] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [whisperText, setWhisperText] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [speakerNames, setSpeakerNames] = useState<SpeakerNames>(DEFAULT_SPEAKER_NAMES);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const segmentsRef = useRef<Segment[]>([]);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);

  // ─── Session persistence
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const draft: DraftState = JSON.parse(raw);
      if (Array.isArray(draft.segments) && draft.segments.length > 0) setHasDraft(true);
    } catch { /* ignore corrupt storage */ }
  }, []);

  const restoreDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const draft: DraftState = JSON.parse(raw);
      if (Array.isArray(draft.segments) && draft.segments.length > 0) {
        setSegments(draft.segments);
        setSecondsElapsed(draft.secondsElapsed ?? 0);
        if (draft.aiCorrected) setAiCorrected(draft.aiCorrected);
        if (draft.summary) setSummary(draft.summary);
        if (draft.speakerNames) setSpeakerNames(draft.speakerNames);
      }
    } catch { /* ignore */ }
    setHasDraft(false);
  }, []);

  const speakerNamesRef = useRef<SpeakerNames>(DEFAULT_SPEAKER_NAMES);
  useEffect(() => { speakerNamesRef.current = speakerNames; }, [speakerNames]);

  const saveDraft = useCallback((segs: Segment[], secs: number, ai: string | null, sum: string | null) => {
    if (segs.length === 0) return;
    try {
      const draft: DraftState = { segments: segs, secondsElapsed: secs, aiCorrected: ai, summary: sum, speakerNames: speakerNamesRef.current };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch { /* quota exceeded — silently ignore */ }
  }, []);

  // ─── Add segment
  const addSegment = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSegments((prev) => [
      ...prev,
      { id: generateId(), speaker: activeSpeaker, text: trimmed, timestamp: secondsRef.current },
    ]);
  }, [activeSpeaker]);

  const addSegmentRef = useRef<(text: string) => void>(() => {});
  useEffect(() => { addSegmentRef.current = addSegment; }, [addSegment]);

  const handleFinal = useCallback((text: string) => { addSegmentRef.current(text); setInterim(''); }, []);
  const handleInterim = useCallback((text: string) => setInterim(text), []);

  const { isRecording, isPaused, error: recError, audioBlob, start: startRec, pause: pauseRec, resume: resumeRec, stop: stopRec } =
    useRecorder();
  const { isLive, sttError, start: startStt, stop: stopStt } =
    useSpeechRecognition(handleFinal, handleInterim);

  // ─── API calls
  const polishTranscript = useCallback(async (segs: Segment[]) => {
    if (segs.length === 0) return;
    setPolishing(true); setApiError(null);
    try {
      const res = await fetch('/api/polish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ segments: segs.map(({ speaker, text, timestamp }) => ({ speaker, text, timestamp })) }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAiCorrected(data.corrected ?? null);
      setSummary(data.summary || null);
      saveDraft(segs, secondsRef.current, data.corrected ?? null, data.summary || null);
    } catch {
      setApiError('polish_failed');
    } finally {
      setPolishing(false);
    }
  }, [saveDraft]);

  const transcribeAudio = useCallback(async (blob: Blob) => {
    setTranscribing(true); setApiError(null);
    try {
      const form = new FormData();
      form.append('audio', blob);
      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWhisperText(data.text ?? null);
    } catch {
      setApiError('transcribe_failed');
    } finally {
      setTranscribing(false);
    }
  }, []);

  // ─── Export
  const exportAs = useCallback((format: ExportFormat, verbatim: string, corrected: string, sum: string | null, segs: Segment[]) => {
    const date = new Date().toISOString().slice(0, 10);
    const slug = `verbafix-${date}`;
    if (format === 'json') {
      triggerDownload(
        JSON.stringify({ date, segments: segs, verbatim, corrected, summary: sum }, null, 2),
        `${slug}.json`, 'application/json'
      );
    } else if (format === 'md') {
      const parts = [`# VerbaFix Session — ${date}\n`];
      if (sum) parts.push(`## Summary\n${sum}\n`);
      parts.push(`## Verbatim\n\`\`\`\n${verbatim}\n\`\`\`\n`);
      parts.push(`## Corrected\n${corrected}`);
      triggerDownload(parts.join('\n'), `${slug}.md`, 'text/markdown');
    } else {
      triggerDownload(verbatim, `${slug}.txt`, 'text/plain');
    }
  }, []);

  // ─── Session lifecycle
  const startSession = useCallback(async () => {
    const ok = await startRec();
    if (!ok) return;
    secondsRef.current = 0;
    setSecondsElapsed(0); setSegments([]); setInterim('');
    setAiCorrected(null); setSummary(null); setWhisperText(null); setApiError(null); setHasDraft(false);
    timerRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSecondsElapsed(secondsRef.current);
      if (secondsRef.current >= MAX_SECONDS) {
        stopRec(); stopStt();
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 1000);
  }, [startRec, stopRec, stopStt]);

  const stopSession = useCallback(() => {
    stopRec(); stopStt();
    if (timerRef.current) clearInterval(timerRef.current);
    setInterim('');
  }, [stopRec, stopStt]);

  useEffect(() => {
    if (audioBlob && segmentsRef.current.length > 0) {
      polishTranscript(segmentsRef.current);
    }
  }, [audioBlob, polishTranscript]);

  // Save draft after each segment added during recording
  useEffect(() => {
    if (segments.length > 0 && !isRecording) return; // only save mid-session
    if (segments.length > 0) saveDraft(segments, secondsRef.current, aiCorrected, summary);
  }, [segments, isRecording, saveDraft, aiCorrected, summary]);

  const togglePause = useCallback(() => { if (isPaused) resumeRec(); else pauseRec(); }, [isPaused, resumeRec, pauseRec]);
  const toggleStt = useCallback(() => { if (isLive) stopStt(); else startStt(); }, [isLive, startStt, stopStt]);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Audio playback URL from recorded blob
  useEffect(() => {
    if (!audioBlob) return;
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioBlob]);

  // Keyboard shortcuts — all handlers accessed via refs to avoid stale closures
  const isRecordingRef = useRef(false);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  const startSessionRef = useRef(startSession);
  useEffect(() => { startSessionRef.current = startSession; }, [startSession]);
  const stopSessionRef = useRef(stopSession);
  useEffect(() => { stopSessionRef.current = stopSession; }, [stopSession]);
  const togglePauseRef = useRef(togglePause);
  useEffect(() => { togglePauseRef.current = togglePause; }, [togglePause]);
  const toggleSttRef = useRef(toggleStt);
  useEffect(() => { toggleSttRef.current = toggleStt; }, [toggleStt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (!isRecordingRef.current) startSessionRef.current();
          else stopSessionRef.current();
          break;
        case 'KeyP':
          if (isRecordingRef.current) togglePauseRef.current();
          break;
        case 'KeyL':
          if (isRecordingRef.current) toggleSttRef.current();
          break;
        case 'Digit1': if (isRecordingRef.current) setActiveSpeaker('A'); break;
        case 'Digit2': if (isRecordingRef.current) setActiveSpeaker('B'); break;
        case 'Digit3': if (isRecordingRef.current) setActiveSpeaker('C'); break;
        case 'Digit4': if (isRecordingRef.current) setActiveSpeaker('D'); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const editSegment = useCallback((id: string) => setSegments((p) => p.map((s) => s.id===id?{...s,editing:true}:s)), []);
  const saveSegment = useCallback((id: string, text: string) => setSegments((p) => p.map((s) => s.id===id?{...s,text,editing:false}:s)), []);
  const cancelEdit = useCallback((id: string) => setSegments((p) => p.map((s) => s.id===id?{...s,editing:false}:s)), []);
  const deleteSegment = useCallback((id: string) => setSegments((p) => p.filter((s) => s.id!==id)), []);

  const fullVerbatim = useMemo(() =>
    segments.map((s) => `${speakerNames[s.speaker]} (${formatTimestamp(s.timestamp)}): ${s.text}`).join('\n'), [segments, speakerNames]);
  const fullCorrected = useMemo(() =>
    segments.map((s) => `${speakerNames[s.speaker]} (${formatTimestamp(s.timestamp)}): ${correctGrammar(s.text)}`).join('\n'), [segments, speakerNames]);

  const copyToClipboard = useCallback((text: string, target: 'verbatim'|'corrected'|'whisper') => {
    navigator.clipboard.writeText(text).then(() => { setCopied(target); setTimeout(() => setCopied(null), 2000); });
  }, []);

  const resetSession = useCallback(() => {
    stopSession();
    setSegments([]); setSecondsElapsed(0); setInterim(''); setCopied(null);
    setAiCorrected(null); setSummary(null); setWhisperText(null); setApiError(null); setHasDraft(false);
    setSpeakerNames(DEFAULT_SPEAKER_NAMES); setAudioUrl(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [stopSession]);

  const addManualSegment = useCallback(() => { addSegment(manualText); setManualText(''); }, [addSegment, manualText]);

  const activeError = recError || sttError || apiError;
  const isProcessing = polishing || transcribing;
  const correctedOutput = aiCorrected ?? fullCorrected;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="vf-root">
        <div className="vf-ambient" aria-hidden="true">
          <div className="vf-orb vf-orb-1" />
          <div className="vf-orb vf-orb-2" />
        </div>

        <main className="vf-content">
          {/* Header */}
          <header style={{ display:'flex',alignItems:'center',gap:14,marginBottom:32 }}>
            <BrandMark size={36} isRecording={isRecording} isLive={isLive} />
            <div style={{ flex:1 }}>
              <h1 style={{ fontSize:20,fontWeight:600,letterSpacing:'-0.01em',color:'var(--text-primary)',margin:0,lineHeight:1.2 }}>VerbaFix</h1>
              <p style={{ fontSize:12,color:'var(--text-tertiary)',margin:0,letterSpacing:'0.02em' }}>Precision conversation recorder</p>
            </div>
            <StatusPill isRecording={isRecording} isPaused={isPaused} isLive={isLive} isProcessing={isProcessing} />
            <a href="/" style={{ fontSize:12,color:'var(--text-hint)',textDecoration:'none',letterSpacing:'0.03em',flexShrink:0 }}
              aria-label="Back to chat">← Chat</a>
          </header>

          {/* Draft restore banner */}
          {hasDraft && !isRecording && segments.length === 0 && (
            <div className="vf-draft-banner" style={{ marginBottom:16 }}>
              <span>↺ Previous session found</span>
              <div style={{ display:'flex',gap:8 }}>
                <PhysicalButton variant="primary" size="sm" onClick={restoreDraft}>Restore</PhysicalButton>
                <PhysicalButton variant="ghost" size="sm" onClick={() => { localStorage.removeItem(STORAGE_KEY); setHasDraft(false); }}>Discard</PhysicalButton>
              </div>
            </div>
          )}

          {/* Error banner */}
          {activeError && (
            <div style={{ marginBottom:16 }}><ErrorBanner message={ERROR_MESSAGES[activeError]} /></div>
          )}

          {/* Timer */}
          <Card style={{ padding:'28px 24px',marginBottom:16,textAlign:'center' }}>
            <TimerDisplay seconds={secondsElapsed} isRecording={isRecording} isPaused={isPaused} />
          </Card>

          {/* Controls */}
          <Card style={{ padding:'20px 24px',marginBottom:16 }}>
            <div style={{ display:'flex',flexWrap:'wrap',gap:10,justifyContent:'center' }}>
              {!isRecording ? (
                <PhysicalButton variant="record" size="lg" onClick={startSession} ariaLabel="Begin session">
                  <span style={{ fontSize:15 }}>●</span> Begin Session
                </PhysicalButton>
              ) : (
                <>
                  <PhysicalButton variant="stop" size="lg" onClick={stopSession} ariaLabel="End session">
                    <span style={{ fontSize:13 }}>■</span> End Session
                  </PhysicalButton>
                  <PhysicalButton variant="ghost" size="lg" onClick={togglePause} ariaLabel={isPaused?'Resume':'Pause'}>
                    {isPaused ? '▶ Resume' : '⏸ Pause'}
                  </PhysicalButton>
                </>
              )}
              {isRecording && (
                <>
                  {SPEAKERS.map((sp) => (
                    <PhysicalButton key={sp} variant="ghost" size="md" active={activeSpeaker===sp}
                      onClick={() => setActiveSpeaker(sp)} ariaLabel={speakerNames[sp]}>
                      <span style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:4,fontSize:11,fontWeight:700,background:SPEAKER_STYLES[sp].background,color:'#fff' }}>{sp}</span>
                      <span style={{ maxWidth:72,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{speakerNames[sp]}</span>
                    </PhysicalButton>
                  ))}
                  <PhysicalButton variant="signal" size="md" active={isLive} onClick={toggleStt}
                    ariaLabel={isLive?'Stop live transcription':'Start live transcription'}>
                    {isLive ? '⊙ Live' : '◎ Live STT'}
                  </PhysicalButton>
                </>
              )}
            </div>

            {isRecording && (
              <div style={{ marginTop:16,display:'flex',gap:8 }}>
                <input value={manualText} onChange={(e) => setManualText(e.target.value)}
                  onKeyDown={(e) => { if(e.key==='Enter'&&manualText.trim()) addManualSegment(); }}
                  placeholder="Type to add segment manually…"
                  style={{ flex:1,background:'var(--elevated)',border:'1px solid var(--border-soft)',borderRadius:8,padding:'8px 12px',color:'var(--text-primary)',fontSize:13,fontFamily:'inherit',outline:'none' }}
                  aria-label="Manual segment text" />
                <PhysicalButton variant="primary" size="sm" onClick={addManualSegment} disabled={!manualText.trim()}>Add</PhysicalButton>
              </div>
            )}

            {/* Speaker name editor */}
            {(isRecording || segments.length > 0) && (
              <div style={{ marginTop:16,display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8 }}>
                {SPEAKERS.map((sp) => (
                  <label key={sp} style={{ display:'flex',alignItems:'center',gap:6 }}>
                    <span className="vf-speaker-badge" style={{ ...SPEAKER_STYLES[sp],width:22,height:22,fontSize:10,flexShrink:0 }}>{sp}</span>
                    <input
                      value={speakerNames[sp]}
                      onChange={(e) => setSpeakerNames((prev) => ({ ...prev, [sp]: e.target.value || DEFAULT_SPEAKER_NAMES[sp] }))}
                      placeholder={DEFAULT_SPEAKER_NAMES[sp]}
                      style={{ flex:1,minWidth:0,background:'var(--elevated)',border:'1px solid var(--border-soft)',borderRadius:5,padding:'4px 8px',color:'var(--text-primary)',fontSize:12,fontFamily:'inherit',outline:'none' }}
                      aria-label={`Name for speaker ${sp}`}
                    />
                  </label>
                ))}
              </div>
            )}
          </Card>

          {/* Keyboard hints */}
          {!isRecording && segments.length === 0 && (
            <p style={{ textAlign:'center',fontSize:11,color:'var(--text-hint)',letterSpacing:'0.04em',marginTop:8,marginBottom:0 }}>
              Space start · P pause · L live STT · 1–4 speaker
            </p>
          )}

          {/* Transcript */}
          {(segments.length > 0 || interim) && (
            <Card style={{ padding:20,marginBottom:16 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14 }}>
                <span style={{ fontSize:12,fontWeight:600,color:'var(--text-tertiary)',letterSpacing:'0.07em',textTransform:'uppercase' }}>Transcript</span>
                <span style={{ fontSize:12,color:'var(--text-hint)' }}>{segments.length} segment{segments.length!==1?'s':''}</span>
              </div>
              <div className="vf-transcript-scroll">
                <div style={{ display:'flex',flexDirection:'column',gap:2 }}>
                  {segments.map((seg,i) => (
                    <SegmentRow key={seg.id} segment={seg} index={i}
                      speakerName={speakerNames[seg.speaker]}
                      onEdit={editSegment} onDelete={deleteSegment} onSave={saveSegment} onCancelEdit={cancelEdit} />
                  ))}
                  {interim && (
                    <div style={{ display:'flex',gap:10,alignItems:'flex-start',padding:'10px 12px',opacity:0.5 }}>
                      <div className="vf-speaker-badge" style={{ ...SPEAKER_STYLES[activeSpeaker],marginTop:2 }}>{activeSpeaker}</div>
                      <span style={{ fontSize:13.5,color:'var(--text-secondary)',fontStyle:'italic' }}>{interim}…</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Output cards */}
          {segments.length > 0 && !isRecording && (
            <>
              {/* Audio playback */}
              {audioUrl && (
                <Card style={{ padding:20,marginBottom:16 }}>
                  <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12 }}>
                    <span style={{ fontSize:12,fontWeight:600,color:'var(--text-tertiary)',letterSpacing:'0.07em',textTransform:'uppercase' }}>Recording</span>
                  </div>
                  <audio controls src={audioUrl} style={{ width:'100%',colorScheme:'dark' }} aria-label="Session recording playback" />
                </Card>
              )}

              <div style={{ display:'grid',gap:14,marginBottom:16,gridTemplateColumns:'1fr 1fr' }}>
                {/* Verbatim */}
                <Card style={{ padding:20 }}>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
                    <span style={{ fontSize:12,fontWeight:600,color:'var(--text-tertiary)',letterSpacing:'0.07em',textTransform:'uppercase' }}>Verbatim</span>
                    <PhysicalButton variant="ghost" size="sm" onClick={() => copyToClipboard(fullVerbatim,'verbatim')} ariaLabel="Copy verbatim">
                      {copied==='verbatim'?'✓ Copied':'Copy'}
                    </PhysicalButton>
                  </div>
                  <div className="vf-output-text">{fullVerbatim||'No content.'}</div>
                </Card>

                {/* AI Corrected */}
                <Card style={{ padding:20 }}>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                      <span style={{ fontSize:12,fontWeight:600,color:'var(--text-tertiary)',letterSpacing:'0.07em',textTransform:'uppercase' }}>Corrected</span>
                      <span className="vf-ai-chip">{polishing?'AI…':'AI'}</span>
                    </div>
                    <PhysicalButton variant="ghost" size="sm" onClick={() => copyToClipboard(correctedOutput,'corrected')} disabled={polishing} ariaLabel="Copy corrected">
                      {copied==='corrected'?'✓ Copied':'Copy'}
                    </PhysicalButton>
                  </div>
                  {polishing ? (
                    <div className="vf-output-text vf-output-shimmer"
                      style={{ display:'flex',alignItems:'center',gap:8 }}
                      aria-busy="true" aria-label="Claude is polishing the transcript">
                      <Spinner />
                      <span style={{ color:'var(--text-hint)',fontSize:13 }}>Claude is polishing…</span>
                    </div>
                  ) : (
                    <div className="vf-output-text">{correctedOutput||'No content.'}</div>
                  )}
                </Card>
              </div>

              {/* Summary */}
              {summary && (
                <Card style={{ padding:20,marginBottom:16 }}>
                  <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12 }}>
                    <span style={{ fontSize:12,fontWeight:600,color:'var(--text-tertiary)',letterSpacing:'0.07em',textTransform:'uppercase' }}>Summary</span>
                    <span className="vf-ai-chip">AI</span>
                  </div>
                  <p style={{ fontSize:14,lineHeight:1.65,color:'var(--text-secondary)',margin:0 }}>{summary}</p>
                </Card>
              )}

              {/* Whisper output */}
              {whisperText && (
                <Card style={{ padding:20,marginBottom:16 }}>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                      <span style={{ fontSize:12,fontWeight:600,color:'var(--text-tertiary)',letterSpacing:'0.07em',textTransform:'uppercase' }}>Whisper Transcript</span>
                      <span className="vf-whisper-chip">Whisper</span>
                    </div>
                    <PhysicalButton variant="ghost" size="sm" onClick={() => copyToClipboard(whisperText,'whisper')} ariaLabel="Copy Whisper transcript">
                      {copied==='whisper'?'✓ Copied':'Copy'}
                    </PhysicalButton>
                  </div>
                  <div className="vf-output-text">{whisperText}</div>
                </Card>
              )}

              {/* Export + action row */}
              <div style={{ display:'flex',flexWrap:'wrap',justifyContent:'center',gap:10 }}>
                {audioBlob && !whisperText && (
                  <PhysicalButton variant="signal" size="md" onClick={() => transcribeAudio(audioBlob)} disabled={transcribing} ariaLabel="Transcribe with Whisper">
                    {transcribing ? <><Spinner /> Transcribing…</> : '◎ Whisper'}
                  </PhysicalButton>
                )}
                <PhysicalButton variant="ghost" size="md" onClick={() => exportAs('txt', fullVerbatim, correctedOutput, summary, segments)}>Export .txt</PhysicalButton>
                <PhysicalButton variant="ghost" size="md" onClick={() => exportAs('md', fullVerbatim, correctedOutput, summary, segments)}>Export .md</PhysicalButton>
                <PhysicalButton variant="ghost" size="md" onClick={() => exportAs('json', fullVerbatim, correctedOutput, summary, segments)}>Export .json</PhysicalButton>
                <PhysicalButton variant="ghost" size="md" onClick={resetSession}>↺ New Session</PhysicalButton>
              </div>
            </>
          )}

          {/* Footer */}
          <footer style={{ marginTop:48,display:'flex',alignItems:'center',gap:12,opacity:0.35 }}>
            <hr className="vf-divider" style={{ flex:1 }} />
            <BrandMark size={16} />
            <hr className="vf-divider" style={{ flex:1 }} />
          </footer>
        </main>
      </div>
    </>
  );
}
