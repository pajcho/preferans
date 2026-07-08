import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './ui/App';
import { initInstallCapture } from './pwa/install';
import './index.css';

const routerBaseName = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

// Uhvati „instaliraj aplikaciju" prompt što ranije (pre nego što React mountuje).
initInstallCapture();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBaseName}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
