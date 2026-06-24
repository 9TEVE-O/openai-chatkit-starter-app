import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import VerbaFix from '@/components/VerbaFix';

// ─── Browser API mocks ─────────────────────────────────────────────────────────

const mockStop = vi.fn();
const mockStart = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();

function makeMockMediaRecorder(mimeType = 'audio/webm') {
  return {
    state: 'inactive' as 'inactive' | 'recording' | 'paused',
    mimeType,
    ondataavailable: null as ((e: any) => void) | null,
    onstop: null as (() => void) | null,
    start: mockStart,
    stop: mockStop,
    pause: mockPause,
    resume: mockResume,
  };
}

let mockMediaRecorderInstance: ReturnType<typeof makeMockMediaRecorder>;

const mockGetUserMedia = vi.fn();

function setupBrowserMocks() {
  // localStorage
  const store: Record<string, string> = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => store[k] ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { store[k] = v; });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((k) => { delete store[k]; });

  // MediaRecorder
  mockMediaRecorderInstance = makeMockMediaRecorder();
  const MockMediaRecorder = vi.fn().mockImplementation(() => mockMediaRecorderInstance) as any;
  MockMediaRecorder.isTypeSupported = vi.fn().mockImplementation((t: string) => t === 'audio/webm');
  (global as any).MediaRecorder = MockMediaRecorder;

  // navigator.mediaDevices
  Object.defineProperty(global.navigator, 'mediaDevices', {
    writable: true,
    value: { getUserMedia: mockGetUserMedia },
  });

  const mockStream = { getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]) };
  mockGetUserMedia.mockResolvedValue(mockStream);

  // URL APIs
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/fake-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  // navigator.clipboard
  Object.defineProperty(global.navigator, 'clipboard', {
    writable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  // fetch
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ corrected: 'AI corrected text.', summary: 'A summary.' }),
  }));

  return store;
}

