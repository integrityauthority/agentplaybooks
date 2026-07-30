// OpenNext configuration for Cloudflare Pages
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig({});

// Next.js standalone tracing resolves the Node/CommonJS branch of the optional
// MSSQL dependency tree. Use the same condition while bundling the Worker so
// OpenNext does not select files absent from the traced package copy. The MSSQL
// branch is never executed on Cloudflare.
config.cloudflare = {
  ...config.cloudflare,
  useWorkerdCondition: false,
};

export default config;
