# VOCALOID7 ⇄ MuseScore: handoff

Working notes for whoever continues this (human or agent). Written 2026-11-12.
Branch: `claude/busy-cori-tiki06` in `alfonslm/MuseScore` (and the same branch name in
`alfonslm/muse_framework`, untouched so far).

## 1. Goal

The user sings a score with **VOCALOID7** (Yamaha, released 2026-11-11; standalone, VST3, AU, ARA2).
The score has **fermatas and caesuras**. Used standalone, the Vocaloid editor cannot follow them, so
the vocal drifts against MuseScore. We want Vocaloid to follow MuseScore's timing.

Routes that were evaluated, in the user's order of interest:

| | Route | Status |
|---|---|---|
| A | MIDI export where a pause lengthens its bar instead of inserting a bar | **in progress, this branch** |
| C | Load VOCALOID7 as a VST3 in MuseScore as it is today | needs a 10-minute test **by the user** |
| D | Send tempo / beat position to VST plugins | not started; only if C shows it is needed |
| E | ARA2 hosting in MuseScore | not started; large |
| B | Direct `.vpr` (Vocaloid project) export with lyrics | not started; optional |

The user said C, D and E are "the ones that would fix it well", and asked to start with A.

## 2. Facts established (with code references)

**MuseScore side**

- A fermata is a tempo stretch; a caesura / breath / section break is a *pause*: zero ticks long,
  N seconds long. Both end up in `TempoTimeline` (`src/engraving/dom/tempotimeline.h`):
  `TempoTimePoint { utick, time, bps, pause }`. `bps` is quarter notes per second, nominal
  (playback-speed multiplier not applied). A pause is its own point with `pause > 0`; a tempo
  value on the same tick is emitted just before it.
  Sources: `ScoreAutomationController::collectPauses` and `addFermataStretchPoints`
  (`src/engraving/automation/internal/scoreautomationcontroller.cpp`).
- MIDI export: `src/importexport/midi/internal/midiexport/exportmidi.cpp`. Fermatas need nothing
  special, they are ordinary tempo events. MIDI has no pauses, so `PauseMap`
  (`src/engraving/compat/midi/pausemap.cpp`) inserts ticks and maps every event tick through
  `CompatMidiRender::tick()` → `PauseMap::tickWithPauses()`.
