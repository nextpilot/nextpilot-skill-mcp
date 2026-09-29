"""Format rules/*.yaml: consistent section order + blank lines between groups.

Only KNOWN top-level keys at their expected indent levels are section boundaries.
"""

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _logging import get_logger  # noqa: E402

log = get_logger("format-rules")

REPO_ROOT = Path(__file__).resolve().parents[2]
PX4_RULES_DIR = REPO_ROOT / "knowledge" / "px4" / "rules"
APM_RULES_DIR = REPO_ROOT / "knowledge" / "ardupilot" / "rules"

# Section display order (after metadata)
SECTION_ORDER = ["condition", "compute", "foreach", "output", "trigger"]

# Meta fields that first
META_ORDER = ["id", "name", "group", "order", "tag"]

# All known top-level keys (only these can be section boundaries)
TOP_KEYS = set(META_ORDER + SECTION_ORDER)

# Top-level key at indent 0 (single-doc) or indent 2 (multi-doc)
_RE_KEY_0 = re.compile(r"^(" + "|".join(TOP_KEYS) + r"):")
_RE_KEY_2 = re.compile(r"^  (" + "|".join(TOP_KEYS) + r"):")
_RE_DOC = re.compile(r"^- id:")


def split_sections(lines):
    """Split into (key, lines) sections; only known top-level keys at their expected
    indent level are section boundaries.
    """
    sections = []
    current_key = "header"
    current_lines = []

    def _flush():
        nonlocal current_lines
        # Strip trailing blank lines
        while current_lines and current_lines[-1].strip() == "":
            current_lines.pop()
        if current_lines:
            sections.append((current_key, current_lines))
        current_lines = []

    for line in lines:
        if line.strip() == "---":
            _flush()
            current_key = "doc_sep"
            current_lines = [line]
        elif _RE_DOC.match(line):
            _flush()
            current_key = "doc_start"
            current_lines = [line]
        elif _RE_KEY_2.match(line):
            m = _RE_KEY_2.match(line)
            _flush()
            current_key = m.group(1)
            current_lines = [line]
        elif _RE_KEY_0.match(line):
            m = _RE_KEY_0.match(line)
            _flush()
            current_key = m.group(1)
            current_lines = [line]
        else:
            current_lines.append(line)

    _flush()

    return sections


def _ensure_blank_before(result):
    """Ensure exactly one blank line before the next section, unless at the very start."""
    if not result:  # never add a blank at the beginning
        return
    while result and result[-1] == "":
        result.pop()
    result.append("")


def _reorder_one_entry(entry_lines):
    """Move 'label' field right after 'when' within one trigger entry."""
    if len(entry_lines) <= 1:
        return entry_lines

    label_idx = None
    for i, line in enumerate(entry_lines):
        if line.lstrip().startswith("label:"):
            label_idx = i
            break

    if label_idx is None or label_idx == 1:
        return entry_lines  # no label, or already right after when

    label_line = entry_lines.pop(label_idx)
    entry_lines.insert(1, label_line)
    return entry_lines


def _reorder_trigger_entries(lines):
    """Reorder fields within each trigger entry: label right after when."""
    result = []
    entry_lines = []
    in_entry = False

    for line in lines:
        is_entry_start = line.lstrip().startswith("- when:")

        if is_entry_start:
            if entry_lines:
                result.extend(_reorder_one_entry(entry_lines))
                entry_lines = []
            in_entry = True

        if in_entry:
            entry_lines.append(line)
        else:
            result.append(line)

    if entry_lines:
        result.extend(_reorder_one_entry(entry_lines))

    return result


