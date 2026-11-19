import React from 'react';

export interface LogoProps {
  size?: number;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 32, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`.trim()}
      role="img"
      aria-label="RentFlow logo"
    >
      {/* Solid vibrant Indigo/Blue squircle base */}
      <rect x="0" y="0" width="64" height="64" rx="16" fill="#4F46E5" />

      {/* Minimalist thick white house roof chevron */}
      <path
        d="M15 29L32 15L49 29"
        stroke="#FFFFFF"
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Top wave: thick solid white wavy line */}
      <path
        d="M16 37.5C20.5 33 27.5 33 32 37.5C36.5 42 43.5 42 48 37.5"
        stroke="#FFFFFF"
        strokeWidth="4.6"
        strokeLinecap="round"
      />

      {/* Bottom wave: slightly thinner semi-transparent white parallel wave */}
      <path
        d="M16 46.5C20.5 42 27.5 42 32 46.5C36.5 51 43.5 51 48 46.5"
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default Logo;
