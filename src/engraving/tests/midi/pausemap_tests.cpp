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

#include <gtest/gtest.h>

#include "engraving/compat/midi/pausemap.h"
#include "engraving/dom/tempotimeline.h"

using namespace mu::engraving;

//! Tests of PauseMapMode::ExtendMeasure: a pause lengthens the measure it belongs to
class PauseMap_Tests : public ::testing::Test
{
protected:
    static constexpr int QUARTER = 480;
    static constexpr int MEASURE_4_4 = 4 * QUARTER;

    static std::vector<PauseMap::MeasureSpan> measures(int count, const Fraction& timeSig)
    {
        std::vector<PauseMap::MeasureSpan> result;
        const int ticks = timeSig.ticks();
        for (int i = 0; i < count; ++i) {
            result.push_back({ i * ticks, ticks, timeSig });
        }
        return result;
    }

    static TempoTimePoint tempo(int utick, double bps)
    {
        return { utick, 0.0, bps, 0.0 };
    }

    static TempoTimePoint pause(int utick, double bps, double seconds)
    {
        return { utick, 0.0, bps, seconds };
    }

    //! Seconds from tick 0 to `tickWithPauses`, as a MIDI player would count them
    static double seconds(const PauseMap& map, int tickWithPauses)
    {
        double result = 0.0;
        int prevTick = 0;
        double bps = 0.0;
        for (const auto& [tick, tempoBps] : map.tempoEvents()) {
            if (tick >= tickWithPauses) {
                break;
            }
            result += bps > 0.0 ? double(tick - prevTick) / QUARTER / bps : 0.0;
            prevTick = tick;
            bps = tempoBps;
        }
        return result + double(tickWithPauses - prevTick) / QUARTER / bps;
    }
};

TEST_F(PauseMap_Tests, pauseInsideMeasure)
{
    // 100 bpm, a 2 second caesura in the middle of the 2nd measure:
    // 3.33 beats, so 3 whole beats are added and the measure becomes 7/4
    const double bps = 100.0 / 60.0;
    const int pauseTick = MEASURE_4_4 + 2 * QUARTER;

    PauseMap map;
    map.calculate({ tempo(0, bps), pause(pauseTick, bps, 2.0) }, measures(3, Fraction(4, 4)));

    EXPECT_EQ(map.tickWithPauses(0), 0);
    EXPECT_EQ(map.tickWithPauses(pauseTick - 1), pauseTick - 1);
    EXPECT_EQ(map.tickWithPauses(pauseTick), pauseTick + 3 * QUARTER);
    EXPECT_EQ(map.tickWithPauses(2 * MEASURE_4_4), 2 * MEASURE_4_4 + 3 * QUARTER);

    const std::map<int, Fraction> expectedTimeSigs {
        { MEASURE_4_4, Fraction(7, 4) },
        { 2 * MEASURE_4_4 + 3 * QUARTER, Fraction(4, 4) },
    };
    EXPECT_EQ(map.timeSigEvents(), expectedTimeSigs);
    EXPECT_EQ(map.timeSigEvents().at(MEASURE_4_4).denominator(), 4); // the original denominator is kept

    // the pause lasts exactly 2 seconds
    const double before = pauseTick / double(QUARTER) / bps;
    EXPECT_NEAR(seconds(map, pauseTick), before, 1e-9);
    EXPECT_NEAR(seconds(map, map.tickWithPauses(pauseTick)), before + 2.0, 1e-9);

    // and the tempo afterwards is the original one
    EXPECT_DOUBLE_EQ(map.tempoEvents().rbegin()->second, bps);
}

TEST_F(PauseMap_Tests, pauseAtEndOfMeasure)
{
    // 120 bpm, a breath of half a second (one beat) at the end of the 1st measure:
    // it lengthens the 1st measure, the 2nd one starts after it
    const double bps = 2.0;

    PauseMap map;
    map.calculate({ tempo(0, bps), pause(MEASURE_4_4, bps, 0.5) }, measures(2, Fraction(4, 4)));

    EXPECT_EQ(map.tickWithPauses(MEASURE_4_4 - 1), MEASURE_4_4 - 1);
    EXPECT_EQ(map.tickWithPauses(MEASURE_4_4), MEASURE_4_4 + QUARTER);

    const std::map<int, Fraction> expectedTimeSigs {
        { 0, Fraction(5, 4) },
        { MEASURE_4_4 + QUARTER, Fraction(4, 4) },
    };
    EXPECT_EQ(map.timeSigEvents(), expectedTimeSigs);
}

TEST_F(PauseMap_Tests, pauseAtEndOfLastMeasure)
{
    const double bps = 2.0;

    PauseMap map;
    map.calculate({ tempo(0, bps), pause(MEASURE_4_4, bps, 1.0) }, measures(1, Fraction(4, 4)));

    const std::map<int, Fraction> expectedTimeSigs {
        { 0, Fraction(6, 4) },
    };
    EXPECT_EQ(map.timeSigEvents(), expectedTimeSigs);
}

