import React from 'react';

interface RentFlowLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export const RentFlowLogo: React.FC<RentFlowLogoProps> = ({
  className = '',
  size = 32,
  showText = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Soft rounded container */}
        <rect width="48" height="48" rx="14" fill="#4F46E5" />

        {/* Minimalist Geometric House Silhouette */}
        <path
          d="M24 11L13 20V34C13 35.1 13.9 36 15 36H33C34.1 36 35 35.1 35 34V20L24 11Z"
          fill="white"
          fillOpacity="0.18"
        />

        {/* Roofline Stroke */}
        <path
          d="M12 21L24 11.5L36 21"
          stroke="white"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Flow Wave / S-curve symbolizing Rent & Cash Flow through the property */}
        <path
          d="M17 26.5C19.5 24 22 24.5 24.5 26.5C27 28.5 29.5 29 32 26.5"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M19 31C21 29.5 23 29.8 24.5 31C26.2 32.2 28 32.5 30 31"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.75"
        />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-bold text-base tracking-tight text-[var(--text-primary)]">
            RentFlow
          </span>
          <span className="text-[10px] text-[var(--text-secondary)] font-mono tracking-wider uppercase mt-0.5">
            Property OS
          </span>
        </div>
      )}
    </div>
  );
};
