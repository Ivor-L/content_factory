import { ImageResponse } from 'next/og';

// Image metadata
export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      // ImageResponse JSX element
      <div
        style={{
          background: 'transparent',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Folder icon"
        >
          <defs>
            <linearGradient id="bgGradient" x1="0" y1="32" x2="0" y2="480" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#FFF9EF" />
              <stop offset="1" stopColor="#FFEFD7" />
            </linearGradient>
            <linearGradient id="tabGradient" x1="0" y1="160" x2="0" y2="256" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#FFD27D" />
              <stop offset="1" stopColor="#FFBE5A" />
            </linearGradient>
            <linearGradient id="folderGradient" x1="0" y1="208" x2="0" y2="448" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#FFCA65" />
              <stop offset="1" stopColor="#F4A53C" />
            </linearGradient>
            <linearGradient id="folderHighlight" x1="0" y1="208" x2="0" y2="448" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#FFE3A6" stopOpacity="0.9" />
              <stop offset="1" stopColor="#FFCF77" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <rect x="32" y="32" width="448" height="448" rx="104" fill="url(#bgGradient)" />
          <path
            d="M76 176c0-22.1 17.9-40 40-40h112.9c14.5 0 28.3 6.7 37.4 18l18.5 23h211.2c22.1 0 40 17.9 40 40v64H76V176z"
            fill="url(#tabGradient)"
          />
          <path
            d="M52 208h408c26.5 0 48 21.5 48 48v172c0 26.5-21.5 48-48 48H100c-26.5 0-48-21.5-48-48V208z"
            fill="url(#folderGradient)"
          />
          <path
            d="M68 224h376c18.8 0 34.4 13.9 36.9 32.5l-18.4 132c-2.4 17.4-17.2 30.5-34.8 30.5H120.3c-17.6 0-32.3-13.1-34.8-30.5l-17.5-125.4C65.8 249 66 236 68 224z"
            fill="url(#folderHighlight)"
          />
          <path
            d="M52 208h408c26.5 0 48 21.5 48 48v172c0 26.5-21.5 48-48 48H100c-26.5 0-48-21.5-48-48V208z"
            stroke="#C9771C"
            strokeWidth="20"
            strokeLinejoin="round"
            fill="none"
            opacity="0.35"
          />
        </svg>
      </div>
    ),
    // ImageResponse options
    {
      ...size,
    }
  );
}
