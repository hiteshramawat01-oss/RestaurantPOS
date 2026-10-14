import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppRoot from './App';
import './styles/global.scss';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
