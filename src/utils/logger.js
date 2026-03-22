import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR   = path.resolve(__dirname, '../../logs');
const LOG_FILE  = path.join(LOG_DIR, `bot-${new Date().toISOString().split('T')[0]}.log`);

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// Short timestamp: HH:MM:SS
function ts() {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

const C = {
  info:  '\x1b[36m',
  warn:  '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m',
  dim:   '\x1b[2m',
};

function log(level, msg) {
  const color = C[level] || C.reset;
  const label = level.toUpperCase().padEnd(5);
  console.log(`${C.dim}[${ts()}]${C.reset} ${color}${label}${C.reset} ${msg}`);
  const full = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${full}] [${label}] ${msg}\n`, 'utf8');
}

export const logger = {
  info:  (msg) => log('info',  msg),
  warn:  (msg) => log('warn',  msg),
  error: (msg) => log('error', msg),
};