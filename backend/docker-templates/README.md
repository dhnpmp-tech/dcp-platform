# DCP Provider Pod Images

These Dockerfiles define the provider-local `dcp-compute:<alias>` images used by
the renter pod launcher. They are not batch-job worker images.

## Aliases

| Alias | Tag | Purpose |
| --- | --- | --- |
| `pytorch` | `dcp-compute:pytorch` | Default CUDA/PyTorch pod with SSH and Jupyter. |
| `cuda` | `dcp-compute:cuda` | Blank CUDA runtime with SSH. |
| `ubuntu` | `dcp-compute:ubuntu` | Blank Ubuntu runtime with SSH. |
| `vllm` | `dcp-compute:vllm` | vLLM stack with SSH; renter starts the server manually. |
| `lora` | `dcp-compute:lora` | Fat LoRA/QLoRA/vLLM image with examples and smoke proof. |

## CI-Safe Contract Check

Run this anywhere, including CI:

```bash
npm run pod-images:verify-contracts
```

This checks `pod-image-contracts.json` against:

- `build-pod-images.sh`
- `backend/src/routes/pods.js` image alias mapping
- Dockerfile entrypoint wiring
- LoRA requirements, examples, and smoke-script references

It does not build Docker images and does not prove GPU runtime behavior.

## Provider-Host Proof

Run this only on a GPU provider host with Docker and NVIDIA Container Toolkit:

```bash
cd /root/dc1-platform/backend/docker-templates
DCP_POD_IMAGE_TARGETS=lora ./build-pod-images.sh
./verify-lora-pod-image.sh
```

The product gate for the LoRA pod image is a fresh GPU container importing the
LoRA stack quickly without pip installing during pod launch.
