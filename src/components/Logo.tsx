import React from 'react';

const Logo: React.FC = () => (
  <div className="logo-container">
    <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg" className="logo-svg">
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="70" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7ecbff" />
          <stop offset="1" stopColor="#ffb3c6" />
        </linearGradient>
      </defs>
      <rect x="8" y="18" width="54" height="34" rx="7" fill="url(#logo-gradient)" stroke="#fff" strokeWidth="2.5" />
      <rect x="15" y="26" width="10" height="7" rx="2" fill="#fff" fillOpacity="0.7" />
      <rect x="40" y="38" width="4.5" height="10" rx="2" fill="#fff" fillOpacity="0.9" />
      <rect x="47.5" y="32" width="4.5" height="16" rx="2" fill="#fff" fillOpacity="0.9" />
      <rect x="55" y="43" width="4.5" height="5" rx="2" fill="#fff" fillOpacity="0.9" />
      <rect x="12" y="22.5" width="46" height="4" rx="2" fill="#fff" fillOpacity="0.18" />
    </svg>
  </div>
);

export default Logo;
