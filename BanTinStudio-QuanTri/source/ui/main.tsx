import React from 'react';
import {createRoot} from 'react-dom/client';
import Desktop from './app/desktop-shell';
import './app/globals.css';
import './desktop.css';
createRoot(document.getElementById('root')!).render(<Desktop/>);
