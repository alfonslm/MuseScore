# muse_framework fork

This repo's `muse` submodule points at **`alfonslm/muse_framework` @ `main`**, not upstream
`musescore/muse_framework`. That is intentional and permanent: the keyswitch map engine
([alfonslm/muse_framework#1](https://github.com/alfonslm/muse_framework/pull/1)) and the
Layout Panel crash fix live only in the fork.

`.github/workflows/check_submodules.yml` accepts the fork via `ALLOWED_FORK_URL` /
`ALLOWED_FORK_BRANCH`. It still requires the pinned commit to be on the fork's `main`, so always
push the fork before bumping the pointer here.

## What the fork carries on top of upstream

In `alfonslm/muse_framework`:

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
  git update-index --cacheinfo 160000,<fork-main-sha>,muse   # muse not checked out
  # or, if it is: git -C muse checkout <fork-main-sha> && git add muse
  ```

- **`.gitmodules`**: keep ours (fork URL, `branch = main`).
- **`.github/workflows/check_submodules.yml`**: keep the `ALLOWED_FORK_*` lines and the
  `SUBMODULE_URL`/`SUBMODULE_BRANCH` logic; take any other upstream changes.

## When syncing upstream muse_framework into the fork

In a clone of `alfonslm/muse_framework`, on a new branch off `main`:

```sh
git remote add upstream https://github.com/musescore/muse_framework.git  # once
git fetch upstream main
git merge upstream/main
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

Merge that into the fork's `main`, then bump `muse` here as above.
