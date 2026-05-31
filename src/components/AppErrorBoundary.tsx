import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
  onClearSession: () => void;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("VastraBook runtime error", { error, componentStack: errorInfo.componentStack });
  }

  private reloadApp = () => {
    window.location.reload();
  };

  private clearSessionAndLogin = () => {
    this.props.onClearSession();
    window.history.replaceState(null, "", "/login");
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="app-error-page">
        <section className="app-error-panel">
          <span>VastraBook by Veltacore</span>
          <h1>Workspace could not be opened</h1>
          <p>
            The app hit a runtime problem while opening this screen. Your tenant data is still in Postgres; reload the
            workspace or clear this browser session and sign in again.
          </p>
          {import.meta.env.DEV && (
            <pre>{this.state.error.message}</pre>
          )}
          <div className="app-error-actions">
            <button type="button" onClick={this.reloadApp}>Reload App</button>
            <button type="button" onClick={this.clearSessionAndLogin}>Clear Session & Login</button>
          </div>
        </section>
      </main>
    );
  }
}
