#!/usr/bin/env bash
# Convenience wrapper: spin up each model on vLLM (or llama.cpp), run bench,
# tear it down, move on. Intended for Node 2 (Tareq's RTX 3090, 24 GB).
#
# Usage:
#   ./run-on-node2.sh                                  # run all from models.yaml
#   ./run-on-node2.sh falcon-h1-arabic-7b allam-7b     # subset
#   SMOKE=1 ./run-on-node2.sh                          # 5-item smoke per eval
#
# Requirements on Node 2:
#   - python3, vllm, llama.cpp (with CUDA), curl, jq, yq
#   - $ANTHROPIC_API_KEY in env if you want judge-LM scoring of rewrites
#   - models pre-pulled to a local cache (HF_HOME or LLAMA_MODELS)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RESULTS="$HERE/results"
mkdir -p "$RESULTS"

PORT=${PORT:-8000}
WORKERS=${WORKERS:-4}
SMOKE_FLAGS=""
if [[ "${SMOKE:-0}" == "1" ]]; then
    SMOKE_FLAGS="--limit-translation 5 --limit-rewrite 5 --limit-classify 5"
fi
JUDGE_FLAGS=""
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    JUDGE_FLAGS="--judge-endpoint https://api.anthropic.com/v1 --judge-model claude-sonnet-4-6 --judge-key $ANTHROPIC_API_KEY"
fi

# Pull model list from yaml
mapfile -t ALL_MODELS < <(yq -r '.models[].name' "$HERE/models.yaml")
PICKED=("$@")
if [[ ${#PICKED[@]} -eq 0 ]]; then PICKED=("${ALL_MODELS[@]}"); fi

wait_for_endpoint() {
    local url="$1" tries=120
    until curl -fsS "$url" >/dev/null 2>&1 || [[ $tries -le 0 ]]; do
        sleep 2; tries=$((tries-1))
    done
    [[ $tries -gt 0 ]]
}

run_one() {
    local name="$1"
    local hf served runner quant
    hf=$(yq -r ".models[] | select(.name == \"$name\") | .hf_id" "$HERE/models.yaml")
    served=$(yq -r ".models[] | select(.name == \"$name\") | .served_name" "$HERE/models.yaml")
    runner=$(yq -r ".models[] | select(.name == \"$name\") | .runner" "$HERE/models.yaml")
    quant=$(yq -r ".models[] | select(.name == \"$name\") | .quant" "$HERE/models.yaml")

    echo "===== $name (hf=$hf served=$served runner=$runner) ====="
    local pid=""
    if [[ "$runner" == "vllm" ]]; then
        python3 -m vllm.entrypoints.openai.api_server \
            --host 127.0.0.1 --port "$PORT" \
            --model "$hf" \
            --quantization awq_marlin \
            --max-model-len 8192 \
            --served-model-name "$served" \
            > "$RESULTS/$name.serve.log" 2>&1 &
        pid=$!
    else
        # llama.cpp path — expects GGUF at $LLAMA_MODELS/<name>.gguf
        local gguf="${LLAMA_MODELS:-/models}/$name.$quant.gguf"
        if [[ ! -f "$gguf" ]]; then
            echo "MISSING $gguf — skipping $name" >&2
            return 0
        fi
        /opt/llama.cpp/llama-server -m "$gguf" \
            --host 127.0.0.1 --port "$PORT" \
            -c 8192 -ngl 999 \
            --api-server-name "$served" \
            > "$RESULTS/$name.serve.log" 2>&1 &
        pid=$!
    fi
    trap "kill $pid 2>/dev/null || true" EXIT

    if ! wait_for_endpoint "http://127.0.0.1:$PORT/v1/models"; then
        echo "FAIL: $name did not come up — see $RESULTS/$name.serve.log" >&2
        kill $pid 2>/dev/null || true
        trap - EXIT
        return 1
    fi

    # Snapshot VRAM for the result bundle
    nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits > "$RESULTS/$name.vram.csv" 2>/dev/null || true

    python3 "$HERE/bench.py" \
        --endpoint "http://127.0.0.1:$PORT/v1" \
        --model "$served" \
        --out "$RESULTS/$name.json" \
        --workers "$WORKERS" \
        $SMOKE_FLAGS \
        $JUDGE_FLAGS

    kill $pid 2>/dev/null || true
    trap - EXIT
    sleep 5
}

for m in "${PICKED[@]}"; do
    run_one "$m" || echo "WARN: $m failed; continuing"
done

python3 "$HERE/aggregate_results.py" "$RESULTS" --out "$RESULTS/_summary.md"
cat "$RESULTS/_summary.md"
