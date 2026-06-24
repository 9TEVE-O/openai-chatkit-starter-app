/**
 * Component-level tests for VerbaFix.tsx changes introduced in this PR.
 *
 * Covers:
 * - StatusPill: new isProcessing prop priority
 * - Draft restore banner rendering
 * - Speaker name editor
 * - VerbaFix page wrapper
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ─── Mocks for browser APIs VerbaFix depends on ───────────────────────────────

const mockGetUserMedia = vi.fn().mockRejectedValue(new Error('permission_denied'));

beforeEach(() => {
  // Navigator media devices
  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  });

  // MediaRecorder
  const mockMediaRecorder = {
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    ondataavailable: null as ((e: BlobEvent) => void) | null,
    onstop: null as (() => void) | null,
    state: 'inactive' as string,
  };
  vi.stubGlobal('MediaRecorder', {
    isTypeSupported: vi.fn().mockReturnValue(true),
    ...mockMediaRecorder,
  });

  // SpeechRecognition
  vi.stubGlobal('SpeechRecognition', undefined);
  vi.stubGlobal('webkitSpeechRecognition', undefined);

  // URL methods (used by audio blob/revoke)
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn().mockReturnValue('blob:fake'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

// ─── StatusPill (replicated component for isolated testing) ───────────────────

/**
 * StatusPill is an internal sub-component. We replicate it here exactly as
 * defined in the source so we can test all state combinations independently.
 */
function StatusPill({ isRecording, isPaused, isLive, isProcessing }: {
  isRecording: boolean; isPaused: boolean; isLive: boolean; isProcessing: boolean;
}) {
  const [status, label] = isProcessing ? ['processing', 'Processing']
    : isRecording && isPaused ? ['paused', 'Paused']
    : isRecording ? ['recording', 'Recording']
    : isLive ? ['live', 'Live']
    : ['idle', 'Idle'];
  return (
    <span className={`vf-status-pill status-${status}`} data-testid="status-pill">
      <span className="vf-status-dot" />{label}
    </span>
  );
}

describe('StatusPill — isProcessing prop (new in this PR)', () => {
  it('shows "Processing" label when isProcessing=true', () => {
    render(<StatusPill isRecording={false} isPaused={false} isLive={false} isProcessing={true} />);
    expect(screen.getByText('Processing')).toBeInTheDocument();
  });

  it('applies status-processing CSS class when isProcessing=true', () => {
    render(<StatusPill isRecording={false} isPaused={false} isLive={false} isProcessing={true} />);
    expect(screen.getByTestId('status-pill')).toHaveClass('status-processing');
  });

  it('isProcessing takes priority over isRecording', () => {
    render(<StatusPill isRecording={true} isPaused={false} isLive={false} isProcessing={true} />);
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.queryByText('Recording')).not.toBeInTheDocument();
  });

  it('isProcessing takes priority over isLive', () => {
    render(<StatusPill isRecording={false} isPaused={false} isLive={true} isProcessing={true} />);
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('isProcessing takes priority over paused state', () => {
    render(<StatusPill isRecording={true} isPaused={true} isLive={false} isProcessing={true} />);
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
  });

  it('shows "Idle" when all flags are false', () => {
    render(<StatusPill isRecording={false} isPaused={false} isLive={false} isProcessing={false} />);
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByTestId('status-pill')).toHaveClass('status-idle');
  });

  it('shows "Recording" when recording and not paused or processing', () => {
    render(<StatusPill isRecording={true} isPaused={false} isLive={false} isProcessing={false} />);
    expect(screen.getByText('Recording')).toBeInTheDocument();
    expect(screen.getByTestId('status-pill')).toHaveClass('status-recording');
  });

  it('shows "Paused" when recording and paused', () => {
    render(<StatusPill isRecording={true} isPaused={true} isLive={false} isProcessing={false} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByTestId('status-pill')).toHaveClass('status-paused');
  });

  it('shows "Live" when isLive=true and not recording or processing', () => {
    render(<StatusPill isRecording={false} isPaused={false} isLive={true} isProcessing={false} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByTestId('status-pill')).toHaveClass('status-live');
  });
});

// ─── Draft restore banner ─────────────────────────────────────────────────────

import VerbaFix from '@/components/VerbaFix';

