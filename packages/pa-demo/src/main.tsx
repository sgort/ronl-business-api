import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { forceMockMode } from './main-helpers';
import App from './App';
import './vendor/index.css';

// Before anything imports pa.api and reads the flag.
forceMockMode();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
