#!/usr/bin/env python3
"""Install small isolated test dependencies; native mutation tools are opt-in."""

import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    environment = ROOT / ".quality-venv"
    venv.EnvBuilder(with_pip=True).create(environment)
    commands = [
        [str(environment / "bin/python"), "-m", "pip", "install", "-r", str(ROOT / "tools/quality/requirements.txt")],
        ["npm", "ci", "--prefix", str(ROOT / "tools/quality/js"), "--no-audit", "--no-fund"],
    ]
    for command in commands:
        completed = subprocess.run(command, cwd=ROOT)
        if completed.returncode:
            return completed.returncode
    print("Quality dependencies ready. Mull and LLVM installations were not changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
