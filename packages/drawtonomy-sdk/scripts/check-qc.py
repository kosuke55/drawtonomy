#!/usr/bin/env python3
"""Run the ASAM qc-opendrive checker bundle on every .xodr in a directory and
fail when any ERROR-level issue is reported.

Usage: python3 scripts/check-qc.py <xodrDir>

Requires: pip install asam-qc-opendrive
"""
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

LEVEL_NAMES = {"1": "ERROR", "2": "WARNING", "3": "INFO"}


def run_qc(xodr: Path, workdir: Path) -> Counter:
    config = workdir / f"config_{xodr.stem}.xml"
    result = workdir / f"result_{xodr.stem}.xqar"
    config.write_text(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<Config>
    <Param name="InputFile" value="{xodr.resolve()}"/>
    <CheckerBundle application="xodrBundle">
        <Param name="resultFile" value="{result.resolve()}"/>
    </CheckerBundle>
</Config>
"""
    )
    subprocess.run(
        [sys.executable, "-m", "qc_opendrive.main", "-c", str(config)],
        check=True,
        capture_output=True,
    )
    counts: Counter = Counter()
    for issue in ET.parse(result).getroot().iter("Issue"):
        counts[(issue.get("level"), issue.get("ruleUID"))] += 1
    return counts


def main() -> int:
    xodr_dir = Path(sys.argv[1])
    files = sorted(xodr_dir.glob("*.xodr"))
    if not files:
        print(f"no .xodr files in {xodr_dir}", file=sys.stderr)
        return 2
    failed = False
    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        for xodr in files:
            counts = run_qc(xodr, workdir)
            errors = sum(n for (level, _), n in counts.items() if level == "1")
            status = "FAIL" if errors else "ok"
            if errors:
                failed = True
            print(f"{status}  {xodr.name}: " + (
                ", ".join(
                    f"{LEVEL_NAMES.get(level, level)} {rule.split(':')[-1]} x{n}"
                    for (level, rule), n in sorted(counts.items())
                )
                or "clean"
            ))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
