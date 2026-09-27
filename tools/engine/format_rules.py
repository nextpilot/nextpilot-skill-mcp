"""
Format rules/*.yaml: consistent section order + blank lines between groups.

V2: Only recognize KNOWN top-level keys at their expected indent levels.
"""

import os
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RULES_DIR = REPO_ROOT / "knowledge" / "px4" / "rules"

# Section display order (after metadata)
SECTION_ORDER = ["condition", "compute", "foreach", "output", "trigger"]

# Meta fields that should appear at the top
META_ORDER = ["id", "name", "group", "order", "tag"]

# All known top-level keys (only these can be section boundaries)
TOP_KEYS = set(META_ORDER + SECTION_ORDER)

# Regex to match a top-level key at indent 0 (single-doc) or indent 2 (multi-doc)
_RE_KEY_0 = re.compile(r"^(" + "|".join(TOP_KEYS) + r"):")
_RE_KEY_2 = re.compile(r"^  (" + "|".join(TOP_KEYS) + r"):")
_RE_DOC = re.compile(r"^- id:")


def split_sections(lines):
    """
    Split lines into sections. Only known top-level keys at their expected
    indent level are treated as section boundaries.
    Returns list of (key, lines) tuples.
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
        if _RE_DOC.match(line):
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
    # Never add a blank at the beginning of output
    if not result:
        return
    # Remove trailing blanks
    while result and result[-1] == "":
        result.pop()
    # Add exactly one blank
    result.append("")


def _reorder_one_entry(entry_lines):
    """Move 'label' field right after 'when' within one trigger entry."""
    if len(entry_lines) <= 1:
        return entry_lines

    # Find label line (indent 6)
    label_idx = None
    for i, line in enumerate(entry_lines):
        if line.lstrip().startswith("label:"):
            label_idx = i
            break

    if label_idx is None or label_idx == 1:
        return entry_lines  # No label or already right after when

    # Move label to position 1 (after '- when:')
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
    """
    Format a single document's sections.
    Returns list of lines.
    """
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
            # For multi-doc, '- id:' is part of metadata, no blank before meta
            skip_meta_blank = True
            break
    else:
        skip_meta_blank = False

    # Meta section: id, name, group, order
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
    """Format lines of a YAML file."""
    has_multi = any(_RE_DOC.search(line) for line in lines)

    if not has_multi:
        sections = split_sections(lines)
        result = format_single_doc(sections)
    else:
        result = []
        docs = []
        current_doc = []

        for line in lines:
            if _RE_DOC.match(line) and current_doc:
                docs.append(current_doc)
                current_doc = [line]
            else:
                current_doc.append(line)
        if current_doc:
            docs.append(current_doc)

        for i, doc_lines in enumerate(docs):
            if i > 0:
                _ensure_blank_before(result)
            sections = split_sections(doc_lines)
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
    lines.append("")  # ensure trailing empty line for split_sections

    result = format_file_lines(lines)
    new_content = "\n".join(result) + "\n"

    return new_content


def main(dry_run=False):
    """If dry_run=True, only print diffs (1-line summary)."""
    files = sorted([f for f in os.listdir(RULES_DIR) if f.endswith(".yaml")])
    changed = 0
    for fname in files:
        filepath = RULES_DIR / fname
        with open(filepath, "r", encoding="utf-8") as f:
            original = f.read()

        formatted = format_file_text(original)

        if original != formatted:
            changed += 1
            if dry_run:
                # Count line diffs
                ol = original.count("\n")
                fl = formatted.count("\n")
                print(f"  ~ {fname}: {ol} -> {fl} lines")
            else:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(formatted)
                print(f"  OK  {fname}")
        else:
            print(f"  -- {fname} (no change)")

    print(f"\n{len(files)} files, {changed} changed")


if __name__ == "__main__":
    main(dry_run="--dry" in os.sys.argv or "--check" in os.sys.argv)