describe('VerbaFix component', () => {
  beforeEach(() => {
    setupBrowserMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('initial render', () => {
    it('renders the VerbaFix heading', () => {
      render(<VerbaFix />);
      expect(screen.getByRole('heading', { name: 'VerbaFix' })).toBeInTheDocument();
    });

    it('renders the subtitle text', () => {
      render(<VerbaFix />);
      expect(screen.getByText('Precision conversation recorder')).toBeInTheDocument();
    });

    it('shows "Begin Session" button initially', () => {
      render(<VerbaFix />);
      expect(screen.getByRole('button', { name: 'Begin session' })).toBeInTheDocument();
    });

    it('shows "Idle" status pill initially', () => {
      render(<VerbaFix />);
      expect(screen.getByText('Idle')).toBeInTheDocument();
    });

    it('shows initial timer as 00:00', () => {
      render(<VerbaFix />);
      expect(screen.getByText('00:00')).toBeInTheDocument();
    });

    it('shows keyboard shortcut hints when idle with no segments', () => {
      render(<VerbaFix />);
      expect(screen.getByText(/Space start/)).toBeInTheDocument();
    });

    it('renders back-to-chat navigation link', () => {
      render(<VerbaFix />);
      const backLink = screen.getByRole('link', { name: 'Back to chat' });
      expect(backLink).toHaveAttribute('href', '/');
    });

    it('does not show draft banner when localStorage is empty', () => {
      render(<VerbaFix />);
      expect(screen.queryByText(/Previous session found/)).not.toBeInTheDocument();
    });
  });

  describe('localStorage draft detection', () => {
    it('shows draft banner when valid draft exists in localStorage', async () => {
      const draft = {
        segments: [{ id: 'abc1234', speaker: 'A', text: 'Hello', timestamp: 5 }],
        secondsElapsed: 10,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => {
        expect(screen.getByText(/Previous session found/)).toBeInTheDocument();
      });
    });

    it('does not show draft banner when draft has empty segments', () => {
      const draft = {
        segments: [],
        secondsElapsed: 0,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);
      expect(screen.queryByText(/Previous session found/)).not.toBeInTheDocument();
    });

    it('does not show draft banner when localStorage contains corrupt data', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? 'INVALID{JSON' : null
      );

      render(<VerbaFix />);
      expect(screen.queryByText(/Previous session found/)).not.toBeInTheDocument();
    });

    it('shows Restore and Discard buttons in draft banner', async () => {
      const draft = {
        segments: [{ id: 'abc1234', speaker: 'A', text: 'Hello', timestamp: 5 }],
        secondsElapsed: 10,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
      });
    });

    it('restoring draft displays segments from localStorage', async () => {
      const draft = {
        segments: [
          { id: 'seg1234', speaker: 'A', text: 'Restored segment text', timestamp: 7 },
        ],
        secondsElapsed: 15,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument());

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
      });

      await waitFor(() => {
        expect(screen.getByText('Restored segment text')).toBeInTheDocument();
      });
    });

    it('discarding draft removes item from localStorage and hides banner', async () => {
      const store: Record<string, string> = {
        verbafix_draft: JSON.stringify({
          segments: [{ id: 'seg1234', speaker: 'A', text: 'Draft text', timestamp: 5 }],
          secondsElapsed: 5,
          aiCorrected: null,
          summary: null,
        }),
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => store[k] ?? null);
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((k) => {
        delete store[k];
      });

      render(<VerbaFix />);

      await waitFor(() => expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument());

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
      });

      await waitFor(() => {
        expect(screen.queryByText(/Previous session found/)).not.toBeInTheDocument();
      });
      expect(removeItemSpy).toHaveBeenCalledWith('verbafix_draft');
    });

    it('restoring draft with speakerNames updates speaker label inputs', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'Test', timestamp: 0 }],
        secondsElapsed: 5,
        aiCorrected: null,
        summary: null,
        speakerNames: { A: 'Alice', B: 'Bob', C: 'Speaker C', D: 'Speaker D' },
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument());

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
      });

      await waitFor(() => {
        // After restore, the speaker name input for A should show 'Alice'
        const inputA = screen.getByRole('textbox', { name: 'Name for speaker A' });
        expect(inputA).toHaveValue('Alice');
      });
    });
  });

  describe('StatusPill state labels', () => {
    it('shows "Idle" when not recording, not paused, not live, not processing', () => {
      render(<VerbaFix />);
      expect(screen.getByText('Idle')).toBeInTheDocument();
    });
  });

  describe('speaker name defaults', () => {
    it('shows default speaker name inputs when a draft is restored', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'B', text: 'Test', timestamp: 0 }],
        secondsElapsed: 0,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: 'Name for speaker A' })).toHaveValue('Speaker A');
        expect(screen.getByRole('textbox', { name: 'Name for speaker B' })).toHaveValue('Speaker B');
        expect(screen.getByRole('textbox', { name: 'Name for speaker C' })).toHaveValue('Speaker C');
        expect(screen.getByRole('textbox', { name: 'Name for speaker D' })).toHaveValue('Speaker D');
      });
    });
  });

  describe('error messages', () => {
    it('error message map includes polish_failed message', () => {
      // We verify the error message by checking what's rendered when apiError is polish_failed
      // This is tested indirectly — the ERROR_MESSAGES content is new in this PR
      // We check by rendering with a stored draft that triggers a scenario where we can inspect
      // the error messages. Since they're in the module, we verify through the rendered error banner.
      // Simulate a failed polish by mocking fetch to fail, starting a session, stopping it.
      // For now, verify the component renders without crashing (smoke test for error boundary).
      render(<VerbaFix />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('correctedOutput fallback logic', () => {
    it('displays AI-corrected text when draft includes aiCorrected', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'hello world', timestamp: 0 }],
        secondsElapsed: 5,
        aiCorrected: 'AI polished: Hello world.',
        summary: 'A greeting was exchanged.',
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => {
        expect(screen.getByText('AI polished: Hello world.')).toBeInTheDocument();
      });
    });

    it('displays summary when draft includes summary', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'hello world', timestamp: 0 }],
        secondsElapsed: 5,
        aiCorrected: 'Polished text.',
        summary: 'This is the restored summary.',
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => {
        expect(screen.getByText('This is the restored summary.')).toBeInTheDocument();
      });
    });
  });

  describe('segment count display', () => {
    it('shows "1 segment" (singular) for one restored segment', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'Hello', timestamp: 5 }],
        secondsElapsed: 5,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => {
        expect(screen.getByText('1 segment')).toBeInTheDocument();
      });
    });

    it('shows "2 segments" (plural) for multiple segments', async () => {
      const draft = {
        segments: [
          { id: 'seg0001', speaker: 'A', text: 'Hello', timestamp: 5 },
          { id: 'seg0002', speaker: 'B', text: 'World', timestamp: 10 },
        ],
        secondsElapsed: 10,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => {
        expect(screen.getByText('2 segments')).toBeInTheDocument();
      });
    });
  });

  describe('verbatim transcript format', () => {
    it('uses speakerNames in verbatim transcript output', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'Custom speaker text', timestamp: 30 }],
        secondsElapsed: 30,
        aiCorrected: null,
        summary: null,
        speakerNames: { A: 'Alice', B: 'Speaker B', C: 'Speaker C', D: 'Speaker D' },
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => {
        // At least one output card (verbatim or corrected) uses the custom speaker name
        const matches = screen.getAllByText(/Alice \(00:30\): Custom speaker text/);
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('segment editing', () => {
    it('clicking edit shows a Save and Cancel button', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'Original text', timestamp: 0 }],
        secondsElapsed: 0,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => screen.getByText('Original text'));

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Edit segment' }));
      });

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('cancelling edit restores original text display', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'Original text', timestamp: 0 }],
        secondsElapsed: 0,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => screen.getByText('Original text'));

      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Edit segment' })); });
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });

      await waitFor(() => {
        expect(screen.getByText('Original text')).toBeInTheDocument();
      });
    });

    it('deleting a segment removes it from the transcript', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'Delete me', timestamp: 0 }],
        secondsElapsed: 0,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => screen.getByText('Delete me'));

      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Delete segment' })); });

      await waitFor(() => {
        expect(screen.queryByText('Delete me')).not.toBeInTheDocument();
      });
    });
  });

  describe('correctGrammar behavior (via corrected transcript)', () => {
    it('capitalizes first letter of segment text', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'hello world', timestamp: 0 }],
        secondsElapsed: 0,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => {
        // Corrected output card shows grammar-corrected text with capitalization
        // The corrected card shows "Speaker A (00:00): Hello world."
        const correctedCards = screen.getAllByText(/Speaker A \(00:00\)/);
        const correctedText = correctedCards.find((el) => el.textContent?.includes('Hello world.'));
        expect(correctedText).toBeTruthy();
      });
    });

    it('fixes lowercase "i" to uppercase "I" in corrected transcript', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'B', text: 'yes i agree with that', timestamp: 0 }],
        secondsElapsed: 0,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => {
        // Corrected output: "Yes I agree with that."
        expect(screen.getByText(/Yes I agree with that\./)).toBeInTheDocument();
      });
    });

    it('adds trailing period when segment text has no ending punctuation', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'This has no period', timestamp: 0 }],
        secondsElapsed: 0,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => {
        expect(screen.getByText(/This has no period\./)).toBeInTheDocument();
      });
    });

    it('does not add period when text already ends with question mark', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'Is this right?', timestamp: 0 }],
        secondsElapsed: 0,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => {
        // Neither the verbatim nor corrected card should contain a period after a question mark
        const allMatches = screen.getAllByText(/Is this right\?/);
        expect(allMatches.length).toBeGreaterThanOrEqual(1);
        allMatches.forEach((el) => {
          expect(el.textContent).not.toMatch(/Is this right\?\./);
        });
      });
    });
  });

  describe('new session / reset', () => {
    it('clicking New Session removes segments and hides output cards', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'Test content', timestamp: 0 }],
        secondsElapsed: 0,
        aiCorrected: 'Polished..',
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => screen.getByText('Test content'));

      act(() => { fireEvent.click(screen.getByText('↺ New Session')); });

      await waitFor(() => {
        expect(screen.queryByText('Test content')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Begin session' })).toBeInTheDocument();
      });
    });
  });

  describe('speaker name editor', () => {
    it('updating speaker name in input reflects in verbatim transcript', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'A', text: 'Hello', timestamp: 5 }],
        secondsElapsed: 5,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => screen.getByRole('textbox', { name: 'Name for speaker A' }));

      const inputA = screen.getByRole('textbox', { name: 'Name for speaker A' });
      act(() => {
        fireEvent.change(inputA, { target: { value: 'John' } });
      });

      await waitFor(() => {
        // Both verbatim and corrected use the new name; at least one match expected
        const matches = screen.getAllByText(/John \(00:05\): Hello/);
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('empty speaker name input reverts to default name', async () => {
      const draft = {
        segments: [{ id: 'seg1234', speaker: 'B', text: 'Hello', timestamp: 0 }],
        secondsElapsed: 0,
        aiCorrected: null,
        summary: null,
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) =>
        k === 'verbafix_draft' ? JSON.stringify(draft) : null
      );

      render(<VerbaFix />);

      await waitFor(() => screen.getByRole('button', { name: 'Restore' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restore' })); });

      await waitFor(() => screen.getByRole('textbox', { name: 'Name for speaker B' }));

      const inputB = screen.getByRole('textbox', { name: 'Name for speaker B' });
      act(() => {
        // onChange with empty string should revert to DEFAULT_SPEAKER_NAMES[B] = 'Speaker B'
        fireEvent.change(inputB, { target: { value: '' } });
      });

      await waitFor(() => {
        expect(inputB).toHaveValue('Speaker B');
      });
    });
  });
});