# DCP pre-baked pod image: vLLM serving stack + sshd.
# Alias "vllm" -> dcp-compute:vllm. sshd is baked in so the daemon launches
# this with bootstrap_ssh=false and the pod starts in seconds (no apt at launch).
#
# IMPORTANT: this does NOT auto-start the vLLM OpenAI server. A pod is a blank
# GPU box — the renter SSHes in and runs `vllm serve <model> ...` themselves.
# The base image is large; that is expected and fine for a pre-baked image.
FROM vllm/vllm-openai:latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Override the base image's vLLM-serving entrypoint with our sshd-only one.
COPY dcp-pod-entrypoint.sh /usr/local/bin/dcp-pod-entrypoint.sh
RUN chmod +x /usr/local/bin/dcp-pod-entrypoint.sh

# Clear the base image's CMD so its default model args are not appended to our
# entrypoint, and replace its serving ENTRYPOINT.
ENTRYPOINT ["/usr/local/bin/dcp-pod-entrypoint.sh"]
CMD []
