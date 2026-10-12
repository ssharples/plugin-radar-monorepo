#!/usr/bin/env python3
"""Use the repository's isolated quality environment without shell activation."""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PYTHON = ROOT / ".quality-venv" / "bin" / "python"

if not PYTHON.is_file():
    sys.exit("Quality dependencies are missing. Run npm run quality:setup first.")
os.chdir(ROOT)
os.execv(str(PYTHON), [str(PYTHON), "-m", "tools.quality.cli", *sys.argv[1:]])
