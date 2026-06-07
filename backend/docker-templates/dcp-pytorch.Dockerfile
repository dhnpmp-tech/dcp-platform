# DCP pre-baked pod image: PyTorch + CUDA + Jupyter + sshd (the DEFAULT pod).
# Alias "pytorch" — and the default when no image is given — maps to
# dcp-compute:pytorch. sshd AND jupyterlab are baked in, so the daemon launches
# this with bootstrap_ssh=false and the pod comes up in seconds (no apt/pip at
# launch). This is the ONLY pre-baked image that ships Jupyter (surfaced via
# access_url); cuda/ubuntu/vllm are SSH-only.
#
# NOTE: do NOT build the default pod image from pytorch-cuda.Dockerfile — that is
# the stale BATCH-job template (ENTRYPOINT runs run_payload.py and exits without
# a payload), which has no sshd/Jupyter and would make every default pod fail.
FROM pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-server \
      ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir jupyterlab

COPY dcp-pod-entrypoint.sh /usr/local/bin/dcp-pod-entrypoint.sh
RUN chmod +x /usr/local/bin/dcp-pod-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/dcp-pod-entrypoint.sh"]
