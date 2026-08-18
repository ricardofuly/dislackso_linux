import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { applySettings } from '@/stores/settings';
import '@/styles/index.css';

// Antes de qualquer render: sem isto o app pisca no tema padrão antes de
// trocar para o que a pessoa escolheu.
applySettings();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
