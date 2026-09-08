import React from 'react';
import { createRoot } from 'react-dom/client';
import Game from './game';
import './globals.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Game />
  </React.StrictMode>,
);
