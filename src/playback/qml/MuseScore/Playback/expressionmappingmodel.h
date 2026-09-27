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

#pragma once

#include <QObject>
#include <QStringList>
#include <qqmlintegration.h>

#include "modularity/ioc.h"
#include "global/iglobalconfiguration.h"
#include "io/ifilesystem.h"

namespace mu::playback {
//! NOTE Backs the "Expression Mapping" popup opened from a Mixer channel strip. Lists the
//! *.json keyswitch maps in Documents/MuseScore4/Keyswitch Maps (see KEYSWITCH-INSTRUCTIONS.md),
//! and lets that popup read/write a map's raw JSON, or create a new one from the bundled
//! default template. Does not itself know which track it belongs to -- MixerChannelItem owns
//! currentMapId and pushes it into the track's real AudioInputParams.configuration.
class ExpressionMappingModel : public QObject
{
    Q_OBJECT

    Q_PROPERTY(QStringList mapIds READ mapIds NOTIFY mapIdsChanged)

    QML_ELEMENT;
    QML_UNCREATABLE("Must be created in C++ only")

    muse::GlobalInject<muse::IGlobalConfiguration> globalConfiguration;
    muse::GlobalInject<muse::io::IFileSystem> fileSystem;

public:
    explicit ExpressionMappingModel(QObject* parent = nullptr);

    QStringList mapIds() const;

    Q_INVOKABLE void reload();
    Q_INVOKABLE QString mapContents(const QString& mapId) const;
    //! NOTE Returns an empty string on success, or a human-readable parse/write error otherwise.
    Q_INVOKABLE QString saveMapContents(const QString& mapId, const QString& json);
    //! NOTE Returns the new map's id, or an empty string if creation failed.
    Q_INVOKABLE QString createMap(const QString& proposedName);

signals:
    void mapIdsChanged();

private:
    muse::io::path_t mapsDirPath() const;
    muse::io::path_t pathForMapId(const QString& mapId) const;
    QString uniqueMapId(const QString& proposedName) const;

    QStringList m_mapIds;
};
}
