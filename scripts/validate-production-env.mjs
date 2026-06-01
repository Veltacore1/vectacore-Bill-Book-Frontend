import { fileURLToPath } from "node:url";

const apiUrl = (process.env.VITE_API_URL || "").trim();

function fail(message) {
  console.error(`Production environment validation failed: ${message}`);
  process.exit(1);
}

export function validateProductionApiUrl() {
  if (!apiUrl) {
    fail("VITE_API_URL is required for production frontend builds.");
  }

  let parsed;
  try {
    parsed = new URL(apiUrl);
  } catch {
    fail("VITE_API_URL must be an absolute URL.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
  if (localHosts.has(parsed.hostname)) {
    fail("VITE_API_URL must not point to localhost in production frontend builds.");
  }

  if (parsed.protocol !== "https:") {
    fail("VITE_API_URL must use HTTPS in production frontend builds.");
  }

  return parsed;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const parsed = validateProductionApiUrl();
  console.log(`Production API URL validated for ${parsed.origin}.`);
}
