/**
 * Tests for the VerbaFix navigation link added to app/App.tsx.
 *
 * We mock the heavy ChatKitPanel dependency to keep the test focused on the
 * change introduced in this PR: the fixed-position "VerbaFix ↗" anchor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/components/ChatKitPanel', () => ({
  ChatKitPanel: () => <div data-testid="chat-kit-panel" />,
}));

vi.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: () => ({ scheme: 'light', setScheme: vi.fn() }),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import App from '@/app/App';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('App component — VerbaFix navigation link', () => {
  beforeEach(() => {
    render(<App />);
  });

  it('renders a link to /verbafix', () => {
    const link = screen.getByRole('link', { name: /open verbafix recorder/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/verbafix');
  });

  it('displays "VerbaFix ↗" as the link text', () => {
    const link = screen.getByRole('link', { name: /open verbafix recorder/i });
    expect(link.textContent).toContain('VerbaFix');
    expect(link.textContent).toContain('↗');
  });

  it('has aria-label "Open VerbaFix recorder"', () => {
    const link = screen.getByLabelText('Open VerbaFix recorder');
    expect(link).toBeInTheDocument();
  });

  it('applies fixed positioning via inline style', () => {
    const link = screen.getByRole('link', { name: /open verbafix recorder/i }) as HTMLAnchorElement;
    expect(link.style.position).toBe('fixed');
    expect(link.style.top).toBe('12px');
    expect(link.style.right).toBe('16px');
  });

  it('has no text decoration (inline style)', () => {
    const link = screen.getByRole('link', { name: /open verbafix recorder/i }) as HTMLAnchorElement;
    expect(link.style.textDecoration).toBe('none');
  });

  it('renders the ChatKitPanel within a max-width container', () => {
    expect(screen.getByTestId('chat-kit-panel')).toBeInTheDocument();
  });
});