"""Tests for v4.1.0 provider tier classification.

classify_provider_tier() bucketizes a detected GPU rig into one of:
  datacenter / workstation / consumer / apple_silicon / cpu_only / unknown
so the backend router can prefer the right tier per workload.
"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import dcp_daemon as d


# ─── Single-GPU happy paths ────────────────────────────────────────────────

def test_datacenter_h100():
    info = {"gpu_name": "NVIDIA H100 PCIe", "gpu_vram_mib": 80 * 1024,
            "all_gpus": [{"gpu_name": "NVIDIA H100 PCIe", "gpu_vram_mib": 80 * 1024}]}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "datacenter"
    assert out["tier_rank"] == 5
    assert out["total_vram_gb"] == 80.0
    assert out["gpu_count"] == 1
    assert out["primary_gpu"] == "NVIDIA H100 PCIe"


def test_datacenter_a100_80gb():
    info = {"all_gpus": [{"gpu_name": "NVIDIA A100-SXM4-80GB",
                          "gpu_vram_mib": 80 * 1024}]}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "datacenter"


def test_datacenter_h200():
    info = {"all_gpus": [{"gpu_name": "NVIDIA H200", "gpu_vram_mib": 141 * 1024}]}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "datacenter"
    assert out["total_vram_gb"] == 141.0


def test_workstation_a6000():
    info = {"all_gpus": [{"gpu_name": "NVIDIA RTX A6000", "gpu_vram_mib": 48 * 1024}]}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "workstation"
    assert out["tier_rank"] == 4


def test_workstation_l40s():
    info = {"all_gpus": [{"gpu_name": "NVIDIA L40S", "gpu_vram_mib": 48 * 1024}]}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "workstation"


def test_workstation_a40():
    info = {"all_gpus": [{"gpu_name": "NVIDIA A40", "gpu_vram_mib": 48 * 1024}]}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "workstation"


def test_consumer_rtx_4090():
    info = {"all_gpus": [{"gpu_name": "NVIDIA GeForce RTX 4090", "gpu_vram_mib": 24 * 1024}]}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "consumer"
    assert out["tier_rank"] == 3
    assert out["total_vram_gb"] == 24.0


def test_consumer_rtx_3090():
    info = {"all_gpus": [{"gpu_name": "NVIDIA GeForce RTX 3090", "gpu_vram_mib": 24 * 1024}]}
    assert d.classify_provider_tier(info)["tier"] == "consumer"


def test_consumer_rtx_5090():
    info = {"all_gpus": [{"gpu_name": "NVIDIA GeForce RTX 5090", "gpu_vram_mib": 32 * 1024}]}
    assert d.classify_provider_tier(info)["tier"] == "consumer"


def test_apple_silicon_m2_ultra():
    info = {"all_gpus": [{"gpu_name": "Apple M2 Ultra", "gpu_vram_mib": 192 * 1024}]}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "apple_silicon"
    assert out["tier_rank"] == 2


def test_apple_silicon_m4_max():
    info = {"all_gpus": [{"gpu_name": "Apple M4 Max", "gpu_vram_mib": 64 * 1024}]}
    assert d.classify_provider_tier(info)["tier"] == "apple_silicon"


# ─── Multi-GPU rigs: highest tier wins ─────────────────────────────────────

def test_multigpu_takes_highest_tier():
    """A rig with an H100 + RTX 4090s should classify as datacenter."""
    info = {"all_gpus": [
        {"gpu_name": "NVIDIA GeForce RTX 4090", "gpu_vram_mib": 24 * 1024},
        {"gpu_name": "NVIDIA H100 PCIe", "gpu_vram_mib": 80 * 1024},
        {"gpu_name": "NVIDIA GeForce RTX 4090", "gpu_vram_mib": 24 * 1024},
    ]}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "datacenter"
    assert out["primary_gpu"] == "NVIDIA H100 PCIe"
    assert out["gpu_count"] == 3
    assert out["total_vram_gb"] == 128.0  # 24 + 80 + 24
    assert out["all_tiers"] == ["consumer", "datacenter", "consumer"]


def test_multigpu_all_consumer():
    info = {"all_gpus": [
        {"gpu_name": "NVIDIA GeForce RTX 4090", "gpu_vram_mib": 24 * 1024},
        {"gpu_name": "NVIDIA GeForce RTX 4090", "gpu_vram_mib": 24 * 1024},
    ]}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "consumer"
    assert out["gpu_count"] == 2
    assert out["total_vram_gb"] == 48.0


# ─── Fallbacks ──────────────────────────────────────────────────────────────

def test_no_gpu_returns_cpu_only():
    assert d.classify_provider_tier({})["tier"] == "cpu_only"
    assert d.classify_provider_tier(None)["tier"] == "cpu_only"
    assert d.classify_provider_tier({"all_gpus": []})["tier"] == "cpu_only"


def test_unknown_gpu_name_is_unknown_not_cpu_only():
    """If a GPU IS detected but we don't recognize the model, tier=unknown."""
    info = {"all_gpus": [{"gpu_name": "NVIDIA Imaginary GPU 9000",
                          "gpu_vram_mib": 42 * 1024}]}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "unknown"
    assert out["gpu_count"] == 1
    assert out["total_vram_gb"] == 42.0


def test_top_level_gpu_name_without_all_gpus():
    """Falls back to top-level gpu_name/gpu_vram_mib if all_gpus missing."""
    info = {"gpu_name": "NVIDIA GeForce RTX 4090", "gpu_vram_mib": 24 * 1024}
    out = d.classify_provider_tier(info)
    assert out["tier"] == "consumer"
    assert out["gpu_count"] == 1
