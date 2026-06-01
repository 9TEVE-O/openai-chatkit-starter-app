import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import VerbaFix from '../components/VerbaFix';

// ---------------------------------------------------------------------------
// Browser API mocks
// ---------------------------------------------------------------------------

class MockMediaRecorder {
  state: string = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType: string;
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = vi.fn().mockReturnValue(true);

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
    MockMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.onstop) this.onstop();
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }
}

class MockMediaStream {
  private tracks: MediaStreamTrack[];
  constructor() {
    this.tracks = [{ stop: vi.fn() } as unknown as MediaStreamTrack];
  }
  getTracks() {
    return this.tracks;
  }
}

// ---------------------------------------------------------------------------
// Pure helper function: mirrored from component for unit testing
// ---------------------------------------------------------------------------
function correctGrammar(text: string): string {
  let out = text.replace(/\bi\b/g, 'I').replace(/\s+/g, ' ').trim();
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (!/[.?!]$/.test(out)) out += '.';
  return out;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Shared setup helpers
// ---------------------------------------------------------------------------

function setupMediaMocks(getUserMediaResult: Promise<MockMediaStream> = Promise.resolve(new MockMediaStream())) {
  (globalThis as any).MediaRecorder = MockMediaRecorder;
  MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);

  const getUserMediaMock = vi.fn().mockReturnValue(getUserMediaResult);
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: { getUserMedia: getUserMediaMock },
    configurable: true,
    writable: true,
  });
  return getUserMediaMock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VerbaFix component', () => {
  let getUserMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockMediaRecorder.instances = [];
    getUserMediaMock = setupMediaMocks();

    // Mock clipboard
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial render
  // -------------------------------------------------------------------------
  describe('initial render', () => {
    it('renders the VerbaFix heading', () => {
      render(<VerbaFix />);
      expect(screen.getByText('VerbaFix')).toBeInTheDocument();
    });

    it('shows "Precision conversation recorder" subtitle', () => {
      render(<VerbaFix />);
      expect(screen.getByText('Precision conversation recorder')).toBeInTheDocument();
    });

    it('renders Begin Session button initially', () => {
      render(<VerbaFix />);
      expect(screen.getByRole('button', { name: /begin session/i })).toBeInTheDocument();
    });

    it('shows Idle status pill initially', () => {
      render(<VerbaFix />);
      expect(screen.getByText('Idle')).toBeInTheDocument();
    });

    it('shows 00:00 timer initially', () => {
      render(<VerbaFix />);
      expect(screen.getByText('00:00')).toBeInTheDocument();
    });

    it('shows "max 5 min" label in timer initially', () => {
      render(<VerbaFix />);
      expect(screen.getByText('max 5 min')).toBeInTheDocument();
    });

    it('does not show End Session button initially', () => {
      render(<VerbaFix />);
      expect(screen.queryByRole('button', { name: /end session/i })).not.toBeInTheDocument();
    });

    it('does not show manual text input initially', () => {
      render(<VerbaFix />);
      expect(screen.queryByRole('textbox', { name: /manual segment text/i })).not.toBeInTheDocument();
    });

    it('does not show transcript card initially', () => {
      render(<VerbaFix />);
      expect(screen.queryByText('Transcript')).not.toBeInTheDocument();
    });

    it('does not show output panels initially', () => {
      render(<VerbaFix />);
      expect(screen.queryByText('Verbatim')).not.toBeInTheDocument();
      expect(screen.queryByText('Corrected')).not.toBeInTheDocument();
    });

    it('does not show New Session button initially', () => {
      render(<VerbaFix />);
      expect(screen.queryByText(/new session/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Starting a session
  // -------------------------------------------------------------------------
  describe('startSession', () => {
    it('calls getUserMedia with audio:true when Begin Session is clicked', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
    });

    it('shows End Session button after session starts', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      expect(screen.getByRole('button', { name: /end session/i })).toBeInTheDocument();
    });

    it('shows Pause button after session starts', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
    });

    it('shows speaker buttons A, B, C, D after session starts', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      expect(screen.getByRole('button', { name: /speaker a/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /speaker b/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /speaker c/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /speaker d/i })).toBeInTheDocument();
    });

    it('does not show Live STT button before session starts', () => {
      render(<VerbaFix />);
      // The STT button is only rendered when isRecording is true
      expect(screen.queryByRole('button', { name: /start live transcription/i })).not.toBeInTheDocument();
    });

    it('shows Live STT toggle only when recording', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      expect(screen.getByRole('button', { name: /start live transcription/i })).toBeInTheDocument();
    });

    it('shows manual text input during recording', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      expect(screen.getByRole('textbox', { name: /manual segment text/i })).toBeInTheDocument();
    });

    it('shows Recording status pill while session is active', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      expect(screen.getByText('Recording')).toBeInTheDocument();
    });

    it('shows error banner if getUserMedia is not available', async () => {
      // Simulate no mediaDevices support
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: null,
        configurable: true,
        writable: true,
      });
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/not supported/i)).toBeInTheDocument();
    });

    it('shows permission_denied error when getUserMedia rejects', async () => {
      getUserMediaMock = setupMediaMocks(Promise.reject(new Error('NotAllowedError')));
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/microphone access was denied/i)).toBeInTheDocument();
    });

    it('shows mime_unsupported error when no supported audio format', async () => {
      MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(false);
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/no supported audio format/i)).toBeInTheDocument();
    });

    it('keeps Begin Session visible when recording fails to start', async () => {
      getUserMediaMock = setupMediaMocks(Promise.reject(new Error('denied')));
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      expect(screen.getByRole('button', { name: /begin session/i })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Stopping a session
  // -------------------------------------------------------------------------
  describe('stopSession', () => {
    it('shows Begin Session again after End Session is clicked', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /end session/i }));
      });
      expect(screen.getByRole('button', { name: /begin session/i })).toBeInTheDocument();
    });

    it('shows Idle status after stopping', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /end session/i }));
      });
      expect(screen.getByText('Idle')).toBeInTheDocument();
    });

    it('hides manual text input after stopping', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /end session/i }));
      });
      expect(screen.queryByRole('textbox', { name: /manual segment text/i })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Pause and Resume
  // -------------------------------------------------------------------------
  describe('pause / resume', () => {
    it('shows Resume button when paused', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /pause/i }));
      });
      expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
    });

    it('shows Paused status pill when paused', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /pause/i }));
      });
      expect(screen.getByText('Paused')).toBeInTheDocument();
    });

    it('shows Pause button again after resuming', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /pause/i }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /resume/i }));
      });
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
    });

    it('shows Recording status again after resuming', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /pause/i }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /resume/i }));
      });
      expect(screen.getByText('Recording')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Timer
  // -------------------------------------------------------------------------
  describe('timer', () => {
    it('timer increments after 1 second of recording', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('00:01')).toBeInTheDocument();
    });

    it('timer increments to 01:00 after 60 seconds', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      act(() => {
        vi.advanceTimersByTime(60000);
      });
      expect(screen.getByText('01:00')).toBeInTheDocument();
    });

    it('shows time remaining label while recording', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      // Should show "XX:XX left" while recording
      expect(screen.getByText(/left/)).toBeInTheDocument();
    });

    it('auto-stops recording when timer reaches 300 seconds', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      await act(async () => {
        vi.advanceTimersByTime(300000);
      });
      expect(screen.getByRole('button', { name: /begin session/i })).toBeInTheDocument();
    });

    it('shows 00:00 when session not started', () => {
      render(<VerbaFix />);
      expect(screen.getByText('00:00')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Manual segment input
  // -------------------------------------------------------------------------
  describe('manual segment input', () => {
    it('Add button is disabled when input is empty', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const addBtn = screen.getByRole('button', { name: 'Add' });
      expect(addBtn).toBeDisabled();
    });

    it('Add button is enabled when input has text', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'Hello world' } });
      const addBtn = screen.getByRole('button', { name: 'Add' });
      expect(addBtn).not.toBeDisabled();
    });

    it('adds a segment when Add button is clicked', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'Hello world' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('clears input after adding segment', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'Hello' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      expect(input).toHaveValue('');
    });

    it('adds segment on Enter key press when input has text', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'Enter pressed text' } });
      act(() => {
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      expect(screen.getByText('Enter pressed text')).toBeInTheDocument();
    });

    it('does not add segment on Enter key press when input is empty', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      act(() => {
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      expect(screen.queryByText('Transcript')).not.toBeInTheDocument();
    });

    it('trims whitespace from segment text', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: '  trimmed  ' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      expect(screen.getByText('trimmed')).toBeInTheDocument();
    });

    it('does not add segment when input is only whitespace', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      // The Add button is disabled for whitespace-only since !manualText.trim() is true
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: '   ' } });
      const addBtn = screen.getByRole('button', { name: 'Add' });
      expect(addBtn).toBeDisabled();
    });

    it('accumulates multiple segments', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      for (const text of ['First', 'Second', 'Third']) {
        fireEvent.change(input, { target: { value: text } });
        act(() => {
          fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        });
      }
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
      expect(screen.getByText('Third')).toBeInTheDocument();
    });

    it('shows segment count in transcript header', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'one' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      expect(screen.getByText('1 segment')).toBeInTheDocument();
    });

    it('shows plural "segments" when count > 1', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      for (const text of ['one', 'two']) {
        fireEvent.change(input, { target: { value: text } });
        act(() => {
          fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        });
      }
      expect(screen.getByText('2 segments')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Speaker selection
  // -------------------------------------------------------------------------
  describe('speaker selection', () => {
    it('assigns segment to Speaker A by default', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'Speaker A text' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      // Badge should show 'A'
      const badges = screen.getAllByLabelText(/Speaker A/);
      expect(badges.length).toBeGreaterThan(0);
    });

    it('assigns segment to Speaker B when B is selected', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      fireEvent.click(screen.getByRole('button', { name: /speaker b/i }));
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'Speaker B text' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      // The segment badge div has aria-label="Speaker B"
      const badges = screen.getAllByLabelText(/Speaker B/);
      expect(badges.length).toBeGreaterThan(0);
    });

    it('assigns segment to Speaker C when C is selected', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      fireEvent.click(screen.getByRole('button', { name: /speaker c/i }));
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'Speaker C text' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      const badges = screen.getAllByLabelText(/Speaker C/);
      expect(badges.length).toBeGreaterThan(0);
    });

    it('assigns segment to Speaker D when D is selected', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      fireEvent.click(screen.getByRole('button', { name: /speaker d/i }));
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'Speaker D text' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      const badges = screen.getAllByLabelText(/Speaker D/);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Output panels (shown only when !isRecording && segments.length > 0)
  // -------------------------------------------------------------------------
  describe('output panels', () => {
    async function addSegmentAndStop(text: string) {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: text } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /end session/i }));
      });
    }

    it('shows Verbatim panel after session ends with segments', async () => {
      await addSegmentAndStop('hello world');
      expect(screen.getByText('Verbatim')).toBeInTheDocument();
    });

    it('shows Corrected panel after session ends with segments', async () => {
      await addSegmentAndStop('hello world');
      expect(screen.getByText('Corrected')).toBeInTheDocument();
    });

    it('verbatim output contains original text', async () => {
      await addSegmentAndStop('i went home');
      // verbatim output div contains the original text
      const verbatimText = screen.getByText(/Speaker A \(00:00\): i went home/);
      expect(verbatimText).toBeInTheDocument();
    });

    it('corrected output contains grammatically corrected text', async () => {
      await addSegmentAndStop('i went home');
      const correctedText = screen.getByText(/Speaker A \(00:00\): I went home\./);
      expect(correctedText).toBeInTheDocument();
    });

    it('does not show output panels during recording', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'some text' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      expect(screen.queryByText('Verbatim')).not.toBeInTheDocument();
      expect(screen.queryByText('Corrected')).not.toBeInTheDocument();
    });

    it('shows AI chip in Corrected panel header', async () => {
      await addSegmentAndStop('hello');
      expect(screen.getByText('AI')).toBeInTheDocument();
    });

    it('shows New Session button after session ends with segments', async () => {
      await addSegmentAndStop('hello');
      expect(screen.getByText(/new session/i)).toBeInTheDocument();
    });

    it('shows Copy button for verbatim transcript', async () => {
      await addSegmentAndStop('hello');
      expect(screen.getByRole('button', { name: /copy verbatim transcript/i })).toBeInTheDocument();
    });

    it('shows Copy button for corrected transcript', async () => {
      await addSegmentAndStop('hello');
      expect(screen.getByRole('button', { name: /copy corrected transcript/i })).toBeInTheDocument();
    });

    it('copy verbatim calls navigator.clipboard.writeText', async () => {
      await addSegmentAndStop('test text');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy verbatim transcript/i }));
      });
      expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('test text'),
      );
    });

    it('copy corrected calls navigator.clipboard.writeText with corrected text', async () => {
      await addSegmentAndStop('i went home');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy corrected transcript/i }));
      });
      expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('I went home.'),
      );
    });

    it('shows Copied feedback after clicking copy verbatim', async () => {
      await addSegmentAndStop('test');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy verbatim transcript/i }));
        // Flush microtasks so the Promise from clipboard.writeText resolves
        await Promise.resolve();
      });
      expect(screen.getByText('✓ Copied')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Segment editing
  // -------------------------------------------------------------------------
  describe('segment editing', () => {
    it('shows edit input when Edit button is clicked', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'Original text' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /edit segment/i }));
      });
      // An input in edit mode should appear
      const editInput = screen.getByDisplayValue('Original text');
      expect(editInput).toBeInTheDocument();
    });

    it('saves edited text when Save is clicked', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const manualInput = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(manualInput, { target: { value: 'Original text' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /edit segment/i }));
      });
      const editInput = screen.getByDisplayValue('Original text');
      fireEvent.change(editInput, { target: { value: 'Edited text' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      });
      expect(screen.getByText('Edited text')).toBeInTheDocument();
    });

    it('cancels edit when Cancel is clicked', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const manualInput = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(manualInput, { target: { value: 'Original' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /edit segment/i }));
      });
      const editInput = screen.getByDisplayValue('Original');
      fireEvent.change(editInput, { target: { value: 'Changed' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      });
      expect(screen.getByText('Original')).toBeInTheDocument();
      expect(screen.queryByText('Changed')).not.toBeInTheDocument();
    });

    it('saves on Enter key in edit input', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const manualInput = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(manualInput, { target: { value: 'Original' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /edit segment/i }));
      });
      const editInput = screen.getByDisplayValue('Original');
      fireEvent.change(editInput, { target: { value: 'Enter saved' } });
      act(() => {
        fireEvent.keyDown(editInput, { key: 'Enter' });
      });
      expect(screen.getByText('Enter saved')).toBeInTheDocument();
    });

    it('cancels on Escape key in edit input', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const manualInput = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(manualInput, { target: { value: 'Original' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /edit segment/i }));
      });
      const editInput = screen.getByDisplayValue('Original');
      act(() => {
        fireEvent.keyDown(editInput, { key: 'Escape' });
      });
      expect(screen.getByText('Original')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Segment deletion
  // -------------------------------------------------------------------------
  describe('segment deletion', () => {
    it('removes segment when Delete button is clicked', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'To be deleted' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      expect(screen.getByText('To be deleted')).toBeInTheDocument();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /delete segment/i }));
      });
      expect(screen.queryByText('To be deleted')).not.toBeInTheDocument();
    });

    it('removes only the target segment when multiple segments exist', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      for (const text of ['Keep me', 'Delete me']) {
        fireEvent.change(input, { target: { value: text } });
        act(() => {
          fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        });
      }
      const deleteButtons = screen.getAllByRole('button', { name: /delete segment/i });
      act(() => {
        fireEvent.click(deleteButtons[1]); // Delete the second segment
      });
      expect(screen.getByText('Keep me')).toBeInTheDocument();
      expect(screen.queryByText('Delete me')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Reset session
  // -------------------------------------------------------------------------
  describe('resetSession', () => {
    it('clears all segments after New Session is clicked', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'Text to clear' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /end session/i }));
      });
      act(() => {
        fireEvent.click(screen.getByText(/new session/i));
      });
      expect(screen.queryByText('Text to clear')).not.toBeInTheDocument();
    });

    it('hides Verbatim and Corrected panels after reset', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'some text' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /end session/i }));
      });
      act(() => {
        fireEvent.click(screen.getByText(/new session/i));
      });
      expect(screen.queryByText('Verbatim')).not.toBeInTheDocument();
      expect(screen.queryByText('Corrected')).not.toBeInTheDocument();
    });

    it('shows Begin Session button after reset', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const input = screen.getByRole('textbox', { name: /manual segment text/i });
      fireEvent.change(input, { target: { value: 'text' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /end session/i }));
      });
      act(() => {
        fireEvent.click(screen.getByText(/new session/i));
      });
      expect(screen.getByRole('button', { name: /begin session/i })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // StatusPill states
  // -------------------------------------------------------------------------
  describe('StatusPill', () => {
    it('shows Idle when not recording and not live', () => {
      render(<VerbaFix />);
      expect(screen.getByText('Idle')).toBeInTheDocument();
    });

    it('shows Recording status class on status pill while recording', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      const pill = screen.getByText('Recording').closest('.vf-status-pill');
      expect(pill).toHaveClass('status-recording');
    });

    it('shows Paused status class on status pill while paused', async () => {
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /pause/i }));
      });
      const pill = screen.getByText('Paused').closest('.vf-status-pill');
      expect(pill).toHaveClass('status-paused');
    });
  });

  // -------------------------------------------------------------------------
  // Speech recognition (STT)
  // -------------------------------------------------------------------------
  describe('useSpeechRecognition', () => {
    it('shows stt_unsupported error when SpeechRecognition is not available', async () => {
      // Ensure no SpeechRecognition on window
      const origSR = (window as any).SpeechRecognition;
      const origWSR = (window as any).webkitSpeechRecognition;
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;

      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /start live transcription/i }));
      });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/live transcription is not supported/i)).toBeInTheDocument();

      // Restore
      if (origSR) (window as any).SpeechRecognition = origSR;
      if (origWSR) (window as any).webkitSpeechRecognition = origWSR;
    });

    it('calls SpeechRecognition start when STT toggle is clicked and available', async () => {
      const startMock = vi.fn();
      const stopMock = vi.fn();
      // Must use a constructor function (not arrow fn) so `new` works
      function MockSR(this: any) {
        this.continuous = false;
        this.interimResults = false;
        this.lang = '';
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        this.start = startMock;
        this.stop = stopMock;
      }
      (window as any).SpeechRecognition = MockSR;

      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /start live transcription/i }));
      });
      expect(startMock).toHaveBeenCalled();

      delete (window as any).SpeechRecognition;
    });

    it('STT button label changes to "Stop live transcription" after STT starts', async () => {
      function MockSR(this: any) {
        this.continuous = false;
        this.interimResults = false;
        this.lang = '';
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        this.start = vi.fn();
        this.stop = vi.fn();
      }
      (window as any).SpeechRecognition = MockSR;

      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /start live transcription/i }));
      });
      // After STT starts, the button should offer to stop live transcription
      expect(screen.getByRole('button', { name: /stop live transcription/i })).toBeInTheDocument();

      delete (window as any).SpeechRecognition;
    });
  });
});

