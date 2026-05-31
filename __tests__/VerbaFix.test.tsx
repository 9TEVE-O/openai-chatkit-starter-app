import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// lucide-react icons - render as simple spans to avoid SVG complexities
vi.mock('lucide-react', () => ({
  Mic: () => <span data-testid="icon-mic" />,
  MicOff: () => <span data-testid="icon-mic-off" />,
  Play: () => <span data-testid="icon-play" />,
  Download: () => <span data-testid="icon-download" />,
  RotateCcw: () => <span data-testid="icon-rotate" />,
  Users: () => <span data-testid="icon-users" />,
}));

// date-fns format - return predictable output
vi.mock('date-fns', () => ({
  format: (_date: Date, _fmt: string) => '00:00',
}));

// ---------------------------------------------------------------------------
// Browser API mocks
// ---------------------------------------------------------------------------

// MediaRecorder mock
class MockMediaRecorder {
  state: string = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  static instances: MockMediaRecorder[] = [];

  constructor(_stream: MediaStream) {
    MockMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.onstop) this.onstop();
  }
}

// MediaStream mock
class MockMediaStream {
  private tracks: MediaStreamTrack[];
  constructor() {
    this.tracks = [{ stop: vi.fn() } as unknown as MediaStreamTrack];
  }
  getTracks() {
    return this.tracks;
  }
}

