import React from 'react';

export function AtomXLogo({ 
  className = "", 
  size = 40,
  isCollapsed = false,
  showText = true
}: { 
  className?: string, 
  textClassName?: string,
  showText?: boolean,
  size?: number,
  isCollapsed?: boolean
}) {
  const src = isCollapsed 
    ? "/sidebar-collapsed.svg" 
    : (showText ? "/sidebar-expanded.svg" : "/favicon-whale.svg");

  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={src}
        alt="AtomX Logo"
        className={`w-auto h-auto ${!isCollapsed && !showText ? 'rounded-full' : ''}`}
        style={{ height: `${size}px` }}
      />
    </div>
  );
}
