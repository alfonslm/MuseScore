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

#include <string>
#include <unordered_map>

#include "modularity/ioc.h"
#include "global/iglobalconfiguration.h"
#include "io/ifilesystem.h"

#include "engraving/types/types.h"

namespace mu::playback {
//! NOTE Dev-only, no-UI way to point a track at a keyswitch map for testing (see
//! KEYSWITCH-INSTRUCTIONS.md Step 2). Reads a plain JSON file kept next to the maps
//! themselves -- never the score's own audiosettings.json -- so it's trivial to hand-edit
//! and never gets saved into a .mscz. Keyed by instrumentId only (not per-part), e.g.:
//!   { "violin": "BBCC Violins 1", "cello": "BBCC Celli" }
//! Absent or missing entries are a no-op: nothing changes for anyone who hasn't created this file.
class KeyswitchTestAssignments
{
    muse::GlobalInject<muse::IGlobalConfiguration> globalConfiguration;
    muse::GlobalInject<muse::io::IFileSystem> fileSystem;

public:
    std::string mapIdFor(const mu::engraving::InstrumentTrackId& trackId);

private:
    void ensureLoaded();

    bool m_loaded = false;
    std::unordered_map<std::string, std::string> m_mapIdByInstrumentId;
};
}
