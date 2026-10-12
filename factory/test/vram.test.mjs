import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseArgs, notInstalled, verdict, CAP_MIB } = await import('../../scripts/vram.mjs').catch(() => ({}));

test('arguments: models, context lengths and host, with the defaults', () => {
  assert.deepEqual(parseArgs(['qwen3.5:4b', 'gemma4:e4b']), { models: ['qwen3.5:4b', 'gemma4:e4b'], ctxs: [2048, 16384], host: 'http://127.0.0.1:11434' });
  assert.deepEqual(parseArgs(['--ctx', '4096', 'phi4-mini', '--host', 'http://127.0.0.1:11435']), { models: ['phi4-mini'], ctxs: [4096], host: 'http://127.0.0.1:11435' });
  assert.deepEqual(parseArgs(['--ctx', '2048,8192', 'x']).ctxs, [2048, 8192]);
  assert.throws(() => parseArgs([]), /name at least one model/);
  assert.throws(() => parseArgs(['--ctx', 'big', 'x']), /--ctx/);
});

test('a model that is not installed is named before anything loads', () => {
  // #38: `ollama pull ... | tail -1` hid a 412 for two models, which surfaced only as "not found" a run later.
  const tags = { models: [{ name: 'qwen3.5:4b' }, { name: 'phi4-mini:latest' }] };
  assert.deepEqual(notInstalled(['qwen3.5:4b', 'phi4-mini', 'gemma3:4b'], tags), ['gemma3:4b']);
  assert.deepEqual(notInstalled(['phi4-mini:latest'], tags), []);
});

test('the verdict uses the nvidia-smi delta against 8 GiB, not what Ollama reports', () => {
  assert.equal(CAP_MIB, 8192);
  // gemma4:e4b at 2k: /api/ps said 255 MB, nvidia-smi rose 4,950 MiB.
  assert.deepEqual(verdict({ deltaMiB: 4950, size: 255055625, sizeVram: 255055625 }), { fits: true, onGpu: true, why: 'fits: 4950 of 8192 MiB' });
  // granite4.1:8b at 16k reached 8,161 MiB: inside the cap, with 31 MiB to spare.
  assert.equal(verdict({ deltaMiB: 8161, size: 1, sizeVram: 1 }).fits, true);
  assert.deepEqual(verdict({ deltaMiB: 8300, size: 1, sizeVram: 1 }), { fits: false, onGpu: true, why: 'over: 8300 of 8192 MiB' });
  // qwen3.5:9b on Ollama 0.24 under the capped server: part of it ran on the CPU.
  assert.deepEqual(verdict({ deltaMiB: 6000, size: 8748981184, sizeVram: 6261420032 }), { fits: false, onGpu: false, why: 'split: 2372 MiB of the model is on the CPU' });
});
