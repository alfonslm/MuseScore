# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A fork (`alfonslm/MuseScore`) of MuseScore Studio (`musescore/MuseScore`), a C++/Qt 6/QML music notation
application. The fork carries features that are not upstream (see "Fork-specific setup" below). The `muse/`
directory is a git submodule holding the Muse framework, which here points at the fork
`alfonslm/muse_framework`, not at `musescore/muse_framework`.

## Commands

Always clone/update with submodules (`git submodule update --init --recursive`); nothing builds without `muse/`.
Building needs Qt 6.10 or newer (CI uses 6.11.2). Full setup instructions are in the upstream wiki
("Set up developer environment").

```bash
# Build and run (RelWithDebInfo by default; add -DCMAKE_BUILD_TYPE=Debug|Release)
cmake -P build.cmake
cmake -P build.cmake run
cmake -P build.cmake clean

# Same build through the script CI uses; targets: release, debug, relwithdebinfo, install,
# installdebug, clean, compile_commands. Output goes to build.release/ or build.debug/.
bash ./ninja_build.sh -t debug
bash ./ninja_build.sh -t compile_commands   # for clangd
```

Unit tests are a separate build configuration (`utest`), built into `build.debug/`:

```bash
MUSESCORE_BUILD_CONFIGURATION=utest MUSESCORE_BUILD_UNIT_TESTS=ON MUSESCORE_DOWNLOAD_SOUNDFONT=OFF \
  bash ./ninja_build.sh -t installdebug

cd build.debug
QT_QPA_PLATFORM=minimal:enable_fonts ASAN_OPTIONS=detect_leaks=0:new_delete_type_mismatch=0 ctest -V

# One module's tests (the CTest name is the module's MODULE_TEST, e.g. engraving_tests,
# notation_tests, project_test, playback_test, iex_midi_tests)
ctest -R engraving_tests -V

# One test case: run that module's test executable with a GoogleTest filter
<path to>/engraving_tests --gtest_filter='PauseMap*'
```

Each module's tests live in `<module>/tests/` and are listed explicitly in that directory's `CMakeLists.txt`
(`MODULE_TEST_SRC`); a new test file must be added there. If you add tests to a module that had none, also
enable the module for the `UTEST` configuration in `SetupConfigure.cmake`.

Code style is enforced by CI with uncrustify (config lives in the submodule):

```bash
cmake -P ./muse/buildscripts/ci/checkcodestyle/checkcodestyle.cmake ./src/
cmake -P ./muse/buildscripts/ci/checkcodestyle/checkcodestyle.cmake ./muse/framework/
./tools/codestyle/tidy_file.sh <file>   # format one file
./hooks/install.sh                      # optional pre-commit hook that formats staged files
```

Visual tests (`vtest/`) render a set of scores to PNG and compare two builds. In CI ("Check: Visual Tests")
the reference is the pull request's base branch, so the check goes red whenever rendering differs from the
base, including after merging upstream engraving changes. To compare against something else, dispatch the
workflow manually with `reference_ref` set to a branch or commit.

## Architecture

Two code bases, two namespaces:

- `muse/framework/` (namespace `muse::`): application-independent framework — module system and IoC
  (`global/modularity`), async channels/promises, UI components, audio engine, VST, MuseSampler, MPE event
  types, cloud, extensions.
- `src/` (namespace `mu::`): the MuseScore application, built from the same kind of modules.

**Modules.** Every directory under `src/` and `muse/framework/` is a module with a `<name>module.cpp`
implementing `IModuleSetup`: `registerExports()` puts implementations into the IoC container,
`resolveImports()` registers with other modules' registries (writers, QML URIs, commands), and `onInit()`
runs after all modules are registered. Services are consumed through injection members, not constructed
directly: `muse::GlobalInject<IFoo> foo;` for application-wide services and
`muse::ContextInject<IFoo> foo = { this };` for per-window (context) services. Interfaces declare which kind
they are with `MODULE_GLOBAL_INTERFACE` / `MODULE_CONTEXT_INTERFACE`.

**Module layout.** Public interfaces are `i*.h` at the module root; implementations are in `internal/`; QML
and the C++ models backing it are in `qml/MuseScore/<Module>/`; mocks are in `tests/mocks/`. Modules that can
be compiled out have a replacement in `src/stubs/` (or `muse/framework/stubs/`). Adding a pure virtual
method to an interface therefore means updating the implementation, the stub and the mock.

