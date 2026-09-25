#!/usr/bin/env python3
"""Build the AGAS specialist catalog from the exact pinned Agency source."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENCY = ROOT / "foundations" / "agency"
OUTPUT = ROOT / "foundations" / "aionui" / "public" / "agas" / "catalog.json"
LOCK = json.loads((ROOT / "runtime" / "foundations.lock.json").read_text())
PIN = next(item["commit"] for item in LOCK["sources"] if item["id"] == "agency")
ACTUAL = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=AGENCY, text=True).strip()
if ACTUAL != PIN:
    raise SystemExit("Agency source is not at the approved commit")

upstream = AGENCY / "scripts" / "build-hermes-plugin.py"
spec = importlib.util.spec_from_file_location("agency_catalog", upstream)
if spec is None or spec.loader is None:
    raise SystemExit("Cannot load Agency's own catalog parser")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
agents = module.collect_agents(AGENCY)
for agent in agents:
    source = AGENCY / agent["source_path"]
    agent["source_commit"] = PIN
    agent["sha256"] = hashlib.sha256(source.read_bytes()).hexdigest()

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps({"source_commit": PIN, "count": len(agents), "agents": agents}, ensure_ascii=False, separators=(",", ":")) + "\n")
print(f"AGAS Agency catalog: {len(agents)} original specialists from {PIN[:12]}")
