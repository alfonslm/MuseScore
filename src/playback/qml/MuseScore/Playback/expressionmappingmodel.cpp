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

#include "expressionmappingmodel.h"

#include <QJsonDocument>
#include <QJsonParseError>

using namespace mu::playback;
using namespace muse;
using namespace muse::io;

ExpressionMappingModel::ExpressionMappingModel(QObject* parent)
    : QObject(parent)
{
}

QStringList ExpressionMappingModel::mapIds() const
{
    return m_mapIds;
}

path_t ExpressionMappingModel::mapsDirPath() const
{
    return globalConfiguration()->userDataPath() + "/Keyswitch Maps";
}

path_t ExpressionMappingModel::pathForMapId(const QString& mapId) const
{
    return mapsDirPath() + "/" + mapId + ".json";
}

void ExpressionMappingModel::reload()
{
    QStringList mapIds;

    const path_t dir = mapsDirPath();
    fileSystem()->makePath(dir);

    RetVal<paths_t> files = fileSystem()->scanFiles(dir, { "*.json" }, ScanMode::FilesInCurrentDir);
    if (files.ret) {
        for (const path_t& file : files.val) {
            mapIds << filename(file, false).toQString();
        }
        mapIds.sort(Qt::CaseInsensitive);
    }

    if (m_mapIds != mapIds) {
        m_mapIds = mapIds;
        emit mapIdsChanged();
    }
}

QString ExpressionMappingModel::mapContents(const QString& mapId) const
{
    RetVal<ByteArray> content = fileSystem()->readFile(pathForMapId(mapId));
    if (!content.ret) {
        return QString();
    }

    return QString::fromUtf8(content.val.toQByteArrayNoCopy());
}

QString ExpressionMappingModel::saveMapContents(const QString& mapId, const QString& json)
{
    QJsonParseError err;
    QJsonDocument::fromJson(json.toUtf8(), &err);
    if (err.error != QJsonParseError::NoError) {
        return err.errorString();
    }

    const ByteArray data = ByteArray::fromQByteArrayNoCopy(json.toUtf8());
    Ret ret = fileSystem()->writeFile(pathForMapId(mapId), data);
    if (!ret) {
        return QString::fromStdString(ret.toString());
    }

    return QString();
}

QString ExpressionMappingModel::uniqueMapId(const QString& proposedName) const
{
    QString base = proposedName.trimmed();
    if (base.isEmpty()) {
        base = "New Map";
    }

    QString candidate = base;
    int suffix = 2;
    while (fileSystem()->exists(pathForMapId(candidate))) {
        candidate = QString("%1 %2").arg(base).arg(suffix++);
    }

    return candidate;
}

QString ExpressionMappingModel::createMap(const QString& proposedName)
{
    //! NOTE Shared with muse_vst (see FoldersPreferencesModel::exportDefaultKeyswitchMap) --
    //! Qt resources are process-global once any linked library embeds them.
    static const path_t TEMPLATE_PATH(":/vst/resources/keyswitch/Default Example.json");

    const QString newId = uniqueMapId(proposedName);

    RetVal<ByteArray> content = fileSystem()->readFile(TEMPLATE_PATH);
    if (!content.ret) {
        return QString();
    }

    fileSystem()->makePath(mapsDirPath());

    Ret ret = fileSystem()->writeFile(pathForMapId(newId), content.val);
    if (!ret) {
        return QString();
    }

    reload();

    return newId;
}
