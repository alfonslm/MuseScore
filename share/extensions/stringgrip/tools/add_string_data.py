"""
add_string_data.py - give bowed-string parts a string tuning in a MuseScore 4 score.

MuseScore's built-in Violin, Viola, Violoncello and Contrabass have no string data.
Without it the staff-type list offers no tablature for them, and "Edit string data..."
in Staff/Part properties stays hidden. This script adds the tuning to a COPY of the
.mscz, in the main score and in every part (excerpt).

    uv run python add_string_data.py "Banshee Medli v2 Rev1.mscz"
    uv run python add_string_data.py score.mscz --five "Violin 1" --five Viola
    uv run python add_string_data.py score.mscz --dry-run

Tunings (MuseScore stores string data at written pitch):
    violin   G3 D4 A4 E5          viola   C3 G3 D4 A4
    5-string C3 G3 D4 A4 E5       (--five, violin or viola)
    cello    C2 G2 D3 A3          double bass E A D G  (written E2..G3, sounds 8vb)

Output: "<name> (strings).mscz" next to the input. The original is never touched.
Parts that already have string data are left alone unless --force.
"""
import argparse
import re
import sys
import zipfile
from pathlib import Path

TUNINGS = {
    "violin": [55, 62, 69, 76],
    "viola": [48, 55, 62, 69],
    "cello": [36, 43, 50, 57],
    "bass": [40, 45, 50, 55],        # written pitch; contrabass transposes -12
}
FIVE = [48, 55, 62, 69, 76]          # C3 G3 D4 A4 E5
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def pname(p):
    return f"{NAMES[p % 12]}{p // 12 - 1}"


def kind_of(text):
    """Same matching as the extension (handles the Swedish part names)."""
    s = text.lower()
    if re.search(r"viola|altfiol|bratsch", s):
        return "viola"
    if re.search(r"violoncell|cello", s):
        return "cello"
    if re.search(r"contrabass|double.?bass|kontraba|string.?bass|upright", s):
        return "bass"
    if re.search(r"electric.?bass|bass.?guitar|elbas|guitar|gitarr", s):
        return None                  # fretted: MuseScore already has string data
    if re.search(r"violin|fiol", s):
        return "violin"
    return None


def tag_text(block, tag):
    m = re.search(rf"<{tag}>(.*?)</{tag}>", block, re.S)
    return re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else ""


def string_data_xml(pitches, frets, indent):
    inner = indent + "  "
    lines = [f"{indent}<StringData>", f"{inner}<frets>{frets}</frets>"]
    lines += [f"{inner}<string>{p}</string>" for p in pitches]
    lines.append(f"{indent}</StringData>")
    return "\n".join(lines) + "\n"


def process_mscx(xml, five_parts, frets, force, log, where):
    out, pos, changed = [], 0, 0
    for pm in re.finditer(r"<Part\b[^>]*>.*?</Part>", xml, re.S):
        part = pm.group(0)
        im = re.search(r'(<Instrument\b[^>]*>)(.*?)(\n?[ \t]*)(</Instrument>)', part, re.S)
        if not im:
            continue
        inst_open, body = im.group(1), im.group(2)
        iid = (re.search(r'id="([^"]*)"', inst_open) or [None, ""])[1]
        name = tag_text(body, "longName") or tag_text(part, "trackName") or tag_text(body, "trackName")
        track = tag_text(part, "trackName")
        kind = kind_of(f"{iid} {name} {track}")
        if not kind:
            continue
        label = name or track or iid
        has = "<StringData>" in body
        if has and not force:
            log.append(f"  {where}: {label}: already has string data - skipped")
            continue
        # exact part name (case-insensitive): "Violin" must not also catch "Violin 2"
        names = {label.strip().lower()}
        wants_five = any(f.strip().lower() in names for f in five_parts)
        if wants_five and kind not in ("violin", "viola"):
            log.append(f"  {where}: {label}: --five only applies to violin/viola - using 4 strings")
            wants_five = False
        pitches = FIVE if wants_five else TUNINGS[kind]
        if has:
            body = re.sub(r"\s*<StringData>.*?</StringData>", "", body, flags=re.S)
        # Like MuseScore's own "Edit string data" dialog: the lowest string sets the
        # bottom of the playable range (otherwise a 5-string's low C shows out of range).
        low = pitches[0]
        for t in ("minPitchA", "minPitchP"):
            m = re.search(rf"<{t}>(\d+)</{t}>", body)
            if m and int(m.group(1)) > low:
                body = body[:m.start(1)] + str(low) + body[m.end(1):]
        # indent like the instrument's first child element
        cm = re.search(r"\n([ \t]*)<", body)
        indent = cm.group(1) if cm else "        "
        new_body = body.rstrip() + "\n" + string_data_xml(pitches, frets, indent).rstrip("\n")
        new_part = part[:im.start(2)] + new_body + im.group(3) + part[im.start(4):]
        out.append(xml[pos:pm.start()] + new_part)
        pos = pm.end()
        changed += 1
        shown = [pname(p - (12 if kind == "bass" else 0)) for p in pitches]
        log.append(f"  {where}: {label} ({iid or kind}): {len(pitches)} strings "
                   f"{' '.join(shown)}{' (sounding)' if kind == 'bass' else ''}")
    out.append(xml[pos:])
    return "".join(out), changed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("score", type=Path, help=".mscz file")
    ap.add_argument("--five", action="append", default=[], metavar="PART",
                    help="exact part name (case-insensitive) to give 5 strings C G D A E; repeatable")
    ap.add_argument("--frets", type=int, default=24, help="fingerboard length in semitones (default 24)")
    ap.add_argument("--force", action="store_true", help="replace existing string data")
    ap.add_argument("--dry-run", action="store_true", help="only report what would change")
    ap.add_argument("-o", "--output", type=Path, help="output path (default: '<name> (strings).mscz')")
    a = ap.parse_args()

    src = a.score
    if not src.exists():
        sys.exit(f"not found: {src}")
    dst = a.output or src.with_name(f"{src.stem} (strings){src.suffix}")
    if dst.resolve() == src.resolve():
        sys.exit("refusing to overwrite the input file")

    log, total = [], 0
    with zipfile.ZipFile(src) as zin:
        entries = [(info, zin.read(info.filename)) for info in zin.infolist()]
    new_entries = []
    for info, data in entries:
        if info.filename.endswith(".mscx"):
            xml = data.decode("utf-8")
            where = "score" if "/" not in info.filename else info.filename.split("/")[-1]
            xml2, n = process_mscx(xml, a.five, a.frets, a.force, log, where)
            total += n
            data = xml2.encode("utf-8")
        new_entries.append((info, data))

    print(f"{src.name}:")
    print("\n".join(log) if log else "  no violin/viola/cello/double-bass parts found")
    unmatched = [f for f in a.five if not any(f": {f.strip().lower()} (" in line.lower() or f": {f.strip().lower()}:" in line.lower() for line in log)]
    for f in unmatched:
        print(f"  warning: --five '{f}' matched no part")
    if a.dry_run or total == 0:
        print("dry run - nothing written" if a.dry_run else "nothing to change")
        return
    with zipfile.ZipFile(dst, "w") as zout:
        for info, data in new_entries:
            zout.writestr(info, data)
    print(f"wrote {dst}  ({total} instrument blocks updated)")
    print("Next: open it, Instruments panel -> staff gear -> 'Create a linked staff', "
          "set the new staff's type to Tablature (4 or 5 strings), then run String Grip.")


if __name__ == "__main__":
    main()
