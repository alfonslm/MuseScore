# FIXME: violin/viola/violoncello/contrabass StringData was hand-edited

`instruments.xml` in this directory is normally **generated** by
`update_instruments_xml.py` from a canonical Google Sheet (see `README.md`).
Direct edits to `instruments.xml` are supposed to be overwritten the next
time that script is run from fresh spreadsheet data.

On the `string-grip` branch, `<StringData>` was added by hand to four
`<Instrument>` entries in `instruments.xml`, bypassing that process, because
the spreadsheet is not editable by community members (only MuseScore team
members can edit it directly; everyone else can only comment on it or file
an issue, per `README.md`). Without `<StringData>`, MuseScore offers no
Tablature staff type for these instruments, which the built-in String Grip
extension (`share/extensions/stringgrip/`) needs.

## What was added

Written pitch, 24 frets each — the same scheme already used for
`electric-bass` (which is why the contrabass numbers match it exactly, a
double bass and an electric bass share a tuning and both notate an octave
above the sounding pitch):

| Instrument id | strings (MIDI, low→high) |
|---|---|
| `violin`      | 55 62 69 76 |
| `viola`       | 48 55 62 69 |
| `violoncello` | 36 43 50 57 |
| `contrabass`  | 40 45 50 55 |

## Risk

If `update_instruments_xml.py` is ever re-run in this fork (e.g. after
pulling in an upstream change to `instruments.xml` that triggers a
regeneration, or by running it manually), it will rebuild `instruments.xml`
from the spreadsheet and **silently drop these four `<StringData>` blocks**,
since the spreadsheet itself doesn't have this data. Tablature would stop
being offered for these four instruments again with no error.

## The correct fix

Get this data into the canonical spreadsheet so the generator produces it
naturally, instead of carrying a permanent hand-edit:

1. Comment on the [Instruments spreadsheet](https://docs.google.com/spreadsheets/d/1SwqZb8lq5rfv5regPSA10drWjUAoi65EuMoYtG-4k5s/edit#gid=516529997)
   requesting `<StringData>` (24 frets, the tunings above) for Violin, Viola,
   Violoncello and Contrabass — the same columns already filled in for
   Electric Bass and the guitars — **or**
2. File a GitHub issue on [musescore/MuseScore](https://github.com/musescore/MuseScore/issues/new)
   with the same request, for a team member to apply to the spreadsheet.
   Suggested issue text:

   > **Add string tuning to Violin, Viola, Violoncello and Contrabass**
   >
   > These four instruments have no `<StringData>` in `instruments.xml`, so
   > MuseScore offers no Tablature staff type for them (the "Edit string
   > data…" button is also hidden when an instrument has 0 strings).
   > Electric bass and the guitars already have string data; the same
   > written-pitch scheme applies here (bowed strings have no frets, but
   > counting fingerboard position in frets is the existing convention for
   > fretless strings in `instruments.xml`, e.g. `electric-bass`):
   >
   > | Instrument | frets | strings (MIDI, written pitch) |
   > |---|---|---|
   > | violin | 24 | 55 62 69 76 |
   > | viola | 24 | 48 55 62 69 |
   > | violoncello | 24 | 36 43 50 57 |
   > | contrabass | 24 | 40 45 50 55 |

Once that lands upstream and `instruments.xml` is regenerated with it, this
file and its manual `<StringData>` blocks can be deleted — the regeneration
will carry the same values (or better-reviewed ones) forward on its own.

## Not yet confirmed

Per `share/extensions/stringgrip/README.md`: the violin/viola ranges used
by String Grip's fingering engine have not yet been checked by a violinist.
Whoever reviews the spreadsheet request should be aware String Grip depends
on this exact tuning, not just any string count.
