import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock ChatKitPanel since it requires a workflow ID and external network
vi.mock('@/components/ChatKitPanel', () => ({
  ChatKitPanel: () => <div data-testid="chatkit-panel">ChatKit Panel</div>,
}));

// Mock useColorScheme hook
vi.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: () => ({ scheme: 'light', setScheme: vi.fn() }),
}));

import App from '@/app/App';

describe('App component — VerbaFix navigation link', () => {
  it('renders the VerbaFix link', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: 'Open VerbaFix recorder' });
    expect(link).toBeInTheDocument();
  });

  it('VerbaFix link points to /verbafix', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: 'Open VerbaFix recorder' });
    expect(link).toHaveAttribute('href', '/verbafix');
  });

  it('VerbaFix link displays the text "VerbaFix ↗"', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: 'Open VerbaFix recorder' });
    expect(link).toHaveTextContent('VerbaFix ↗');
  });

  it('VerbaFix link is positioned fixed at top-right', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: 'Open VerbaFix recorder' });
    expect(link).toHaveStyle({ position: 'fixed', top: '12px', right: '16px' });
  });

  it('VerbaFix link has no text decoration', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: 'Open VerbaFix recorder' });
    expect(link).toHaveStyle({ textDecoration: 'none' });
  });

  it('VerbaFix link has a high z-index to stay above content', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: 'Open VerbaFix recorder' });
    expect(link).toHaveStyle({ zIndex: '50' });
  });

  it('still renders the ChatKit panel', () => {
    render(<App />);
    expect(screen.getByTestId('chatkit-panel')).toBeInTheDocument();
  });
});