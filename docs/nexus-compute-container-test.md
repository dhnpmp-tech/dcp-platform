# Nexus test — spin up a complete GPU compute container and do anything in it

**Goal:** prove a renter can rent a full GPU container on DCP and do *whatever they
want* inside it (it's Vast.ai-style — root, the whole GPU, open egress). This
exercises the complete path: launch → SSH/Jupyter → install/download/train/serve →
stop. Test it via **CLI**, **raw API**, and the **web UI** — all three should work.

> ⚠️ STATUS (2026-06-08): Node 2's NVIDIA driver auto-updated and currently
> mismatches (NVML 595.71 vs kernel module 595.58.03), so GPU pods fail at
> attach until the kernel module is reloaded (one `sudo` on Node 2). Everything
> below is the verified flow; run it once Node 2's GPU is back.

## Prereqs
- Funded renter key: `dc1-renter-7007e3da33dfcdbf8afa39af4613f242`
- `export DCP_API_KEY=dc1-renter-7007e3da33dfcdbf8afa39af4613f242`
- `sshpass` for the SSH step (`apt-get install -y sshpass`)

## A) CLI (the SDK)
```bash
# from sdk/python (or `pip install dc1`); --base-url is a GLOBAL arg before `pod`
TOK=$(openssl rand -hex 12)
python3 -m dc1.cli --base-url https://api.dcp.sa pod create --image cuda --duration 30 --token "$TOK"
#   image: pytorch | vllm | cuda | ubuntu  (pre-baked, fast)  OR any docker ref (arbitrary, sshd injected)
#   prints: id, root_password, access_url (Jupyter), ssh_command
python3 -m dc1.cli --base-url https://api.dcp.sa pod list
python3 -m dc1.cli --base-url https://api.dcp.sa pod get  <id>
python3 -m dc1.cli --base-url https://api.dcp.sa pod stop <id>
```

## B) Raw API
```bash
API=https://api.dcp.sa/api; K=$DCP_API_KEY
# create (image optional → defaults to pytorch)
curl -s -X POST "$API/pods" -H "x-renter-key: $K" -H 'content-type: application/json' \
  -d '{"image":"cuda","duration_minutes":30,"params":{"NOTEBOOK_TOKEN":"'"$(openssl rand -hex 12)"'"}}'
# poll until access_url/ssh_command appear, then GET / DELETE
curl -s "$API/pods/<id>" -H "x-renter-key: $K"
curl -s "$API/pods"       -H "x-renter-key: $K"
curl -s -X DELETE "$API/pods/<id>" -H "x-renter-key: $K"
```

## C) Web UI (the v2 console)
`https://dcp.sa/v2/renter/pods` (prod, once merged) — or the branch preview
`https://dc1-platform-git-feat-interactive-pods-dc11.vercel.app/v2/renter/pods`
(needs the `x-vercel-protection-bypass` token + renter key). Pick an Image
(PyTorch / vLLM / CUDA base / Ubuntu / Custom…), set duration + a ≥12-char token,
**LAUNCH GPU POD**, watch it go live, then **Stop**.

## D) DO ANYTHING in the container (the point)
SSH in with the printed password + ssh_command, then run whatever you like:
```bash
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o PreferredAuthentications=password -o PubkeyAuthentication=no \
    -p <sshport> root@api.dcp.sa
# inside the pod — it's yours, root, full RTX 3090:
nvidia-smi                                  # the whole GPU
apt-get update && apt-get install -y <x>    # install anything
pip install vllm transformers datasets      # any python stack
huggingface-cli download <small-model>      # pull a model (open egress)
python -c "import torch; print(torch.cuda.get_device_name(0))"
python train.py                             # train it  (proved: MNIST 9.5%→98.98%)
#   or:  vllm serve <model>                 # serve it
```
**Proven earlier today on a healthy GPU:** 62.6 TFLOPS fp16 in-container; MNIST
trained to 98.98%; a checkpoint saved + reloaded; SSH root + `nvidia-smi` →
RTX 3090; and the renter could `pip install` + download a HF model freely.

## Expected result
A blank GPU container, full root, the entire RTX 3090, open internet — install,
download, train, or serve anything, then tear it down. No DCP inference,
qwen3.6, or Ollama is visible inside the renter's container — those are the
provider's own workloads (paused automatically while a compute pod runs).
