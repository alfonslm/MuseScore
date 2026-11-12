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

/**
 \file
 Implementation of class PauseMap.
*/

#include "pausemap.h"

#include <algorithm>
#include <cmath>

#include "dom/measure.h"
#include "dom/repeatlist.h"
#include "dom/score.h"
#include "dom/sig.h"
#include "dom/tempotimeline.h"

#include "log.h"

using namespace mu;
using namespace muse;

namespace mu::engraving {
static constexpr int WHOLE_NOTE_TICKS = 4 * Constants::DIVISION;
static constexpr int SHORTEST_GAP_UNIT = Constants::DIVISION / 16; // a 64th note
static constexpr int MAX_MIDI_TIMESIG_NUMERATOR = 255; // stored in one byte
static constexpr int MAX_MIDI_TIMESIG_DENOMINATOR = 64;

static bool isPowerOfTwo(int v)
{
    return v > 0 && (v & (v - 1)) == 0;
}

static int beatTicks(const Fraction& timeSig)
{
    const int den = timeSig.denominator();
    if (!isPowerOfTwo(den) || den > MAX_MIDI_TIMESIG_DENOMINATOR) {
        return Constants::DIVISION;
    }

    return WHOLE_NOTE_TICKS / den;
}

//---------------------------------------------------------
//   gapTicks
//    How many ticks to insert for a pause, at roughly the surrounding tempo.
//    Whole beats where the pause is long enough, so that the lengthened
//    measure gets a readable time signature (4/4 + 2 beats = 6/4).
//---------------------------------------------------------

static int gapTicks(double pauseSecs, double bps, int beatTicks)
{
    const double exactTicks = pauseSecs * bps * Constants::DIVISION;

    int unit = std::max(beatTicks, SHORTEST_GAP_UNIT);
    while (unit > SHORTEST_GAP_UNIT && unit % 2 == 0 && exactTicks < 0.75 * unit) {
        unit /= 2;
    }

    return static_cast<int>(std::max(1L, std::lround(exactTicks / unit))) * unit;
}

//---------------------------------------------------------
//   timeSigForTicks
//    The time signature of a measure that is `ticks` long, keeping the
//    original denominator if possible. Invalid if MIDI cannot express it.
//---------------------------------------------------------

static Fraction timeSigForTicks(int ticks, const Fraction& originalTimeSig)
{
    static const Fraction INVALID(0, 0);

    int den = originalTimeSig.denominator();
    if (!isPowerOfTwo(den)) {
        return INVALID;
    }

    for (; den <= MAX_MIDI_TIMESIG_DENOMINATOR; den *= 2) {
        const long long scaled = static_cast<long long>(ticks) * den;
        if (scaled % WHOLE_NOTE_TICKS != 0) {
            continue;
        }

        const long long num = scaled / WHOLE_NOTE_TICKS;
        if (num > MAX_MIDI_TIMESIG_NUMERATOR) {
            break;
        }

        return Fraction(static_cast<int>(num), den);
    }

    return INVALID;
}

//---------------------------------------------------------
//   calculate
//    MIDI files cannot contain pauses so insert extra ticks and tempo changes instead.
//    The PauseMap and tempo events are fully unwound to account for pauses on repeats.
//---------------------------------------------------------

void PauseMap::calculate(const Score* s, PauseMapMode mode)
{
    IF_ASSERT_FAILED(s) {
        LOGE() << "failed to calculate pause map";
    }

    if (mode == PauseMapMode::ExtendMeasure) {
        std::vector<MeasureSpan> measures;
        for (const RepeatSegment* rs : s->repeatList()) {
            const int tickOffset = rs->utick - rs->tick;
            for (const Measure* m : rs->measureList()) {
                measures.push_back({ m->tick().ticks() + tickOffset, m->ticks().ticks(), m->timesig() });
            }
        }

        calculate(s->tempoTimeline().points(), measures);
        return;
    }

    insert(std::pair<const int, int>(0, 0));    // can't start with a pause

    const TimeSigMap* sigmap = s->sigmap();
    const RepeatList& repeatList = s->repeatList();

    for (const TempoTimePoint& point : s->tempoTimeline().points()) {
        const int utick = point.utick;

        if (point.pause <= 0.0) {
            // We have a regular tempo change.
            m_tempoEvents[tickWithPauses(utick)] = point.bps;
            continue;
        }

        // We have a pause event.
        const int tick = repeatList.utick2tick(utick);
        Fraction timeSig(sigmap->timesig(tick).timesig());
        double quarterNotesPerMeasure = (4.0 * timeSig.numerator()) / timeSig.denominator();
        int ticksPerMeasure =  quarterNotesPerMeasure * Constants::DIVISION;           // store a full measure of ticks to keep barlines in same places
        m_tempoEvents[tickWithPauses(utick)] = quarterNotesPerMeasure / point.pause;           // new tempo for pause
        insert(std::pair<const int, int>(utick, ticksPerMeasure + offsetAtUTick(utick)));            // store running total of extra ticks
        m_tempoEvents[tickWithPauses(utick)] = point.bps;           // restore previous tempo
    }
}

//---------------------------------------------------------
//   calculate
//    Lengthen the measure a pause belongs to instead of inserting a whole measure,
//    so that the measures of the MIDI file stay in step with those of the score.
//    The extra ticks get a tempo that makes them last exactly as long as the pause.
//---------------------------------------------------------

void PauseMap::calculate(const std::vector<TempoTimePoint>& tempoPoints, const std::vector<MeasureSpan>& measures)
{
    clear();
    m_tempoEvents.clear();
    m_timeSigEvents.clear();

    insert(std::pair<const int, int>(0, 0));    // can't start with a pause

    std::map<size_t, int> extraTicksByMeasure;

    for (const TempoTimePoint& point : tempoPoints) {
        const int utick = point.utick;

        // A pause belongs to the measure it interrupts, or to the one that ends where it is
        size_t measureIdx = muse::nidx;
        if (point.pause > 0.0) {
            auto it = std::lower_bound(measures.begin(), measures.end(), utick, [](const MeasureSpan& m, int tick) {
                return m.utick + m.ticks < tick;
            });
            if (it != measures.end() && it->utick < utick) {
                measureIdx = static_cast<size_t>(it - measures.begin());
            }
        }

        if (measureIdx == muse::nidx) {
            // We have a regular tempo change (or a pause before the first note, which cannot be expressed).
            m_tempoEvents[tickWithPauses(utick)] = point.bps;
            continue;
        }

        // We have a pause event.
        const int gap = gapTicks(point.pause, point.bps, beatTicks(measures[measureIdx].timeSig));
        m_tempoEvents[tickWithPauses(utick)] = static_cast<double>(gap) / Constants::DIVISION / point.pause; // new tempo for pause
        (*this)[utick] = gap + offsetAtUTick(utick);            // store running total of extra ticks
        m_tempoEvents[tickWithPauses(utick)] = point.bps;       // restore previous tempo

        extraTicksByMeasure[measureIdx] += gap;
    }

    for (const auto& [measureIdx, extraTicks] : extraTicksByMeasure) {
        const MeasureSpan& measure = measures[measureIdx];
        const Fraction timeSig = timeSigForTicks(measure.ticks + extraTicks, measure.timeSig);
        if (!timeSig.isValid()) {
            LOGW() << "no time signature for the measure lengthened by a pause at utick " << measure.utick
                   << ", later measures will not line up";
            continue;
        }

        m_timeSigEvents[tickWithPauses(measure.utick)] = timeSig;

        const size_t nextIdx = measureIdx + 1;
        if (nextIdx < measures.size() && extraTicksByMeasure.find(nextIdx) == extraTicksByMeasure.end()) {
            m_timeSigEvents[tickWithPauses(measures[nextIdx].utick)] = measures[nextIdx].timeSig;
        }
    }
}

//---------------------------------------------------------
//   offsetAtUTick
//    In total, how many extra ticks have been inserted prior to this utick.
//---------------------------------------------------------

int PauseMap::offsetAtUTick(int utick) const
{
    // make sure calculate was called
    IF_ASSERT_FAILED(!empty()) {
        LOGE() << "accessing empty container";
    }

    auto i = upper_bound(utick);
    if (i != begin()) {
        --i;
    }
    return i->second;
}
}
