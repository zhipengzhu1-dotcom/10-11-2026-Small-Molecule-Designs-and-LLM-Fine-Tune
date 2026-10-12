#!/usr/bin/env node
// Measures how much GPU memory an Ollama model really takes, against the 8 GiB cap (the RTX 5060
// budget every run must fit). Loads each model alone and reads the rise in nvidia-smi's memory.used.
// Ollama's own /api/ps size_vram is not used for the verdict: it reads 0.4 to 1.6 GiB low, and about
// 0.25 GB for gemma4 models that take 3 to 5 GiB (issue #38).
//
//   node scripts/vram.mjs <model>... [--ctx 2048,16384] [--host http://127.0.0.1:11434]
//
// Unloads every model on that Ollama server first. Prints one tab-separated line per model and
// context, and exits 1 when a model is missing, over the cap, or partly on the CPU.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CAP_MIB = 8192;
const MIB = 1024 * 1024;

export function parseArgs(argv) {
  const out = { models: [], ctxs: [2048, 16384], host: 'http://127.0.0.1:11434' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--host') out.host = argv[++i];
    else if (argv[i] === '--ctx') {
      out.ctxs = String(argv[++i]).split(',').map(Number);
      if (out.ctxs.some((c) => !Number.isInteger(c) || c <= 0)) throw new Error('--ctx takes context lengths such as 2048,16384');
    } else out.models.push(argv[i]);
  }
  if (!out.models.length) throw new Error('name at least one model, e.g. node scripts/vram.mjs qwen3.5:4b');
  return out;
}

// Models missing from GET /api/tags. A name without a tag means :latest, as in `ollama pull`.
export function notInstalled(models, tags) {
  const have = new Set(tags.models.map((m) => m.name));
  return models.filter((m) => !have.has(m.includes(':') ? m : `${m}:latest`));
}

// deltaMiB: the nvidia-smi rise. size, sizeVram: /api/ps, used only to see whether part of the
// model was placed on the CPU.
export function verdict({ deltaMiB, size, sizeVram }, cap = CAP_MIB) {
  if (sizeVram < size) return { fits: false, onGpu: false, why: `split: ${Math.round((size - sizeVram) / MIB)} MiB of the model is on the CPU` };
  return deltaMiB <= cap
    ? { fits: true, onGpu: true, why: `fits: ${deltaMiB} of ${cap} MiB` }
    : { fits: false, onGpu: true, why: `over: ${deltaMiB} of ${cap} MiB` };
}

const usedMiB = () => Number(execFileSync('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'], { encoding: 'utf8' }).split(/\r?\n/)[0]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(host, path, body) {
  const res = await fetch(`${host}${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : {});
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(`${path}: ${j.error ?? res.status}`);
  return j;
}

async function unloadAll(host) {
  for (const m of (await call(host, '/api/ps')).models) await call(host, '/api/generate', { model: m.name, keep_alive: 0 });
  await sleep(3000);
}

async function measure(host, model, ctx) {
  await unloadAll(host);
  const before = usedMiB();
  const caps = (await call(host, '/api/show', { model })).capabilities ?? [];
  const options = { num_ctx: ctx, num_predict: 1 };
  if (caps.includes('embedding')) await call(host, '/api/embed', { model, input: ['warm up'], keep_alive: '60s', options });
  else await call(host, '/api/generate', { model, prompt: 'hi', stream: false, keep_alive: '60s', options });
  await sleep(2000);
  const deltaMiB = usedMiB() - before;
  const ps = (await call(host, '/api/ps')).models.find((m) => m.name === model || m.name === `${model}:latest`);
  return { deltaMiB, size: ps.size, sizeVram: ps.size_vram, ctxLoaded: ps.context_length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`vram: ${e.message}`); process.exit(2); }
  const missing = notInstalled(args.models, await call(args.host, '/api/tags'));
  if (missing.length) {
    console.error(`vram: not installed: ${missing.join(', ')}. Pull them and read the pull's last line for an error.`);
    process.exit(1);
  }
  console.log(['model', 'ctx', 'ctx_loaded', 'delta_mib', 'ps_size_vram_mib', 'verdict'].join('\t'));
  let bad = 0;
  for (const model of args.models) {
    for (const ctx of args.ctxs) {
      const m = await measure(args.host, model, ctx);
      const v = verdict(m);
      if (!v.fits) bad++;
      console.log([model, ctx, m.ctxLoaded, m.deltaMiB, Math.round(m.sizeVram / MIB), v.why].join('\t'));
    }
  }
  await unloadAll(args.host);
  process.exit(bad ? 1 : 0);
}
