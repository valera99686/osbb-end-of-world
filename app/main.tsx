import React from 'react';
import { createRoot } from 'react-dom/client';
import { CrashSwitch, ErrorBoundary } from './error-boundary';
import Game from './game';
import './globals.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Game />
      {import.meta.env.DEV && <CrashSwitch />}
    </ErrorBoundary>
  </React.StrictMode>,
);
