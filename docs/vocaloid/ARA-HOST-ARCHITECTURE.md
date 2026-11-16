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
   what ARA cannot express (see section 6).
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
| 2 | **Musical content** | App side: the builder also produces the map without standstills (section 6, decision 1). Framework side: `AraMusicalContent`, the conversion of that map to ARA tempo entries and bar signatures (section 6, decisions 2 and 3). | Unit tests only: plain tempo, tempo changes, fermata stretch, a caesura, pickup bar, a bar lengthened by a pause, time-signature changes, empty map. |
| 3 | **Document** | `AraDocument` and `IAraHost`: create the document controller from the factory, a document, one musical context served from package 2 through the content-access callbacks, one region sequence per bound instance; update the musical context when the map changes; the other host callback tables with the minimal behaviour ARA requires. App side: `PlaybackController` pushes the map. | Unit tests against a **fake ARA plugin** written for the tests (a struct of C function pointers that records the calls it gets and reads the host's content back through the callbacks). Asserts the order of calls ARA requires. |
| 4 | **Binding and the switch** | `VstPluginInstance` binds to the document with the roles the plugin offers, before the point ARA requires; teardown in the right order; the config key; the mixer menu item (MuseScore side). | Unit tests for the config key and menu model; macOS CI build; then the user tries VOCALOID7: does its tempo track show MuseScore's tempo map and bars, and does it stay in sync through a fermata and a caesura. |
| 5 | **Playback requests** | The plugin asking the host to start, stop or move the playhead (ARA playback controller) is forwarded to MuseScore's playback. | Fake plugin in unit tests; user check. |
| 6 | **Persistence** | ARA document archive saved with the score next to the VST state. | Round-trip unit test with the fake plugin; user check. |

Packages 5 and 6 are outlined only after the user's result for package 4.

## 5. Facts from the ARA headers

Read from `ARAInterface.h` and `ARAVST3.h` of ARA_API (release 2.3.0, 2025-11-07, Apache-2.0; the API is
headers only). Line references are to those files at that release.

- **Finding the factory.** A VST3 plugin with ARA has an extra class in its module factory with the category
  `"ARA Main Factory Class"` (`kARAMainFactoryClass`), implementing `ARA::IMainFactory`
  (IID `DB2A1669-FAFD42A5-A82F864F-7B6872EA`), whose `getFactory()` returns the `ARAFactory` struct. The
  audio processor class implements `ARA::IPlugInEntryPoint2` (IID `CD9A5913-C9EB46D7-96CA53AD-D1DB89F5`).
  This is where the probe of work package 1 looks, in the same loop over `factory.classInfos()` that
  `VstPluginInstance::load()` already runs for `kVstAudioEffectClass`.
- **Binding.** `IPlugInEntryPoint2::bindToDocumentControllerWithRoles(controllerRef, knownRoles,
  assignedRoles)`, roles `kARAPlaybackRendererRole`, `kARAEditorRendererRole`, `kARAEditorViewRole`.
  `ARAVST3.h`: "This may be called only once during the lifetime of the IAudioProcessor component, before
  the first call to setActive () or setState () or getProcessContextRequirements () or the creation of the
  GUI". And: "when tearing down the plug-in, the actual order for deleting the IAudioProcessor instance and
  for deleting ARA document controller is undefined. Plug-ins must handle both potential destruction
  orders".
- **Tempo map.** A list of sync points `ARAContentTempoEntry { timePosition (seconds), quarterPosition }`,
  sorted by time. The tempo between two neighbours is the slope between them, and the tempo before the first
  and after the last point is that of the first and last section. So: "there must always be at least 2 sync
  points", and "there must be a tempo sync point given at quarter 0" (`ARAInterface.h`, about line 1300 to
  1330). The header does not say that a section may have a slope of zero.
- **Bars.** `ARAContentBarSignature { numerator, denominator, position (quarters) }`. "The distance between
  two bar signatures must be an integer multiple of the bar length of the earlier of the two signatures."
- **API generation.** The newest is `kARAAPIGeneration_2_3_Final`. Which generations VOCALOID7 accepts is
  one of the things the probe reports (`lowestSupportedApiGeneration`, `highestSupportedApiGeneration`).

