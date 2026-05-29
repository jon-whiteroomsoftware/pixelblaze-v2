"""Step-zero PoC for #112 — prove ElectroMage's compiler, run *headless*
(outside the browser), emits Pixelblaze VM bytecode the device both ACCEPTS
and EXECUTES live. Confirmed against 192.168.8.224, fw 3.67 on 2026-05-29:
83-byte blob, rainbow rendered on the strip. No flash write.

This is a human-in-the-loop, out-of-band tool (needs a real Pixelblaze on the
LAN) and is excluded from the pre-commit gate, like the rest of this directory.

Setup / run:
    python3 -m venv /tmp/pb-poc
    /tmp/pb-poc/bin/pip install pixelblaze-client      # pulls in py-mini-racer (V8)
    PIXELBLAZE_IP=192.168.8.224 /tmp/pb-poc/bin/python test/capability-spike/bytecode-poc.py

How it works (mirrors pixelblaze-client.compilePattern):
    1. download /index.html.gz from the device
    2. extract the device's own minified JS compiler + constants for *its* firmware
    3. run that compiler in MiniRacer (V8) -> Pixelblaze VM bytecode
    4. sendPatternToRenderer -> live execution via putByteCode (binary type 3)
The JS host (MiniRacer here, node:vm in the eventual bridge, the browser in the
stock editor) is interchangeable; the compiler and its bytecode output are not.
"""
import json
import os
import traceback

from pixelblaze import Pixelblaze

IP = os.environ.get("PIXELBLAZE_IP", "192.168.8.224")
SRC = "export function render(index) { hsv(time(.1) + index/pixelCount, 1, 1) }"
OUT = os.environ.get("PIXELBLAZE_POC_OUT", "/tmp/pb-poc/result.json")

r = {"ok": False, "ip": IP}
try:
    pb = Pixelblaze(IP)
    r["firmware"] = pb.getVersion()
    bc = pb.compilePattern(SRC)            # headless compile via device's own JS
    r["bytecode_type"] = type(bc).__name__
    r["bytecode_len"] = len(bc) if bc else 0
    r["bytecode_head_hex"] = bc[:24].hex() if bc else ""
    if bc and len(bc) >= 8:
        # Header sanity: DWORD opcode-size, DWORD exports-size, then sections.
        opcode_sz = int.from_bytes(bc[0:4], "little")
        exports_sz = int.from_bytes(bc[4:8], "little")
        r["opcode_section_bytes"] = opcode_sz
        r["exports_section_bytes"] = exports_sz
        r["header_matches_len"] = (8 + opcode_sz + exports_sz == len(bc))
        pb.sendPatternToRenderer(bc)       # live execution, no flash write
        r["sent_to_renderer"] = True
        r["ok"] = r["header_matches_len"]
except Exception as e:                      # noqa: BLE001 - report, don't raise
    r["error"] = f"{type(e).__name__}: {e}"
    r["traceback"] = traceback.format_exc()

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(r, f, indent=2)
print(json.dumps({k: v for k, v in r.items() if k != "traceback"}, indent=2))
