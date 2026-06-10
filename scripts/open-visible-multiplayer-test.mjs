import { spawn } from "node:child_process";

const url = process.env.MULTIPLAYER_TEST_URL || "http://localhost:3000/?uiTest=1";
const platform = process.platform;

const command =
  platform === "darwin"
    ? "open"
    : platform === "win32"
      ? "cmd"
      : "xdg-open";
const args =
  platform === "win32"
    ? ["/c", "start", "", url]
    : [url];

const child = spawn(command, args, { stdio: "inherit" });
child.on("exit", (code) => {
  if (code && code !== 0) {
    console.error(`Could not open ${url}. Open it manually in your browser.`);
    process.exit(code);
  }
  console.log(`Opened ${url}`);
});
