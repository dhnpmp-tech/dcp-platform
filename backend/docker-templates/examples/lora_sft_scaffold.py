#!/usr/bin/env python3
"""Tiny offline LoRA SFT scaffold check.

This does not download a base model or claim to train a customer adapter. It
proves the image has torch + peft available and can construct the fixed recipe
objects the managed LoRA MVP will later use with a mounted dataset.
"""

from __future__ import annotations

import json
import os

import torch
from peft import LoraConfig, TaskType


def main() -> int:
    rank = int(os.getenv("ADAPTER_RANK", "16"))
    base_model = os.getenv("BASE_MODEL", "mistralai/Mistral-7B-Instruct-v0.2")
    config = LoraConfig(
        r=rank,
        lora_alpha=rank * 2,
        target_modules=["q_proj", "v_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
    )
    payload = {
        "template": "lora-sft-scaffold",
        "status": "ready_for_dataset",
        "base_model": base_model,
        "adapter_rank": config.r,
        "lora_alpha": config.lora_alpha,
        "target_modules": sorted(config.target_modules),
        "cuda_available": bool(torch.cuda.is_available()),
        "gpu_count": int(torch.cuda.device_count()) if torch.cuda.is_available() else 0,
    }
    print("DC1_RESULT_JSON:" + json.dumps(payload, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
