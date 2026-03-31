import React from 'react';
import './TitleBar.css';

export const TitleBar: React.FC = () => {
  const handleMinimize = () => {
    (window as any).ipcRenderer.send('window-minimize');
  };

  const handleMaximize = () => {
    (window as any).ipcRenderer.send('window-maximize');
  };

  const handleClose = () => {
    (window as any).ipcRenderer.send('window-close');
  };

  return (
    <div className="title-bar">
      <div className="title-bar__drag-area">
        <div className="title-bar__logo">
          <span className="title-bar__logo-text">DRAGON<span className="highlight">ARENA</span></span>
        </div>
      </div>
      <div className="title-bar__controls">
        <button className="title-bar__button title-bar__button--minimize" onClick={handleMinimize} title="Minimizar">
          <svg width="12" height="12" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6"></rect></svg>
        </button>
        <button className="title-bar__button title-bar__button--maximize" onClick={handleMaximize} title="Maximizar">
          <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M2.5,2.5v7h7v-7H2.5z M9,9H3V3h6V9z"></path></svg>
        </button>
        <button className="title-bar__button title-bar__button--close" onClick={handleClose} title="Fechar">
          <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M10.7,1.3c-0.4-0.4-1-0.4-1.4,0L6,4.6L2.7,1.3c-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4L4.6,6l-3.3,3.3c-0.4,0.4-0.4,1,0,1.4 c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3L6,7.4l3.3,3.3c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c0.4-0.4,0.4-1,0-1.4L7.4,6 l3.3-3.3C11.1,2.3,11.1,1.7,10.7,1.3z"></path></svg>
        </button>
      </div>
    </div>
  );
};
