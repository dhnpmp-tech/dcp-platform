"""Tests for v4.1.0 consolidated per-model detail builder.

build_model_details() is the one-stop routing-ready dict the heartbeat
exposes per served model. It combines MODEL_ARCH_TABLE, MODEL_GEOMETRY_TABLE,
and MODEL_IDENTITY_TABLE into a single shape the backend router can consume
without re-deriving anything.
"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import dcp_daemon as d


# ─── Known-model happy paths ────────────────────────────────────────────────

def test_build_model_details_moe_known_model():
    """Qwen3-30B-A3B is a known MoE; all tables should resolve."""
    details = d.build_model_details("Qwen/Qwen3-30B-A3B-GPTQ-Int4")
    assert details["canonical_key"] == "qwen3-30b-a3b"
    assert details["architecture"]["type"] == "moe"
    assert details["architecture"]["total_params_b"] == 30.0
    assert details["architecture"]["active_params_b"] == 3.0
    assert details["architecture"]["confidence"] == "known"
    assert details["geometry"]["num_layers"] == 48
    assert details["geometry"]["hidden_size"] == 2048
    assert details["geometry"]["size_gb"] == 18.0
    assert details["identity"]["ollama"] == "qwen3:30b-a3b"
    assert "Qwen/Qwen3-30B-A3B-GPTQ-Int4" in details["identity"]["hf_formats"]
    # KV cache fp16: 2 * 48 * 2048 * 2 = 393,216 bytes/token
    assert details["kv_cache_bytes_per_token_fp16"] == 393_216


def test_build_model_details_dense_known_model():
    """Llama 3.3 70B is dense; geometry and identity should resolve."""
    details = d.build_model_details("meta-llama/Llama-3.3-70B-Instruct")
    assert details["canonical_key"] == "llama-3.3-70b"
    assert details["architecture"]["type"] == "dense"
    assert details["architecture"]["total_params_b"] == 70.0
    assert details["architecture"]["active_params_b"] == 70.0
    assert details["geometry"]["num_layers"] == 80
    assert details["geometry"]["hidden_size"] == 8192
    # 2 * 80 * 8192 * 2 = 2,621,440
    assert details["kv_cache_bytes_per_token_fp16"] == 2_621_440


# ─── Alias resolution ───────────────────────────────────────────────────────

def test_build_model_details_resolves_ollama_tag_to_canonical():
    details = d.build_model_details("allam:7b")
    assert details["canonical_key"] == "allam-7b"
    assert details["architecture"]["type"] == "dense"
    assert details["identity"]["canonical"] == "ALLaM-AI/ALLaM-7B-Instruct-preview"


def test_build_model_details_resolves_hf_format_to_canonical():
    details = d.build_model_details("ALLaM-AI/ALLaM-7B-Instruct-preview")
    assert details["canonical_key"] == "allam-7b"
    assert details["identity"]["ollama"] == "allam:7b"


# ─── Unknown / fallback path ────────────────────────────────────────────────

def test_build_model_details_unknown_model_falls_back_safely():
    """Unknown model id → inferred architecture, fallback geometry, no identity."""
    details = d.build_model_details("someorg/unknown-42b-instruct")
    assert details["canonical_key"] is None
    assert details["architecture"]["confidence"] == "inferred"
    # Dense fallback geometry
    assert details["geometry"]["num_layers"] == 32
    assert details["geometry"]["hidden_size"] == 4096
    assert details["geometry"]["size_gb"] is None
    assert details["identity"]["canonical"] is None
    assert details["identity"]["hf_formats"] == []
    assert details["kv_cache_bytes_per_token_fp16"] > 0


def test_build_model_details_unknown_moe_gets_moe_fallback_geometry():
    """Unknown `-a3b`-suffixed model → inferred MoE, MoE fallback geometry."""
    details = d.build_model_details("someorg/mystery-50b-a3b")
    assert details["architecture"]["type"] == "moe"
    assert details["architecture"]["confidence"] == "inferred"
    # MoE fallback is (48, 4096), larger than dense (32, 4096).
    assert details["geometry"]["num_layers"] == 48


# ─── Empty / null input ─────────────────────────────────────────────────────

def test_build_model_details_empty_input_returns_safe_shape():
    details = d.build_model_details("")
    # Shape must be complete so the backend router never KeyErrors.
    assert set(details.keys()) >= {
        "model_id", "canonical_key", "architecture",
        "geometry", "identity", "kv_cache_bytes_per_token_fp16",
    }
    assert details["canonical_key"] is None


def test_build_model_details_none_input_returns_safe_shape():
    details = d.build_model_details(None)
    assert details["model_id"] == ""
    assert details["architecture"]["type"] in ("dense", "unknown")


# ─── KV cache arithmetic ────────────────────────────────────────────────────

def test_kv_cache_bytes_per_token_matches_formula():
    """2 * layers * hidden * dtype_bytes."""
    assert d._kv_cache_bytes_per_token(32, 4096, 2) == 2 * 32 * 4096 * 2
    # fp8
    assert d._kv_cache_bytes_per_token(32, 4096, 1) == 2 * 32 * 4096 * 1


def test_kv_cache_bytes_per_token_bad_input_is_zero():
    assert d._kv_cache_bytes_per_token(None, 4096) == 0
    assert d._kv_cache_bytes_per_token(32, None) == 0
