"""Tests that v4.1.0 model table extensions are present and self-consistent."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import dcp_daemon as d


def test_geometry_has_kv_cache_field():
    for name, meta in d.MODEL_GEOMETRY_TABLE.items():
        assert "kv_cache_per_1k_gb" in meta, f"{name} missing kv_cache_per_1k_gb"
        assert isinstance(meta["kv_cache_per_1k_gb"], (int, float))
        assert 0 < meta["kv_cache_per_1k_gb"] < 5.0, f"{name} kv_cache looks wrong"


def test_geometry_has_gqa_fields():
    """Every entry must have kv_heads, head_dim, max_context (may be None)."""
    for name, meta in d.MODEL_GEOMETRY_TABLE.items():
        assert "kv_heads" in meta, f"{name} missing kv_heads"
        assert "head_dim" in meta, f"{name} missing head_dim"
        assert "max_context" in meta, f"{name} missing max_context"
        # When present, kv_heads/head_dim must be positive ints
        if meta["kv_heads"] is not None:
            assert isinstance(meta["kv_heads"], int) and meta["kv_heads"] > 0
        if meta["head_dim"] is not None:
            assert isinstance(meta["head_dim"], int) and meta["head_dim"] > 0
        if meta["max_context"] is not None:
            assert isinstance(meta["max_context"], int) and meta["max_context"] >= 2048


def test_arch_has_category_field():
    valid = {"flagship_moe_24gb", "flagship_moe_32gb", "dense_workhorse",
             "dense_70b_tight_fit", "small_efficient", "small_moe", "flagship_tier"}
    for name, meta in d.MODEL_ARCH_TABLE.items():
        assert "category" in meta, f"{name} missing category"
        assert meta["category"] in valid, f"{name} bad category: {meta['category']}"


def test_arch_has_default_ctx_risk_field():
    for name, meta in d.MODEL_ARCH_TABLE.items():
        assert "default_ctx_risk" in meta, f"{name} missing default_ctx_risk"
        assert meta["default_ctx_risk"] in ("safe", "cpu_offload_risk")


def test_market_data_table_exists():
    assert hasattr(d, "MODEL_MARKET_DATA"), "MODEL_MARKET_DATA must be defined"
    for name in ("qwen3-30b-a3b", "llama-3.3-70b", "qwen2.5-32b"):
        assert name in d.MODEL_MARKET_DATA, f"{name} missing from MODEL_MARKET_DATA"
        meta = d.MODEL_MARKET_DATA[name]
        assert "verified_speeds" in meta
        assert isinstance(meta["verified_speeds"], dict)


def test_tables_have_matching_keys():
    geo_keys = set(d.MODEL_GEOMETRY_TABLE.keys())
    arch_keys = set(d.MODEL_ARCH_TABLE.keys())
    assert geo_keys == arch_keys, f"drift: {geo_keys ^ arch_keys}"


def test_llama_70b_flagged_as_ctx_risk():
    assert d.MODEL_ARCH_TABLE["llama-3.3-70b"]["default_ctx_risk"] == "cpu_offload_risk"
