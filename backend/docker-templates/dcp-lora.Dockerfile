# DCP fat pod image: PyTorch/CUDA + Jupyter/SSH + LoRA/QLoRA/vLLM toolchain.
#
# Alias target: lora -> dcp-compute:lora
#
# This image is intentionally provider-local. Build it on a GPU provider host
# with backend/docker-templates/build-pod-images.sh, then verify with
# verify-lora-pod-image.sh. Do not treat a laptop or VPS build as product proof:
# the acceptance gate is a fresh provider pod importing the stack quickly
# without pip installing at launch time.
FROM pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/opt/dcp/model-cache \
    TRANSFORMERS_CACHE=/opt/dcp/model-cache \
    HF_HUB_ENABLE_HF_TRANSFER=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-server \
      ca-certificates \
      curl \
      git \
      build-essential \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/dcp
COPY requirements-lora.txt /opt/dcp/requirements-lora.txt
RUN python -m pip install --no-cache-dir --upgrade pip setuptools wheel \
  && python -m pip install --no-cache-dir -r /opt/dcp/requirements-lora.txt

# Optional Tinker cookbook hook. Keep default off until licensing/access and the
# exact source are approved; the product copy must not claim Tinker API
# compatibility merely because this hook exists.
ARG TINKER_COOKBOOK_GIT_URL=""
RUN if [ -n "${TINKER_COOKBOOK_GIT_URL}" ]; then \
      git clone --depth 1 "${TINKER_COOKBOOK_GIT_URL}" /opt/dcp/tinker-cookbook; \
    fi

WORKDIR /workspace
RUN mkdir -p /workspace /opt/dcp/examples /opt/dcp/model-cache

COPY examples/lora_stack_smoke.py /opt/dcp/examples/lora_stack_smoke.py
COPY examples/lora_sft_scaffold.py /opt/dcp/examples/lora_sft_scaffold.py
COPY dcp-pod-entrypoint.sh /usr/local/bin/dcp-pod-entrypoint.sh
RUN chmod +x \
      /usr/local/bin/dcp-pod-entrypoint.sh \
      /opt/dcp/examples/lora_stack_smoke.py \
      /opt/dcp/examples/lora_sft_scaffold.py

ENTRYPOINT ["/usr/local/bin/dcp-pod-entrypoint.sh"]