// ---------------------------------------------------------------------------
// Pure function: formatTimestamp
// ---------------------------------------------------------------------------
describe('formatTimestamp (pure)', () => {
  it('returns 00:00 for 0 seconds', () => {
    expect(formatTimestamp(0)).toBe('00:00');
  });

  it('returns 00:01 for 1 second', () => {
    expect(formatTimestamp(1)).toBe('00:01');
  });

  it('returns 00:59 for 59 seconds', () => {
    expect(formatTimestamp(59)).toBe('00:59');
  });

  it('returns 01:00 for 60 seconds', () => {
    expect(formatTimestamp(60)).toBe('01:00');
  });

  it('returns 05:00 for 300 seconds', () => {
    expect(formatTimestamp(300)).toBe('05:00');
  });

  it('pads single-digit seconds with a leading zero', () => {
    expect(formatTimestamp(65)).toBe('01:05');
  });

  it('pads single-digit minutes with a leading zero', () => {
    expect(formatTimestamp(9 * 60 + 3)).toBe('09:03');
  });

  it('handles large values', () => {
    expect(formatTimestamp(3600)).toBe('60:00');
  });
});

// ---------------------------------------------------------------------------
// Pure function: correctGrammar
// ---------------------------------------------------------------------------
describe('correctGrammar (pure)', () => {
  it('capitalises standalone "i" to "I"', () => {
    expect(correctGrammar('i went to the store')).toContain('I went to the store');
  });

  it('does not change "i" inside a word like "inside"', () => {
    expect(correctGrammar('inside the box')).toBe('Inside the box.');
  });

  it('capitalises the first letter of the sentence', () => {
    expect(correctGrammar('hello world')).toMatch(/^Hello/);
  });

  it('appends a period when text has no ending punctuation', () => {
    expect(correctGrammar('hello world')).toMatch(/\.$/);
  });

  it('does not add a period when text already ends with a period', () => {
    expect(correctGrammar('Hello world.')).toBe('Hello world.');
  });

  it('does not add a period when text ends with a question mark', () => {
    expect(correctGrammar('how are you?')).toBe('How are you?');
  });

  it('does not add a period when text ends with an exclamation mark', () => {
    expect(correctGrammar('great job!')).toBe('Great job!');
  });

  it('collapses multiple spaces into one', () => {
    expect(correctGrammar('hello   world')).toBe('Hello world.');
  });

  it('trims leading and trailing whitespace before processing', () => {
    expect(correctGrammar('  hello  ')).toBe('Hello.');
  });

  it('handles empty string without throwing', () => {
    expect(correctGrammar('')).toBe('.');
  });

  it('handles text that is only whitespace', () => {
    expect(correctGrammar('   ')).toBe('.');
  });

  it('corrects multiple standalone "i" occurrences', () => {
    expect(correctGrammar('i think i can do it')).toBe('I think I can do it.');
  });

  it('does not double-capitalise already-uppercase first letter', () => {
    expect(correctGrammar('Hello there')).toBe('Hello there.');
  });

  it('preserves question mark without adding period', () => {
    const result = correctGrammar('are you sure?');
    expect(result.endsWith('?')).toBe(true);
    expect(result).not.toContain('?.');
  });

  it('handles already-correct sentence unchanged', () => {
    expect(correctGrammar('This is fine.')).toBe('This is fine.');
  });

  it('handles text that ends with exclamation after capitalisation', () => {
    expect(correctGrammar('wow!')).toBe('Wow!');
  });
});

