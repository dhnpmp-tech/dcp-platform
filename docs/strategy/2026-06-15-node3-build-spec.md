# Node 3 — 4× RTX 3090 Build Spec & Sourcing

**For:** Tareq · **Date:** 2026-06-15 · **Cards:** the 4 acceptance-passed Palit GameRock RTX 3090s (a 5th passed too — keep as hot spare).

## The decision in one line
For DCP's workload (independent inference + whole-GPU pods — the cards never talk to each other), you do **NOT** need the $5,000 WRX80 / Threadripper-PRO / ECC route. A cheap CPU + normal RAM + **x4 lanes per card** is plenty. One hard rule from our own Gen-1 data: **no x1 USB mining risers** (they bottleneck multi-GPU LLM 30–40%). Target **x4 per card** — cheap *and* fast enough.

Why: in inference, once a model is loaded the CPU↔GPU traffic is ~0.5 MB/s — thousands of times below even PCIe x4. Lanes only affect model *load* time. So the expensive parts (Threadripper PRO, ECC RDIMM) buy x16-to-every-card, which only matters for tensor-parallel/training — not us.

---

## ✅ OPTION B — New build, in stock in Dubai today (RECOMMENDED)
All links verified live on Amazon.ae on 2026-06-15 (loaded each page, prices + stock confirmed).

| Part | Model | Price (AED) | Link |
|---|---|---|---|
| **Motherboard** | ASUS ProArt X870E-Creator (AM5, supports PCIe bifurcation) | 1,825 | amazon.ae/dp/B0DF123GCV |
| **CPU** | AMD Ryzen 5 7600X (6-core — idle during GPU work) | 699 | amazon.ae/dp/B0H5BJKSHN |
| **RAM** | Crucial Pro 64 GB DDR5-6000 (2×32, non-ECC) | 2,551 | amazon.ae/dp/B0DSQVNBD5 |
| **Bifurcation card** | JMT PCIe x16 → 4× x4 splitter (x4x4x4x4) | 151 | amazon.ae/dp/B0C9WS3MBG |
| **Risers ×4** | LINKUP PCIe 4.0 x16 riser (shielded) — buy 4 | 249 ea (~996) | amazon.ae/dp/B0CXJKXN29 |
| **PSU** | Corsair AX1600i (1600 W Titanium) | 1,999 | amazon.ae/dp/B078X274ML |
| **CPU cooler** | Thermalright Peerless Assassin 120 (AM5) | 207 | amazon.ae/dp/B0DMVVK2YT |
| **NVMe** | WD Black SN850X 2 TB (1 TB = AED 775 is fine) | 1,458 | amazon.ae/dp/B0B7CKZGN6 |
| **Frame** | DAN&DRE open-air mining frame | 166 | amazon.ae/dp/B0GW6HD4YC |
| | **TOTAL (ex-GPUs)** | **≈ AED 9,050 (~$2,465)** | |

*(Drop to ~AED 8,370 with the 1 TB NVMe. vs ~AED 18,000+ for the WRX80 build.)*

**Two must-dos with Option B:**
1. **Confirm the ProArt board's BIOS does `x4x4x4x4` bifurcation** on the main slot before relying on it (ProArt Creator boards support bifurcation — verify the exact mode). The JMT splitter then breaks that one x16 slot into 4× x4, one riser → one GPU.
2. The JMT splitter is PCIe **Gen3 x4** per card (~3.9 GB/s) — fine for inference, only slower on model *loads*. A Gen4 OCuLink splitter is an upgrade if load speed matters.

---

## OPTION A — Used HEDT (cheapest for full lanes; used market)
A used **AMD Threadripper X399** (1950X/2950X) or **Intel X299** board+CPU gives **64 native PCIe lanes** → all 4 cards at x8/x16 with **no bifurcation card** and DDR4 (cheaper). Board+CPU ≈ **AED 1,500–2,500 used**.

These are end-of-life, so they're **used-market, not new retail** — source in Dubai via **dubizzle.ae** and **OpenSooq** (search "Threadripper X399" / "X299"); listings are live classifieds, so availability changes daily. Reuse the same PSU / risers / NVMe / frame / cooler-for-TR4 from the list above. Best lanes-per-riyal, but you accept used hardware + a hunt.

---

## 🇸🇦 KSA sourcing
- **PSU (verified):** Corsair AX1600i on Amazon.sa = **SAR 2,279** — amazon.sa/dp/B078X274ML
- The rest of Option B: **Amazon.sa carries most of the catalog** (search the exact models above) — but the ProArt board + splitter are thinner on Saudi retail. Practical path: **buy in UAE (Amazon.ae / microless) and bring across**, or import. **gccgamers.com** ships to Riyadh/Jeddah for most parts.

---

## Power — the make-or-break (applies to both options)
4× 3090 = ~1400 W + system ~200 W, with 400–500 W transient spikes/card. **Power-limit each card to ~285 W** (`sudo nvidia-smi -pl 285`) → ~3–5 % perf loss, drops sustained to ~1350 W, tames spikes → safe on **one AX1600i**. On UAE/KSA 220–240 V the AX1600i delivers its full 1600 W. (Dual-PSU + ADD2PSU is the max-headroom alternative.)

## Do / Don't
- ✅ Power-limit the cards. ✅ x4 per card (Option B) or x8/x16 (Option A). ✅ Good Gen4 risers. ✅ Open frame (4 triple-slot cards never fit a tower).
- ❌ No x1 USB mining risers. ❌ No need for Threadripper PRO / ECC RDIMM for this workload. ❌ Don't put 4 cards directly on the board.
