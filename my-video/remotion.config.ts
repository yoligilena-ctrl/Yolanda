/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { existsSync } from "node:fs";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.overrideBundlerConfig(enableTailwind);

// This environment's network policy blocks Remotion's own Chrome Headless
// Shell download (remotion.media), so use the pre-installed Playwright
// Chromium build when present. Falls back to Remotion's default behavior
// (download its own browser) on machines without this path.
const preinstalledHeadlessShell =
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
if (existsSync(preinstalledHeadlessShell)) {
  Config.setBrowserExecutable(preinstalledHeadlessShell);
}
