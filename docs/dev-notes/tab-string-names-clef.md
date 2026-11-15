# String-name tablature clef (`ClefType::TAB_STRING_NAMES`)

A TAB clef (Master Palette > Clefs) that draws each staff line's open-string note name
(e.g. `D A D G B E`) instead of the generic "TAB" text, so it always matches the staff's
actual tuning and works for any number of strings. It does not change the plain "TAB"
clef or its default status; it's an additional option in the Master Palette only
(`clefsMaster`, not `clefsDefault`, in `src/palette/internal/palettecreator.cpp`).

Upstream status: proposed as [musescore/MuseScore#35070](https://github.com/musescore/MuseScore/pull/35070)
against [issue #34967](https://github.com/musescore/MuseScore/issues/34967), closed without merging — this
fork doesn't pursue upstream contributions (see `CLAUDE.md`). The feature lives here only.

## Where the code is

- `src/engraving/types/types.h`, `typesconv.cpp` — the `ClefType` enum value and its name/translation.
- `src/engraving/dom/clef.h`, `.cpp` — the `ClefInfo::clefTable` entry (`SymId::noSym`: no fixed glyph,
  it's drawn dynamically) and the `Clef::LayoutData` fields it uses (`stringNames`, `stringNamesLineDist`).
- `src/engraving/rendering/score/tlayout.cpp` (`TLayout::layoutClef`) — reads the staff's real string data
  and computes the bbox.
- `src/engraving/rendering/score/tdraw.cpp` (`TDraw::draw(const Clef*, ...)`) — draws the letters.
- `src/engraving/rendering/single/singlelayout.cpp` — the isolated-render path (palette icon), which has no
  real staff/string context and just falls back to the plain TAB glyph.
- `src/engraving/api/v1/apitypes.h`, `src/engraving/editing/editnote.cpp`,
  `src/braille/internal/braille.cpp`, `src/importexport/mnx/internal/shared/mnxtypesconv.cpp`,
  `src/importexport/musicxml/internal/export/exportmusicxml.cpp` — the usual places that switch
  exhaustively (or near-exhaustively) on `ClefType` and needed a case added alongside the other TAB variants.

## Design decisions and why

**Drawn dynamically, not a fixed symbol.** The clef table entry uses `SymId::noSym`. The letters depend on
the staff's actual tuning, which can change mid-piece (`StringTunings`), so there's no single glyph to point
at. `TLayout::layoutClef` builds the string list itself from `Part::stringData()` and stores it in
`Clef::LayoutData::stringNames` (one entry per staff line, top to bottom); `TDraw::draw` just renders that
list. When no real string data is available (e.g. the palette preview icon, rendered through
`singlelayout.cpp`/`singledraw.cpp` outside a real score context), it falls back to `SymId::sixStringTabClef`
— the existing plain TAB glyph.

**Font is hardcoded to "Edwin", not read from style.** The natural-looking choice — `Sid::staffTextFontFace`,
or the TAB staff's own `fretFont()` — turned out to be wrong, and finding out why took three rounds of bug
reports ("the letters are giant/wrong size") before landing on the real cause: `Sid::staffTextFontFace` is a
score-configurable style property, and a score's style can point it at a music-symbol font (Bravura, Leland,
a Finale font, etc.). Those fonts can remap plain Latin letters to unrelated glyphs with wildly different
design sizes, which is exactly what one real test score did. `fretFont()` has the same kind of problem from
the other direction: it's a `Font::Type::Tablature` font defined only for digits, "X", and a small
letter-fret array, not a general alphabet, so arbitrary Latin letters there are unpredictable. Both `tlayout.cpp`
and `tdraw.cpp` now hardcode `Font(u"Edwin", Font::Type::Text)`, matching an existing precedent already in
`tdraw.cpp` (the irregular-measure marker), rather than trust any style-configurable font for this.

**Font size is derived from the staff's line distance, not a fixed point size.** A fixed size (even a
reasonable-looking `10.0 * item->magS()`, matching the TAB fret-number font's own default) overlapped on a
real test score's custom TAB staff type, which used a looser line distance (1.5 sp) than the implicit
assumption baked into "10pt looked fine on the staves I tried." The fix: build a probe `Font`/`FontMetrics`
at a reference size, measure its actual cap height, then scale so the *drawn* cap height is a fixed fraction
(0.65) of the real line-to-line distance — so it's correct for a tight or a spread-out tab staff type, not
just the ones tested by hand. The `0.65` fill fraction is a reasonable starting guess tuned against one real
score; nobody has pushed on it further since.

**Each letter builds its own `Font`/`FontMetrics`, rather than sharing one across the loop.** Defensive,
from mid-debugging when the symptom looked like per-letter size inconsistency within a single clef (it
turned out to be the font-family issue above, not this), but harmless and kept.

**The string-data lookup uses the clef's own tick, not the tick used for staff-type selection.**
`TLayout::layoutClef` already special-cases the tick it uses to pick a staff type, to get the right staff
type for a clef at the very end of a measure (around a `StaffTypeChange`). That tick is *not* necessarily
the clef's own tick. The open-string names must reflect the tuning in effect *at the clef*, which can differ
if a mid-measure re-tuning happens before that special-cased tick — so the `StringData` lookup explicitly
uses `item->tick()`, independent of the staff-type-selection tick. (Found by CodeRabbit on the upstream PR,
not by hand-testing — the test scores used didn't happen to hit this case.)

**`TDraw::draw` reads the line distance from `LayoutData`, not by re-deriving it.** It used to look up
`item->staff()->staffType(item->tick())` again at draw time to get the line distance. That lookup isn't
guaranteed to resolve to the same `StaffType` instance `layoutClef` used (same kind of edge case as above,
around a staff-type change coinciding with the clef), which could desync the drawn letters from the bbox
they were laid out against. `TLayout::layoutClef` now stores the line distance it actually used in
`Clef::LayoutData::stringNamesLineDist`; `TDraw::draw` reads that back instead of re-deriving it. (Also
CodeRabbit, not hand-testing.)

## Known limitations

- **MEI export.** `src/importexport/mei/internal/meiconverter.cpp`'s clef converter falls back to a generic
  SMuFL-glyph lookup (`ClefInfo::symId(clef)`) for any clef type it doesn't special-case by name. Every other
  TAB clef variant has a real glyph there; this one's `SymId::noSym` means MEI export of a score using this
  clef will omit the clef's glyph reference. Doesn't affect `.mscz`, MusicXML export, or normal use. Not
  fixed — narrow use case, left as a known gap.
- **No vtest/unit test.** The feature was hand-verified against a real score (see the bug-hunting notes
  above) but has no automated regression coverage.
- **`0.65` fill fraction is a guess**, not a measured value from multiple staff types/fonts. If letters ever
  look slightly too tight or too loose on some staff configuration, that's the first knob to turn.
