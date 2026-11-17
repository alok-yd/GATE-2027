import React from 'react';

interface SectionErrorBoundaryProps {
  sectionName: string;
  children: React.ReactNode;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
}

/**
 * Isolates a runtime failure to the active section instead of allowing one
 * route's render error to blank the entire ACHIEVER application.
 */
class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SectionErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[ACHIEVER] ${this.props.sectionName} section failed to render.`,
      error,
      info.componentStack
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section
        role="alert"
        className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-slate-800 shadow-sm"
      >
        <h2 className="text-lg font-bold text-amber-900">
          {this.props.sectionName} could not be displayed
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          This section encountered an unexpected error. Your saved tracker records have not been intentionally
          cleared. The rest of ACHIEVER remains available. Reload the application and try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Reload ACHIEVER
        </button>
      </section>
    );
  }
}

export default SectionErrorBoundary;
