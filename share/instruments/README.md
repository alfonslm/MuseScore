# Instruments

## This fork: one file per instrument

In this fork `instruments.xml` is not kept in the repository. The instrument
definitions live in [`source/`](source), one file per instrument, so that
changes to different instruments (ours and upstream's) merge without conflicts:

- `source/<group>/<instrument-id>.xml` - one `<Instrument>` each, e.g.
  `source/strings/violin.xml`.
- `source/<group>/_begin.xml`, `_end.xml` - the group's opening (with its name)
  and closing tags.
- `source/genres.xml`, `families.xml`, `articulations.xml`, `_head.xml`,
  `_tail.xml` - the parts of the file outside the instrument groups.
- `source/manifest.txt` - every file above, in the order they are joined. A new
  instrument must be listed here; moving a line moves the instrument in the
  instrument picker.

The build joins them into `instruments.xml` (see
[`AssembleInstruments.cmake`](AssembleInstruments.cmake)); nothing else changes
for MuseScore, which still loads one `instruments.xml` from its resources.
[`instruments_source.py`](instruments_source.py) does the same from the command
line and converts in the other direction:

```Bash
python3 instruments_source.py assemble -o instruments.xml  # join source/ (e.g. for generate_tsv.py)
python3 instruments_source.py check instruments.xml        # does source/ join to exactly this file?
python3 instruments_source.py split instruments.xml        # replace source/ with this file's content
```

### Taking upstream's changes

Upstream still keeps `instruments.xml` and regenerates it from its spreadsheet
(see below). When a merge of upstream `main` changes it, git reports a
modify/delete conflict for `share/instruments/instruments.xml`. Resolve it by
merging upstream's change into `source/` file by file, then keep the deletion:

```Bash
python3 share/instruments/instruments_source.py merge-git $(git merge-base HEAD MERGE_HEAD) MERGE_HEAD
git rm share/instruments/instruments.xml
git add share/instruments/source
```

Our own edits to an instrument are kept; if both sides changed the same lines
of one instrument, that file gets conflict markers, like any git conflict, and
the build refuses to assemble until they are resolved.

### What is not covered

`instrumentsxml.h` (translatable instrument names) and the standard drumset in
`src/engraving/dom/drumset.cpp` are still generated from upstream's spreadsheet
by `update_instruments_xml.py`. If you add an instrument or change a name in
`source/`, add the strings to `instrumentsxml.h` by hand, following the
existing entries.

The rest of this file describes upstream's process.

## About the online spreadsheet

Instrument data is stored in this [Google spreadsheet][Instruments], which
contains multiple worksheets (aka. 'sheets' or 'tabs') for different data:

- [Instruments]
- [Channels]
- [Basics]
- Etc.

[Instruments]: https://docs.google.com/spreadsheets/d/1SwqZb8lq5rfv5regPSA10drWjUAoi65EuMoYtG-4k5s/edit#gid=516529997
[Channels]: https://docs.google.com/spreadsheets/d/1SwqZb8lq5rfv5regPSA10drWjUAoi65EuMoYtG-4k5s/edit#gid=504647632
[Basics]: https://docs.google.com/spreadsheets/d/1SwqZb8lq5rfv5regPSA10drWjUAoi65EuMoYtG-4k5s/edit#gid=457195594

Some sheets are hidden and only accessible via the View menu to those with
permission. The hidden sheets contain mainly third-party data that is unlikely
to change, such as constants from the General MIDI specification. Hiding these
sheets is purely a matter of convenience.

## Editing the spreadsheet

To request changes, community members can comment on the visible sheets or
create issues on GitHub. Team members can request permission to edit the
spreadsheet directly if required.

Anybody can make an editable copy of the spreadsheet in their own Google Drive,
or download it in a variety of formats (Excel, ODS, CSV, etc.).

## Updating local files

After you make changes to any of the spreadsheet sheets, run the Python script
[`update_instruments_xml.py`] to update the following files in the repository:

- [`instruments.xml`] - Used by MuseScore Studio to load most instrument data.

- [`instrumentsxml.h`] - A fake header file used to generate translatable
    strings (see also `tools/translations/run_lupdate.sh`).

- [`src/engraving/dom/drumset.cpp`][`drumset.cpp`] - A C++ source file that
  contains the standard drumset used to initialize MuseScore Studio's MIDI and
  playback systems at startup, prior to `instruments.xml` being loaded.

[`update_instruments_xml.py`]: update_instruments_xml.py
[`instruments.xml`]: instruments.xml
[`instrumentsxml.h`]: instrumentsxml.h
[`drumset.cpp`]: /src/engraving/dom/drumset.cpp

Commit the changes to these files and submit them in a PR (pull request).

## Using cached data

If you're running the Python script repeatedly (e.g. during development), you
can use the script's `-c` or `--cached` option in combination with the `-d` or
`--download` option to avoid downloading the entire spreadsheet each time.

For example, this will download only the [Instruments] and [Channels] sheets,
while using cached data for all the other sheets:

```Bash
./update_instruments_xml.py -c -d Instruments -d Channels
```

See the script's `-h` or `--help` option for more details.

Make sure that you run the script once with no options as a final step before
submitting a PR. This ensures you're using the latest data from all sheets.

## Ignoring other people's changes

If somebody else has edited the spreadsheet, and their changes are showing in
the diff after you run the Python script, you can use the `-p` or `--patch`
option to `git add` to avoid committing their changes.

```Bash
git add -p .
```

This triggers an [interactive staging session], where Git shows you each
distinct 'hunk' (i.e. region) of diff and asks whether you want to 'stage' it
(i.e. add it to the index) ready to be committed. You can respond with:

- `y` - Yes, stage this hunk (in order to commit it).
- `n` - No, don't stage this hunk (i.e. exclude it from the commit).
- `?` - Help, show [more patch options].

[interactive staging session]: https://git-scm.com/book/en/v2/Git-Tools-Interactive-Staging#_staging_patches
[more patch options]: https://git-scm.com/docs/git-add#Documentation/git-add.txt-patch

After responding `y` (yes) to all of your own hunks, and `n` (no) to everyone
else's, you can go ahead and create the commit with `git commit`. Use
`git checkout .` if you want to remove unstaged changes from the working tree.

## Justification

The main advantages of the spreadsheet are its speed and convenience for making
large-scale changes to many items at once, which would not be so easy if the
data was stored purely in a traditional data-serialization format like XML,
JSON, YAML, or as hard-coded C++ data structures.

Important too is the ability to quickly look along rows and columns to compare
values and check for errors or inconsistencies. Formulas and formatting also
help significancy with these tasks, providing instant feedback about whether a
particular value is expected or allowed.

The reasons for not storing the actual spreadsheet file itself in the
repository are set out [here](https://github.com/musescore/MuseScore/pull/26082#issuecomment-2590711797).