TEST_F(PauseMap_Tests, shortPauseUsesSmallerUnit)
{
    // 120 bpm, 0.1 seconds is less than a 16th note (0.125 s): one 16th is added, a bit faster
    const double bps = 2.0;
    const int pauseTick = 2 * QUARTER;
    const int sixteenth = QUARTER / 4;

    PauseMap map;
    map.calculate({ tempo(0, bps), pause(pauseTick, bps, 0.1) }, measures(2, Fraction(4, 4)));

    EXPECT_EQ(map.tickWithPauses(pauseTick), pauseTick + sixteenth);

    const std::map<int, Fraction> expectedTimeSigs {
        { 0, Fraction(17, 16) },
        { MEASURE_4_4 + sixteenth, Fraction(4, 4) },
    };
    EXPECT_EQ(map.timeSigEvents(), expectedTimeSigs);
    EXPECT_EQ(map.timeSigEvents().at(0).denominator(), 16);

    EXPECT_DOUBLE_EQ(map.tempoEvents().at(pauseTick), 2.5);
    EXPECT_NEAR(seconds(map, map.tickWithPauses(pauseTick)), 1.0 + 0.1, 1e-9);
}

TEST_F(PauseMap_Tests, compoundMeter)
{
    // 6/8 at 120 quarter notes per minute, 1 second = 4 eighth notes: 6/8 becomes 10/8
    const double bps = 2.0;
    const Fraction timeSig(6, 8);
    const int measureTicks = timeSig.ticks();
    const int eighth = QUARTER / 2;

    PauseMap map;
    map.calculate({ tempo(0, bps), pause(measureTicks, bps, 1.0) }, measures(2, timeSig));

    const std::map<int, Fraction> expectedTimeSigs {
        { 0, Fraction(10, 8) },
        { measureTicks + 4 * eighth, Fraction(6, 8) },
    };
    EXPECT_EQ(map.timeSigEvents(), expectedTimeSigs);
}

TEST_F(PauseMap_Tests, severalPauses)
{
    // Two pauses in the 1st measure add up; the 2nd measure has one too,
    // so the time signature is only restored on the 3rd measure
    const double bps = 2.0;

    PauseMap map;
    map.calculate({
        tempo(0, bps),
        pause(2 * QUARTER, bps, 0.5),                   // 1 beat inside measure 1
        pause(MEASURE_4_4, bps, 1.0),                   // 2 beats at the end of measure 1
        pause(MEASURE_4_4 + QUARTER, bps, 0.5),         // 1 beat inside measure 2
    }, measures(3, Fraction(4, 4)));

    EXPECT_EQ(map.tickWithPauses(2 * QUARTER), 3 * QUARTER);
    EXPECT_EQ(map.tickWithPauses(MEASURE_4_4), MEASURE_4_4 + 3 * QUARTER);
    EXPECT_EQ(map.tickWithPauses(MEASURE_4_4 + QUARTER), MEASURE_4_4 + 5 * QUARTER);
    EXPECT_EQ(map.tickWithPauses(2 * MEASURE_4_4), 2 * MEASURE_4_4 + 4 * QUARTER);

    const std::map<int, Fraction> expectedTimeSigs {
        { 0, Fraction(7, 4) },
        { MEASURE_4_4 + 3 * QUARTER, Fraction(5, 4) },
        { 2 * MEASURE_4_4 + 4 * QUARTER, Fraction(4, 4) },
    };
    EXPECT_EQ(map.timeSigEvents(), expectedTimeSigs);
}

TEST_F(PauseMap_Tests, tempoChangeOnPause)
{
    // A new tempo starts right after the pause: the value point comes first, then the pause point
    PauseMap map;
    map.calculate({ tempo(0, 2.0), tempo(MEASURE_4_4, 1.0), pause(MEASURE_4_4, 1.0, 2.0) }, measures(2, Fraction(4, 4)));

    // 2 seconds at 60 bpm are 2 beats
    EXPECT_EQ(map.tickWithPauses(MEASURE_4_4), MEASURE_4_4 + 2 * QUARTER);

    const std::map<int, double> expectedTempos {
        { 0, 2.0 },
        { MEASURE_4_4, 1.0 },
        { MEASURE_4_4 + 2 * QUARTER, 1.0 },
    };
    EXPECT_EQ(map.tempoEvents(), expectedTempos);
}

TEST_F(PauseMap_Tests, pauseBeforeFirstNoteIsIgnored)
{
    PauseMap map;
    map.calculate({ pause(0, 2.0, 1.0) }, measures(2, Fraction(4, 4)));

    EXPECT_EQ(map.tickWithPauses(0), 0);
    EXPECT_EQ(map.tickWithPauses(MEASURE_4_4), MEASURE_4_4);
    EXPECT_TRUE(map.timeSigEvents().empty());
}

TEST_F(PauseMap_Tests, noPauses)
{
    PauseMap map;
    map.calculate({ tempo(0, 2.0), tempo(MEASURE_4_4, 1.5) }, measures(2, Fraction(4, 4)));

    EXPECT_EQ(map.tickWithPauses(MEASURE_4_4 + 7), MEASURE_4_4 + 7);
    EXPECT_TRUE(map.timeSigEvents().empty());

    const std::map<int, double> expectedTempos {
        { 0, 2.0 },
        { MEASURE_4_4, 1.5 },
    };
    EXPECT_EQ(map.tempoEvents(), expectedTempos);
}