- **Legacy behaviour**: one *whole measure* of ticks is inserted per pause, played at a tempo that
  makes it last the pause. Every later bar number is +1 per pause. This is the suspected reason
  the Vocaloid editor "does not like" the file (not yet confirmed with the user's files).
- Lyrics are already written as MIDI lyric meta events (`exportmidi.cpp`, "export Lyrics").
- VST host (`muse/framework/vst/internal/vstaudioclient.cpp`): the `ProcessContext` given to a
  plugin carries only `kPlaying`, `sampleRate` and `projectTimeSamples`. **No tempo, time
  signature, `projectTimeMusic`, bar position, and none of the `k…Valid` flags.**
  Plugin state is saved/restored (`vstplugininstance.cpp`, `getState`/`setState`).
- The audio engine works in absolute time (µs). It has no tempo map at all; `mpe::PlaybackData`
  (`muse/framework/mpe/events.h`) carries timestamped events only.
- There is no ARA code anywhere in either repo.

**Vocaloid side** (from Yamaha's pages via web search; vocaloid.com itself is not reachable from
the cloud sandbox, and nobody has run VOCALOID7 against MuseScore yet)

- VOCALOID7 Editor: standalone / VST3 / AU / ARA2. Spec line: "Other DAW: VST3 / AU / ARA2
  (Transport, Song Position and Tempo Sync)". Note/lyric editing from the host is Cubase-only
  (private integration) – there is no public way to push notes + lyrics into the plugin live.
- VOCALOID6 FAQ 664: as a plain VST3 the editor's own tempo track must match the DAW's; enter it
  by hand or import a MIDI file from the DAW. Automatic tempo following came with ARA2. Unknown
  whether V7 changed that.
- Import formats known for V6: VPR, VSQX, MIDI (with tempo and time signatures). MusicXML import
  is **not** confirmed for the editor. Whether MIDI lyric meta events are imported is unknown.
- Tempo range of the Vocaloid tempo track is believed to be about 20–300 BPM (unverified). This
  matters: see "Why not borrow time" below.

## 3. Route A – what is done

New export option, off by default: **Export dialog → MIDI → "Keep measure numbers at caesuras and
pauses"**. With it on, a pause lengthens the measure it belongs to:

- `PauseMapMode { InsertMeasure, ExtendMeasure }` in `src/engraving/compat/midi/pausemap.h`.
- `PauseMap::calculate(points, measures)` (new overload, plain data, unit-testable):
  - a pause belongs to the measure it interrupts, or to the measure that *ends* at its tick
    (breath at the end of a bar, section break);
  - inserted ticks ≈ pause × current tempo, rounded to whole beats of the bar's time signature
    (4/4 + 2 s at 120 BPM → 8/4; at 100 BPM → 7/4). If the pause is shorter than ¾ beat the unit
    is halved, down to a 64th note;
  - the inserted ticks get their own tempo so the gap lasts **exactly** the pause, then the
    previous tempo is restored. The gap tempo stays within roughly ⅔…1⅓ of the surrounding tempo;
  - `timeSigEvents()`: the lengthened time signature at the start of that measure and the normal
    one at the start of the next measure (unless that one is lengthened too);
  - pauses at tick 0 are ignored (same as legacy);
  - if no MIDI-expressible signature exists (numerator > 255 or denominator > 64) it logs a
    warning and writes none: timing is still exact, bars after it drift.
- `CompatMidiRendererInternal::Context::pauseMode` selects the mode; `ExportMidi::setPauseMode()`.
- `ExportMidi::writeHeader` now collects time signatures into one map (score sigmap first, pause
  overrides second) and writes them; denominator 64 added. Legacy output should be byte-identical.
- Setting `io/midi/exportExtendMeasuresForPauses` (`IMidiImportExportConfiguration`,
  `MidiConfiguration`, stub), read in `notationmidiwriter.cpp`, checkbox in
  `MidiSettingsPage.qml` via `ExportDialogModel::midiExtendMeasuresForPauses`.
- Tests: `src/engraving/tests/midi/pausemap_tests.cpp` (plain-data tests) and
  `MidiRenderer_Tests.caesuraExtendMeasure` in `midirenderer_tests.cpp`.

### Why not "borrow time from the preceding note"

That was the first idea (keep the tick grid untouched, slow the tempo over the last ticks before
the pause). It does not work in practice: a 2 s caesura at 120 BPM squeezed into a 32nd note needs
about 3.6 BPM, which is MIDI's absolute floor and far below what Vocaloid accepts (≈20 BPM). At
20 BPM you must steal ~0.8 of a quarter note, i.e. cut most of the note before the caesura.
Lengthening the bar keeps note lengths and tempo sane and still keeps bar numbers aligned.

### Verification status

Done in the cloud sandbox (no Qt 6.8 there, see section 7):

- `pausemap.cpp` and `compatmidirenderinternal.cpp` compile in the Qt-free engraving build
  (`tools/check_build_without_qt`), no warnings.
- `pausemap_tests.cpp`: all 9 tests pass, built against that Qt-free engraving library.
- `exportmidi.cpp`, `notationmidiwriter.cpp`, `midiconfiguration.cpp`, `midiconfigurationstub.cpp`,
  `exportdialogmodel.cpp` and `midirenderer_tests.cpp` pass `c++ -fsyntax-only` against Ubuntu's
  Qt 6.4 headers (the only errors are unrelated logger/QString overloads caused by that setup).

**Not done:**

- no full build, no link of the MIDI module or the app;
- `MidiRenderer_Tests.caesuraExtendMeasure` has never been run (it needs `ScoreRW`);
- the existing `iex_midi_tests` / `engraving_tests` suites have not been run against the change;
- the QML checkbox has never been rendered;
- no exported file has been opened in VOCALOID7 or any DAW;
- uncrustify has not been run.

## 4. Route A – what is left

1. **Build the real thing with Qt and run the tests** (see section 7). Everything outside
   `src/engraving` is uncompiled.
2. Run `iex_midi_tests` and `engraving_tests` – existing MIDI reference tests must still pass
   unchanged (legacy mode must be byte-identical).
3. Add an end-to-end export test in `src/importexport/midi/tests/midiexport_tests.cpp`:
   `ExportMidi em(score); em.setPauseMode(PauseMapMode::ExtendMeasure);` on
   `midiexport_data/testPauses.mscx`, `testPausesRepeats.mscx` and
   `testPausesTempoTimesigChange.mscx`; generate `-ref.mid` files, and inspect them once by hand
   (the test utils have an SMF→YAML serializer, `utils/smfyamlserializer.h`).
4. Run uncrustify (`tools/codestyle/tidy_file.sh`); it is not installed in the cloud sandbox.
5. **Try it with VOCALOID7** (user): export with the option on, import in Vocaloid, check that
   bar numbers match and the vocal lines up with a MuseScore audio export of the same score.
   Things to watch for and likely fixes:
   - Vocaloid rejects signatures like 17/16 or 7/4 → restrict the gap unit (e.g. always whole
     beats) in `gapTicks()`;
   - Vocaloid ignores mid-file time signatures → fall back to legacy, or go to route B;
   - **pickup bars**: MuseScore writes only nominal time signatures, so an anacrusis shifts every
     barline in any DAW. Cheap follow-up in the same spirit: in ExtendMeasure mode also emit the
     actual length of irregular measures as time signatures (`Measure::ticks()` vs `timesig()`).
6. Known quirk, not touched: `exportmidi.cpp` writes tempo as `1 / bps * tempoMultiplier`, so a
   playback-speed slider ≠ 100 % changes the exported tempo the *wrong way round* (and scales
   pauses). Worth a separate fix + upstream report.
7. Decide with the user whether the option should default to on in their fork.
8. If this goes upstream: drop `docs/vocaloid/` from the PR, add the string to translations
   as the upstream process requires.

## 5. Route C – test by the user (no code)

In MuseScore: Mixer → the vocal staff → Sound → VST3 → VOCALOID7. Open the plugin window, put a
few notes in it, press play / stop / seek in MuseScore. Report:

- does the plugin appear in the VST3 instrument list at all (if not: check how
  `vstpluginmetareader.cpp` classifies it; it may register as an effect or use an unusual
  subcategory);
- does it start/stop with MuseScore; does it start from the right place after seeking;
- does it stay in sync through a tempo change when Vocaloid's tempo track was imported from the
  route-A MIDI file;
- does audio export (File → Export → WAV) contain the vocal (offline mode, `kOffline`).

If start/stop/seek work, the full workflow already exists: A for the tempo map + notes, C for
playback inside MuseScore. If it does not start or ignores position, go to D.

## 6. Routes D, E, B – outlines

### D. Tempo and musical position in `ProcessContext` (est. 1–2 weeks, both repos)

Goal: fill `tempo`, `timeSigNumerator/Denominator`, `projectTimeMusic`, `barPositionMusic` and
set `kTempoValid | kTimeSigValid | kProjectTimeMusicValid | kBarPositionValid` in
`VstAudioClient::process` (`muse/framework/vst/internal/vstaudioclient.cpp`, next to
`projectTimeSamples`).

The hard part is that the audio engine has no tempo map. Suggested design:

1. Define a small POD in the framework, e.g. `muse::audio::TempoMap`: sorted points
   `{ secs, quarterPosition, bps, timeSigNum, timeSigDen }`, with pauses represented as a segment
   where quarterPosition does not advance.
2. Build it in MuseScore from `TempoTimeline` + sigmap + repeat list (unwound), next to where
   playback data is produced (`src/playback/internal/playbackcontroller.cpp`,
   `src/engraving/playback/`), and rebuild on tempo changes and on tempo-multiplier changes.
3. Carry it to the engine: either a field in `mpe::PlaybackSetupData` / `PlaybackData`
   (`muse/framework/mpe/events.h`) or a sequence-level call on `IPlayer`
   (`muse/framework/audio/main/iplayer.h`) that is forwarded over the engine RPC
   (`audio/engine/internal/enginerpccontroller.cpp`). Sequence-level is cleaner: the map is per
   score, not per track.
4. `VstSynthesiser::process` / `VstFxProcessor::process` look up the map at
   `m_currentPosition` and pass it to `VstAudioClient`.
5. Check `git log` upstream for musescore/MuseScore PR 26663 (mentioned on musescore.org as the
   place where kPlaying / projectTimeSamples were added) before designing, to match its style.

Caveat: this only helps plugins that *use* host tempo. Per the V6 FAQ Vocaloid as plain VST3 does
not; so D is only justified if test C shows Vocaloid refusing to run without valid tempo flags.

### E. ARA2 host (est. 1.5–3 months, high risk)

What it would give: Vocaloid reads MuseScore's tempo map and time signatures itself (ARA
"musical context") and follows transport. What it needs:

