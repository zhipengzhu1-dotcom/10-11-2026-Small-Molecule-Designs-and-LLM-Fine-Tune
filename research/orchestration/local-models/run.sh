#!/usr/bin/env bash
# Throwaway (#38): one capped Ollama server on :11435, then the embedder and judge tests against it.
cd "$(dirname "$0")"
B=http://127.0.0.1:11435
FREE=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | tr -d ' \r')
OVER=$(( (FREE - 8192) * 1024 * 1024 ))
echo "ollama $(ollama --version 2>/dev/null | tail -1) free=${FREE}MiB overhead=${OVER}B" > capped-server.env
OLLAMA_HOST=127.0.0.1:11435 OLLAMA_GPU_OVERHEAD=$OVER OLLAMA_DEBUG=1 OLLAMA_MAX_LOADED_MODELS=2 OLLAMA_NUM_PARALLEL=1 ollama serve > capped-server.log 2>&1 &
SRV=$!
until curl -s $B/api/version >/dev/null; do sleep 1; done
unload() { local x; for x in $(curl -s $B/api/ps | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>JSON.parse(s).models.forEach(m=>console.log(m.name)))'); do curl -s $B/api/generate -d "{\"model\":\"$x\",\"keep_alive\":0}" >/dev/null; done; sleep 2; }
if [ -z "$MODELS" ]; then echo "== embed $(date +%T)"; node embed.mjs decisions.tsv embed.json $B > embed.txt 2>&1; echo "embed done"; fi
for m in ${MODELS:-qwen3.5:4b gemma3:4b phi4-mini:3.8b qwen2.5:3b-instruct qwen3-vl:4b qwen3.5:9b}; do
  unload; echo "== $m $(date +%T)"; node judge.mjs decisions.tsv $B $m "judge-${m//[:.]/_}.json" 2>&1 | tee -a judge.txt
done
unload; kill $SRV; echo "ALL DONE $(date +%T)"