def format_single_doc(sections):
    """Format a single document's sections into a list of lines."""
    result = []

    # Header comments
    for key, lines in sections:
        if key == "header":
            result.extend([line.rstrip() for line in lines])
            break

    # doc_start: output the '- id:' line for multi-doc entries
    for key, lines in sections:
        if key == "doc_start":
            _ensure_blank_before(result)
            result.extend([line.rstrip() for line in lines])
            # '- id:' is part of metadata: no blank before meta
            skip_meta_blank = True
            break
    else:
        skip_meta_blank = False

    # Meta section
    if not skip_meta_blank:
        meta_exists = any(any(key == meta_key for key, _ in sections) for meta_key in META_ORDER)
        if meta_exists:
            _ensure_blank_before(result)
    for meta_key in META_ORDER:
        for key, lines in sections:
            if key == meta_key:
                result.extend([line.rstrip() for line in lines])
                break

    # Ordered sections
    for section_key in SECTION_ORDER:
        for key, lines in sections:
            if key == section_key:
                _ensure_blank_before(result)
                section_lines = [line.rstrip() for line in lines]
                if section_key == "trigger":
                    section_lines = _reorder_trigger_entries(section_lines)
                result.extend(section_lines)
                break

    # Any remaining sections not in the predefined order
    known = set(META_ORDER + SECTION_ORDER + ["header", "doc_start"])
    for key, lines in sections:
        if key not in known:
            _ensure_blank_before(result)
            result.extend([line.rstrip() for line in lines])

    return result


def format_file_lines(lines):
    """Format lines of a YAML file.

    Single-doc files (PX4 rules): full formatting with section ordering.
    Multi-doc files (APM rules using --- between rules): split at ---, format
    each rule individually, then rejoin with --- separators.
    """
    has_multi = any(line.strip() == "---" for line in lines)

    if not has_multi:
        sections = split_sections(lines)
        result = format_single_doc(sections)
    else:
        result = []
        chunks = []
        current = []

        for line in lines:
            if line.strip() == "---":
                if current:
                    chunks.append(current)
                    current = []
            else:
                current.append(line)
        if current:
            chunks.append(current)

        for i, chunk in enumerate(chunks):
            # Strip leading/trailing blank lines
            while chunk and chunk[0].strip() == "":
                chunk.pop(0)
            while chunk and chunk[-1].strip() == "":
                chunk.pop()

            if not chunk:
                continue

            if i > 0:
                _ensure_blank_before(result)
                result.append("---")

            sections = split_sections(chunk)
            doc_result = format_single_doc(sections)
            result.extend(doc_result)

    while result and result[-1] == "":
        result.pop()

    return result


def format_file_text(text, dry_run=False):
    """Format YAML content. Returns formatted text."""
    lines = text.split("\n")
    while lines and lines[-1].strip() == "":
        lines.pop()
    lines.append("")  # trailing empty line for split_sections

    result = format_file_lines(lines)
    new_content = "\n".join(result) + "\n"

    return new_content


def main(dry_run=False):
    """If dry_run=True, only print diffs (1-line summary)."""
    dirs = [
        ("PX4", PX4_RULES_DIR),
        ("APM", APM_RULES_DIR),
    ]
    total_files = 0
    total_changed = 0

    for label, rules_dir in dirs:
        if not rules_dir.exists():
            continue
        files = sorted([f for f in os.listdir(rules_dir) if f.endswith(".yaml")])
        changed = 0
        for fname in files:
            filepath = rules_dir / fname
            with open(filepath, "r", encoding="utf-8") as f:
                original = f.read()

            formatted = format_file_text(original)

            if original != formatted:
                changed += 1
                if dry_run:
                    ol = original.count("\n")
                    fl = formatted.count("\n")
                    log.warning(f"  ~ {label}/{fname}: {ol} -> {fl} lines")
                else:
                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(formatted)
                    log.info(f"  OK  {label}/{fname}")
            else:
                log.info(f"  -- {label}/{fname} (no change)")

        log.info(f"\n  [{label}] {len(files)} files, {changed} changed")
        total_files += len(files)
        total_changed += changed

    log.info(f"\nTotal: {total_files} files, {total_changed} changed")


if __name__ == "__main__":
    main(dry_run="--dry" in sys.argv or "--check" in sys.argv)
