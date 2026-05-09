/**
 * Locale-aware error boundary for the auth-loaded subtree (slice 152).
 *
 * The outer ErrorBoundary in main.tsx (slice 145) renders an AZ
 * default fallback because it lives outside QueryClientProvider /
 * BrowserRouter / the auth bootstrap, so useT() can't see
 * profile.locale. This inner boundary wraps Layout's <Outlet/> tree
 * and uses useT() to render the same fallback in the user's locale.
 *
 * Behaviour mirrors the outer boundary — reportError() to
 * observability, hard reload — but copy resolves through the
 * dictionary so an EN/RU user sees their language. The outer boundary
 * is still the safety net if the inner boundary itself throws (e.g.
 * a missing dictionary blowing up t()).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '@/lib/observability';
import { useT } from '@/lib/i18n';

type Props = { children: ReactNode };
type InnerProps = Props & {
  copy: { title: string; body: string; reload: string };
};
type State = { hasError: boolean; error: Error | null };

class LocaleErrorBoundaryInner extends Component<InnerProps, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      source: 'react.localeErrorBoundary',
      componentStack: info.componentStack,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const { copy } = this.props;
    return (
      <div
        role="alert"
        className="min-h-[60vh] flex items-center justify-center p-6"
      >
        <div
          className="card max-w-md w-full text-center"
          style={{ padding: 32 }}
        >
          <h1 className="text-h2 mb-2">{copy.title}</h1>
          <p
            className="text-body mb-4"
            style={{ color: 'var(--text-soft)' }}
          >
            {copy.body}
          </p>
          {this.state.error?.message ? (
            <pre
              className="text-meta text-left mb-4 px-3 py-2 rounded-btn"
              style={{
                background: 'var(--surface-mist)',
                color: 'var(--text-muted)',
                whiteSpace: 'pre-wrap',
                overflow: 'auto',
                maxHeight: 120,
              }}
            >
              {this.state.error.message}
            </pre>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            onClick={this.handleReload}
          >
            {copy.reload}
          </button>
        </div>
      </div>
    );
  }
}

export function LocaleErrorBoundary({ children }: Props) {
  const t = useT();
  return (
    <LocaleErrorBoundaryInner
      copy={{
        title: t('error_boundary.title'),
        body: t('error_boundary.body'),
        reload: t('error_boundary.reload'),
      }}
    >
      {children}
    </LocaleErrorBoundaryInner>
  );
}
