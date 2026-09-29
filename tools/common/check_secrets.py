"""Scan tracked files for committed credentials.

Project rule: "secrets live in the edge function / EdgeOne console environment,
never in the repo" -- until now nothing checked it.

Rule vocabulary is imported from web/lib/error-policy.js, the project's existing
authority on "what counts as a sensitive string" (it drives issue-report
scrubbing). A second set of rules would mean "the scrubber thinks this is safe,
the scanner thinks it is a secret" -- two authorities disagreeing, and the
eventual outcome is someone turning the scanner off.

The judgement is "key name AND a value that looks like a real credential":
matching key names alone would flag documentation (docs/operations/README.md
legitimately writes EDGEONE_API_TOKEN), and a scanner that cries wolf on the
first run is one people learn to bypass with --no-verify.

Usage:
    python tools/common/check_secrets.py            # scan (exit 1 on findings)
    python tools/common/check_secrets.py --list     # print the rules and allowlist
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _logging import get_logger  # noqa: E402

log = get_logger("secrets")

ROOT = Path(__file__).resolve().parents[2]
ERROR_POLICY = ROOT / "web" / "lib" / "error-policy.js"

# Files that are not secrets even when they match: lockfiles carry integrity hashes,
# and the generated knowledge bundle is a build artifact.
SKIP_SUFFIXES = {".lock", ".map", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".pdf"}
SKIP_NAMES = {"pnpm-lock.yaml", "package-lock.json"}
SKIP_PARTS = {"node_modules", ".next", ".git", "playwright-report", "test-results"}

# Key names that would hold a credential; matched case-insensitively as whole words.
CREDENTIAL_KEYS = [
    "EDGEONE_API_TOKEN",
    "AUTH_SECRET",
    "DEEPSEEK_API_KEY",
    "SMTP_PASS",
    "SMTP_PASSWORD",
    "NEXTAUTH_SECRET",
    "API_KEY",
    "API_TOKEN",
    "ACCESS_TOKEN",
    "CLIENT_SECRET",
    "PRIVATE_KEY",
    "PASSWORD",
    "PASSWD",
    "SECRET",
]

# Value read from the environment (`env?.AUTH_SECRET`, `process.env.X`,
# `import.meta.env.X`) -- the correct pattern; flagging it would invert the check.
ENV_REFERENCE = re.compile(r"(?:\w+\s*[.?]\s*)*\b(?:process\.env|import\.meta\.env|env)\b\s*[.?[]")

# What documentation and .env.example legitimately use; anything matching is not reported.
PLACEHOLDER_SHAPE = re.compile(
    r"""^[\s"']*$            # empty
      | ^<.*>$               # <your-token>
      | ^\$?\{.*\}$          # ${VAR} / {VAR}
      | ^\$\w+$              # $VAR
      | ^[A-Z][A-Z0-9_]*$    # another CONSTANT_NAME (a reference, not a value)
      | ^(?:x{3,}|X{3,}|\*{3,}|\.{3,}|-{3,})$   # xxx / *** / ...
      | ^(?:your|my|the|some|example|test|dummy|fake|sample|placeholder|changeme|redacted|probe|invalid)
          [-_ ]?.*$                              # probe-invalid-key, fake-token, ...
      | ^(?:change[-_]?me|todo|none|null|undefined|true|false)$
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Value built at runtime (`${...}` in a template literal, or a concatenation):
# a credential that is never a literal in the file cannot be leaked by the file.
INTERPOLATION = re.compile(r"\$\{|\bencodeURIComponent\b|\bJSON\.stringify\b")

# Rendered explicitly instead of inferred from the JS: the rules are the scanner's
# contract and belong in reviewable Python.
SCRUB_EQUIVALENT = [
    ("email", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")),
    ("bearer", re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{8,}", re.IGNORECASE)),
    ("hex", re.compile(r"\b[A-Fa-f0-9]{24,}\b")),
    ("win-home", re.compile(r"[A-Za-z]:\\Users\\[^\\\s\"'`]+", re.IGNORECASE)),
    ("posix-home", re.compile(r"/(?:home|Users)/[^/\s\"'`]+")),
    ("ip", re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")),
]


def tracked_files() -> list[Path]:
    """Tracked files to scan; uses git so untracked scratch files are ignored."""
    out = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if out.returncode != 0:
        # Not a git checkout: fall back to walking the tree.
        return [p for p in ROOT.rglob("*") if p.is_file() and not any(part in SKIP_PARTS for part in p.parts)]
    return [ROOT / name for name in out.stdout.split("\0") if name]


def scannable(path: Path) -> bool:
    if path.suffix.lower() in SKIP_SUFFIXES or path.name in SKIP_NAMES:
        return False
    if any(part in SKIP_PARTS for part in path.parts):
        return False
    return True


def placeholder(value: str) -> bool:
    return bool(PLACEHOLDER_SHAPE.match(value.strip()))


def looks_like_credential(value: str) -> bool:
    """A real-looking credential: long enough, no whitespace, mixed shape.
    Deliberately permissive -- `placeholder()` already filtered docs / .env.example.
    """
    v = value.strip().strip("'\"")
    if len(v) < 12:
        return False
    if any(c.isspace() for c in v):
        return False
    if placeholder(v):
        return False
    # Needs some entropy: not a single repeated character or a plain word.
    return len(set(v)) >= 6


def key_and_value_findings(text: str) -> list[tuple[int, str, str]]:
    """Lines where a credential key is assigned something credential-shaped."""
    findings: list[tuple[int, str, str]] = []
    keys = "|".join(re.escape(k) for k in CREDENTIAL_KEYS)
    # KEY = value / KEY: value / "KEY": "value" -- value runs to EOL or quote. The
    # separator must not be a comparison (`if (!AUTH_SECRET)` checks the env var).
    pattern = re.compile(
        rf"""["']?\b({keys})\b["']?\s*(?<![=!<>])=(?!=)\s*(?P<val>["']?[^\s"'#]{{1,200}}["']?)
          | ["']?\b({keys})\b["']?\s*:\s*(?P<val2>["']?[^\s"'#]{{1,200}}["']?)
        """,
        re.IGNORECASE | re.VERBOSE,
    )
    for lineno, line in enumerate(text.splitlines(), start=1):
        for m in pattern.finditer(line):
            raw = m.group("val") or m.group("val2") or ""
            if ENV_REFERENCE.search(raw) or INTERPOLATION.search(raw):
                continue
            if looks_like_credential(raw):
                findings.append((lineno, m.group(1), raw.strip()[:60]))
    return findings


def scrub_findings(text: str) -> list[tuple[int, str, str]]:
    """Values that already look like the things error-policy.js scrubs.

    Only JWT and Bearer: a bare 24+ hex or an IP appears legitimately in generated
    knowledge JSON and lockfiles, and email is everywhere in docs/fixtures and is
    not a credential.
    """
    findings: list[tuple[int, str, str]] = []
    wanted = {"jwt", "bearer"}
    for lineno, line in enumerate(text.splitlines(), start=1):
        for name, rule in SCRUB_EQUIVALENT:
            if name not in wanted:
                continue
            m = rule.search(line)
            if not m:
                continue
            # `Bearer <token>` / `Bearer ${...}` is the documented placeholder form,
            # as is a token whose text marks it probe/fake (`kv-probe.js` sends
            # "Bearer probe-invalid-key" to test rejection).
            if name == "bearer":
                token = re.sub(r"^\s*Bearer\s+", "", m.group(0), flags=re.IGNORECASE)
                if re.match(r"^(?:<|\$\{)", token) or placeholder(token):
                    continue
            findings.append((lineno, name, m.group(0)[:60]))
    return findings


def fixture_values() -> set[str]:
    """Expected values, taken from the scrubber's fixtures.

    web/scripts/test-issue-filer.mjs holds deliberately-fake literal emails/JWTs
    so the scrub rules have something to match; the project already forbids them
    anywhere else, so whatever the scanner finds there is expected.
    """
    fixture = ROOT / "web" / "scripts" / "test-issue-filer.mjs"
    if not fixture.exists():
        return set()
    text = fixture.read_text(encoding="utf-8", errors="replace")
    values: set[str] = set()
    for name, rule in SCRUB_EQUIVALENT:
        for m in rule.finditer(text):
            values.add(m.group(0))
    return values


def main(argv: list[str]) -> int:
    if "--list" in argv:
        log.info("credential key names:")
        for k in CREDENTIAL_KEYS:
            log.info(f"  {k}")
        log.info("\nvalue must also match one of the SCRUB_RULES shapes (jwt / bearer):")
        for name, rule in SCRUB_EQUIVALENT:
            log.info(f"  {name}: {rule.pattern}")
        return 0

    if not ERROR_POLICY.exists():
        log.err(f"FAIL  missing {ERROR_POLICY.relative_to(ROOT)}")
        log.err("      The scanner borrows its rule vocabulary from that file,")
        log.err("      so it cannot run without it.")
        return 1

    files = [p for p in tracked_files() if scannable(p)]
    findings: list[tuple[str, int, str, str]] = []
    known_fixtures = fixture_values()

    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        found = [(ln, k, v) for ln, k, v in key_and_value_findings(text) if v not in known_fixtures]
        found += [(ln, k, v) for ln, k, v in scrub_findings(text) if v not in known_fixtures]
        for lineno, key, value in found:
            findings.append((rel, lineno, key, value))

    # This file necessarily contains the key names and rule patterns.
    findings = [f for f in findings if f[0] != str(Path(__file__).relative_to(ROOT)).replace("\\", "/")]

    if not findings:
        log.info(f"OK    no committed credentials in {len(files)} tracked files")
        return 0

    log.err(f"FAIL  {len(findings)} credential-shaped value(s) in tracked files:\n")
    for path, lineno, key, value in findings:
        log.err(f"  {path}:{lineno}  [{key}]  {value}")
    log.err("\nMove the value to an environment variable. If it is a legitimate")
    log.err("placeholder, extend PLACEHOLDER_SHAPE (or the key list) in this file.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
