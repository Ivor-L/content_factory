import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.next_cache*/**",
      "**/out/**",
      "**/build/**",
      "public/uploads/**",
      "workflows/**",
      "public/extensions/**",
      "nextide0323/**",
      "nextide-site/**",
      "digital_human_miniapp/**",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