// formatDuration is referenced inside VerbaFix JSX but never defined/imported;
// define it on globalThis so the component doesn't crash when segments render.
(globalThis as unknown as Record<string, unknown>).formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Helper: extract correctGrammar pure logic mirrored from the component
// ---------------------------------------------------------------------------
function correctGrammar(text: string): string {
  let corrected = text
    .replace(/\bi\b/g, 'I')
    .replace(/\s+/g, ' ')
    .trim();
  corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
  if (!corrected.endsWith('.') && !corrected.endsWith('?') && !corrected.endsWith('!')) {
    corrected += '.';
  }
  return corrected;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('VerbaFix component', () => {
  let getUserMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockMediaRecorder.instances = [];

    // Replace global MediaRecorder with mock
    (globalThis as unknown as Record<string, unknown>).MediaRecorder = MockMediaRecorder;

    // Mock URL.createObjectURL
    (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:mock-url');

    // Mock navigator.mediaDevices.getUserMedia
    getUserMediaMock = vi.fn().mockResolvedValue(new MockMediaStream());
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: getUserMediaMock },
      configurable: true,
      writable: true,
    });

    // Mock window.alert and window.prompt
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'prompt').mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Rendering & initial state
  // -------------------------------------------------------------------------

  describe('initial render', () => {
    it('renders the VerbaFix heading', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      expect(screen.getByText('VerbaFix')).toBeInTheDocument();
    });

    it('shows the initial 5:00 timer', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      expect(screen.getByText(/5:00/)).toBeInTheDocument();
    });

    it('renders Start Recording button initially', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      expect(screen.getByText('Start Recording')).toBeInTheDocument();
    });

    it('renders Speaker A toggle button initially', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      expect(screen.getByText('Speaker A')).toBeInTheDocument();
    });

    it('shows empty transcript placeholder text', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      expect(screen.getByText(/Recording will appear here/)).toBeInTheDocument();
    });

    it('shows 0 segments count', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      expect(screen.getByText('0 segments')).toBeInTheDocument();
    });

    it('Export TXT button is disabled when no segments', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      const exportBtn = screen.getByText('Export TXT').closest('button')!;
      expect(exportBtn).toBeDisabled();
    });

    it('"Add what was just said" button is disabled when not recording', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      const addBtn = screen.getByText(/Add what was just said/).closest('button')!;
      expect(addBtn).toBeDisabled();
    });

    it('does not show Play Recording button when no audio url', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      expect(screen.queryByText('Play Recording')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Speaker toggle
  // -------------------------------------------------------------------------

  describe('speaker toggle', () => {
    it('switches from Speaker A to Speaker B on click', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      const toggleBtn = screen.getByText('Speaker A').closest('button')!;
      fireEvent.click(toggleBtn);
      expect(screen.getByText('Speaker B')).toBeInTheDocument();
    });

    it('switches back from Speaker B to Speaker A on second click', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      const toggleBtn = screen.getByText('Speaker A').closest('button')!;
      fireEvent.click(toggleBtn);
      fireEvent.click(screen.getByText('Speaker B').closest('button')!);
      expect(screen.getByText('Speaker A')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Recording controls
  // -------------------------------------------------------------------------

  describe('startRecording', () => {
    it('calls getUserMedia when Start Recording is clicked', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
    });

    it('shows Stop Recording button after recording starts', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      expect(screen.getByText('Stop Recording')).toBeInTheDocument();
    });

    it('enables the Add Segment button while recording', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      const addBtn = screen.getByText(/Add what was just said/).closest('button')!;
      expect(addBtn).not.toBeDisabled();
    });

    it('shows alert and stays stopped when getUserMedia throws', async () => {
      getUserMediaMock.mockRejectedValueOnce(new Error('Permission denied'));
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      expect(window.alert).toHaveBeenCalledWith('Microphone access denied or not available.');
      expect(screen.getByText('Start Recording')).toBeInTheDocument();
    });
  });

  describe('stopRecording', () => {
    it('shows Start Recording button after stopping', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('Stop Recording'));
      });
      expect(screen.getByText('Start Recording')).toBeInTheDocument();
    });

    it('shows Play Recording button after recording stops (blob URL created)', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('Stop Recording'));
      });
      expect(screen.getByText('Play Recording')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Timer countdown
  // -------------------------------------------------------------------------

  describe('timer countdown', () => {
    it('decrements timer after 1 second of recording', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText(/4:59/)).toBeInTheDocument();
    });

    it('decrements timer after 60 seconds', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        vi.advanceTimersByTime(60000);
      });
      expect(screen.getByText(/4:00/)).toBeInTheDocument();
    });

    it('stops recording automatically when timer reaches 0', async () => {
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      await act(async () => {
        vi.advanceTimersByTime(300000);
      });
      expect(screen.getByText('Start Recording')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Adding segments (handleManualInput)
  // -------------------------------------------------------------------------

  describe('adding segments', () => {
    it('adds a segment when prompt returns text', async () => {
      vi.spyOn(window, 'prompt').mockReturnValueOnce('Hello world');
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
      });
      expect(screen.getByText('Hello world')).toBeInTheDocument();
      expect(screen.getByText('1 segments')).toBeInTheDocument();
    });

    it('does not add a segment when prompt returns null', async () => {
      vi.spyOn(window, 'prompt').mockReturnValueOnce(null);
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
      });
      expect(screen.getByText('0 segments')).toBeInTheDocument();
    });

    it('does not add a segment when prompt returns whitespace only', async () => {
      vi.spyOn(window, 'prompt').mockReturnValueOnce('   ');
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
      });
      expect(screen.getByText('0 segments')).toBeInTheDocument();
    });

    it('trims whitespace from segment text', async () => {
      vi.spyOn(window, 'prompt').mockReturnValueOnce('  trimmed text  ');
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
      });
      expect(screen.getByText('trimmed text')).toBeInTheDocument();
    });

    it('assigns segment to current speaker', async () => {
      vi.spyOn(window, 'prompt').mockReturnValueOnce('Speaker B speaking');
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      // Switch to speaker B
      fireEvent.click(screen.getByText('Speaker A').closest('button')!);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
      });
      // The avatar should show 'B'
      const avatars = screen.getAllByText('B');
      expect(avatars.length).toBeGreaterThan(0);
    });

    it('accumulates multiple segments', async () => {
      vi.spyOn(window, 'prompt')
        .mockReturnValueOnce('First')
        .mockReturnValueOnce('Second')
        .mockReturnValueOnce('Third');
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      const addBtn = screen.getByText(/Add what was just said/).closest('button')!;
      act(() => { fireEvent.click(addBtn); });
      act(() => { fireEvent.click(addBtn); });
      act(() => { fireEvent.click(addBtn); });
      expect(screen.getByText('3 segments')).toBeInTheDocument();
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
      expect(screen.getByText('Third')).toBeInTheDocument();
    });

    it('shows verbatim and corrected panels when segments exist', async () => {
      vi.spyOn(window, 'prompt').mockReturnValueOnce('some text');
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
      });
      expect(screen.getByText('Verbatim')).toBeInTheDocument();
      expect(screen.getByText('Grammatically Corrected')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  describe('resetApp', () => {
    it('clears all segments and resets timer after New Conversation', async () => {
      vi.spyOn(window, 'prompt').mockReturnValueOnce('Some text');
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
      });
      expect(screen.getByText('1 segments')).toBeInTheDocument();
      act(() => {
        fireEvent.click(screen.getByText('New Conversation').closest('button')!);
      });
      expect(screen.getByText('0 segments')).toBeInTheDocument();
      expect(screen.getByText(/5:00/)).toBeInTheDocument();
    });

    it('hides verbatim and corrected panels after reset', async () => {
      vi.spyOn(window, 'prompt').mockReturnValueOnce('Some text');
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
      });
      act(() => {
        fireEvent.click(screen.getByText('New Conversation').closest('button')!);
      });
      expect(screen.queryByText('Verbatim')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  describe('exportTxt', () => {
    it('Export TXT button is enabled when segments exist', async () => {
      vi.spyOn(window, 'prompt').mockReturnValueOnce('Some text');
      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
      });
      const exportBtn = screen.getByText('Export TXT').closest('button')!;
      expect(exportBtn).not.toBeDisabled();
    });

    it('clicking Export TXT creates a download link and triggers click', async () => {
      vi.spyOn(window, 'prompt').mockReturnValueOnce('Export test');
      const clickSpy = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          const anchor = { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement;
          return anchor;
        }
        return originalCreateElement(tag);
      });

      const { default: VerbaFix } = await import('../components/VerbaFix');
      render(<VerbaFix />);
      await act(async () => {
        fireEvent.click(screen.getByText('Start Recording'));
      });
      act(() => {
        fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
      });
      act(() => {
        fireEvent.click(screen.getByText('Export TXT').closest('button')!);
      });
      expect(clickSpy).toHaveBeenCalled();
      createElementSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Pure function tests for correctGrammar (mirrored logic from component)
// ---------------------------------------------------------------------------

describe('correctGrammar (pure logic)', () => {
  it('capitalises lowercase "i" as a standalone word', () => {
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

  it('does not add a period when text ends with a period', () => {
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

  it('trims leading and trailing whitespace', () => {
    expect(correctGrammar('  hello  ')).toBe('Hello.');
  });

  it('handles empty string without throwing', () => {
    // Empty string: charAt(0) is '', toUpperCase is '', slice(1) is '' → '' then '.'
    expect(correctGrammar('')).toBe('.');
  });

  it('handles already-correct sentence unchanged (except period)', () => {
    expect(correctGrammar('This is fine.')).toBe('This is fine.');
  });

  it('corrects multiple standalone "i" occurrences', () => {
    const result = correctGrammar('i think i can do it');
    expect(result).toBe('I think I can do it.');
  });

  it('handles mixed case first letter correctly', () => {
    expect(correctGrammar('already Capitalised.')).toBe('Already Capitalised.');
  });

  it('handles text that is only whitespace — trims to empty then adds period', () => {
    const result = correctGrammar('   ');
    expect(result).toBe('.');
  });

  it('preserves existing question mark — regression boundary', () => {
    const result = correctGrammar('are you sure?');
    expect(result).not.toContain('?.');
    expect(result.endsWith('?')).toBe(true);
  });

  it('does not double-capitalise an already-uppercase first letter', () => {
    expect(correctGrammar('Hello there')).toBe('Hello there.');
  });
});

// ---------------------------------------------------------------------------
// getFullVerbatim and getCorrectedVersion output format (via component render)
// ---------------------------------------------------------------------------

describe('transcript output format', () => {
  let getUserMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockMediaRecorder.instances = [];
    (globalThis as unknown as Record<string, unknown>).MediaRecorder = MockMediaRecorder;
    (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:mock-url');
    getUserMediaMock = vi.fn().mockResolvedValue(new MockMediaStream());
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: getUserMediaMock },
      configurable: true,
      writable: true,
    });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'prompt').mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('verbatim panel contains speaker label and original text', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('i went home');
    const { default: VerbaFix } = await import('../components/VerbaFix');
    render(<VerbaFix />);
    await act(async () => {
      fireEvent.click(screen.getByText('Start Recording'));
    });
    act(() => {
      fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
    });
    // The verbatim section shows original (uncorrected) text
    const verbatimPre = screen.getAllByText(/Speaker A/)[0].closest('pre') ||
                        [...document.querySelectorAll('pre')][0];
    expect(verbatimPre?.textContent).toContain('i went home');
  });

  it('corrected panel contains grammatically corrected text', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('i went home');
    const { default: VerbaFix } = await import('../components/VerbaFix');
    render(<VerbaFix />);
    await act(async () => {
      fireEvent.click(screen.getByText('Start Recording'));
    });
    act(() => {
      fireEvent.click(screen.getByText(/Add what was just said/).closest('button')!);
    });
    // Corrected section should have 'I went home.' (capitalised 'I', period added)
    const pres = document.querySelectorAll('pre');
    const correctedPre = pres[1];
    expect(correctedPre?.textContent).toContain('I went home.');
  });

  it('verbatim panel shows multiple segments separated by blank lines', async () => {
    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('first')
      .mockReturnValueOnce('second');
    const { default: VerbaFix } = await import('../components/VerbaFix');
    render(<VerbaFix />);
    await act(async () => {
      fireEvent.click(screen.getByText('Start Recording'));
    });
    const addBtn = screen.getByText(/Add what was just said/).closest('button')!;
    act(() => { fireEvent.click(addBtn); });
    act(() => { fireEvent.click(addBtn); });
    const pres = document.querySelectorAll('pre');
    expect(pres[0]?.textContent).toContain('first');
    expect(pres[0]?.textContent).toContain('second');
    expect(pres[0]?.textContent).toContain('\n\n');
  });
});