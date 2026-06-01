import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { validateProductionApiUrl } from "./validate-production-env.mjs";

const outputPath = process.argv[2] || "build/nginx/default.conf";
const template = readFileSync("nginx.conf.template", "utf8");
const { origin } = validateProductionApiUrl();
const rendered = template.replaceAll("__VASTRABOOK_API_ORIGIN__", origin);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered);
console.log(`Rendered Nginx config for API origin ${origin} at ${outputPath}.`);
