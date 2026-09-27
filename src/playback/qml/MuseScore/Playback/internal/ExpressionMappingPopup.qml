/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Studio-CLA-applies
 *
 * MuseScore Studio
 * Music Composition & Notation
 *
 * Copyright (C) 2026 MuseScore Limited and others
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts

import Muse.Ui
import Muse.UiComponents

import MuseScore.Playback

StyledPopupView {
    id: root

    property MixerChannelItem channelItem: null

    property bool showJsonEditor: false
    property string errorText: ""

    contentWidth: contentColumn.implicitWidth
    contentHeight: contentColumn.implicitHeight

    onOpened: {
        root.showJsonEditor = false
        root.errorText = ""

        if (root.channelItem) {
            root.channelItem.expressionMappingModel.reload()
        }
    }

    NavigationPanel {
        id: navPanel
        name: "ExpressionMappingPopup"
        section: root.navigationSection
        accessible.name: qsTrc("playback", "Expression mapping popup")

        onNavigationEvent: function(event) {
            if (event.type === NavigationEvent.Escape) {
                root.close()
            }
        }
    }

    ColumnLayout {
        id: contentColumn

        width: 300

        spacing: 12

        StyledTextLabel {
            Layout.fillWidth: true
            text: qsTrc("playback", "Expression mapping")
            font: ui.theme.largeBodyBoldFont
            horizontalAlignment: Text.AlignLeft
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            StyledDropdown {
                id: mapDropdown

                Layout.fillWidth: true

                model: {
                    const items = [{ text: qsTrc("playback", "None"), value: "" }]
                    const ids = root.channelItem ? root.channelItem.expressionMappingModel.mapIds : []
                    for (let i = 0; i < ids.length; ++i) {
                        items.push({ text: ids[i], value: ids[i] })
                    }
                    return items
                }

                currentIndex: mapDropdown.indexOfValue(root.channelItem ? root.channelItem.keyswitchMapId : "")

                navigation.panel: navPanel
                navigation.order: 1
                navigation.accessible.name: qsTrc("playback", "Keyswitch map")

                onActivated: function(index, value) {
                    if (root.channelItem) {
                        root.channelItem.keyswitchMapId = value
                    }
                }
            }

            FlatButton {
                icon: IconCode.PLUS
                toolTipTitle: qsTrc("playback", "Create new map")

                navigation.panel: navPanel
                navigation.order: 2
                navigation.accessible.name: qsTrc("playback", "Create new keyswitch map")

                onClicked: {
                    if (!root.channelItem) {
                        return
                    }

                    const newId = root.channelItem.expressionMappingModel.createMap(qsTrc("playback", "New Map"))
                    if (newId.length > 0) {
                        root.channelItem.keyswitchMapId = newId
                    }
                }
            }
        }

        FlatButton {
            Layout.fillWidth: true
            text: root.showJsonEditor ? qsTrc("playback", "Hide JSON") : qsTrc("playback", "Edit JSON")

            enabled: root.channelItem && root.channelItem.keyswitchMapId.length > 0

            navigation.panel: navPanel
            navigation.order: 3

            onClicked: {
                root.errorText = ""
                root.showJsonEditor = !root.showJsonEditor

                if (root.showJsonEditor && root.channelItem) {
                    //! NOTE Set the TextArea's text directly rather than through TextInputArea's
                    //! currentText binding -- that binding breaks permanently the first time the
                    //! user types, so a later re-open within the same popup instance (e.g. after
                    //! switching maps) would otherwise keep showing stale contents.
                    jsonEditor.inputField.text = root.channelItem.expressionMappingModel.mapContents(root.channelItem.keyswitchMapId)
                }
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 6
            visible: root.showJsonEditor

            TextInputArea {
                id: jsonEditor

                Layout.fillWidth: true

                initialHeight: 220
                resizeVerticallyWithText: false

                navigation.panel: navPanel
                navigation.order: 4
                navigation.accessible.name: qsTrc("playback", "Keyswitch map JSON")
            }

            StyledTextLabel {
                Layout.fillWidth: true
                visible: root.errorText.length > 0
                text: root.errorText
                horizontalAlignment: Text.AlignLeft
                wrapMode: Text.Wrap
                color: "#EF2929"
            }

            FlatButton {
                Layout.fillWidth: true
                text: qsTrc("playback", "Save")

                navigation.panel: navPanel
                navigation.order: 5

                onClicked: {
                    if (!root.channelItem) {
                        return
                    }

                    root.errorText = root.channelItem.expressionMappingModel.saveMapContents(
                                root.channelItem.keyswitchMapId, jsonEditor.inputField.text)
                }
            }
        }
    }
}
