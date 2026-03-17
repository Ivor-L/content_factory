import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "public/uploads/**",
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
