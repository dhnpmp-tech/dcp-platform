#!/usr/bin/env python3
"""Provider-side smoke test for the DCP LoRA pod image.

The acceptance gate is intentionally simple: a fresh container must import the
LoRA stack without running pip at pod launch time. The script emits a
DC1_RESULT_JSON marker so provider logs and future pod-smoke jobs can parse it.
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
import time


MODULES = [
    ("torch", "torch"),
    ("transformers", "transformers"),
    ("peft", "peft"),
    ("accelerate", "accelerate"),
    ("datasets", "datasets"),
    ("bitsandbytes", "bitsandbytes"),
    ("safetensors", "safetensors"),
    ("trl", "trl"),
    ("vllm", "vllm"),
]


def _version(module: object) -> str | None:
    return getattr(module, "__version__", None)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-import-seconds", type=float, default=5.0)
    parser.add_argument("--require-gpu", action="store_true")
    args = parser.parse_args()

    started = time.perf_counter()
    imports = {}
    errors = {}

    for label, module_name in MODULES:
        item_started = time.perf_counter()
        try:
            module = importlib.import_module(module_name)
            imports[label] = {
                "ok": True,
                "version": _version(module),
                "seconds": round(time.perf_counter() - item_started, 4),
            }
        except Exception as exc:  # pragma: no cover - runs inside provider image
            imports[label] = {
                "ok": False,
                "seconds": round(time.perf_counter() - item_started, 4),
            }
            errors[label] = str(exc)

    total_seconds = round(time.perf_counter() - started, 4)

    torch = sys.modules.get("torch")
    cuda_available = bool(torch and torch.cuda.is_available())
    gpu_count = int(torch.cuda.device_count()) if cuda_available else 0
    gpu_name = torch.cuda.get_device_name(0) if cuda_available else None

    passed = not errors
    if args.require_gpu and not cuda_available:
        passed = False
        errors["cuda"] = "CUDA GPU is required for this provider-host smoke"
    if total_seconds > args.max_import_seconds:
        passed = False
        errors["import_budget"] = (
            f"imports took {total_seconds}s, budget is {args.max_import_seconds}s"
        )

    payload = {
        "template": "dcp-lora-pod-image",
        "status": "pass" if passed else "fail",
        "total_import_seconds": total_seconds,
        "max_import_seconds": args.max_import_seconds,
        "cuda_available": cuda_available,
        "gpu_count": gpu_count,
        "gpu_name": gpu_name,
        "imports": imports,
        "errors": errors,
    }
    print("DC1_RESULT_JSON:" + json.dumps(payload, sort_keys=True))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
