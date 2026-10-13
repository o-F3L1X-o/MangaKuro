import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, ChevronDown } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleResetAndReload = (): void => {
    try {
      localStorage.removeItem('mangajutsu_active_session_id');
      localStorage.removeItem('cbz_active_session_id');
      sessionStorage.clear();
    } catch {}
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-comic-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-lg w-full bg-comic-900 border border-comic-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Algo no salió como se esperaba
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-2">
                Se ha producido un error inesperado en la interfaz. Tus archivos y datos en el servidor siguen a salvo.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-left text-xs font-mono text-rose-200 break-words max-h-32 overflow-y-auto">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleRetry}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition active:scale-95 shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reintentar renderizado</span>
              </button>

              <button
                onClick={this.handleResetAndReload}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-200 text-xs sm:text-sm font-semibold border border-comic-700 transition active:scale-95 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>Restablecer y recargar</span>
              </button>
            </div>

            {this.state.errorInfo && (
              <details className="text-left text-[11px] text-slate-500 pt-2 border-t border-comic-800">
                <summary className="cursor-pointer hover:text-slate-300 transition flex items-center gap-1">
                  <ChevronDown className="w-3 h-3" />
                  <span>Ver detalles técnicos</span>
                </summary>
                <pre className="mt-2 p-2 bg-comic-950 rounded-lg overflow-x-auto text-[10px] font-mono text-slate-400 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
