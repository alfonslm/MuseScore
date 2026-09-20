# String Grip — MuseScore Studio 4.7 extension

String Grip fingers the string parts in a score (violin, viola, cello, double
bass, electric bass, guitar). It picks a string and a fret for every note, writes
them so a tablature staff shows that fingering, and colours what is hard or
impossible to play.

This file defines what the colours and ranges mean. When the code and this file
disagree, this file states the intent.

---

## 1. The colours

| Colour | Meaning |
|---|---|
| none (white/black) | Normal playing for a grade-3 string player. |
| **olive** | **Grade-3 maximum.** A grade-3 ensemble can play it, but it shouldn't dominate a grade-3 piece. (Grades 1–2 are beginner level, where other things dominate.) |
| **amber** | **The highest clearly defined grip limit.** Professional level; use it only when the piece needs it. |
| **red** | **Beyond professional level:** at best a master can play it, or it isn't playable at all (e.g. two notes on one string). |

Grades follow string-orchestra grading (ASTA, Alfred, SHAR); see section 9.

**Which staff shows what**, when the part has a tab staff:

| Staff | White means | Coloured when |
|---|---|---|
| **Tab** | easy to play | any grip problem: stretch, shift, double stop, high position, impossible chord |
| **Notation** (standard staff) | in range | only when the note is out of range (red): below the lowest string or off the fingerboard |

Without a tab staff, the notation staff shows all the colours, since there's
nowhere else to put them.

## 2. Words used in this file

- **Fret** — a semitone step above the open string. Bowed strings have no frets,
  but counting in frets makes the hand easy to describe: fret 1 on the cello
  G string is G♯, fret 2 is A.
- **Fret 0** — the open string (the nut). It is counted as a physical fret when a
  range is measured, e.g. violin 0–9. That's only to size the reach correctly: an
  open string needs no finger, so it is never a note the hand has to cover.
- **Range** — written as frets, e.g. *cello 1–6*. It describes how far the hand
  reaches, not a fixed place: the same size of hand can sit anywhere on the neck.
- **Line** — notes played one after another.
- **Double stop** — two or more notes played together on different strings.

## 3. Lines: what counts as a stretch or a shift

A line is judged with two measures:

1. **What the hand holds right now:** the current note plus the previous two.
   This decides whether a note is a **stretch**.
2. **Where the hand has been since its last shift.** This decides whether the
   hand has actually moved, i.e. a **shift**.

**Example, cello: "white reach is 1 to 6, but not 1 and 6 next to each other."**

- The hand covers **1–5 or 2–6** freely, and slides between the two as needed.
  So `4 4 1 2 4 6` on one string is all white: when the 6 is played, the hand
  no longer holds the 1.
- **1 and 6 next to each other** (1 then straight to 6, or held together) is a
  pinky stretch → **olive**.
- Anything past the whole 1–6 range (e.g. 1 … then 7) means the hand has moved →
  **shift** (olive).

The same logic applies to every instrument with its own numbers (table in
section 5).

**Shifts.** Every shift is olive. Shifts are found, not graded by distance; the
guides only say "large leaps" are grade 5, without a distance. The fingering
search always picks the fingering with the fewest shifts. Untick **Every shift**
in the dialog to see only the grade-level flags.

**Stretch or shift** is decided by what comes next:
- A white or olive stretch is always preferred over shifting out and straight back.
- **Fast notes** (under ~0.18 s apart, i.e. 16ths from about ♩=85) leave no time to
  shift. A single note sticking out is then reached with a **professional stretch
  (amber)** instead of two shifts. Cello: up to 1–7.
- If the hand stays up there, it's one shift.

**Open strings** never count: they need no finger, and they don't reset the hand.
"Fret 7 = the next string open" follows on its own: the engine plays the open
string instead, except on the top string.

## 4. Double stops

A double stop holds both ends at once, so it gets less room than a line
("way harder to stretch both ways"). The strings must be next to each other when
bowed; with `pizz.` any strings work. 3- and 4-note chords are olive, because
they must be broken when bowed.

## 5. The ranges

All ranges are frets, per section 2.

| | **Line: white** | **Line: olive** (stretch, no shift) | **Line: amber** (fast only) | **Double stop: white** | **DS: olive** | **DS: amber** | **Red** |
|---|---|---|---|---|---|---|---|
| Violin | 1–7 or 2–8 | up to 0–9 | – | 2–6 (3rds, 6ths, open strings) | 2–8 (octaves) | 0–9 (tenths) | beyond |
| Viola | 1–7 or 2–8 | up to 0–9 | – | 2–6 | 2–8 | 0–9 | beyond |
| Cello | 1–5 or 2–6 | 1–6 | 1–7 | 1–5 | 1–6 | 1–7 | beyond |
| Double bass | 1–4 | 1–5 | – | 1–3 | 1–4 | 1–5 | beyond |
| Electric bass / guitar | 1–4 | – | – | 1–4 | 1–6 | 1–7 | beyond |

**High positions (olive), above the grade-3 positions:** violin above fret 14
(5th position), viola above fret 10 (3rd position, per ASTA), cello above
fret 12 (thumb position is grade 4), double bass above fret 12.

**Red** is beyond the amber limit (master level at best), and also covers what can't be played at all:
- two notes that need the same string (e.g. cello C2 + D2);
- more notes than strings;
- strings too far apart to bow together;
- notes below the lowest string or off the end of the fingerboard.

**Units.** *Semitones* (default) uses the fret difference: 1–6 = 5.
*Millimetres* uses the real distance between those two fret positions, so the
same hand covers more frets higher up (a violin 2–8 hand covers roughly 12–20 up
the neck). Both agree in first position.

