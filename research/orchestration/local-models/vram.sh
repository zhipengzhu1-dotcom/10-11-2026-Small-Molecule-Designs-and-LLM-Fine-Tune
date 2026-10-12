#!/usr/bin/env bash
# Throwaway (#38): true loaded VRAM per model, as the nvidia-smi memory.used delta, on a server capped at 8 GiB.
cd "$(dirname "$0")"
B=http://127.0.0.1:11435
used() { nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | tr -d ' \r'; }
names() { curl -s $1/api/ps | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>JSON.parse(s).models.forEach(m=>console.log(m.name)))'; }
unload() { local x; for x in $(names $1); do curl -s $1/api/generate -d "{\"model\":\"$x\",\"keep_alive\":0}" >/dev/null; done; sleep 3; }
unload http://127.0.0.1:11434   # the main server holds nothing while we measure
FREE=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | tr -d ' \r')
OVER=$(( (FREE - 8192 - 457) * 1024 * 1024 ))   # Ollama also keeps a 457 MiB minimum free; cap = 8 GiB including it
OLLAMA_HOST=127.0.0.1:11435 OLLAMA_GPU_OVERHEAD=$OVER OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_NUM_PARALLEL=1 ollama serve > vram-server.log 2>&1 &
SRV=$!
until curl -s $B/api/version >/dev/null; do sleep 1; done
echo "model ctx used_delta_MiB ps_size ps_size_vram"
for m in embeddinggemma:300m qwen3-embedding:0.6b qwen3.5:4b gemma3:4b phi4-mini:3.8b qwen2.5:3b-instruct qwen3-vl:4b gemma4:e2b gemma4:e4b granite4.1:8b qwen3.5:9b; do
  for ctx in 2048 16384; do
    unload $B; u0=$(used)
    if [[ $m == *embed* ]]; then curl -s $B/api/embed -d "{\"model\":\"$m\",\"input\":[\"warm up\"],\"keep_alive\":\"60s\",\"options\":{\"num_ctx\":$ctx}}" >/dev/null
    else curl -s $B/api/generate -d "{\"model\":\"$m\",\"prompt\":\"hi\",\"stream\":false,\"keep_alive\":\"60s\",\"options\":{\"num_ctx\":$ctx,\"num_predict\":1}}" >/dev/null; fi
    sleep 2; u1=$(used)
    ps=$(curl -s $B/api/ps | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).models[0]||{};console.log(m.size,m.size_vram,m.context_length)})')
    echo "$m $ctx $((u1-u0)) $ps"
  done
done
unload $B; kill $SRV
grep -E 'msg="gpu memory"' vram-server.log | head -1 | grep -oE 'available="[^"]+"|overhead="[^"]+"'
