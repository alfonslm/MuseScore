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

#include <vector>

#include "engraving/dom/instrtemplate.h"
#include "engraving/dom/stringdata.h"

using namespace mu::engraving;

//! NOTE The instrument templates come from instruments.xml, which the build assembles from
//! share/instruments/source (see share/instruments/README.md); the test environment loads it.
class Engraving_InstrumentTemplatesTests : public ::testing::Test
{
};

//! The assembled instruments.xml is embedded and loaded at all
TEST_F(Engraving_InstrumentTemplatesTests, TemplatesAreLoaded)
{
    EXPECT_TRUE(searchTemplate(u"piano"));
    EXPECT_TRUE(searchTemplate(u"violin"));
    EXPECT_TRUE(searchTemplate(u"electric-bass"));
}

//! The bowed strings carry the string tuning String Grip needs (written pitch, 24 frets), so a
//! Tablature staff type is offered for them; see share/instruments/source/strings/
TEST_F(Engraving_InstrumentTemplatesTests, BowedStringsHaveStringData)
{
    struct Expected {
        const char16_t* id;
        std::vector<int> pitches; // lowest string first, as in instruments.xml
    };

    const std::vector<Expected> expected = {
        { u"violin", { 55, 62, 69, 76 } },
        { u"viola", { 48, 55, 62, 69 } },
        { u"violoncello", { 36, 43, 50, 57 } },
        { u"contrabass", { 40, 45, 50, 55 } },
    };

    for (const Expected& e : expected) {
        const InstrumentTemplate* t = searchTemplate(e.id);
        ASSERT_TRUE(t) << String(e.id).toStdString();

        const StringData& stringData = t->stringData;
        EXPECT_EQ(stringData.frets(), 24) << String(e.id).toStdString();

        std::vector<int> pitches;
        for (const instrString& s : stringData.stringList()) {
            pitches.push_back(s.pitch);
        }
        EXPECT_EQ(pitches, e.pitches) << String(e.id).toStdString();
    }
}
