import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted fonts (bundled) — no external Google Fonts request, which is blocked
// in some regions (e.g. Iran) and would otherwise blank the page on first paint.
import '@fontsource-variable/inter';
import '@fontsource-variable/vazirmatn';
import App from './App';
import './i18n';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
