import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import dcp_daemon as d


def test_llama_70b_on_48gb_clamps_low():
    # Model 42 GB + 2 GB overhead = 4 GB free; 4 / 2.62 GB-per-1k ≈ 1.5k → clamps to 2048
    ctx = d.calculate_safe_context("llama-3.3-70b", total_vram_gb=48)
    assert ctx in (2048, 4096), f"expected ≤4k for 70B on 48GB, got {ctx}"


def test_llama_70b_on_80gb_picks_larger():
    ctx = d.calculate_safe_context("llama-3.3-70b", total_vram_gb=80)
    # 80 - 42 - 2 = 36 GB free; 36 / 2.62 ≈ 13.7k → clamps to 8192
    assert ctx >= 8192


def test_qwen3_30b_on_24gb_fits_comfortably():
    ctx = d.calculate_safe_context("qwen3-30b-a3b", total_vram_gb=24)
    # 24 - 18 - 2 = 4 GB; 4 / 0.40 = 10k → clamps to 8192
    assert ctx >= 8192


def test_unknown_model_defaults_to_4k():
    assert d.calculate_safe_context("nonexistent-model", total_vram_gb=24) == 4096


def test_model_too_big_returns_minimum():
    # 70B on 24GB — does not fit at all
    ctx = d.calculate_safe_context("llama-3.3-70b", total_vram_gb=24)
    assert ctx == 2048  # hard minimum


def test_returns_power_of_two_friendly():
    for vram in (16, 24, 32, 48, 80):
        ctx = d.calculate_safe_context("qwen2.5-32b", total_vram_gb=vram)
        assert ctx in (2048, 4096, 8192, 16384, 32768, 65536, 131072)


def test_canonical_maps_ollama_tag():
    assert d._canonical_model_id("qwen3:30b-a3b") == "qwen3-30b-a3b"
    assert d._canonical_model_id("llama-3.3-70b") == "llama-3.3-70b"
    assert d._canonical_model_id("unknown:1b") == "unknown:1b"  # unchanged