**Engraving (`src/engraving/`)** is the score model and has no UI dependency:

- `dom/` — the score object model (`Score`, `Measure`, `Segment`, `Chord`, `Note`, ...). Element properties
  go through `Pid` (`dom/property.h`); the `propertyList` table in `dom/property.cpp` must stay in exactly the
  same order as the `Pid` enum. `ClefType` (`types/types.h`) and the `ClefInfo` table in `dom/clef.cpp` are
  coupled the same way.
- `rendering/score/` — layout (`TLayout`) and drawing (`TDraw`) are separate passes; layout writes into each
  element's `LayoutData`, drawing only reads it. `rendering/single/` lays out isolated elements (palettes).
- `rw/` — file reading (one reader per file-format generation, `read500` being current) and writing.
- `playback/` — turns the score into framework MPE events (`PlaybackModel`, `PlaybackContext`).
- `compat/midi/` — the older MIDI renderer still used for MIDI export.

**From score to sound.** `src/notation` wraps an engraving score for the UI (`INotation`,
`IMasterNotation`, parts/excerpts). `src/project` owns files, saving and export; `IProjectSession` gives the
current project and notation of a window (it replaced `context::IGlobalContext` upstream).
`src/playback` (`PlaybackController`) maps instrument tracks to audio-engine tracks and drives
`muse::audio::IPlayback`. The audio code is split into a main-thread side (`muse/framework/audio/main`) and
an engine side (`audio/engine`) that talk only through an RPC channel (`audio/common/rpc`); anything passed
between them must be packable in `rpcpacker.h`.

**Import/export.** Each format is a module under `src/importexport/` that registers `INotationReader` /
`INotationWriter` implementations by file suffix. `ExportProjectScenario` (in `src/project`) picks the
writer and handles files, progress and retries.

## Fork-specific setup

- **Branches.** `beta` is the fork's integration branch (features + upstream) and the base for pull
  requests. `main` is the fork's default branch. `upstream-main` is a mirror of upstream that is no longer
  synced automatically; fetch `https://github.com/musescore/MuseScore.git` directly to get current upstream.
- **Paired framework changes.** Several fork features need engine-side code in `alfonslm/muse_framework`
  (parallel audio export, playback markings, keyswitch maps). Such a change is two branches with the same
  name, one per repository; the MuseScore branch pins the framework branch's commit in `muse`. The framework
  pull request must be merged with a merge commit so the pinned commit stays reachable.
- **`Check: Submodules`** (`.github/workflows/check_submodules.yml`) is modified here: it accepts the fork's
  framework URL and requires the pinned commit to be on the framework's `beta`, or, for a pull request, on
  the framework branch named like the pull request's own branch.
- **Merging upstream.** Merge the framework only up to the commit that upstream MuseScore pins as its `muse`
  submodule, then set `muse` to that merge; a newer framework may not match the application code. Textually
  clean merges can still break the build when upstream renames an API that fork code uses, so check fork
  code against upstream's header changes.
- **macOS workflows.** `build_macos_arm64.yml` exists only in this fork and is a copy of `build_macos.yml`
  restricted to arm64 (faster test builds). Upstream changes to `build_macos.yml` and to the CI scripts it
  calls have to be ported to it by hand.
- **Fork features and where they live.** Multi-part audio export: `src/importexport/audioexport`,
  `ExportProjectScenario`, `muse/framework/audio/engine/internal/export` (the first and the last have a
  README describing the design). Playback
  markings (Live/Standby, On/Off on staff text): `StaffTextBase`, `PlaybackContext`,
  `audio/engine/internal/nodes/playbackstatetimeline.*`. Keyswitch maps: `muse/framework/vst/internal/synth`,
  mixer UI in `src/playback/qml`. String-name tablature clef: `ClefType::TAB_STRING_NAMES`. MIDI export
  option to lengthen a measure at a pause: `compat/midi/pausemap.*`. String Grip extension:
  `share/extensions/stringgrip`.
- **Contributions meant for upstream.** `AI_POLICY.md` applies: disclose AI assistance in the pull request
  template and with an `Assisted-by:` commit trailer (not `Co-authored-by:`), and the contributor must have
  read and understood everything submitted. `.github/pull_request_template.md` is upstream's checklist.
