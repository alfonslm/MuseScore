#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Tells CI whether the changes between two commits can affect a build.

Usage: needs_build.py <base rev> <head rev>

Prints "needs_build=true" or "needs_build=false" on stdout (for $GITHUB_OUTPUT) and the
reason for each changed file on stderr. A build is NOT needed when every changed file is

  * documentation: a Markdown file, or anything under docs/
  * a C, C++ or Objective-C file whose changes are only in comments and whitespace

Anything else needs a build: other file types, added or deleted source files, submodule
updates, and whatever this script can't judge. When in doubt it answers "true".
"""

import re
import subprocess
import sys

C_FAMILY_SUFFIXES = (".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx", ".m", ".mm")
NULL_SHA_RE = re.compile(r"^0+$")
REGULAR_FILE_MODES = ("100644", "100755")
RAW_STRING_PREFIX_RE = re.compile(r'(?:u8|u|U|L)?R"([^ ()\\\t\v\f\n]{0,16})\(')
WHITESPACE_RE = re.compile(r"[ \t\r\f\v]*\n[ \t\r\f\v\n]*|[ \t\r\f\v]+")


def git(*args):
    return subprocess.run(("git",) + args, check=True, stdout=subprocess.PIPE).stdout


def is_documentation(path):
    return path.lower().endswith(".md") or path.startswith("docs/")


def code_without_comments(text):
    """The file's tokens in order: comments dropped, whitespace outside literals normalized.

    A comment counts as one space, as it does for the compiler. Runs of whitespace are
    reduced to one space, or to one newline if they contain one (line ends matter to the
    preprocessor). String, character and raw string literals are kept exactly.
    """
    out = []
    code = []  # pending text outside literals, normalized when flushed

    def flush_code():
        if code:
            out.append(WHITESPACE_RE.sub(lambda m: "\n" if "\n" in m.group() else " ", "".join(code)))
            code.clear()

    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if c == "/" and nxt == "/":
            # Line comment: up to the end of line (a backslash before the newline continues it)
            i += 2
            while i < n and text[i] != "\n":
                if text[i] == "\\" and i + 1 < n and text[i + 1] == "\n":
                    i += 1
                i += 1
            code.append(" ")
            continue

        if c == "/" and nxt == "*":
            end = text.find("*/", i + 2)
            i = n if end < 0 else end + 2
            code.append(" ")
            continue

        if c in "RuUL":
            prev = text[i - 1] if i > 0 else ""
            raw = RAW_STRING_PREFIX_RE.match(text, i)
            if raw and not (prev.isalnum() or prev == "_"):
                terminator = ")" + raw.group(1) + '"'
                end = text.find(terminator, raw.end())
                end = n if end < 0 else end + len(terminator)
                flush_code()
                out.append(text[i:end])
                i = end
                continue

        if c in "\"'":
            # String or character literal: up to the closing quote. It stops at the end of
            # the line as well, so that a stray quote (1'000, #error don't) can't swallow
            # more than its own line; what it does swallow is kept, never dropped
            start = i
            i += 1
            while i < n and text[i] != c and text[i] != "\n":
                if text[i] == "\\" and i + 1 < n:
                    i += 1
                i += 1
            if i < n and text[i] == c:
                i += 1
            flush_code()
            out.append(text[start:i])
            continue

        code.append(c)
        i += 1

    flush_code()
    return "".join(out).strip()


def judge(status, old_mode, new_mode, old_sha, new_sha, path):
    """Returns (needs build, reason) for one changed file."""
    if is_documentation(path):
        return False, "documentation"

    if status != "M":
        return True, "added, deleted or changed type"

    if old_mode not in REGULAR_FILE_MODES or new_mode not in REGULAR_FILE_MODES:
        return True, "not a regular file (submodule or link)"

    if not path.lower().endswith(C_FAMILY_SUFFIXES):
        return True, "not documentation, and not a file whose comments this script can tell apart"

    if NULL_SHA_RE.match(old_sha) or NULL_SHA_RE.match(new_sha):
        return True, "content not available"

    try:
        old_text = git("cat-file", "blob", old_sha).decode("utf-8")
        new_text = git("cat-file", "blob", new_sha).decode("utf-8")
    except UnicodeDecodeError:
        return True, "not UTF-8 text"

    if code_without_comments(old_text) == code_without_comments(new_text):
        return False, "only comments or whitespace changed"

    return True, "code changed"


def changed_files(base, head):
    raw = git("diff", "--raw", "--no-renames", "--no-abbrev", "-z", base, head).decode("utf-8", "surrogateescape")
    fields = raw.split("\0")
    # Each entry is ":<old mode> <new mode> <old sha> <new sha> <status>" NUL "<path>" NUL
    for meta, path in zip(fields[0::2], fields[1::2]):
        old_mode, new_mode, old_sha, new_sha, status = meta.lstrip(":").split(" ")
        yield status[0], old_mode, new_mode, old_sha, new_sha, path


def main(argv):
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2

    needs_build = False
    try:
        files = list(changed_files(argv[1], argv[2]))
        if not files:
            # Nothing changed, or the diff could not be read: build, to be safe
            print("no changed files found", file=sys.stderr)
            needs_build = True

        for entry in files:
            file_needs_build, reason = judge(*entry)
            print(f"{'BUILD' if file_needs_build else 'skip '}  {entry[-1]}: {reason}", file=sys.stderr)
            needs_build = needs_build or file_needs_build
    except Exception as e:  # pylint: disable=broad-except
        print(f"could not judge the changes ({e!r}): building, to be safe", file=sys.stderr)
        needs_build = True

    print(f"needs_build={'true' if needs_build else 'false'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
