# Divergence report — preview vs Pixelblaze hardware

**Generated:** 2026-05-29  
**Device:** `192.168.8.224`  
**Firmware:** 3.67  
**Resolution:** 16.16 fixed-point, 1 ULP = 0.0000152587890625 (0.000015258789)

Produced by `npm run harness` (test/divergence-harness). The probe pattern is hand-loaded via the ElectroMage editor; the harness drives it over the documented getVars/setVars API. This report is the Phase-1 deliverable that the fidelity feature draws its divergence conclusions from.

## Transcendentals — divergence vs ideal float64

| built-in | samples | max \|Δ\| | (in ULPs) | worst input |
|---|---|---|---|---|
| `sin` | 64 | 0.0061490000 | 403.0 | a=-3.141592653589793 |
| `cos` | 64 | 0.0061973083 | 406.1 | a=1.545863051766406 |
| `tan` | 64 | 0.011223622 | 735.6 | a=1.2 |
| `sqrt` | 64 | 0.000016942390 | 1.1 | a=29.46031746031746 |
| `exp` | 64 | 0.0017718959 | 116.1 | a=3.746031746031746 |
| `log` | 64 | 0.00022372645 | 14.7 | a=0.05 |
| `pow` | 64 | 0.00081787694 | 53.6 | a=7.873015873015873, b=2.5 |

## Candidate integer hashes — bit-identity preview↔hardware

| hash | samples | max \|Δ\| | bit-identical? |
|---|---|---|---|
| `hash11` | 128 | 0.99713135 | ❌ NO |
| `hash21` | 256 | 0.99896240 | ❌ NO |
| `reint` | 64 | 0.0038909912 | ❌ NO |
| `hash11_s1` | 64 | 0.91970825 | ❌ NO |
| `hash11_s2` | 64 | 0.97302246 | ❌ NO |
| `mul-precision` | 64 | 0.000015723633 | ✅ yes |

<details><summary>hash11 — sample values (device vs fixed-point reference)</summary>

| input | device | reference | Δ |
|---|---|---|---|
| a=0 | 0.0000000 | 0.72659302 | 0.72659302 |
| a=2 | 0.0000000 | 0.89501953 | 0.89501953 |
| a=4 | 0.0000000 | 0.87313843 | 0.87313843 |
| a=6 | 0.0000000 | 0.66094971 | 0.66094971 |
| a=8 | 0.0000000 | 0.25845337 | 0.25845337 |
| a=10 | 0.0000000 | 0.66564941 | 0.66564941 |

</details>

<details><summary>hash21 — sample values (device vs fixed-point reference)</summary>

| input | device | reference | Δ |
|---|---|---|---|
| a=0, b=0 | 0.0000000 | 0.72659302 | 0.72659302 |
| a=0, b=9 | 0.0000000 | 0.44680786 | 0.44680786 |
| a=0, b=18 | 0.0000000 | 0.34967041 | 0.34967041 |
| a=0, b=27 | 0.0000000 | 0.43518066 | 0.43518066 |
| a=0, b=36 | 0.0000000 | 0.70333862 | 0.70333862 |
| a=0, b=45 | 0.0000000 | 0.15414429 | 0.15414429 |

</details>

<details><summary>reint — sample values (device vs fixed-point reference)</summary>

| input | device | reference | Δ |
|---|---|---|---|
| a=0 | 0.0000000 | 0.0000000 | 0.0000000 |
| a=4 | 0.0000000 | 0.000061035156 | 0.000061035156 |
| a=8 | 0.0000000 | 0.00012207031 | 0.00012207031 |
| a=12 | 0.0000000 | 0.00018310547 | 0.00018310547 |
| a=16 | 0.0000000 | 0.00024414063 | 0.00024414063 |
| a=20 | 0.0000000 | 0.00030517578 | 0.00030517578 |

</details>

<details><summary>hash11_s1 — sample values (device vs fixed-point reference)</summary>

| input | device | reference | Δ |
|---|---|---|---|
| a=0 | 0.0000000 | 0.015457153 | 0.015457153 |
| a=4 | 0.0000000 | 0.11427307 | 0.11427307 |
| a=8 | 0.0000000 | 0.21308899 | 0.21308899 |
| a=12 | 0.0000000 | 0.31190491 | 0.31190491 |
| a=16 | 0.0000000 | 0.41072083 | 0.41072083 |
| a=20 | 0.0000000 | 0.50953674 | 0.50953674 |