`MusicalTimeMap` (`muse/framework/audio/common/musicaltimemap.h`) is the same shape as the ARA tempo map:
`TempoPoint { secs, quarters, bps }` are sync points with linear movement between them, and `BarPoint`
is a bar signature at a quarter position, plus `lengthQuarters` for a bar whose real length differs from
its signature.

## 6. Decisions on the hard points

1. **Pauses are not sent as a standstill.** In `MusicalTimeMap` a caesura is two points with the same
   `quarters` and different `secs`. As an ARA section that is a tempo of zero, which the header neither
   allows nor forbids, and which a plugin that divides by the tempo may not survive. The conversion
   therefore lengthens the bar that the pause belongs to by a whole number of beats, played at a tempo close
   to the surrounding one so that the gap lasts exactly as long as the pause: the rule route A already uses
   for MIDI export (`PauseMap`, ExtendMeasure mode, `src/engraving/compat/midi/pausemap.*`). This has a second
   benefit that decides it: the user gets the notes into Vocaloid by importing that MIDI file, so the bars
   and tempo Vocaloid reads over ARA must be the same ones the MIDI file has.
   Consequence for the design: the conversion needs the pause rule as data, not as engraving code. Work
   package 2 takes the lengthened bars and gap tempos from where route A computes them, on the app side,
   and the framework receives a `MusicalTimeMap` that already has no standstill in it (a second map built
   in the same builder, `src/engraving/playback/musicaltimemapbuilder.*`, next to the one the audio engine
   uses, which keeps the true standstill for route D).
2. **Irregular bars get their own signature.** A pickup or a lengthened bar is sent as a bar signature of
   its real length (a one-quarter pickup in 4/4 is a 1/4 bar, a 4/4 bar lengthened by two beats is 6/4),
   followed by a signature that restores the normal one. This satisfies the "integer multiple" rule above
   and matches what the MIDI export writes. A real length that has no numerator/denominator form with a
   denominator up to 64 is rounded to the nearest 64th and logged.
3. **The list always starts at quarter 0 and has at least two points.** If the map has one point, a second
   one is added one bar later at the same tempo. If the map is empty there is no musical context and ARA is
   not offered for that score.
4. **Binding happens in `VstPluginInstance::load()`**, on the main thread, right after
   `VstPluginProvider::init()` has initialised the component and before anything that reaches `setState`
   (`syncControllerToComponentState()`, `updatePluginConfig()`), `setActive` (`VstAudioClient`) or the view.
   The document must therefore exist before the instance is loaded: `IAraHost` creates the document for a
   plugin type on first use and keeps it for the life of the score.
5. **Teardown** follows alfonslm/muse_framework#13: an instance's ARA binding ends with the instance
   (`unload()` / the release path), and the document is destroyed in `VSTModule::onDeinit()` after
   `VstInstancesRegister::unloadAll()` and before the module repository lets go of the modules. ARA allows
   either order between instance and document controller; ours is instances first.
6. **Still open, answered by the probe, not by design:** what a generator needs in the document before it
   renders (an audio source, modification and playback region, or nothing), and whether VOCALOID7 offers
   ARA to a host that Yamaha does not list. Work package 3 starts from the probe's output.

## 7. Who does what, and where things stand

- **Architecture (this document):** the managing session. Finished 2026-11-16; changes go through that
  session.
- **Outline (`ARA-HOST-OUTLINE.md`):** to be written by an Opus worker from this document, the code and
  the ARA headers, with every file, interface, call sequence and test, so that no design decision is left to
  the coder. **Not written yet.** A first attempt stopped at a usage limit before it produced anything, and
  the user asked on 2026-11-16 not to start the workers for now.
- **Code:** a Sonnet worker, one work package at a time from the outline. Not started.
- **Facts from the internet:** fetched by a Haiku worker and saved to files. Done once: the two ARA API
  headers, the licence and notes were fetched into the session's scratchpad, which does not survive the
  session. To get them again: `ARA_API/ARAInterface.h`, `ARAVST3.h` and `LICENSE.txt` from the `ARA_API`
  repository of the GitHub organisation `Celemony`, tag `releases/2.3.0`. Work package 1 vendors them into
  the framework, after which they are in the repository.
- **Not confirmed:** anything about VOCALOID7 itself. Yamaha's sites could not be reached from the cloud
  session. Search results say VOCALOID6 follows the host's tempo only through ARA2; nothing was found for
  VOCALOID7. See the open point in section 1.
- **Review and merge:** the managing session reviews each package's pull requests and merges them.
