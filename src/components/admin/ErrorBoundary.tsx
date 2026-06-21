"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /**
   * Rendered in place of `children` when a descendant throws during render.
   * Receives the captured error plus a `reset` callback that clears the error
   * state so the boundary attempts to render `children` again.
   */
  fallback: (args: { error: Error; reset: () => void }) => ReactNode;
  /**
   * When any value in this array changes between renders, the boundary
   * automatically clears its error state. This lets a parent recover the
   * boundary by swapping its inputs (e.g. opening a different order) without
   * the user having to click "retry".
   */
  resetKeys?: ReadonlyArray<unknown>;
  /** Optional hook for telemetry; defaults to a console.error log. */
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = {
  error: Error | null;
};

function keysChanged(
  prev: ReadonlyArray<unknown> | undefined,
  next: ReadonlyArray<unknown> | undefined,
): boolean {
  if (prev === next) return false;
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i += 1) {
    if (!Object.is(prev[i], next[i])) return true;
  }
  return false;
}

/**
 * Generic client-side error boundary. A render crash inside `children` is
 * caught here instead of unmounting the whole React tree, so surrounding
 * chrome (modal backdrop, close buttons, the rest of the dashboard) keeps
 * working and the user is never left staring at a frozen overlay.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && keysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, info);
    } else {
      console.error("[ErrorBoundary] caught a render error:", error, info);
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    }
    return this.props.children;
  }
}
