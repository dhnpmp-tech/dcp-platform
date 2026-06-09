# Renter Quickstart — Launch a GPU Pod

A DCP **pod** is a renter-launched GPU container: you get a blank GPU box, SSH
into it, and run anything — train a model, serve inference, profile a kernel.
Every pod is reached over **SSH**; Jupyter is a bonus on the `pytorch` image
(surfaced as `access_url`).

You launch a pod three ways — the **CLI**, the **web dashboard**, or the **raw
API**. All three drive the same endpoint: `POST /api/pods`.

---

## Pick an image

Every pod boots from an image. You pass it as the `image` field.

| `image` you pass | What you get | SSH | Jupyter |
|---|---|---|---|
| `pytorch` *(default)* | Pre-baked PyTorch + CUDA, sshd + Jupyter baked in → fast start | yes | yes |
| `vllm` | Pre-baked vLLM serving image | yes | no |
| `cuda` | Pre-baked CUDA base | yes | no |
| `ubuntu` | Pre-baked plain Ubuntu | yes | no |
| any Docker ref<br>e.g. `tensorflow/tensorflow:latest-gpu`, `ghcr.io/org/repo:tag` | Your arbitrary image — the daemon injects an sshd at boot | yes | only if the image ships it |

- **Friendly aliases** (`pytorch`, `vllm`, `cuda`, `ubuntu`) map to pre-baked
  `dcp-compute:<alias>` images. sshd (and, for `pytorch`, Jupyter) is already
  baked in, so they start fast.
- **Any other valid Docker image reference** is allowed. The daemon injects an
  SSH daemon at boot so you can still get in.
- Omit `image` and you get `pytorch`.

A pod requires a Docker + CUDA-capable provider with at least 8 GiB VRAM. If you
don't pin a provider, the backend auto-picks the freshest, least-busy capable
one.

---

## (a) CLI — `dcp pod`

```bash
# Install the SDK (ships the `dcp` CLI) — stdlib-only, served as a tarball
curl -sL https://api.dcp.sa/installers/dc1-sdk.tar.gz | tar xz
dcp() { python3 -m dc1.cli "$@"; }   # or add the extracted dir to PATH

# Auth: pass --api-key, or export one of these
export DCP_API_KEY="dc1-renter-…"      # (DC1_RENTER_KEY also works)
```

Launch a PyTorch pod (default image) and wait until it's reachable:

```bash
dcp pod create \
  --duration 60 \
  --token "$(python3 -c 'import uuid;print(uuid.uuid4().hex)')"
```

Pick a different image — an alias or any Docker ref:

```bash
# Pre-baked vLLM image, pinned to a specific provider
dcp pod create --duration 120 --token "$(uuidgen)" --image vllm --provider 42

# Arbitrary image — daemon injects sshd
dcp pod create --duration 60 --token "$(uuidgen)" --image tensorflow/tensorflow:latest-gpu
```

`dcp pod create` prints the pod id, Jupyter token, root password, `access_url`,
and a ready-to-paste `ssh_command`. It polls until the pod is ready (override
with `--timeout <seconds>` or `--no-wait`).

Manage pods:

```bash
dcp pod list                 # recent pods
dcp pod get  <pod_id>         # status + access_url + ssh_command + root_password
dcp pod stop <pod_id>         # tear it down
```

> Flags: `--duration` (minutes, required) · `--token` (Jupyter token, required,
> ≥16 chars) · `--image` (alias or Docker ref, default `pytorch`) · `--provider`
> (pin a provider id) · `--base-url` (default `https://api.dcp.sa`).

---

## (b) Web — `/renter/pods`

1. Open **`https://dcp.sa/renter/pods`** (GPU Pods in the renter sidebar).
2. Pick an **image**: PyTorch, vLLM, CUDA base, Ubuntu, or **Custom…** (type any
   Docker image reference).
3. Set **duration** (minutes) and, optionally, pin a **provider**.
4. Enter a strong **notebook token** (≥16 characters — weak/default tokens are
   rejected).
5. **Launch.** The card auto-refreshes; once the pod is running it shows the
   `access_url` (Jupyter, on `pytorch`) and the `ssh_command`. Stop it from the
   same card.

The page calls `POST /api/pods` with exactly the fields below.

---

## (c) Raw API — `POST /api/pods`

Authenticate with your renter key via the `x-renter-key` header (or `?key=` /
`renter_key` query param).

