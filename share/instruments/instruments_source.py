#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# MuseScore-Studio-CLA-applies
#
# MuseScore Studio
# Music Composition & Notation
#
# Copyright (C) 2026 MuseScore Limited and others
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License version 3 as
# published by the Free Software Foundation.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""Keep the instrument definitions as one file per instrument.

instruments.xml is not stored in this repository. Its source is the
directory `source/`, which holds one file per instrument (grouped by
instrument group) plus a few shared files, and `source/manifest.txt`, which
lists the files in the order they are joined. The build joins them into
instruments.xml (see AssembleInstruments.cmake); this script does the same for
checking, and converts in the other direction.

  split FILE               Replace source/ with the content of an instruments.xml
                           (e.g. one produced by update_instruments_xml.py).
  assemble [-o FILE]       Join source/ into an instruments.xml (stdout by default).
  check FILE               Exit with an error unless source/ assembles to FILE.
  merge BASE THEIRS        Bring the changes between two instruments.xml files
                           (e.g. upstream's before and after a sync) into source/
                           with a three-way merge per file; conflicts are left
                           with conflict markers, like git does.
  merge-git BASE THEIRS    The same, reading share/instruments/instruments.xml
                           from two git revisions, e.g. after `git merge upstream/main`:
                             merge-git $(git merge-base HEAD MERGE_HEAD) MERGE_HEAD

The assembled file is byte for byte what the split one was, so splitting an
instruments.xml and assembling it again gives the same file.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.join(HERE, 'source')
MANIFEST = 'manifest.txt'

TOP_LEVEL_FILES = {
    'Genre': 'genres.xml',
    'Family': 'families.xml',
    'Articulation': 'articulations.xml',
}

GROUP_RE = re.compile(r'^      <InstrumentGroup id="([^"]+)">\n$')
GROUP_END = '      </InstrumentGroup>\n'
INSTRUMENT_RE = re.compile(r'^            <Instrument id="([^"]+)">\n$')
INSTRUMENT_END = '            </Instrument>\n'
TOP_LEVEL_RE = re.compile(r'^      <([A-Za-z]+)[ >]')
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9._+()'-]+$")  # portable file names; ids like oboe-d'amore


def fail(message):
    print(f'{os.path.basename(__file__)}: error: {message}', file=sys.stderr)
    raise SystemExit(1)


def read_lines(path):
    with open(path, encoding='utf-8', newline='') as f:
        text = f.read()
    if '\r' in text:
        fail(f'{path}: expected LF line endings')
    if not text.endswith('\n'):
        fail(f'{path}: expected a final newline')
    return text.splitlines(keepends=True)


def safe_name(name, what):
    if not SAFE_NAME_RE.match(name) or name.startswith('_') or name.startswith('.'):
        fail(f'{what} "{name}" cannot be used as a file name')
    return name


def split_lines(lines):
    """Cut an instruments.xml into (relative path, lines) chunks, in file order."""
    chunks = []
    current_path = None
    current = []

    def flush():
        nonlocal current_path, current
        if current:
            assert current_path is not None
            chunks.append((current_path, current))
        current_path = None
        current = []

    def start(path):
        flush()
        nonlocal current_path
        current_path = path

    group = None
    instrument = None
    seen_instruments = set()
    seen_top_level = []

    start('_head.xml')
    for number, line in enumerate(lines, start=1):
        if group is None:
            m = GROUP_RE.match(line)
            if m:
                group = safe_name(m.group(1), 'Instrument group id')
                start(f'{group}/_begin.xml')
                current.append(line)
                continue

            if line == '</museScore>\n':
                start('_tail.xml')
                current.append(line)
                continue

            m = TOP_LEVEL_RE.match(line)
            if m and current_path != '_tail.xml':
                tag = m.group(1)
                if tag not in TOP_LEVEL_FILES:
                    fail(f'line {number}: unexpected top-level element <{tag}>')
                path = TOP_LEVEL_FILES[tag]
                if current_path != path:
                    if path in seen_top_level:
                        fail(f'line {number}: <{tag}> elements are not all together')
                    seen_top_level.append(path)
                    start(path)
            current.append(line)
            continue

        # Inside an instrument group
        if instrument is None:
            m = INSTRUMENT_RE.match(line)
            if m:
                instrument = safe_name(m.group(1), 'Instrument id')
                if instrument in seen_instruments:
                    fail(f'line {number}: instrument id "{instrument}" is used twice')
                seen_instruments.add(instrument)
                start(f'{group}/{instrument}.xml')
                current.append(line)
                continue

            if line == GROUP_END:
                start(f'{group}/_end.xml')
                current.append(line)
                group = None
                continue

            if current_path != f'{group}/_begin.xml':
                fail(f'line {number}: unexpected line between instruments: {line!r}')
            current.append(line)
            continue

        current.append(line)
        if line == INSTRUMENT_END:
            instrument = None
            start(f'{group}/_between.xml')

    if group is not None or instrument is not None:
        fail('the file ends inside an instrument group')

    flush()

    # Lines between instruments are not expected; an empty placeholder chunk is dropped
    result = []
    for path, chunk_lines in chunks:
        if path.endswith('/_between.xml'):
            fail(f'unexpected lines after an instrument in group "{path.split("/")[0]}"')
        result.append((path, chunk_lines))

    paths = [path for path, _ in result]
    if len(paths) != len(set(paths)):
        fail('two parts of the file map to the same source file')

    return result


def write_source(chunks, source_dir):
    if os.path.isdir(source_dir):
        shutil.rmtree(source_dir)
    os.makedirs(source_dir)

    for path, chunk_lines in chunks:
        full = os.path.join(source_dir, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, 'w', encoding='utf-8', newline='') as f:
            f.writelines(chunk_lines)

    with open(os.path.join(source_dir, MANIFEST), 'w', encoding='utf-8', newline='\n') as f:
        f.write('# Files joined, in this order, into instruments.xml. See ../instruments_source.py\n')
        for path, _ in chunks:
            f.write(path + '\n')


def read_manifest(source_dir):
    path = os.path.join(source_dir, MANIFEST)
    if not os.path.isfile(path):
        fail(f'{path} not found')
    entries = []
    for line in read_lines(path):
        line = line.strip()
        if line and not line.startswith('#'):
            entries.append(line)
    if len(entries) != len(set(entries)):
        fail(f'{path}: a file is listed twice')
    return entries


def assemble(source_dir):
    parts = []
    for entry in read_manifest(source_dir):
        full = os.path.join(source_dir, entry)
        if not os.path.isfile(full):
            fail(f'{MANIFEST} lists {entry}, which does not exist')
        with open(full, encoding='utf-8', newline='') as f:
            text = f.read()
        if '<<<<<<<' in text or '>>>>>>>' in text:
            fail(f'{entry} still has conflict markers')
        parts.append(text)
    return ''.join(parts)


def unlisted_files(source_dir):
    listed = set(read_manifest(source_dir))
    result = []
    for root, _, files in os.walk(source_dir):
        for name in files:
            rel = os.path.relpath(os.path.join(root, name), source_dir).replace(os.sep, '/')
            if rel != MANIFEST and rel not in listed:
                result.append(rel)
    return sorted(result)


def cmd_split(args):
    chunks = split_lines(read_lines(args.file))
    write_source(chunks, SOURCE_DIR)
    instruments = sum(1 for path, _ in chunks if '/' in path and not os.path.basename(path).startswith('_'))
    print(f'Wrote {len(chunks)} files ({instruments} instruments) to {os.path.relpath(SOURCE_DIR)}')


def cmd_assemble(args):
    text = assemble(SOURCE_DIR)
    if args.output:
        with open(args.output, 'w', encoding='utf-8', newline='') as f:
            f.write(text)
    else:
        sys.stdout.write(text)


def cmd_check(args):
    with open(args.file, encoding='utf-8', newline='') as f:
        expected = f.read()
    if assemble(SOURCE_DIR) != expected:
        fail(f'source/ does not assemble to {args.file}')
    extra = unlisted_files(SOURCE_DIR)
    if extra:
        fail('files not listed in the manifest: ' + ', '.join(extra))
    print(f'OK: source/ assembles to {args.file}')


def merge_manifests(ours, base, theirs):
    """Three-way merge of two orderings: keep ours, apply their insertions and removals."""
    base_set, ours_set, theirs_set = set(base), set(ours), set(theirs)
    removed_by_them = base_set - theirs_set
    added = [entry for entry in theirs if entry not in base_set and entry not in ours_set]

    result = [entry for entry in ours if entry not in removed_by_them]

    for entry in added:
        # Insert after the nearest preceding entry in their order that we also have
        index = theirs.index(entry)
        anchor = None
        for previous in reversed(theirs[:index]):
            if previous in result:
                anchor = previous
                break
        position = result.index(anchor) + 1 if anchor else 0
        result.insert(position, entry)
    return result


def cmd_merge(args):
    merge_files(args.base, args.theirs)


def cmd_merge_git(args):
    with tempfile.TemporaryDirectory() as tmp:
        paths = []
        for name, rev in (('base', args.base), ('theirs', args.theirs)):
            path = os.path.join(tmp, name + '.xml')
            result = subprocess.run(['git', 'show', f'{rev}:share/instruments/instruments.xml'],
                                    cwd=HERE, capture_output=True)
            if result.returncode != 0:
                fail(f'cannot read share/instruments/instruments.xml at {rev}: '
                     + result.stderr.decode(errors='replace').strip())
            with open(path, 'wb') as f:
                f.write(result.stdout)
            paths.append(path)
        merge_files(*paths)


def merge_files(base_xml, theirs_xml):
    with tempfile.TemporaryDirectory() as tmp:
        base_dir = os.path.join(tmp, 'base')
        theirs_dir = os.path.join(tmp, 'theirs')
        write_source(split_lines(read_lines(base_xml)), base_dir)
        write_source(split_lines(read_lines(theirs_xml)), theirs_dir)

        base_entries = read_manifest(base_dir)
        theirs_entries = read_manifest(theirs_dir)
        ours_entries = read_manifest(SOURCE_DIR)

        conflicts = []
        changed = 0
        for entry in sorted(set(base_entries) | set(theirs_entries)):
            base_file = os.path.join(base_dir, entry)
            theirs_file = os.path.join(theirs_dir, entry)
            ours_file = os.path.join(SOURCE_DIR, entry)
            in_base, in_theirs, in_ours = os.path.isfile(base_file), os.path.isfile(theirs_file), os.path.isfile(ours_file)

            if in_theirs and in_base:
                with open(base_file, 'rb') as a, open(theirs_file, 'rb') as b:
                    if a.read() == b.read():
                        continue  # unchanged by them: keep ours
                if not in_ours:
                    conflicts.append(f'{entry} (they changed it, we deleted it)')
                    continue
                result = subprocess.run(['git', 'merge-file', '-L', 'ours', '-L', 'base', '-L', 'theirs',
                                         ours_file, base_file, theirs_file])
                changed += 1
                if result.returncode != 0:
                    conflicts.append(entry)
            elif in_theirs:  # added by them
                if in_ours:
                    with open(ours_file, 'rb') as a, open(theirs_file, 'rb') as b:
                        if a.read() != b.read():
                            conflicts.append(f'{entry} (added on both sides, kept ours)')
                    continue
                os.makedirs(os.path.dirname(ours_file), exist_ok=True)
                shutil.copyfile(theirs_file, ours_file)
                changed += 1
            else:  # removed by them
                if in_ours:
                    with open(ours_file, 'rb') as a, open(base_file, 'rb') as b:
                        if a.read() != b.read():
                            conflicts.append(f'{entry} (they deleted it, we changed it; kept ours)')
                            continue
                    os.remove(ours_file)
                    changed += 1

        merged = merge_manifests(ours_entries, base_entries, theirs_entries)
        merged = [entry for entry in merged if os.path.isfile(os.path.join(SOURCE_DIR, entry))]
        with open(os.path.join(SOURCE_DIR, MANIFEST), 'w', encoding='utf-8', newline='\n') as f:
            f.write('# Files joined, in this order, into instruments.xml. See ../instruments_source.py\n')
            for entry in merged:
                f.write(entry + '\n')

        # Remove directories left empty by deletions
        for root, dirs, files in os.walk(SOURCE_DIR, topdown=False):
            if root != SOURCE_DIR and not os.listdir(root):
                os.rmdir(root)

    print(f'Merged {changed} changed files into {os.path.relpath(SOURCE_DIR)}')
    if conflicts:
        print('Conflicts to resolve by hand:', file=sys.stderr)
        for conflict in conflicts:
            print('  ' + conflict, file=sys.stderr)
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)

    p = sub.add_parser('split', help='replace source/ with the content of an instruments.xml')
    p.add_argument('file')
    p.set_defaults(func=cmd_split)

    p = sub.add_parser('assemble', help='join source/ into an instruments.xml')
    p.add_argument('-o', '--output')
    p.set_defaults(func=cmd_assemble)

    p = sub.add_parser('check', help='verify that source/ assembles to the given file')
    p.add_argument('file')
    p.set_defaults(func=cmd_check)

    p = sub.add_parser('merge', help='three-way merge the changes between two instruments.xml into source/')
    p.add_argument('base')
    p.add_argument('theirs')
    p.set_defaults(func=cmd_merge)

    p = sub.add_parser('merge-git', help='like merge, reading instruments.xml from two git revisions')
    p.add_argument('base')
    p.add_argument('theirs')
    p.set_defaults(func=cmd_merge_git)

    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
