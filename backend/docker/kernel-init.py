"""Kernel init script — runs once when the Jupyter kernel starts."""

import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Environment setup
# ---------------------------------------------------------------------------
os.environ["MPLBACKEND"] = "Agg"
os.environ["PIP_TARGET"] = "/workspace/.python"

if "/workspace/.python" not in sys.path:
    sys.path.insert(0, "/workspace/.python")

os.chdir("/workspace")

# ---------------------------------------------------------------------------
# Dataset path resolver (extracted from containerManager wrapper)
# ---------------------------------------------------------------------------

def resolve_dataset_path(filename, dataset_id=None):
    """Resolve dataset path across cloud and browser mounts.

    Checks multiple locations in order of priority:
    1. Direct filename in workspace root (/workspace/{filename})
    2. Workspace datasets dir (/workspace/datasets/{filename})
    3. Mounted datasets dir (/datasets/{filename})
    4. UUID-based paths if dataset_id provided
    5. Fallback to recursive search
    """
    candidates = [
        Path("/workspace") / filename,
        Path("/workspace/datasets") / filename,
        Path("/datasets") / filename,
    ]

    if dataset_id:
        candidates.extend([
            Path("/workspace/datasets") / dataset_id / filename,
            Path("/datasets") / dataset_id / filename,
        ])
        suffix = "".join(c for c in str(dataset_id) if c.isalnum())[:8]
        if suffix:
            stem = Path(filename).stem
            ext = Path(filename).suffix
            alias = f"{stem}__{suffix}{ext}"
            candidates.extend([
                Path("/workspace/datasets") / alias,
                Path("/datasets") / alias,
            ])

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    # Fallback: recursive glob
    for root in [Path("/workspace"), Path("/workspace/datasets"), Path("/datasets")]:
        if root.exists():
            matches = list(root.rglob(filename))
            if matches:
                return str(matches[0])

    return str(candidates[0])

# ---------------------------------------------------------------------------
# DataFrame display helper
# ---------------------------------------------------------------------------

def _display_df(df):
    """Rich-display a pandas DataFrame in notebook output."""
    from IPython.display import display, HTML  # noqa: delayed import
    display(HTML(df.to_html(max_rows=100, max_cols=50, notebook=True)))