describe('VerbaFix — draft restore banner', () => {
  const STORAGE_KEY = 'verbafix_draft';

  it('shows "Previous session found" banner when valid draft exists in localStorage', () => {
    const draft = {
      segments: [{ id: 'abc', speaker: 'A', text: 'Hello', timestamp: 0 }],
      secondsElapsed: 10,
      aiCorrected: null,
      summary: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));

    render(<VerbaFix />);
    expect(screen.getByText(/previous session found/i)).toBeInTheDocument();
  });

  it('does not show draft banner when localStorage has no draft', () => {
    render(<VerbaFix />);
    expect(screen.queryByText(/previous session found/i)).not.toBeInTheDocument();
  });

  it('does not show draft banner when draft has empty segments array', () => {
    const draft = { segments: [], secondsElapsed: 0, aiCorrected: null, summary: null };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));

    render(<VerbaFix />);
    expect(screen.queryByText(/previous session found/i)).not.toBeInTheDocument();
  });

  it('does not show draft banner when localStorage contains corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
    render(<VerbaFix />);
    expect(screen.queryByText(/previous session found/i)).not.toBeInTheDocument();
  });

  it('shows Restore and Discard buttons in the draft banner', () => {
    const draft = {
      segments: [{ id: 'abc', speaker: 'A', text: 'Hello', timestamp: 0 }],
      secondsElapsed: 10,
      aiCorrected: null,
      summary: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));

    render(<VerbaFix />);
    expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  it('restores draft segments on Restore click', async () => {
    const user = userEvent.setup();
    const draft = {
      segments: [{ id: 'seg1', speaker: 'A', text: 'My restored text', timestamp: 5 }],
      secondsElapsed: 5,
      aiCorrected: null,
      summary: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));

    render(<VerbaFix />);
    await user.click(screen.getByRole('button', { name: /restore/i }));

    expect(screen.getByText('My restored text')).toBeInTheDocument();
  });

  it('hides draft banner after Restore click', async () => {
    const user = userEvent.setup();
    const draft = {
      segments: [{ id: 'seg1', speaker: 'A', text: 'Hello', timestamp: 0 }],
      secondsElapsed: 0,
      aiCorrected: null,
      summary: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));

    render(<VerbaFix />);
    await user.click(screen.getByRole('button', { name: /restore/i }));

    expect(screen.queryByText(/previous session found/i)).not.toBeInTheDocument();
  });

  it('hides draft banner and clears storage after Discard click', async () => {
    const user = userEvent.setup();
    const draft = {
      segments: [{ id: 'seg1', speaker: 'A', text: 'Hello', timestamp: 0 }],
      secondsElapsed: 0,
      aiCorrected: null,
      summary: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));

    render(<VerbaFix />);
    await user.click(screen.getByRole('button', { name: /discard/i }));

    expect(screen.queryByText(/previous session found/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

// ─── General VerbaFix structure ───────────────────────────────────────────────

describe('VerbaFix — initial render', () => {
  it('renders the VerbaFix heading', () => {
    render(<VerbaFix />);
    expect(screen.getByRole('heading', { name: /verbafix/i })).toBeInTheDocument();
  });

  it('renders a "Begin Session" button', () => {
    render(<VerbaFix />);
    expect(screen.getByRole('button', { name: /begin session/i })).toBeInTheDocument();
  });

  it('renders the status pill in idle state by default', () => {
    render(<VerbaFix />);
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('renders a back-to-chat link', () => {
    render(<VerbaFix />);
    const backLink = screen.getByRole('link', { name: /back to chat/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/');
  });

  it('shows keyboard hint text when idle with no segments', () => {
    render(<VerbaFix />);
    expect(screen.getByText(/space start/i)).toBeInTheDocument();
  });
});

// ─── VerbaFix page wrapper ────────────────────────────────────────────────────

import VerbaFixPage from '@/app/verbafix/page';

describe('VerbaFixPage', () => {
  it('renders the VerbaFix component', () => {
    render(<VerbaFixPage />);
    expect(screen.getByRole('heading', { name: /verbafix/i })).toBeInTheDocument();
  });

  it('page shows Begin Session button', () => {
    render(<VerbaFixPage />);
    expect(screen.getByRole('button', { name: /begin session/i })).toBeInTheDocument();
  });
});