// ---------------------------------------------------------------------------
// ERROR_MESSAGES coverage
// ---------------------------------------------------------------------------
describe('error message display', () => {
  let getUserMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockMediaRecorder.instances = [];
    (globalThis as any).MediaRecorder = MockMediaRecorder;
    MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows "not_supported" error message when mediaDevices is unavailable', async () => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    render(<VerbaFix />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
    });
    expect(screen.getByText('Audio recording is not supported in this browser.')).toBeInTheDocument();
  });

  it('shows "permission_denied" error message when getUserMedia rejects', async () => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('NotAllowed')) },
      configurable: true,
      writable: true,
    });
    render(<VerbaFix />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
    });
    expect(screen.getByText('Microphone access was denied. Please allow mic access and try again.')).toBeInTheDocument();
  });

  it('shows "mime_unsupported" error when no MIME type is supported', async () => {
    MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(false);
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()) },
      configurable: true,
      writable: true,
    });
    render(<VerbaFix />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
    });
    expect(screen.getByText('No supported audio format found in this browser.')).toBeInTheDocument();
  });

  it('shows "stt_unsupported" message when STT API is unavailable', async () => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()) },
      configurable: true,
      writable: true,
    });
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    render(<VerbaFix />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /begin session/i }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /start live transcription/i }));
    });
    expect(screen.getByText('Live transcription is not supported in this browser.')).toBeInTheDocument();
  });
});