### Launch

```bash
TOKEN=$(python3 -c 'import uuid;print(uuid.uuid4().hex)')

curl -s -X POST https://api.dcp.sa/api/pods \
  -H "x-renter-key: dc1-renter-…" \
  -H 'content-type: application/json' \
  -d "{
        \"image\": \"pytorch\",
        \"duration_minutes\": 60,
        \"params\": { \"NOTEBOOK_TOKEN\": \"$TOKEN\" }
      }"
```

Body fields:

| Field | Required | Notes |
|---|---|---|
| `image` | no | Alias (`pytorch`\|`vllm`\|`cuda`\|`ubuntu`) or any Docker ref. Default `pytorch`. |
| `duration_minutes` | no | 5–1440. Default 60. |
| `provider_id` | no | Pin to a specific provider. Auto-picked if omitted. |
| `params.NOTEBOOK_TOKEN` | no | Jupyter token (≥16 chars, non-default). Auto-generated if omitted. |

Response (`201`):

```json
{
  "id": "pod-1733...-a1b2c3",
  "status": "starting",
  "provider_id": 42,
  "root_password": "…",
  "jupyter_token": "…"
}
```

Examples for the other two image cases:

```bash
# Pre-baked vLLM alias
-d '{ "image": "vllm", "duration_minutes": 120 }'

# Arbitrary image — daemon injects sshd
-d '{ "image": "ghcr.io/org/repo:tag", "duration_minutes": 60 }'
```

### Poll until ready

The pod boots asynchronously. Poll `GET /api/pods/:id` until `access_url` /
`ssh_command` appear (status `running`):

```bash
curl -s https://api.dcp.sa/api/pods/<pod_id> -H "x-renter-key: dc1-renter-…"
# { "id":"pod-…", "status":"running",
#   "access_url":"http://api.dcp.sa:4100x/?token=…",
#   "ssh_command":"ssh -p 4200x root@api.dcp.sa" }
```

### List / stop

```bash
curl -s    https://api.dcp.sa/api/pods            -H "x-renter-key: dc1-renter-…"   # { "pods": [...] }
curl -s -X DELETE https://api.dcp.sa/api/pods/<pod_id> -H "x-renter-key: dc1-renter-…"   # { "id":"pod-…","status":"stopped" }
```

---

## SSH in

Use the `ssh_command` from `get` (or the CLI output) and the `root_password`
from `create`:

```bash
ssh -p 4200x root@api.dcp.sa        # paste the ssh_command verbatim
# password: the root_password from create
nvidia-smi                           # confirm the GPU is visible
```

On the `pytorch` image you can also open the `access_url` in a browser for
Jupyter (the token is already baked into the URL).

---

## Tiny example — download a HF model + train

Once you're SSHed into a `pytorch` pod, everything is already there (PyTorch +
CUDA). Pull a model from the Hugging Face Hub and run a quick fine-tune step:

```bash
pip install -q "transformers>=4.44" datasets accelerate

python3 - <<'PY'
import torch
from transformers import (AutoModelForSequenceClassification, AutoTokenizer,
                          TrainingArguments, Trainer)
from datasets import load_dataset

assert torch.cuda.is_available(), "no GPU?!"
print("GPU:", torch.cuda.get_device_name(0))

model_id = "distilbert-base-uncased"          # downloaded from the HF Hub
tok = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForSequenceClassification.from_pretrained(model_id, num_labels=2)

ds = load_dataset("imdb", split="train[:2%]").train_test_split(test_size=0.2)
enc = ds.map(lambda b: tok(b["text"], truncation=True, padding="max_length",
                           max_length=128), batched=True)

trainer = Trainer(
    model=model,
    args=TrainingArguments(output_dir="out", per_device_train_batch_size=16,
                           num_train_epochs=1, fp16=True, report_to="none"),
    train_dataset=enc["train"],
    eval_dataset=enc["test"],
)
trainer.train()
trainer.save_model("out/distilbert-imdb")     # persists inside the pod
print("done — model saved to out/distilbert-imdb")
PY
```

When you're finished, free the GPU:

```bash
dcp pod stop <pod_id>        # or DELETE /api/pods/<pod_id>
```

---

## See also

- [`interactive-pods-nexus-test.md`](interactive-pods-nexus-test.md) — end-to-end
  verification runbook (create → reach → SSH → teardown).