- ARA SDK (Apache-2.0, compatible with GPLv3) as a dependency (goes through `muse_deps`);
- discovering the ARA factory on the VST3 (`IPlugInEntryPoint` / `IMainFactory`), creating a
  document controller, a document, a musical context, a region sequence and (for a generator
  like Vocaloid) whatever minimal audio source / playback region it insists on;
- host-side controllers: audio access, archiving, content access (this is where the tempo map
  and bar signatures are served – same data as route D's `TempoMap`), model update, playback;
- binding each plugin instance to the document with the right roles;
- persisting the ARA archive in the project file next to the VST state.

Risks: Yamaha lists specific supported ARA hosts; behaviour in an unknown host is untested and
the plugin is closed source. Cannot be developed or tested in the Linux cloud sandbox at all
(Vocaloid is Windows/macOS and licensed). Do D first: its `TempoMap` is a prerequisite.

### B. Direct `.vpr` export (est. 1–2 weeks)

A `.vpr` is a zip with `Project/sequence.json` (tempo track, time signatures, tracks → parts →
notes with `lyric`, `phoneme`, `pos`, `duration`, `number`, `velocity`). Undocumented; V7 may
have changed it. **Needs a sample `.vpr` saved from VOCALOID7** (asked from the user). Reuse
`PauseMap` in ExtendMeasure mode for timing. Start as a new `src/importexport/` module modelled
on `lyricsexport`. Only worth it if retyping lyrics after MIDI import is the pain point.

## 7. Building and testing in the Claude cloud sandbox

- The `muse` and `muse_deps` submodules are not checked out by default. `muse` can be taken from
  the local `muse_framework` checkout; `muse_deps` (public, upstream) is readable through git:

  ```bash
  git -c submodule.muse_framework.url=/home/user/muse_framework -c protocol.file.allow=always submodule update --init muse
  ```

  ```bash
  git submodule update --init --depth 1 muse_deps
  ```

- **Qt ≥ 6.8 is required for the normal build and is not available**: Ubuntu 24.04 ships 6.4, and
  `download.qt.io` is blocked by the environment's network policy. To build the app or the Qt
  test binaries, the user has to allow `download.qt.io` (then `pip install aqtinstall` and
  `aqt install-qt linux desktop 6.10.x`), or the work has to happen on a real dev machine.
- **Without Qt**, `tools/check_build_without_qt` builds `global`, `draw`, `engraving`, MusicXML
  and Guitar Pro (~25 min on 4 cores). That is enough to compile `PauseMap` and run
  `pausemap_tests.cpp` against it with system gtest (`apt-get update && apt-get install -y
  libgtest-dev`):

  ```bash
  B=/path/to/build; cmake tools/check_build_without_qt -B "$B" -GNinja -DCMAKE_BUILD_TYPE=Debug && ninja -C "$B" engraving_app
  ```

  ```bash
  cd "$B" && c++ -std=gnu++20 -g -DENGRAVING_NO_ACCESSIBILITY -DENGRAVING_NO_API -DENGRAVING_NO_INTERACTIVE -DENGRAVING_NO_INTERNAL -DNO_QT_SUPPORT -I. -I/home/user/MuseScore/src -I/home/user/MuseScore -I/home/user/MuseScore/muse/framework -I/home/user/MuseScore/muse/framework/global /home/user/MuseScore/src/engraving/tests/midi/pausemap_tests.cpp -o pausemap_tests -Wl,-rpath,$PWD/_deps/zlib/lib engraving/libengraving.a draw/libmuse_draw.a global/libmuse_global.a engraving/libengraving.a draw/libmuse_draw.a global/libmuse_global.a libpugixml.a _deps/zlib/lib/libz.so -ldl -lgtest -lgtest_main -lpthread && ./pausemap_tests
  ```

  Not buildable this way: `src/importexport/midi` (uses `QIODevice`), anything QML, and the
  score-file based tests (`ScoreRW`).

## 8. Open questions for the user

1. What exactly goes wrong in the standalone Vocaloid editor today, and which file is imported
   (MIDI? something else)? A screenshot would settle whether the inserted bar was the problem.
2. Files asked for: the score (`.mscz`), a tiny `.vpr` saved from VOCALOID7 (a few notes with
   lyrics, one tempo change, one time-signature change), the list of import formats in V7's
   File → Import dialog, and the result of test C.
3. Is the vocal mixed with a MuseScore audio export of the other parts? (If yes, exact pause
   length matters, which is why the gap has its own tempo.)
4. Does the score have repeats or a pickup bar?

## 9. Sources

- https://www.yamaha.com/en/news_release/2026/26111101/
- https://www.vocaloid.com/en/news/news_49/
- https://www.kvraudio.com/news/yamaha-releases-vocaloid7-69778
- https://www.vocaloid.com/en/support/faq/664
- https://www.vocaloid.com/en/vocaloid6/specs/
- https://www.vocaloid.com/en/editor_sysreq
- https://rsc-net.vocaloid.com/assets/pdf_files/bb/VOCALOID6_Reference_Manual_6130_ENG.pdf
- https://musescore.org/en/node/376057
