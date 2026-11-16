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

#include <gtest/gtest.h>

#include "engraving/dom/chordrest.h"
#include "engraving/dom/factory.h"
#include "engraving/dom/fermata.h"
#include "engraving/dom/masterscore.h"
#include "engraving/dom/measure.h"
#include "engraving/dom/segment.h"
#include "engraving/editing/editvisibility.h"
#include "engraving/editing/transaction/transaction.h"
#include "engraving/editing/transaction/undostack.h"

#include "utils/scorerw.h"

using namespace mu::engraving;

static const String FERMATA_DATA_DIR("fermata_data/");

class Engraving_FermataTests : public ::testing::Test
{
protected:
    static Fermata* fermataOnStaff(const Segment* segment, staff_idx_t staffIdx)
    {
        const track_idx_t track = staff2track(staffIdx);
        return toFermata(segment->findAnnotation(ElementType::FERMATA, track, track + VOICES - 1));
    }

    static void dropFermata(MasterScore* score, ChordRest* target)
    {
        score->transactionManager()->transaction(TranslatableString::untranslatable("Engraving fermata tests"), [&](Transaction& tx) {
            EditData dd(0);
            Fermata* fermata = Factory::createFermata(score->dummy()->segment());
            fermata->setSymIdAndTimeStretch(SymId::fermataAbove);
            dd.dropElement = fermata;
            if (target->acceptDrop(dd)) {
                target->drop(tx, dd);
            } else {
                delete fermata;
            }
        });
    }
};

TEST_F(Engraving_FermataTests, addToAllStaves)
{
    MasterScore* score = ScoreRW::readScore(FERMATA_DATA_DIR + u"fermata-all-staves.mscx");
    ASSERT_TRUE(score);
    ASSERT_EQ(score->nstaves(), 3u);
    score->doLayout();

    Segment* segment = score->firstMeasure()->first(SegmentType::ChordRest);
    ASSERT_TRUE(segment);
    ASSERT_TRUE(segment->element(0));

    dropFermata(score, toChordRest(segment->element(0)));

    // The fermata is added to every staff, and the copies are linked
    Fermata* top = fermataOnStaff(segment, 0);
    ASSERT_TRUE(top);
    for (staff_idx_t i = 1; i < score->nstaves(); ++i) {
        Fermata* other = fermataOnStaff(segment, i);
        ASSERT_TRUE(other) << "staff " << i;
        EXPECT_TRUE(other->visible());
        EXPECT_TRUE(other->isLinked(top));
    }

    // Undo removes all of them again
    score->undoStack()->undo(0);
    for (staff_idx_t i = 0; i < score->nstaves(); ++i) {
        EXPECT_FALSE(fermataOnStaff(segment, i)) << "staff " << i;
    }

    delete score;
}

TEST_F(Engraving_FermataTests, styleOffAddsToOneStaff)
{
    MasterScore* score = ScoreRW::readScore(FERMATA_DATA_DIR + u"fermata-all-staves.mscx");
    ASSERT_TRUE(score);
    score->style().set(Sid::fermataAddToAllStaves, false);
    score->doLayout();

    Segment* segment = score->firstMeasure()->first(SegmentType::ChordRest);
    ASSERT_TRUE(segment);

    dropFermata(score, toChordRest(segment->element(0)));

    EXPECT_TRUE(fermataOnStaff(segment, 0));
    for (staff_idx_t i = 1; i < score->nstaves(); ++i) {
        EXPECT_FALSE(fermataOnStaff(segment, i)) << "staff " << i;
    }

    delete score;
}

TEST_F(Engraving_FermataTests, hideExceptHereAndShowOnAllStaves)
{
    MasterScore* score = ScoreRW::readScore(FERMATA_DATA_DIR + u"fermata-all-staves.mscx");
    ASSERT_TRUE(score);
    score->doLayout();

    Segment* segment = score->firstMeasure()->first(SegmentType::ChordRest);
    ASSERT_TRUE(segment);

    dropFermata(score, toChordRest(segment->element(0)));

    Fermata* here = fermataOnStaff(segment, 1);
    ASSERT_TRUE(here);
    score->select(here);

    score->transactionManager()->transaction(TranslatableString::untranslatable("Engraving fermata tests"), [&](Transaction& tx) {
        EditVisibility::hideFermatasOnOtherStaves(tx, score);
    });

    for (staff_idx_t i = 0; i < score->nstaves(); ++i) {
        Fermata* f = fermataOnStaff(segment, i);
        ASSERT_TRUE(f) << "staff " << i;
        EXPECT_EQ(f->visible(), i == 1) << "staff " << i;
    }

    score->transactionManager()->transaction(TranslatableString::untranslatable("Engraving fermata tests"), [&](Transaction& tx) {
        EditVisibility::showFermatasOnAllStaves(tx, score);
    });

    for (staff_idx_t i = 0; i < score->nstaves(); ++i) {
        EXPECT_TRUE(fermataOnStaff(segment, i)->visible()) << "staff " << i;
    }

    delete score;
}
