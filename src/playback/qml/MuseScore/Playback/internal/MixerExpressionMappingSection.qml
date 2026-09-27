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

import Muse.Ui
import Muse.UiComponents

MixerPanelSection {
    id: root

    headerTitle: qsTrc("playback", "Expr. Map")

    Item {
        id: content

        required property MixerChannelItem channelItem

        height: mappingButton.height
        width: root.channelItemWidth

        visible: !channelItem.outputOnly
                 && (channelItem.type === MixerChannelItem.PrimaryInstrument
                     || channelItem.type === MixerChannelItem.SecondaryInstrument)

        PopupButton {
            id: mappingButton

            anchors.horizontalCenter: parent.horizontalCenter

            width: 96
            height: 26

            icon: IconCode.MIDI_INPUT
            text: content.channelItem.keyswitchMapId.length > 0 ? content.channelItem.keyswitchMapId : qsTrc("playback", "None")

            toolTipTitle: qsTrc("playback", "Expression mapping")

            navigation.name: "ExpressionMappingButton"
            navigation.panel: content.channelItem.panel
            navigation.row: root.navigationRowStart
            navigation.accessible.name: mappingButton.toolTipTitle

            popupComponent: ExpressionMappingPopup {
                channelItem: content.channelItem
            }
        }
    }
}