**Where the numbers come from:**
- Cello and double bass: set by Alfons.
- Violin and viola: from the grade guides and standard technique. The closed hand
  is a perfect fourth, and one finger extends. **Not yet confirmed by a violinist.**
- Bass amber double stop (1–5): a proposal, not yet confirmed.

## 6. Your fingering is kept

String Grip doesn't overwrite fingering already in the score. For each
**phrase** (notes between rests or pauses), it scores your fingering and the best
one it can find:

| | white | olive | amber | red |
|---|---|---|---|---|
| weight | 0 | 1 | 2 | 8 |

A phrase's score is **(sum of the weights)²**, so a cluster of problems costs more
than the same problems spread out. Red weighs 8 because it's master level at best.

It writes its own fingering **only when it scores strictly lower**; on a tie,
your fingering stays. Even then the change is **minimal**: starting from its
own fingering, it puts your choice back note by note wherever that doesn't raise
the phrase score, so only the notes that had to change are rewritten. The colours
always show the fingering that ends up in the score. The summary line says how
many phrases were kept and how many were improved.

**Only the tab staff counts.** Your fingering is read from the tab staff, and
String Grip writes fingering to the tab staff only. MuseScore stores string/fret
separately on each staff, even linked ones, so a hidden standard staff can hold
old values; those are ignored. A part with no tab staff has no fingering of yours
to keep: String Grip fingers it itself.

Untick **Keep my fingering** to let String Grip rewrite everything (the old
behaviour). Notes without a fingering in the score are always fingered by
String Grip.

## 7. Overview: olive shouldn't dominate

Olive is the grade-3 maximum: fine now and then, but it shouldn't dominate a
grade-3 piece. So besides colouring single notes, String Grip shows:

- **per part**, the share of white / olive / amber / red notes (in the summary);
- **passages where olive or worse dominates**: any 4-bar block where more than
  half of the notes are olive or worse (blocks under 8 notes are skipped). These
  are listed first in the findings.

**Difficulty compounds.** Grading systems add up across dimensions: rhythm,
tempo, key and grip all count together. A passage with a complicated rhythm
should stay white, or at most olive, for the grip, even in a grade-5 piece. For
now String Grip only measures the left hand, so judge dense olive passages
together with the rhythm. (Planned: combine with the per-bar difficulty grader,
which does score rhythm.)

## 8. Other rules

- `pizz.` / `arco` text (staff text or playing technique) switches the
  string-adjacency rule.
- Only a part's first staff is checked, so keyswitch staves are skipped. Other
  staves in the part with the same notes (a linked tab staff) get the same
  fingering and colours.
- Voices are separate players by default (voice 2 = divisi). A toggle treats all
  voices as one player.
- A low, close double stop on bass can be muddy. That's a musical issue, not a
  playability one, so it isn't coloured.

## 9. Grade-level basis

A full per-grade summary with quotes and links is in the header of `engine.js`.
In short:
- **Extensions:** none at grade 1 (violin only the low 1st finger on E). From
  grade 2, "1st through 3rd positions with all extensions", so standard extensions
  aren't flagged.
- **Positions at grade 3:** "1st through 5th positions". ASTA: violas up to 3rd.
  Cello thumb position is grade 4.
- **Double stops:** simple ones at grades 2–3; more at grade 4; octaves and
  extended double-stop passages at grade 5; tenths are advanced.
- **Shifting:** rare at grade 2, fluent at grade 3; "large leaps" at grade 5.

Sources: [ASTA grading summary](https://stringorchestrasheetmusic.com/wp-content/uploads/2015/05/ASTA-GRADING-SYSTEM.pdf),
[Alfred string orchestra guidelines](https://images.alfred.com/submissions/orchestra-guidelines.pdf),
[SHAR difficulty ratings](https://www.sharmusic.com/pages/sheet-music-difficulty-ratings),
[ASTACAP levels (cello, bass)](https://bairdd.wixsite.com/celloandabass/asta-advancement-levels).

**Planned:** a target-level checker. You pick a grade; olive marks what's at
that grade, amber what's above it, red what's not reasonably playable.

---

## Setting up tab staves for violin, viola, cello, double bass

MuseScore's built-in bowed strings have no string tuning, so no tablature staff
type is offered for them. Add the tuning to a *copy* of the score first:

    uv run python tools/add_string_data.py "My Score.mscz" --dry-run
    uv run python tools/add_string_data.py "My Score.mscz" --five "Violin"

- It writes "My Score (strings).mscz"; the original is never touched.
- `--five PART` (exact part name) gives a violin or viola five strings,
  C3 G3 D4 A4 E5.

Then in MuseScore:
1. Instruments panel → the staff's ⚙ → **Create a linked staff**.
2. Set the new staff's type to **Tablature** (4 or 5 strings).
3. Run String Grip.

## Install

Drag `StringGrip-<version>.mext` onto the MuseScore window, then enable it under
Home → Plugins. Menu: Plugins → **String Grip: check playability…**. Every change
gets a new version number, so MuseScore offers to replace the old one.

A full orchestral score takes a few seconds (about 4 s for ~10,000 string notes).

## Files

- `engine.js` — fingering and playability engine (pure JS); the grade notes are
  in its header.
- `score.js` — walks the score, applies colours and string/fret.
- `Main.qml` — the dialog. `quick.js`, `clear.js` — menu actions without a dialog.
- `tools/add_string_data.py` — adds string tuning to bowed parts in a .mscz copy.
- `test.js`, `test_score.js` — `node test.js && node test_score.js`.
- `build.sh` — runs the tests and builds `StringGrip-<version>.mext` +
  `StringGrip-<version>-source.zip`.
