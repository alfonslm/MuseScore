# ARA2 hosting for VOCALOID7: architecture

Written 2026-11-16 by the fork's managing session, after reviewing `HANDOFF.md`. This is the frame for
route E of the handoff. It fixes the boundaries, the order of work and how each step is verified. It does
not contain the detailed design: that is `ARA-HOST-OUTLINE.md`, written from this document.

## 1. Why this is the next step

State of the handoff's routes on 2026-11-16:

| Route | State |
|---|---|
| A, MIDI export that keeps bar numbers | Merged in `beta`. Its Qt tests have not run yet (unit tests only started working in CI today). |
| C, VOCALOID7 as a VST3 instrument | Tried by the user on 2026-11-15: it loads and plays. |
| "Keep running when playback is stopped" | Merged in `beta` (alfonslm/muse_framework#11, alfonslm/MuseScore#25). The user confirmed it works. |
| Crash on quit with VST3 plugins | Fix written (alfonslm/muse_framework#13, alfonslm/MuseScore#28), waiting for a test on the user's Mac. |
| D, tempo and bar position in `ProcessContext` | Merged in `beta`. Not confirmed that VOCALOID7 uses it. |
| E, ARA2 host | Not started. **This document.** |
| B, `.vpr` export | Not started, blocked: needs a sample `.vpr` from the user. |

The goal is unchanged: VOCALOID7 follows MuseScore's timing, including fermatas (tempo stretches) and
caesuras (pauses). Yamaha's documentation for VOCALOID6 says a plain VST3 instance does not follow the host's
tempo map and that automatic following came with ARA2. Route D gives a plugin the tempo at the playhead; ARA
gives it the whole tempo map and the bar structure in advance, which is what an editor with its own piano
roll needs. So E is the route that can close the gap, and D's `MusicalTimeMap` is the data it serves.

**Open point that decides how much of this is needed:** whether VOCALOID7 as a plain VST3 already follows
tempo changes with route D in the user's `beta` build. If it does, only work package 1 below is worth
building, as a diagnostic. Ask the user before starting work package 3.

## 2. Constraints

- **No way to run VOCALOID7 here.** It is macOS/Windows only and licensed. The cloud sandbox is Linux
  without Qt 6.10. Everything must be verifiable in three ways only: unit tests in CI (Linux), the macOS
  arm64 build in CI, and short manual checks the user runs on their Mac with the CI build.
- **The ARA SDK cannot go through `muse_deps`**: that repository is upstream's and not writable. ARA's
  interface is a small set of C headers (`ARA_API`, Apache-2.0). They are vendored into the framework fork.
  `ARA_Library` (C++ convenience classes) is not used: fewer files to carry, and the host side we need is
  small.
- **Fork conventions** (`CLAUDE.md`): paired branches of the same name in `alfonslm/muse_framework` and
  `alfonslm/MuseScore`, pull requests to `beta`, framework merged first with a merge commit, `muse` pinned to
  it. An interface change needs the implementation, the stub and the mock.
- **Nothing changes for plugins that don't use ARA.** ARA is off unless switched on for an instrument.
- **Small steps.** Each work package is one pull-request pair that builds, passes its tests and can be
  merged on its own, so that upstream merges stay easy and a wrong turn costs one package.

## 3. Shape of the solution

```
MuseScore (src/)                         muse_framework (framework/vst/)
----------------                         --------------------------------
NotationPlayback                         internal/ara/
  musicalTimeMap()  ──────────────┐        AraFactoryProbe      finds a plugin's ARA factory (WP1)
PlaybackController                │        AraMusicalContent    MusicalTimeMap → ARA tempo and bar entries (WP2)
  pushes the map on setup         └────►   AraDocument          one ARA document per score and plugin type:
  and on change (WP3)                                           document controller, musical context,
Mixer sound menu                                                region sequence, host callbacks (WP3)
  "Follow the score with ARA" ─────────►   VstPluginInstance    binds the instance to the document (WP4)
  (WP4)                                    IAraHost (context)   what the app talks to (WP3)
                                         thirdparty/ara_api/    vendored headers (WP1)
```

Decisions:

1. **Where the code lives.** A sub-directory `framework/vst/internal/ara/` inside the existing `muse_vst`
   module, built only when a new CMake option `MUSE_MODULE_VST_ARA` is on (default on where VST is built).
   The vendored headers are in `framework/vst/thirdparty/ara_api/` with their licence file.
2. **Main thread only.** All ARA model calls (document controller, musical context, binding) happen on the
   main thread, like the rest of the VST3 lifecycle in `VstPluginInstance`. The audio thread never touches
   ARA objects. The outline must state, for each host callback, which thread ARA allows it to arrive on,
   quoting the header.
3. **The tempo map comes from the app, not from the engine.** `MusicalTimeMap` already exists on the main
   thread in `NotationPlayback::musicalTimeMap()`; `PlaybackController` sends it to the player in
   `setupPlayer()` and on change (`playbackcontroller.cpp`, near the two `setMusicalTimeMap` calls). It is
   sent to the ARA host at the same two places. No new data path through the audio engine.
4. **One interface for the app:** a context-level `IAraHost` exported by the VST module (with stub),
   with roughly: set the musical time map; say whether a plugin resource supports ARA. The app never sees ARA
   types.
5. **Conversion is a pure function.** `MusicalTimeMap` → ARA tempo entries and bar signatures is plain
   data in, plain data out, with no ARA calls, so it is unit-tested exhaustively. It also owns the policy for
   what ARA cannot express (see section 5).
6. **Opt-in per instrument,** stored like "keep running when stopped": a key in the instrument's
   `AudioUnitConfig` (host-set, so `isPluginStateConfigKey()` keeps it apart from plugin state). The mixer's
   sound menu shows the item only for plugins whose module has an ARA factory. Binding has to happen when the
   plugin instance is created, so toggling it recreates the synthesizer; that is acceptable.
7. **Teardown order is part of the design, not an afterthought.** ARA objects must be destroyed before the
   plugin component is terminated and before the module is unloaded. alfonslm/muse_framework#13 rewrites
   exactly that release path (`VstPluginInstance::unload()`, `VstInstancesRegister::unloadAll()`); the ARA
   work builds on it and must name where in that sequence each ARA object is destroyed.

## 4. Work packages, in order

Each has a deliverable the user or CI can check. Do not start a package before the previous one is merged.

| # | Package | What it adds | How it is verified |
|---|---|---|---|
| 1 | **ARA probe** | Vendored headers, CMake option, `AraFactoryProbe`: given a loaded VST3 module, find the ARA main factory and read the factory's fields (API generations, factory id, document archive id, content types it can analyse or accept, supported playback transformations). A diagnostic entry that lists this for every scanned plugin. | Unit test with a fake VST3 factory object. On the user's Mac: the diagnostic shows what VOCALOID7 reports. **This output decides the rest**: it tells us whether VOCALOID7 exposes ARA through VST3 at all in a host it doesn't know, and which API generation to speak. |
| 2 | **Musical content** | `AraMusicalContent`: the conversion of decision 5, with the pause and irregular-bar policy. | Unit tests only: plain tempo, tempo changes, fermata stretch, a caesura, pickup bar, a bar lengthened by a pause, time-signature changes, empty map. |
| 3 | **Document** | `AraDocument` and `IAraHost`: create the document controller from the factory, a document, one musical context served from package 2 through the content-access callbacks, one region sequence per bound instance; update the musical context when the map changes; the other host callback tables with the minimal behaviour ARA requires. App side: `PlaybackController` pushes the map. | Unit tests against a **fake ARA plugin** written for the tests (a struct of C function pointers that records the calls it gets and reads the host's content back through the callbacks). Asserts the order of calls ARA requires. |
| 4 | **Binding and the switch** | `VstPluginInstance` binds to the document with the roles the plugin offers, before the point ARA requires; teardown in the right order; the config key; the mixer menu item (MuseScore side). | Unit tests for the config key and menu model; macOS CI build; then the user tries VOCALOID7: does its tempo track show MuseScore's tempo map and bars, and does it stay in sync through a fermata and a caesura. |
| 5 | **Playback requests** | The plugin asking the host to start, stop or move the playhead (ARA playback controller) is forwarded to MuseScore's playback. | Fake plugin in unit tests; user check. |
| 6 | **Persistence** | ARA document archive saved with the score next to the VST state. | Round-trip unit test with the fake plugin; user check. |

Packages 5 and 6 are outlined only after the user's result for package 4.

## 5. Known hard points the outline must settle

1. **Pauses.** In `MusicalTimeMap` a caesura is two tempo points with the same `quarters` and different
   `secs`: the music stands still. Find out from the ARA header what a tempo-entry list may contain (must
   quarter positions strictly increase? is a tempo of zero allowed?) and choose a representation. If a
   standstill cannot be expressed, the fallback is the one route A uses for MIDI: lengthen the bar by a whole
   number of beats at a sane tempo so that later bars keep their numbers (`PauseMap`, ExtendMeasure mode,
   `src/engraving/compat/midi/pausemap.*`). Note that this would need bar entries and tempo entries to agree
   with what the MIDI export writes, since the user imports that file into Vocaloid for the notes.
2. **Irregular bars.** `BarPoint::lengthQuarters` describes pickups and lengthened bars. ARA bar signatures
   are numerator/denominator at a quarter position. State how each irregular bar is expressed.
3. **What a generator plugin needs.** ARA was designed around audio sources that the plugin analyses.
   VOCALOID7 generates audio. The probe (package 1) and the header tell what the minimum document is: does a
   playback renderer need an audio source, an audio modification and a playback region to render anything,
   and if so what does the host provide for a plugin that has no input audio.
4. **When to bind.** The exact point in the VST3 instance's life at which
   `bindToDocumentControllerWithRoles` must be called, relative to `initialize`, `setActive`, and creating
   the edit controller and the view. Quote the header.
5. **Unknown-host risk.** Yamaha lists the hosts it supports. A plugin may refuse or misbehave in a host it
   doesn't know. Package 1 exists to find this out for one day of work instead of six weeks.

## 6. Who does what

- **Architecture (this document):** the managing session. Changes to it go through that session.
- **Outline:** an Opus worker writes `ARA-HOST-OUTLINE.md` from this document, the code and the ARA
  headers. It does not write product code.
- **Code:** a Sonnet worker implements one work package at a time from the outline, on the paired
  branches, with the tests the outline lists.
- **Facts from the internet:** a Haiku worker fetches them (headers, documentation, vendor pages) and saves
  them to files; nobody else browses. Fetched material so far is in the session's scratchpad under
  `ara-research/` (the ARA headers verbatim, `notes.md`, `vocaloid.md`).
- **Review and merge:** the managing session reviews each package's pull requests and merges them.
