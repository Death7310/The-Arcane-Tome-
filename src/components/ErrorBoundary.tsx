// Keeps one broken panel from taking the whole sheet down. If something in a panel throws
// while drawing (a bug, or data the app didn't expect), that panel shows a short message with
// a Try again button, and everything else keeps working. Your character is saved as usual,
// so nothing typed is lost.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Panel } from './ui';

interface Props {
  /** What's inside, for the message ("Spellcasting", "the sheet"). */
  name: string;
  children: ReactNode;
  /** The whole app: offers a reload instead of a retry. */
  whole?: boolean;
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}]`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Panel title={this.props.whole ? 'Something went wrong' : this.props.name} tab="stats">
        <div className="crash" role="alert">
          <p>
            {this.props.whole ? 'The app ran into an error it couldn’t show.' : 'This part of the sheet ran into an error; the rest still works.'} Your character is saved, so nothing
            you entered is lost.
          </p>
          <p className="hint mono">{error.message}</p>
          <div className="row">
            {this.props.whole ? (
              <button type="button" className="btn small primary" onClick={() => location.reload()}>
                Reload
              </button>
            ) : (
              <button type="button" className="btn small primary" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Panel>
    );
  }
}
