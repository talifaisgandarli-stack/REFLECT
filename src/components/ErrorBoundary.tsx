/**
 * App-level error boundary (slice 145).
 *
 * Catches render-phase exceptions that React's standard re-render
 * loop can't recover from on its own. Without this, a single bad
 * component (e.g. a missing dictionary key on a freshly-deployed
 * locale, an undefined .map call on stale data) blanks the whole
 * page with a white screen.
 *
 * Behaviour:
 *   - reports to observability (slice 13's reportError) so Sentry
 *     captures the stack trace + componentStack the same way the
 *     window.error handler does.
 *   - renders a localized fallback card with a Reload button. The
 *     useT() hook can't be used in a class component, so we read the
 *     dictionary directly via the module-level t() helper (always
 *     reads AZ — fine for an emergency surface that the user only
 *     sees when something is already broken).
 *
 * Reset is a hard reload, not a state reset, because the broken
 * component might depend on a query state that throws again on
 * remount.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '@/lib/observability';
import { t } from '@/lib/i18n';

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      source: 'react.errorBoundary',
      componentStack: info.componentStack,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'var(--canvas)' }}
      >
        <div
          className="card max-w-md w-full text-center"
          style={{ padding: 32 }}
        >
          <h1 className="text-h2 mb-2">{t('error_boundary.title')}</h1>
          <p
            className="text-body mb-4"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('error_boundary.body')}
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
            {t('error_boundary.reload')}
          </button>
        </div>
      </div>
    );
  }
}
