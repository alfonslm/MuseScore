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

#include "musicaltimemapbuilder.h"

#include "dom/measure.h"
#include "dom/repeatlist.h"
#include "dom/score.h"
#include "dom/tempotimeline.h"
#include "types/constants.h"

#include "log.h"

using namespace mu::engraving;
using namespace muse::audio;

static double toQuarters(int ticks)
{
    return static_cast<double>(ticks) / Constants::DIVISION;
}

MusicalTimeMap MusicalTimeMapBuilder::build(const Score* score, bool expandRepeats)
{
    IF_ASSERT_FAILED(score) {
        return MusicalTimeMap();
    }

    std::vector<MeasureSpan> measures;
    for (const RepeatSegment* rs : score->repeatList(expandRepeats)) {
        const int tickOffset = rs->utick - rs->tick;
        for (const Measure* m : rs->measureList()) {
            measures.push_back({ m->tick().ticks() + tickOffset, m->ticks().ticks(), m->timesig() });
        }
    }

    const TempoTimeline& timeline = score->tempoTimeline(expandRepeats);

    return build(timeline.points(), measures, timeline.tempoMultiplier().val);
}

MusicalTimeMap MusicalTimeMapBuilder::build(const std::vector<TempoTimePoint>& tempoPoints, const std::vector<MeasureSpan>& measures,
                                            double tempoMultiplier)
{
    MusicalTimeMap result;

    if (tempoMultiplier <= 0.0) {
        tempoMultiplier = 1.0;
    }

    auto addTempoPoint = [&result](double secs, double quarters, double bps) {
        if (!result.tempo.empty()) {
            MusicalTimeMap::TempoPoint& last = result.tempo.back();
            if (last.secs == secs && last.quarters == quarters) {
                last.bps = bps;
                return;
            }
        }
        result.tempo.push_back({ secs, quarters, bps });
    };

    for (const TempoTimePoint& point : tempoPoints) {
        const double quarters = toQuarters(point.utick);
        const double bps = point.bps * tempoMultiplier;

        if (point.pause > 0.0) {
            // The music stands still from the start of the pause (which is where the previous point ended)...
            addTempoPoint((point.time - point.pause) / tempoMultiplier, quarters, bps);
        }

        // ...until here
        addTempoPoint(point.time / tempoMultiplier, quarters, bps);
    }

    if (result.tempo.empty()) {
        result.tempo.push_back({ 0.0, 0.0, Constants::DEFAULT_TEMPO.val * tempoMultiplier });
    }

    // One bar point where the time signature changes, and one for each measure
    // that is not as long as its time signature says (a pickup, for example) and for the measure after it
    bool prevIrregular = false;
    for (const MeasureSpan& measure : measures) {
        const bool irregular = measure.ticks != measure.timeSig.ticks();
        const bool timeSigChanged = result.bars.empty()
                                    || result.bars.back().numerator != measure.timeSig.numerator()
                                    || result.bars.back().denominator != measure.timeSig.denominator();

        if (irregular || prevIrregular || timeSigChanged) {
            result.bars.push_back({ toQuarters(measure.utick), measure.timeSig.numerator(), measure.timeSig.denominator(),
                                    irregular ? toQuarters(measure.ticks) : 0.0 });
        }

        prevIrregular = irregular;
    }

    return result;
}
