import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * SectionErrorBoundary — wraps the active section in V2's main pad so a
 * crash inside one section component doesn't take down the topbar / rail /
 * dock. Renders a quiet fallback panel with a retry button instead.
 *
 * Reset on `sectionId` change: navigating to another rail item should
 * clear the error and try again.
 */

interface Props {
  sectionId: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidUpdate(prev: Props) {
    // Reset when the user navigates to a different section
    if (prev.sectionId !== this.props.sectionId && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(
      `[SectionErrorBoundary] ${this.props.sectionId} crashed:`,
      error,
      info.componentStack
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="v2-section-error" role="alert">
          <div className="v2-section-error-icon" aria-hidden="true">
            ⚠
          </div>
          <h2 className="v2-section-error-title">Deze sectie kon niet geladen worden</h2>
          <p className="v2-section-error-body">
            Er is iets misgegaan bij het tonen van <code>{this.props.sectionId}</code>. De rest van
            het dashboard werkt nog wel.
          </p>
          {this.state.error?.message && (
            <pre className="v2-section-error-detail">{this.state.error.message}</pre>
          )}
          <button type="button" className="v2-btn" onClick={this.handleRetry}>
            Probeer opnieuw
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