</details>

<details><summary>hash11_s2 — sample values (device vs fixed-point reference)</summary>

| input | device | reference | Δ |
|---|---|---|---|
| a=0 | 0.0000000 | 0.70315552 | 0.70315552 |
| a=4 | 0.0000000 | 0.30282593 | 0.30282593 |
| a=8 | 0.0000000 | 0.76626587 | 0.76626587 |
| a=12 | 0.0000000 | 0.093475342 | 0.093475342 |
| a=16 | 0.0000000 | 0.28445435 | 0.28445435 |
| a=20 | 0.0000000 | 0.33920288 | 0.33920288 |

</details>

<details><summary>mul-precision — sample values (device vs fixed-point reference)</summary>

| input | device | reference | Δ |
|---|---|---|---|
| a=0, b=0.3333333333333333 | 0.0000000 | 0.0000000 | 0.0000000 |
| a=0.015873015873015872, b=0.3333333333333333 | 0.0052800000 | 0.0052795410 | 4.5898437e-7 |
| a=0.031746031746031744, b=0.3333333333333333 | 0.010574000 | 0.010574341 | 3.4082031e-7 |
| a=0.047619047619047616, b=0.3333333333333333 | 0.015854000 | 0.015869141 | 0.000015140625 |
| a=0.06349206349206349, b=0.3333333333333333 | 0.021149000 | 0.021148682 | 3.1835938e-7 |
| a=0.07936507936507936, b=0.3333333333333333 | 0.026443000 | 0.026443481 | 4.8144531e-7 |

</details>

## Firmware behaviour — confirmed answers

### small-const

**Q:** Does the literal 1/65536 (0.0000152587890625) compile to raw 1 or flush to 0?  
**Device returned:** `0.0000000`  
**→ flushes to 0**

| candidate | predicted | \|Δ\| |
|---|---|---|
| raw 1 (smallest 16.16 ULP) | 0.000015258789 | 0.000015258789 |
| flushes to 0 | 0.0000000 | 0.0000000 |

### add-overflow

**Q:** On 16.16 overflow, does the device WRAP or SATURATE?  
**Device returned:** `-5536.0000`  
**→ wrap**

| candidate | predicted | \|Δ\| |
|---|---|---|
| wrap | -5536.0000 | 0.0000000 |
| saturate | 32768.000 | 38304.000 |

### mul-rounding

**Q:** After (a·b)>>16, does the device ROUND or TRUNCATE the dropped bits?  
**Device returned:** `0.25000000`  
**→ truncate**

| candidate | predicted | \|Δ\| |
|---|---|---|
| truncate | 0.25000000 | 0.0000000 |
| round (half up) | 0.25001526 | 0.000015258789 |

### frac-negative

**Q:** frac(-0.25): TRUNCATE-based (-0.25) or FLOOR-based (0.75)?  
**Device returned:** `-0.25000000`  
**→ truncate (sign follows a)**

| candidate | predicted | \|Δ\| |
|---|---|---|
| truncate (sign follows a) | -0.25000000 | 0.0000000 |
| floor (always [0,1)) | 0.75000000 | 1.0000000 |

### mod-negative

**Q:** -1 % 3: FLOORED (2, sign of b) or TRUNCATED (-1, sign of a)?  
**Device returned:** `-1.0000000`  
**→ truncated (sign of a)**

| candidate | predicted | \|Δ\| |
|---|---|---|
| floored (sign of b) | 2.0000000 | 3.0000000 |
| truncated (sign of a) | -1.0000000 | 0.0000000 |

### not-fractional

**Q:** ~2.5: NOT of the raw 16.16 int, or NOT of the truncated integer part?  
**Device returned:** `-3.0000000`  
**→ not-of-int-part**

| candidate | predicted | \|Δ\| |
|---|---|---|
| not-of-raw (keeps fraction) | -2.5000153 | 0.49998474 |
| not-of-int-part | -3.0000000 | 0.0000000 |

## Interpretation & follow-ups

This file is auto-generated raw evidence. Hand-written interpretation and the filed follow-up issues live in [`findings.md`](./findings.md).
