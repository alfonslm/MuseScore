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

#include "keyswitchtestassignments.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonParseError>

#include "log.h"

using namespace muse;
using namespace muse::io;
using namespace mu::engraving;

namespace mu::playback {
void KeyswitchTestAssignments::ensureLoaded()
{
    if (m_loaded) {
        return;
    }

    m_loaded = true;

    const path_t path = globalConfiguration()->userDataPath() + "/Keyswitch Maps/track-map-assignments.json";
    if (!fileSystem()->exists(path)) {
        return;
    }

    RetVal<ByteArray> content = fileSystem()->readFile(path);
    if (!content.ret) {
        LOGW() << "Unable to read keyswitch track-map assignments " << path << ": " << content.ret.toString();
        return;
    }

    QJsonParseError err;
    QJsonDocument doc = QJsonDocument::fromJson(content.val.toQByteArrayNoCopy(), &err);
    if (err.error != QJsonParseError::NoError || !doc.isObject()) {
        LOGW() << "Unable to parse keyswitch track-map assignments " << path << ": " << err.errorString();
        return;
    }

    const QJsonObject object = doc.object();
    for (auto it = object.constBegin(); it != object.constEnd(); ++it) {
        if (!it.value().isString()) {
            continue;
        }

        m_mapIdByInstrumentId[it.key().toStdString()] = it.value().toString().toStdString();
    }
}

std::string KeyswitchTestAssignments::mapIdFor(const InstrumentTrackId& trackId)
{
    ensureLoaded();

    auto it = m_mapIdByInstrumentId.find(trackId.instrumentId.toStdString());
    return it != m_mapIdByInstrumentId.cend() ? it->second : std::string();
}
}
