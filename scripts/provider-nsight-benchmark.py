#!/usr/bin/env python3
"""Collect provider GPU telemetry for DCP provider quality scoring.

This script is intentionally provider-side. It emits machine-readable JSON and
CSV evidence that can be attached to provider scorecards without exposing
provider internals to renters.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import platform
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any


SCHEMA_VERSION = "2026-07-08.provider-nsight-benchmark.v1"
DEFAULT_NVIDIA_SMI_FIELDS = [
    "index",
    "uuid",
    "name",
    "driver_version",
    "memory.total",
    "memory.used",
    "utilization.gpu",
    "utilization.memory",
    "temperature.gpu",
    "power.draw",
    "clocks.sm",
    "clocks.mem",
]
DEFAULT_NCU_METRICS = [
    "sm__warps_active.avg.pct_of_peak_sustained_active",
    "lts__t_sector_hit_rate.pct",
    "dram__throughput.avg.pct_of_peak_sustained_elapsed",
]
NCU_METRIC_MAP = {
    "sm__warps_active.avg.pct_of_peak_sustained_active": "occupancy_pct",
    "lts__t_sector_hit_rate.pct": "cache_hit_pct",
    "dram__throughput.avg.pct_of_peak_sustained_elapsed": "memory_bandwidth_utilization_pct",
}
CSV_FIELDS = [
    "sample_index",
    "timestamp",
    "gpu_index",
    "gpu_uuid",
    "gpu_name",
    "driver_version",
    "utilization_gpu_pct",
    "utilization_memory_pct",
    "memory_total_mib",
    "memory_used_mib",
    "temperature_c",
    "power_w",
    "sm_clock_mhz",
    "mem_clock_mhz",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_number(value: str | None) -> float | None:
    if value is None:
        return None
    cleaned = value.strip()
    if cleaned in {"", "N/A", "[N/A]", "Not Supported", "[Not Supported]"}:
        return None
    cleaned = cleaned.replace("%", "").replace("MiB", "").replace("W", "").strip()
    try:
        parsed = float(cleaned)
    except ValueError:
        return None
    if math.isnan(parsed) or math.isinf(parsed):
        return None
    return parsed


def parse_int(value: str | None) -> int | None:
    parsed = parse_number(value)
    if parsed is None:
        return None
    return int(round(parsed))


def avg(values: list[float | int | None]) -> float | None:
    present = [float(value) for value in values if value is not None]
    if not present:
        return None
    return round(mean(present), 2)


def max_value(values: list[float | int | None]) -> float | None:
    present = [float(value) for value in values if value is not None]
    if not present:
        return None
    return round(max(present), 2)


def which_tools() -> dict[str, Any]:
    return {
        "nvidia_smi": shutil.which("nvidia-smi"),
        "nsys": shutil.which("nsys"),
        "ncu": shutil.which("ncu"),
    }


def run_nvidia_smi_sample(nvidia_smi: str) -> list[dict[str, Any]]:
    command = [
        nvidia_smi,
        f"--query-gpu={','.join(DEFAULT_NVIDIA_SMI_FIELDS)}",
        "--format=csv,noheader,nounits",
    ]
    completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=15)
    rows = []
    for raw_row in csv.reader(completed.stdout.splitlines()):
        if not raw_row:
            continue
        values = [cell.strip() for cell in raw_row]
        while len(values) < len(DEFAULT_NVIDIA_SMI_FIELDS):
            values.append("")
        row = dict(zip(DEFAULT_NVIDIA_SMI_FIELDS, values))
        rows.append(
            {
                "gpu_index": parse_int(row.get("index")),
                "gpu_uuid": row.get("uuid") or None,
                "gpu_name": row.get("name") or None,
                "driver_version": row.get("driver_version") or None,
                "utilization_gpu_pct": parse_number(row.get("utilization.gpu")),
                "utilization_memory_pct": parse_number(row.get("utilization.memory")),
                "memory_total_mib": parse_int(row.get("memory.total")),
                "memory_used_mib": parse_int(row.get("memory.used")),
                "temperature_c": parse_number(row.get("temperature.gpu")),
                "power_w": parse_number(row.get("power.draw")),
                "sm_clock_mhz": parse_number(row.get("clocks.sm")),
                "mem_clock_mhz": parse_number(row.get("clocks.mem")),
            }
        )
    return rows


def mock_samples() -> list[dict[str, Any]]:
    base = {
        "gpu_index": 0,
        "gpu_uuid": "GPU-mock-0000",
        "gpu_name": "NVIDIA GeForce RTX 4090",
        "driver_version": "mock",
        "memory_total_mib": 24564,
        "sm_clock_mhz": 2520.0,
        "mem_clock_mhz": 10501.0,
    }
    now = utc_now()
    return [
        {
            "sample_index": 0,
            "timestamp": now,
            **base,
            "utilization_gpu_pct": 41.0,
            "utilization_memory_pct": 33.0,
            "memory_used_mib": 8192,
            "temperature_c": 63.0,
            "power_w": 298.5,
        },
        {
            "sample_index": 1,
            "timestamp": now,
            **base,
            "utilization_gpu_pct": 79.0,
            "utilization_memory_pct": 58.0,
            "memory_used_mib": 14336,
            "temperature_c": 72.0,
            "power_w": 374.2,
        },
    ]


def collect_samples(
    nvidia_smi: str,
    duration_seconds: float,
    interval_seconds: float,
    workload: list[str],
    workload_output_path: Path | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    samples: list[dict[str, Any]] = []
    workload_result: dict[str, Any] = {"provided": bool(workload), "exit_code": None, "started_at": None, "completed_at": None}
    process: subprocess.Popen[Any] | None = None
    output_handle = None

    if workload:
        workload_result["started_at"] = utc_now()
        if workload_output_path:
            workload_output_path.parent.mkdir(parents=True, exist_ok=True)
            output_handle = workload_output_path.open("w", encoding="utf-8")
            workload_result["output_path"] = str(workload_output_path)
            process = subprocess.Popen(workload, stdout=output_handle, stderr=subprocess.STDOUT)
        else:
            process = subprocess.Popen(workload, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    started = time.monotonic()
    sample_index = 0
    while True:
        timestamp = utc_now()
        try:
            gpu_rows = run_nvidia_smi_sample(nvidia_smi)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError(f"nvidia-smi sample failed: {exc}") from exc

        for row in gpu_rows:
            samples.append({"sample_index": sample_index, "timestamp": timestamp, **row})
        sample_index += 1

        elapsed = time.monotonic() - started
        process_done = process is not None and process.poll() is not None
        if elapsed >= duration_seconds:
            break
        if process_done and elapsed >= max(0.1, interval_seconds):
            break

        time.sleep(min(interval_seconds, max(0.05, duration_seconds - elapsed)))

    if process is not None:
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        workload_result["exit_code"] = process.returncode
        workload_result["completed_at"] = utc_now()
    if output_handle:
        output_handle.close()

    return samples, workload_result


def build_ncu_command(ncu: str, workload: list[str]) -> list[str]:
    return [
        ncu,
        "--csv",
        "--target-processes",
        "all",
        "--metrics",
        ",".join(DEFAULT_NCU_METRICS),
        *workload,
    ]


def parse_ncu_metrics(raw_text: str) -> dict[str, float]:
    metric_values: dict[str, list[float]] = {}
    for row in csv.reader(raw_text.splitlines()):
        if not row or "Metric Name" in row:
            continue
        lowered = [cell.strip().lower() for cell in row]
        if "metric name" in lowered:
            continue
        metric_name = None
        metric_value = None
        for cell in row:
            stripped = cell.strip()
            if stripped in NCU_METRIC_MAP:
                metric_name = stripped
            parsed = parse_number(stripped)
            if metric_name and parsed is not None:
                metric_value = parsed
        if metric_name and metric_value is not None:
            metric_values.setdefault(metric_name, []).append(metric_value)

    parsed_metrics: dict[str, float] = {}
    for metric_name, output_key in NCU_METRIC_MAP.items():
        values = metric_values.get(metric_name, [])
        if values:
            parsed_metrics[output_key] = round(mean(values), 2)
    return parsed_metrics


def build_nsys_command(nsys: str, workload: list[str], output_prefix: Path) -> list[str]:
    return [
        nsys,
        "profile",
        "--stats=true",
        "--force-overwrite=true",
        "--output",
        str(output_prefix),
        *workload,
    ]


def summarize_samples(samples: list[dict[str, Any]], nsight_metrics: dict[str, float]) -> dict[str, Any]:
    by_gpu: dict[str, list[dict[str, Any]]] = {}
    for sample in samples:
        key = str(sample.get("gpu_index") if sample.get("gpu_index") is not None else sample.get("gpu_uuid") or "unknown")
        by_gpu.setdefault(key, []).append(sample)

    per_gpu = []
    for _, gpu_samples in sorted(by_gpu.items()):
        first = gpu_samples[0]
        per_gpu.append(
            {
                "gpu_index": first.get("gpu_index"),
                "gpu_uuid": first.get("gpu_uuid"),
                "gpu_name": first.get("gpu_name"),
                "sample_count": len(gpu_samples),
                "avg_utilization_gpu_pct": avg([sample.get("utilization_gpu_pct") for sample in gpu_samples]),
                "max_utilization_gpu_pct": max_value([sample.get("utilization_gpu_pct") for sample in gpu_samples]),
                "avg_utilization_memory_pct": avg([sample.get("utilization_memory_pct") for sample in gpu_samples]),
                "max_utilization_memory_pct": max_value([sample.get("utilization_memory_pct") for sample in gpu_samples]),
                "max_memory_used_mib": max_value([sample.get("memory_used_mib") for sample in gpu_samples]),
                "memory_total_mib": max_value([sample.get("memory_total_mib") for sample in gpu_samples]),
                "max_temperature_c": max_value([sample.get("temperature_c") for sample in gpu_samples]),
                "avg_power_w": avg([sample.get("power_w") for sample in gpu_samples]),
            }
        )

    missing_metrics = []
    for key in ["occupancy_pct", "cache_hit_pct", "memory_bandwidth_utilization_pct"]:
        if key not in nsight_metrics:
            missing_metrics.append(key)

    max_temperature = max_value([sample.get("temperature_c") for sample in samples])
    return {
        "sample_count": len(samples),
        "gpu_count": len(by_gpu),
        "per_gpu": per_gpu,
        "thermal_throttle_risk": bool(max_temperature is not None and max_temperature >= 85),
        "nsight_metrics": nsight_metrics,
        "missing_metrics": missing_metrics,
    }


def build_quality_score_input(
    samples: list[dict[str, Any]],
    summary: dict[str, Any],
    nsight_status: dict[str, Any],
    evidence_mode: str,
) -> dict[str, Any]:
    ncu_metrics = summary.get("nsight_metrics") or {}
    max_temperature = max_value([sample.get("temperature_c") for sample in samples])
    avg_gpu_util = avg([sample.get("utilization_gpu_pct") for sample in samples])
    return {
        "benchmark_ready": bool(samples),
        "evidence_mode": evidence_mode,
        "mock_data": evidence_mode == "mock",
        "sample_count": len(samples),
        "gpu_count": summary.get("gpu_count", 0),
        "avg_utilization_gpu_pct": avg_gpu_util,
        "max_utilization_gpu_pct": max_value([sample.get("utilization_gpu_pct") for sample in samples]),
        "avg_utilization_memory_pct": avg([sample.get("utilization_memory_pct") for sample in samples]),
        "max_utilization_memory_pct": max_value([sample.get("utilization_memory_pct") for sample in samples]),
        "max_memory_used_mib": max_value([sample.get("memory_used_mib") for sample in samples]),
        "max_temperature_c": max_temperature,
        "avg_power_w": avg([sample.get("power_w") for sample in samples]),
        "occupancy_pct": ncu_metrics.get("occupancy_pct"),
        "cache_hit_pct": ncu_metrics.get("cache_hit_pct"),
        "memory_bandwidth_utilization_pct": ncu_metrics.get("memory_bandwidth_utilization_pct"),
        "thermal_throttle_risk": bool(max_temperature is not None and max_temperature >= 85),
        "sustained_load_observed": bool(avg_gpu_util is not None and avg_gpu_util >= 60),
        "nsight_profile_status": nsight_status,
        "missing_metrics": summary.get("missing_metrics", []),
        "scoring_notes": [
            "Use only provider-side scorecards until admin ingestion is built.",
            "Occupancy/cache metrics require Nsight Compute with a representative workload.",
        ],
    }


def write_csv(path: Path, samples: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for sample in samples:
            writer.writerow({field: sample.get(field) for field in CSV_FIELDS})


def write_json(path: Path | None, report: dict[str, Any]) -> None:
    payload = json.dumps(report, indent=2, sort_keys=True)
    if path is None:
        print(payload)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload + "\n", encoding="utf-8")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect DCP provider GPU/Nsight benchmark evidence.")
    parser.add_argument("--duration-seconds", type=float, default=10.0, help="nvidia-smi sampling duration.")
    parser.add_argument("--interval-seconds", type=float, default=1.0, help="Seconds between samples.")
    parser.add_argument("--output-json", type=Path, help="Path for the JSON benchmark report. Defaults to stdout.")
    parser.add_argument("--output-csv", type=Path, help="Path for per-sample CSV telemetry.")
    parser.add_argument("--label", default="provider-nsight-benchmark", help="Human-readable run label.")
    parser.add_argument("--provider-id", help="Optional provider id to include in the report.")
    parser.add_argument("--profile", choices=["none", "ncu", "nsys"], default="none", help="Optional Nsight profiler for the workload.")
    parser.add_argument("--mock", action="store_true", help="Emit deterministic mock data for CI/docs validation.")
    parser.add_argument("--allow-missing-gpu", action="store_true", help="Return a report instead of failing when nvidia-smi is unavailable.")
    parser.add_argument("--workload", nargs=argparse.REMAINDER, help="Optional command to run while sampling or profiling.")
    args = parser.parse_args(argv)
    if args.duration_seconds < 0:
        parser.error("--duration-seconds must be >= 0")
    if args.interval_seconds <= 0:
        parser.error("--interval-seconds must be > 0")
    if args.profile != "none" and not args.workload:
        parser.error("--profile requires --workload")
    return args


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    tools = which_tools()
    generated_at = utc_now()
    evidence_mode = "mock" if args.mock else "provider_host"
    workload = args.workload or []
    nsight_profile: dict[str, Any] = {"mode": args.profile, "status": "skipped", "reason": "Profile mode is none."}
    workload_result: dict[str, Any] = {"provided": bool(workload), "exit_code": None, "started_at": None, "completed_at": None}

    try:
        if args.mock:
            samples = mock_samples()
            nsight_profile = {
                "mode": args.profile,
                "status": "mocked",
                "metrics": {
                    "occupancy_pct": 61.5,
                    "cache_hit_pct": 72.2,
                    "memory_bandwidth_utilization_pct": 48.4,
                },
            }
        else:
            nvidia_smi = tools.get("nvidia_smi")
            if not nvidia_smi:
                if not args.allow_missing_gpu:
                    raise RuntimeError("nvidia-smi is not available; run on a NVIDIA provider host or use --mock")
                samples = []
            elif args.profile == "ncu":
                ncu = tools.get("ncu")
                if not ncu:
                    raise RuntimeError("Nsight Compute (ncu) is not available on PATH")
                ncu_output = Path.cwd() / f"dcp-ncu-{int(time.time())}.csv"
                profile_command = build_ncu_command(ncu, workload)
                samples, workload_result = collect_samples(
                    nvidia_smi,
                    args.duration_seconds,
                    args.interval_seconds,
                    profile_command,
                    workload_output_path=ncu_output,
                )
                ncu_metrics = parse_ncu_metrics(ncu_output.read_text(encoding="utf-8", errors="replace"))
                nsight_profile = {
                    "mode": "ncu",
                    "status": "completed" if workload_result.get("exit_code") == 0 else "completed_with_errors",
                    "exit_code": workload_result.get("exit_code"),
                    "started_at": workload_result.get("started_at"),
                    "completed_at": workload_result.get("completed_at"),
                    "metrics": ncu_metrics,
                    "raw_csv_path": str(ncu_output),
                }
            elif args.profile == "nsys":
                nsys = tools.get("nsys")
                if not nsys:
                    raise RuntimeError("Nsight Systems (nsys) is not available on PATH")
                output_prefix = Path.cwd() / f"dcp-nsys-{int(time.time())}"
                profile_command = build_nsys_command(nsys, workload, output_prefix)
                samples, workload_result = collect_samples(
                    nvidia_smi,
                    args.duration_seconds,
                    args.interval_seconds,
                    profile_command,
                )
                nsight_profile = {
                    "mode": "nsys",
                    "status": "completed" if workload_result.get("exit_code") == 0 else "completed_with_errors",
                    "exit_code": workload_result.get("exit_code"),
                    "started_at": workload_result.get("started_at"),
                    "completed_at": workload_result.get("completed_at"),
                    "report_path": f"{output_prefix}.nsys-rep",
                }
            else:
                samples, workload_result = collect_samples(nvidia_smi, args.duration_seconds, args.interval_seconds, workload)
    except RuntimeError as exc:
        report = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated_at,
            "label": args.label,
            "provider_id": args.provider_id,
            "evidence_mode": evidence_mode,
            "status": "failed",
            "error": str(exc),
            "tool_availability": {name: bool(path) for name, path in tools.items()},
        }
        write_json(args.output_json, report)
        return 2

    nsight_metrics = (nsight_profile.get("metrics") if isinstance(nsight_profile.get("metrics"), dict) else {}) or {}
    summary = summarize_samples(samples, nsight_metrics)
    quality_score_input = build_quality_score_input(samples, summary, nsight_profile, evidence_mode)
    status = "completed" if samples or args.allow_missing_gpu else "failed"

    report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "label": args.label,
        "provider_id": args.provider_id,
        "evidence_mode": evidence_mode,
        "status": status,
        "host": {
            "hostname": platform.node(),
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "cwd": os.getcwd(),
        },
        "tool_availability": {name: bool(path) for name, path in tools.items()},
        "tool_paths": tools,
        "workload": workload_result,
        "nsight_profile": nsight_profile,
        "samples": samples,
        "summary": summary,
        "provider_quality_score_input": quality_score_input,
    }

    if args.output_csv:
        write_csv(args.output_csv, samples)
        report["csv_path"] = str(args.output_csv)
    write_json(args.output_json, report)
    return 0 if status == "completed" else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
