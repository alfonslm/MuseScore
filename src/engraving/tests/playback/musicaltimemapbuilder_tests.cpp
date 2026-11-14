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

#include "engraving/dom/tempotimeline.h"
#include "engraving/playback/musicaltimemapbuilder.h"

using namespace mu::engraving;
using namespace muse::audio;

class Engraving_MusicalTimeMapBuilderTests : public ::testing::Test
{
protected:
    static constexpr int QUARTER = 480;
    static constexpr int MEASURE_4_4 = 4 * QUARTER;

    using MeasureSpan = MusicalTimeMapBuilder::MeasureSpan;
    using TempoPoint = MusicalTimeMap::TempoPoint;
    using BarPoint = MusicalTimeMap::BarPoint;

    static std::vector<MeasureSpan> measures(int count, const Fraction& timeSig)
    {
        std::vector<MeasureSpan> result;
        const int ticks = timeSig.ticks();
        int utick = 0;
        for (int i = 0; i < count; ++i) {
            result.push_back({ utick, ticks, timeSig });
            utick += ticks;
        }
        return result;
    }
};

TEST_F(Engraving_MusicalTimeMapBuilderTests, ConstantTempo)
{
    // 120 bpm, three measures of 4/4
    const std::vector<TempoTimePoint> points { { 0, 0.0, 2.0, 0.0 } };

    const MusicalTimeMap map = MusicalTimeMapBuilder::build(points, measures(3, Fraction(4, 4)), 1.0);

    EXPECT_EQ(map.tempo, (std::vector<TempoPoint> { { 0.0, 0.0, 2.0 } }));
    EXPECT_EQ(map.bars, (std::vector<BarPoint> { { 0.0, 4, 4, 0.0 } }));

    // 3 seconds in: 6 quarter notes, in the 2nd measure
    const MusicalPosition pos = map.positionAt(3.0);
    EXPECT_DOUBLE_EQ(pos.bpm, 120.0);
    EXPECT_DOUBLE_EQ(pos.quarters, 6.0);
    EXPECT_DOUBLE_EQ(pos.barStartQuarters, 4.0);
}

TEST_F(Engraving_MusicalTimeMapBuilderTests, TempoChangeAndFermata)
{
    // 120 bpm; the 2nd measure is held at half speed (a fermata is a slower stretch of tempo), then back
    const std::vector<TempoTimePoint> points {
        { 0, 0.0, 2.0, 0.0 },
        { MEASURE_4_4, 2.0, 1.0, 0.0 },
        { 2 * MEASURE_4_4, 6.0, 2.0, 0.0 },
    };

    const MusicalTimeMap map = MusicalTimeMapBuilder::build(points, measures(3, Fraction(4, 4)), 1.0);

    EXPECT_EQ(map.tempo, (std::vector<TempoPoint> { { 0.0, 0.0, 2.0 }, { 2.0, 4.0, 1.0 }, { 6.0, 8.0, 2.0 } }));

    EXPECT_DOUBLE_EQ(map.positionAt(4.0).quarters, 6.0);
    EXPECT_DOUBLE_EQ(map.positionAt(4.0).bpm, 60.0);
    EXPECT_DOUBLE_EQ(map.positionAt(7.0).quarters, 10.0);
    EXPECT_DOUBLE_EQ(map.positionAt(7.0).bpm, 120.0);
}

TEST_F(Engraving_MusicalTimeMapBuilderTests, Pause)
{
    // 120 bpm, a 2 second caesura in the middle of the 2nd measure (after 6 quarter notes = 3 s).
    // TempoTimeline gives the pause as a point of its own; its time is where the pause ends.
    const int pauseTick = MEASURE_4_4 + 2 * QUARTER;
    const std::vector<TempoTimePoint> points {
        { 0, 0.0, 2.0, 0.0 },
        { pauseTick, 5.0, 2.0, 2.0 },
    };

    const MusicalTimeMap map = MusicalTimeMapBuilder::build(points, measures(3, Fraction(4, 4)), 1.0);

    EXPECT_EQ(map.tempo, (std::vector<TempoPoint> { { 0.0, 0.0, 2.0 }, { 3.0, 6.0, 2.0 }, { 5.0, 6.0, 2.0 } }));

    // standing still during the pause, bar position included
    EXPECT_DOUBLE_EQ(map.positionAt(4.0).quarters, 6.0);
    EXPECT_DOUBLE_EQ(map.positionAt(4.0).barStartQuarters, 4.0);
    // the 3rd measure starts 1 second after the pause
    EXPECT_DOUBLE_EQ(map.positionAt(6.0).quarters, 8.0);
    EXPECT_DOUBLE_EQ(map.positionAt(6.0).barStartQuarters, 8.0);
}

