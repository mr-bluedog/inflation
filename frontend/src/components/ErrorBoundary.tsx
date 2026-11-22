import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Filet d'erreur : une vue ou un graphique en panne affiche un message au lieu de vider la page. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur d’affichage', error, info.componentStack);
  }

  render() {
    if (this.state.error)
      return (
        <div className="state error" role="alert">
          {this.props.label ?? 'Cette section'} n'a pas pu s'afficher : {this.state.error.message}
          <div>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Réessayer
            </button>
          </div>
        </div>
      );
    return this.props.children;
  }
}
