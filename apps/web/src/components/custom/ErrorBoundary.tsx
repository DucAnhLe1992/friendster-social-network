import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Changing this value clears the error, e.g. the current route so navigating away recovers. */
  resetKey?: unknown;
  fullScreen?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey: unknown;
}

const isChunkLoadError = (error: Error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    error.message
  );

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private retry = () => {
    const { error } = this.state;
    // A new deployment replaced the page's code chunks; only a full reload fetches the new ones.
    if (error && isChunkLoadError(error)) window.location.reload();
    else this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const outdated = isChunkLoadError(error);
    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center text-center px-6 py-16 animate-fade-in ${
          this.props.fullScreen ? 'min-h-screen bg-background' : ''
        }`}
      >
        <div className="w-16 h-16 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="font-semibold text-lg">{outdated ? 'A new version is available' : 'Something went wrong'}</h2>
        <p className="text-muted-foreground text-sm mt-1 max-w-sm">
          {outdated
            ? 'This page was updated since you opened it. Reload to get the latest version.'
            : 'This part of the page hit an unexpected error. Your data is safe; try again or head back home.'}
        </p>
        <div className="flex gap-2 mt-5">
          <Button onClick={this.retry} className="rounded-full">
            <RotateCcw className="w-4 h-4 mr-2" />
            {outdated ? 'Reload' : 'Try again'}
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => window.location.assign('/')}>
            Go home
          </Button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
