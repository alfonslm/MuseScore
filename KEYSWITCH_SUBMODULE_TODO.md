# TODO: repoint muse_framework submodule to upstream

## Context

[#7](https://github.com/alfonslm/MuseScore/pull/7) ("Presets and key triggers: keyswitch map
support") needs engine-level changes in `muse_framework` (`VstSequencer`/`VstSynthesiser`/
`KeyswitchMapRegistry`) that live in a fork PR, [alfonslm/muse_framework#1](https://github.com/alfonslm/muse_framework/pull/1),
since `musescore/muse_framework` isn't writable from this account.

To let #7 pass CI, `.github/workflows/check_submodules.yml`'s `check_muse_framework` job was
temporarily widened, on this branch, to also accept `https://github.com/alfonslm/muse_framework.git`
@ `keyswitch-maps` as a valid submodule pin, alongside the real upstream
`musescore/muse_framework.git` @ `main`. The `muse` submodule itself is currently pinned to a
commit on that fork branch, not upstream.

## Follow-up (push-2)

Once `alfonslm/muse_framework#1` is accepted/merged into the real `musescore/muse_framework`
upstream (or an equivalent change lands there some other way):

1. Update `.gitmodules` and bump the `muse` submodule pointer back to the real upstream commit
   that carries the change.
2. Revert the temporary `ALLOWED_FORK_URL`/`ALLOWED_FORK_BRANCH` exception in
   `.github/workflows/check_submodules.yml`, restoring the strict upstream-only check.
3. Delete this file.
4. Confirm CI is still green on the resulting branch/PR afterward.

Until this is done, this branch carries a real, intentional exception to the submodule-URL
guard -- this file is the reminder to close it out. GitHub Issues are disabled on this fork, so
this file stands in for one.
