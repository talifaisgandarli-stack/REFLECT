/**
 * Global error boundary — without this a single render exception white-screens
 * the whole app (PRD §6 reliability). On catch, surface a friendly message
 * and a "Reload" action; in dev mode include the stack for debugging.
 */
import { Component, ReactNode } from 'react';

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full" style={{ padding: 28 }}>
          <h2 className="text-h2 mb-2">Nəsə tərs getdi</h2>
          <p className="text-body" style={{ color: 'var(--text-soft)' }}>
            Bu səhifəni yükləyə bilmədik. Bu, müvəqqəti problem ola bilər.
          </p>
          {import.meta.env.DEV ? (
            <pre
              className="text-meta mt-3 p-3 rounded-card overflow-auto"
              style={{
                background: 'var(--surface-mist)',
                color: 'var(--text-muted)',
                maxHeight: 200,
                fontSize: 11,
              }}
            >
              {this.state.error.stack ?? this.state.error.message}
            </pre>
          ) : null}
          <div className="flex gap-2 mt-4">
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Yenidən yüklə
            </button>
            <button className="btn-outline" onClick={this.reset}>
              Davam et
            </button>
          </div>
        </div>
      </div>
    );
  }
}
