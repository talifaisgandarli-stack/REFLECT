import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

vi.mock('@/lib/observability', () => ({
  reportError: vi.fn(),
}));

import { reportError } from '@/lib/observability';

function Boom(): JSX.Element {
  throw new Error('boom in render');
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <p>healthy</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('renders the localized fallback when a child throws', () => {
    // Suppress React's expected console.error during the throw — keeps
    // vitest output focused on the assertion.
    const orig = console.error;
    console.error = () => {};
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    } finally {
      console.error = orig;
    }

    // The AZ default copy is what the module-level t() returns.
    expect(screen.getByText('Nəsə düz getmədi')).toBeInTheDocument();
    // The thrown message bubbles into the <pre> for forensics.
    expect(screen.getByText(/boom in render/)).toBeInTheDocument();
  });

  it('reports the error to observability with componentStack', () => {
    const orig = console.error;
    console.error = () => {};
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    } finally {
      console.error = orig;
    }

    expect(reportError).toHaveBeenCalledTimes(1);
    const [err, ctx] = vi.mocked(reportError).mock.calls[0];
    expect((err as Error).message).toBe('boom in render');
    expect(ctx).toMatchObject({ source: 'react.errorBoundary' });
    expect(typeof (ctx as Record<string, unknown>).componentStack).toBe('string');
  });

  it('exposes a Reload button (window.location.reload)', () => {
    const orig = console.error;
    console.error = () => {};
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
      const button = screen.getByRole('button', { name: 'Yenidən yüklə' });
      button.click();
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      console.error = orig;
    }
  });
});
