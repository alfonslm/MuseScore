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

#ifndef MU_ENGRAVING_PAUSEMAP_H
#define MU_ENGRAVING_PAUSEMAP_H

#include <map>
#include <vector>

#include "../../types/fraction.h"

/**
 \file
 Definition of class PauseMap.
*/

namespace mu::engraving {
class Score;
struct TempoTimePoint;

//---------------------------------------------------
//   PauseMapMode
//    How a pause (caesura, breath, section break) is
//    turned into extra ticks.
//---------------------------------------------------
enum class PauseMapMode {
    InsertMeasure,   // insert a whole measure of ticks per pause: every later measure number moves up by one
    ExtendMeasure,   // lengthen the measure the pause belongs to: measure numbers stay the same as in the score
};

//---------------------------------------------------
//   PauseMap
//    MIDI files cannot contain pauses so need to insert
//    extra ticks extra ticks and tempo changes instead.
//---------------------------------------------------
class PauseMap : std::map<int, int>
{
public:
    //! A measure as it is played back: one entry per pass through a repeated measure
    struct MeasureSpan {
        int utick = 0;      // unwound start tick
        int ticks = 0;      // actual length
        Fraction timeSig;   // nominal time signature
    };

    void calculate(const engraving::Score* s, PauseMapMode mode = PauseMapMode::InsertMeasure);

    //! The ExtendMeasure calculation on plain data. `measures` must be contiguous and in playback order.
    void calculate(const std::vector<TempoTimePoint>& tempoPoints, const std::vector<MeasureSpan>& measures);

    inline int tickWithPauses(int utick) const { return utick + offsetAtUTick(utick); }
    const std::map<int, double>& tempoEvents() const { return m_tempoEvents; }

    //! Time signatures of the lengthened measures and of the measures that follow them.
    //! Keyed by tick with pauses; they take precedence over the score's own time signatures. Empty in InsertMeasure mode.
    const std::map<int, Fraction>& timeSigEvents() const { return m_timeSigEvents; }

private:
    int offsetAtUTick(int utick) const;

    std::map<int, double> m_tempoEvents;
    std::map<int, Fraction> m_timeSigEvents;
};
} // namespace mu::engraving
#endif
