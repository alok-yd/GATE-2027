import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * FocusErrorBoundary
 * 
 * Enforces strict isolation: camera, WebGL, or ML inference errors
 * inside the AI Focus subsystem will NEVER crash or blank the rest of the GATE 2027 Prep Tracker.
 */
export class FocusErrorBoundary extends Component<Props, State> {
  public declare props: Props;
  public declare setState: (update: Partial<State> | ((prevState: State) => Partial<State>)) => void;

  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('FocusErrorBoundary captured error:', error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 bg-slate-900 border border-rose-500/30 rounded-2xl text-slate-200 shadow-2xl">
          <div className="flex items-center gap-3 mb-4 text-rose-400 font-bold text-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>AI Focus Subsystem Encountered an Error</span>
          </div>
          <p className="text-sm text-slate-300 mb-4">
            An issue occurred during video feed or neural network execution. The rest of your GATE Prep Tracker remains fully safe and operational.
          </p>
          <div className="p-3 bg-black/40 border border-slate-800 rounded-lg font-mono text-xs text-rose-300/90 mb-6 overflow-x-auto">
            {this.state.error?.message || 'Unknown subsystem error'}
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-amber-500 text-slate-900 font-semibold rounded-lg hover:bg-amber-400 transition"
            >
              Restart AI Focus
            </button>
            <button
              onClick={() => window.location.href = '#/'}
              className="px-4 py-2 bg-slate-800 text-slate-300 font-semibold rounded-lg hover:bg-slate-700 transition"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
