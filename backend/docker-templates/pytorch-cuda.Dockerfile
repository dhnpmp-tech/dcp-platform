FROM pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/opt/dcp/model-cache \
    TRANSFORMERS_CACHE=/opt/dcp/model-cache

WORKDIR /opt/dcp/work

COPY run_payload.py /opt/dcp/bin/run_payload.py
COPY dcp-entrypoint.sh /usr/local/bin/dcp-entrypoint.sh
RUN chmod +x /opt/dcp/bin/run_payload.py /usr/local/bin/dcp-entrypoint.sh

# Expose the conda Python to non-login SSH shells. Interactive pods open SSH, and
# `ssh host cmd` runs a non-login shell that never sources conda's init — so
# `python3`/`pip`/`torch` would appear "not found" even though they're installed.
# /usr/local/bin is on the default PATH everywhere; profile.d covers login shells.
RUN ln -sf /opt/conda/bin/python  /usr/local/bin/python  \
 && ln -sf /opt/conda/bin/python3 /usr/local/bin/python3 \
 && ln -sf /opt/conda/bin/pip     /usr/local/bin/pip     \
 && printf 'export PATH=/opt/conda/bin:$PATH\n' > /etc/profile.d/conda-path.sh

ENTRYPOINT ["/usr/local/bin/dcp-entrypoint.sh"]
