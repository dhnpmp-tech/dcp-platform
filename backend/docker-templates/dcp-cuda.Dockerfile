# DCP pre-baked pod image: CUDA runtime + sshd, no ML stack.
# Alias "cuda" -> dcp-compute:cuda. sshd is baked in so the daemon launches
# this with bootstrap_ssh=false and the pod starts in seconds (no apt at launch).
# The renter SSHes into a blank CUDA box and installs whatever they want.
FROM nvidia/cuda:12.4.1-base-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY dcp-pod-entrypoint.sh /usr/local/bin/dcp-pod-entrypoint.sh
RUN chmod +x /usr/local/bin/dcp-pod-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/dcp-pod-entrypoint.sh"]
