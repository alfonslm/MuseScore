/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Studio-CLA-applies
 *
 * MuseScore Studio
 * Music Composition & Notation
 *
 * Copyright (C) 2021 MuseScore Limited and others
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

#include <vector>

#include "audio/common/musicaltimemap.h"

#include "../types/fraction.h"

namespace mu::engraving {
class Score;
struct TempoTimePoint;

//! Describes the score to the audio engine as time <-> musical position (tempo, pauses, bar lines),
//! so that plugins which follow the host transport know the tempo and which bar and beat they are at.
class MusicalTimeMapBuilder
{
public:
    //! A measure as it is played back: one entry per pass through a repeated measure
    struct MeasureSpan {
        int utick = 0;      // unwound start tick
        int ticks = 0;      // actual length
        Fraction timeSig;   // nominal time signature
    };

    static muse::audio::MusicalTimeMap build(const Score* score, bool expandRepeats);

    //! `measures` must be contiguous and in playback order.
    //! `tempoMultiplier` is the playback speed: the times of `tempoPoints` are nominal, the result is in real playback time.
    static muse::audio::MusicalTimeMap build(const std::vector<TempoTimePoint>& tempoPoints, const std::vector<MeasureSpan>& measures,
                                             double tempoMultiplier);
};
}
