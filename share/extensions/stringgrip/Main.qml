/*
 * String Grip — MuseScore Studio 4.7 extension
 * Fingers string parts, writes string/fret (shows in linked tab staves) and
 * colours notes: olive = stretch / extension / shift, amber = hard (professionals
 * can), red = impossible as written.
 * All playability logic lives in engine.js (tested outside MuseScore).
 */
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

import MuseScore
import Muse.UiComponents

import "engine.js" as Engine
import "score.js" as ScoreRun

MuseScore {
    id: root
    width: 460
    height: 720

    readonly property string olive: ScoreRun.OLIVE_COLOR
    readonly property string amber: ScoreRun.AMBER_COLOR
    readonly property string red: ScoreRun.RED_COLOR

    Settings {
        category: "StringGripExtension"
        property alias unitMm: optMm.checked
        property alias chords: optChords.checked
        property alias shifts: optShifts.checked
        property alias range: optRange.checked
        property alias writeTab: optTab.checked
        property alias keepFingering: optKeep.checked
        property alias crossVoices: optVoices.checked
    }

    ListModel { id: findings }
    property var findingNotes: []   // parallel to `findings`: arrays of note objects
    property string summary: ""

    // ------------------------------------------------------------ run

    function options() {
        return {
            unit: optMm.checked ? "mm" : "semitones",
            chords: optChords.checked, shifts: optShifts.checked,
            range: optRange.checked,
            writeTab: optTab.checked, crossVoices: optVoices.checked, keepFingering: optKeep.checked
        }
    }

    function run(clearOnly) {
        if (!curScore) return
        findings.clear()
        findingNotes = []
        var res = ScoreRun.check(curScore, Engine, { CHORD: Element.CHORD, REST: Element.REST }, options(), clearOnly)
        var notes = []
        for (var i = 0; i < res.findings.length; i++) {
            var f = res.findings[i]
            findings.append({ bar: f.bar, part: f.part, level: f.level, text: f.text, fingering: f.fingering })
            notes.push(f.notes)
        }
        findingNotes = notes
        summary = res.summary
    }

    function goTo(index) {
        var ns = findingNotes[index]
        if (!ns || !ns.length) return
        curScore.selection.clear()
        for (var i = 0; i < ns.length; i++) curScore.selection.select(ns[i], i > 0)
    }

    // ------------------------------------------------------------ UI

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 10

        StyledTextLabel {
            Layout.fillWidth: true
            text: "Checks every string part (violin, viola, cello, double bass, electric bass, guitar) in the selection, or the whole score if nothing is range-selected."
            wrapMode: Text.WordWrap
            horizontalAlignment: Text.AlignLeft
        }

        StyledGroupBox {
            Layout.fillWidth: true
            title: "Grip distance measured in"
            RowLayout {
                spacing: 16
                ButtonGroup { id: unitGroup }
                RoundedRadioButton { id: optSemi; text: "Semitones"; checked: !optMm.checked; ButtonGroup.group: unitGroup }
                RoundedRadioButton { id: optMm; text: "Millimetres (position-aware)"; checked: false; ButtonGroup.group: unitGroup }
            }
        }

        StyledGroupBox {
            Layout.fillWidth: true
            title: "Mark"
            ColumnLayout {
                spacing: 6
                CheckBox { id: optChords; text: "Stretches and double stops (grip ranges, same string, string skips)"; checked: true; onClicked: checked = !checked }
                CheckBox { id: optShifts; text: "Every shift (off = only the grade-level flags)"; checked: true; onClicked: checked = !checked }
                CheckBox { id: optRange; text: "Range (below lowest string, off the fingerboard, high positions)"; checked: true; onClicked: checked = !checked }
            }
        }

        StyledGroupBox {
            Layout.fillWidth: true
            title: "Options"
            ColumnLayout {
                spacing: 6
                CheckBox { id: optTab; text: "Write fingering to tab (string + fret)"; checked: true; onClicked: checked = !checked }
                CheckBox { id: optKeep; text: "Keep my fingering unless a better one is found"; checked: true; enabled: optTab.checked; onClicked: checked = !checked }
                CheckBox { id: optVoices; text: "One player reads all voices (voice 2 = double stops, not divisi)"; checked: false; onClicked: checked = !checked }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 8
            FlatButton { text: "Check"; accentButton: true; onClicked: run(false) }
            FlatButton { text: "Clear markings"; onClicked: run(true) }
            Item { Layout.fillWidth: true }
            FlatButton { text: "Close"; onClicked: quit() }
        }

        StyledTextLabel {
            Layout.fillWidth: true
            text: summary
            visible: summary !== ""
            wrapMode: Text.WordWrap
            horizontalAlignment: Text.AlignLeft
        }

        ListView {
            id: list
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: findings
            spacing: 2
            ScrollBar.vertical: StyledScrollBar {}
            delegate: Rectangle {
                width: list.width
                height: col.implicitHeight + 8
                radius: 3
                color: mouse.containsMouse ? ui.theme.buttonColor : "transparent"
                Rectangle { width: 4; height: parent.height; radius: 2; color: model.level === 3 ? root.red : model.level === 2 ? root.amber : root.olive }
                ColumnLayout {
                    id: col
                    anchors.left: parent.left; anchors.right: parent.right
                    anchors.leftMargin: 10; anchors.rightMargin: 4
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 1
                    StyledTextLabel { Layout.fillWidth: true; horizontalAlignment: Text.AlignLeft; font: ui.theme.bodyBoldFont; text: "Bar " + model.bar + " · " + model.part }
                    StyledTextLabel { Layout.fillWidth: true; horizontalAlignment: Text.AlignLeft; wrapMode: Text.WordWrap; maximumLineCount: 4; text: model.text }
                    StyledTextLabel { Layout.fillWidth: true; horizontalAlignment: Text.AlignLeft; opacity: 0.7; wrapMode: Text.WordWrap; text: model.fingering }
                }
                MouseArea { id: mouse; anchors.fill: parent; hoverEnabled: true; onClicked: goTo(index) }
            }
        }
    }
}
