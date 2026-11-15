// Writes public/env.js from the MOVIQ_API_URL environment variable before a production build.
// Example (Vercel project env var): MOVIQ_API_URL=https://moviq-api.onrender.com/api
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'public', 'env.js');
const raw = (process.env.MOVIQ_API_URL || '').trim().replace(/\/+$/, '');

if (!raw) {
  console.warn('[write-env] MOVIQ_API_URL is not set; the app will call http://localhost:5000/api.');
  process.exit(0);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error(`[write-env] MOVIQ_API_URL is not a valid URL: ${raw}`);
  process.exit(1);
}
if (!/^https?:$/.test(url.protocol)) {
  console.error('[write-env] MOVIQ_API_URL must start with https:// (or http:// for local testing)');
  process.exit(1);
}
const api = url.pathname.endsWith('/api') ? url.href.replace(/\/+$/, '') : `${url.origin}${url.pathname.replace(/\/+$/, '')}/api`;

fs.writeFileSync(target, `// Generated at build time by scripts/write-env.mjs\nwindow.MOVIQ_API = ${JSON.stringify(api)};\n`);
console.log(`[write-env] API URL set to ${api}`);
