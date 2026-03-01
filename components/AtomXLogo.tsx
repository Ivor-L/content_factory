import React from 'react';
import Image from 'next/image';

export function AtomXLogo({ 
  className = "", 
  size = 40
}: { 
  className?: string, 
  textClassName?: string,
  showText?: boolean,
  size?: number
}) {
  return (
    <div className={`flex items-center ${className}`}>
      <Image
        src="/logo.svg"
        alt="AtomX Logo"
        width={0}
        height={0}
        sizes="100vw"
        style={{ width: 'auto', height: `${size}px` }}
        priority
      />
    </div>
  );
}
