import React from 'react';

export interface LogoProps {
  size?: number;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 32, className = '' }) => {
  return (
    <img
      src="/assets/logo.png"
      alt="RentFlow logo"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-lg object-contain ${className}`.trim()}
    />
  );
};

export default Logo;
