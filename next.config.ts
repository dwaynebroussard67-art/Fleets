import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: ["*.e2b.app"],
  devIndicators: false,
  // Auth browser tests use an isolated Next output folder with mock public env.
  distDir: process.env.FLEET_BUILD_DIR || ".next",
};
export default config;
