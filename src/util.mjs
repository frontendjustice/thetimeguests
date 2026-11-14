import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

export const sha1 = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

export function run(cmd, args, { input, quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    if (input) { p.stdin.end(input); }
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited ${code}\n${err.split('\n').slice(-15).join('\n')}`));
    });
    void quiet;
  });
}

export const ffmpeg = args => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

export async function duration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(out.trim());
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const ensureDir = d => fs.mkdirSync(d, { recursive: true });
export const log = (...a) => console.log('›', ...a);
export const warn = (...a) => console.warn('⚠', ...a);
