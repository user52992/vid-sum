/** @type {import("prettier").Config} */

const config = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./app/globals.css",
};

export default config;
