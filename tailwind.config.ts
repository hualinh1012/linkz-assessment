import type { Config } from "tailwindcss";

// Shared design system — also intended to be reused by the Keycloakify login theme
// (see TSD 1.5 §3.7) so the login page and the app stay visually unified.
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/keycloak-theme/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
