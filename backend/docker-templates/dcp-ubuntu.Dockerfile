# DCP pre-baked pod image: plain Ubuntu + sshd, no GPU stack.
# Alias "ubuntu" -> dcp-compute:ubuntu. sshd is baked in so the daemon launches
# this with bootstrap_ssh=false and the pod starts in seconds (no apt at launch).
# A blank Ubuntu box the renter SSHes into and uses however they want.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY dcp-pod-entrypoint.sh /usr/local/bin/dcp-pod-entrypoint.sh
RUN chmod +x /usr/local/bin/dcp-pod-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/dcp-pod-entrypoint.sh"]