TEST_F(Engraving_MusicalTimeMapBuilderTests, TempoChangeOnPause)
{
    // A new tempo on the tick of a pause: TempoTimeline emits the value point first, then the pause point
    const std::vector<TempoTimePoint> points {
        { 0, 0.0, 2.0, 0.0 },
        { MEASURE_4_4, 2.0, 1.0, 0.0 },
        { MEASURE_4_4, 3.5, 1.0, 1.5 },
    };

    const MusicalTimeMap map = MusicalTimeMapBuilder::build(points, measures(2, Fraction(4, 4)), 1.0);

    EXPECT_EQ(map.tempo, (std::vector<TempoPoint> { { 0.0, 0.0, 2.0 }, { 2.0, 4.0, 1.0 }, { 3.5, 4.0, 1.0 } }));
    EXPECT_DOUBLE_EQ(map.positionAt(3.0).quarters, 4.0);
    EXPECT_DOUBLE_EQ(map.positionAt(4.5).quarters, 5.0);
}

TEST_F(Engraving_MusicalTimeMapBuilderTests, PlaybackSpeed)
{
    // Played at half speed: everything takes twice as long and the tempo plugins see is halved
    const int pauseTick = MEASURE_4_4;
    const std::vector<TempoTimePoint> points {
        { 0, 0.0, 2.0, 0.0 },
        { pauseTick, 3.0, 2.0, 1.0 },
    };

    const MusicalTimeMap map = MusicalTimeMapBuilder::build(points, measures(2, Fraction(4, 4)), 0.5);

    EXPECT_EQ(map.tempo, (std::vector<TempoPoint> { { 0.0, 0.0, 1.0 }, { 4.0, 4.0, 1.0 }, { 6.0, 4.0, 1.0 } }));
    EXPECT_DOUBLE_EQ(map.positionAt(2.0).bpm, 60.0);
    EXPECT_DOUBLE_EQ(map.positionAt(2.0).quarters, 2.0);
}

TEST_F(Engraving_MusicalTimeMapBuilderTests, TimeSignatures)
{
    // 4/4, 4/4, 3/4, 3/4, 6/8
    std::vector<MeasureSpan> spans = measures(2, Fraction(4, 4));
    int utick = 2 * MEASURE_4_4;
    for (const Fraction& ts : { Fraction(3, 4), Fraction(3, 4), Fraction(6, 8) }) {
        spans.push_back({ utick, ts.ticks(), ts });
        utick += ts.ticks();
    }

    const MusicalTimeMap map = MusicalTimeMapBuilder::build({ { 0, 0.0, 2.0, 0.0 } }, spans, 1.0);

    EXPECT_EQ(map.bars, (std::vector<BarPoint> { { 0.0, 4, 4, 0.0 }, { 8.0, 3, 4, 0.0 }, { 14.0, 6, 8, 0.0 } }));
}

TEST_F(Engraving_MusicalTimeMapBuilderTests, PickupMeasure)
{
    // a pickup of one quarter note, then two full measures of 4/4
    const std::vector<MeasureSpan> spans {
        { 0, QUARTER, Fraction(4, 4) },
        { QUARTER, MEASURE_4_4, Fraction(4, 4) },
        { QUARTER + MEASURE_4_4, MEASURE_4_4, Fraction(4, 4) },
    };

    const MusicalTimeMap map = MusicalTimeMapBuilder::build({ { 0, 0.0, 2.0, 0.0 } }, spans, 1.0);

    EXPECT_EQ(map.bars, (std::vector<BarPoint> { { 0.0, 4, 4, 1.0 }, { 1.0, 4, 4, 0.0 } }));

    // bar lines are where the score has them, not every 4 quarter notes from the start
    EXPECT_DOUBLE_EQ(map.positionAt(0.25).barStartQuarters, 0.0);
    EXPECT_DOUBLE_EQ(map.positionAt(1.0).barStartQuarters, 1.0);
    EXPECT_DOUBLE_EQ(map.positionAt(3.0).barStartQuarters, 5.0);
}

TEST_F(Engraving_MusicalTimeMapBuilderTests, NoTempoPoints)
{
    const MusicalTimeMap map = MusicalTimeMapBuilder::build({}, measures(1, Fraction(4, 4)), 1.0);

    EXPECT_TRUE(map.isValid());
    EXPECT_DOUBLE_EQ(map.positionAt(1.0).bpm, 120.0);
    EXPECT_DOUBLE_EQ(map.positionAt(1.0).quarters, 2.0);
}
