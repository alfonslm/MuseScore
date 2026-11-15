# muse_framework fork

This repo's `muse` submodule points at **`alfonslm/muse_framework`**, not upstream
`musescore/muse_framework`. That is intentional and permanent: the engine-side code of the fork's
features (keyswitch maps, parallel audio export, playback markings, VST transport) and the Layout
Panel crash fix live only in the fork. As in this repository, the framework fork's `beta` is its
integration branch.

`.github/workflows/check_submodules.yml` accepts the fork via `ALLOWED_FORK_URL` /
`ALLOWED_FORK_BRANCH`. It requires the pinned commit to be on the framework fork's `beta` (or, for a
pull request, on the framework branch named like the pull request's own branch), so always push the
framework first and merge its pull request with a merge commit before bumping the pointer here.

## What the fork carries on top of upstream

In `alfonslm/muse_framework`, for keyswitch maps (CLAUDE.md lists where the other features live):

- `framework/vst/internal/synth/keyswitchmap.{h,cpp}`, `keyswitchmapregistry.{h,cpp}` (new)
- `framework/vst/resources/keyswitch/Default Example.json` (new)
- `framework/vst/internal/synth/vstsequencer.{h,cpp}`, `vstsynthesiser.{h,cpp}`,
  `framework/vst/vstmodule.cpp`, `framework/vst/CMakeLists.txt` (small edits)
- `framework/uicomponents/qml/Muse/UiComponents/LegacyTreeView/BasicTableView.qml`
  (Layout Panel crash fix)

In this repo, besides the feature code itself: `.gitmodules`, `check_submodules.yml`, and
`src/instrumentsscene/.../layoutpaneltreemodel.cpp` / `abstractlayoutpaneltreeitem.cpp`
(the other half of the crash fix).

## When syncing upstream MuseScore into this repo

Do it on a new branch. Expect conflicts in:

- **`muse`** (the gitlink) whenever upstream has bumped its framework. Don't take upstream's
  commit: it isn't on the fork, so `check_submodules.yml` fails. First bring the fork up to at
  least that upstream commit (next section), then point `muse` at the resulting fork commit:

  ```sh
  git update-index --cacheinfo 160000,<fork-beta-sha>,muse   # muse not checked out
  # or, if it is: git -C muse checkout <fork-beta-sha> && git add muse
  ```

  Merge the framework only up to the commit that upstream MuseScore pins as its own `muse`; a
  newer framework may not match the application code.

- **`.gitmodules`**: keep ours (fork URL).
- **`.github/workflows/check_submodules.yml`**: keep the `ALLOWED_FORK_*` lines and the
  `SUBMODULE_URL`/`SUBMODULE_BRANCH` logic; take any other upstream changes.

## When syncing upstream muse_framework into the fork

In a clone of `alfonslm/muse_framework`, on a new branch off `beta`:

```sh
git remote add upstream https://github.com/musescore/muse_framework.git  # once
git fetch upstream main
git merge <upstream commit pinned by upstream MuseScore>
```

Conflicts, if any, will be in the files listed above. Keep both sides: the keyswitch hooks
are a few self-contained blocks (`setKeyswitchMap`/`addKeyswitchEvent` in the sequencer,
`applyKeyswitchMap` in the synthesiser, the `ensureDefaultMapExists()` call in
`VSTModule::onInit`).

Before pushing, run the codestyle check with **uncrustify 0.74.0** exactly. That's the version
pinned in `muse_deps` (`recipes/uncrustify/spec.cmake`). A newer distro build (e.g. 0.78)
reformats hundreds of unrelated files.

```sh
bash tools/codestyle/run_scan.sh /path/to/uncrustify-0.74.0 tools/codestyle/uncrustify_muse.cfg .untidy framework
git diff --stat   # should only show files you touched
```

Merge that into the framework fork's `beta` (with a merge commit), then bump `muse` here as above.
