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

#include "stafftextbase.h"

#include <algorithm>

#include "score.h"
#include "segment.h"
#include "staff.h"

#include "log.h"

using namespace mu::engraving;

StaffTextBase::StaffTextBase(const ElementType& type, Segment* parent, TextStyleType tid, ElementFlags flags)
    : TextBase(type, parent, tid, flags)
{
    setSwingParameters(Constants::DIVISION / 2, 60);
}

void StaffTextBase::clear()
{
    for (voice_idx_t voice = 0; voice < VOICES; ++voice) {
        m_channelNames[voice].clear();
    }
    clearAeolusStops();
}

void StaffTextBase::clearAeolusStops()
{
    for (int i = 0; i < 4; ++i) {
        m_aeolusStops[i] = 0;
    }
}

void StaffTextBase::setAeolusStop(int group, int idx, bool val)
{
    if (val) {
        m_aeolusStops[group] |= (1 << idx);
    } else {
        m_aeolusStops[group] &= ~(1 << idx);
    }
}

void StaffTextBase::setAeolusStop(int group, int val)
{
    m_aeolusStops[group] = val;
}

bool StaffTextBase::getAeolusStop(int group, int idx) const
{
    return m_aeolusStops[group] & (1 << idx);
}

int StaffTextBase::aeolusStop(int group) const
{
    return m_aeolusStops[group];
}

Segment* StaffTextBase::segment() const
{
    if (!ownershipParent()->isSegment()) {
        LOGD("parent %s", ownershipParent()->typeName());
        return 0;
    }
    Segment* s = toSegment(ownershipParent());
    return s;
}

void StaffTextBase::added()
{
    TextBase::added();

    Score* s = score();
    if (s && swing()) {
        s->updateSwing();
    }
}

void StaffTextBase::removed()
{
    TextBase::removed();

    Score* s = score();
    if (s && swing()) {
        s->updateSwing();
    }
}

PropertyValue StaffTextBase::getProperty(Pid propertyId) const
{
    switch (propertyId) {
    case Pid::PLAYBACK_STATE:
        return static_cast<int>(m_playbackState.type);
    case Pid::PLAYBACK_STATE_TIME:
        return m_playbackState.timeMs;
    case Pid::PLAYBACK_STATE_TIME_UNIT:
        return static_cast<int>(m_playbackState.timeUnit);
    case Pid::PLAYBACK_STATE_TRANSITION:
        return static_cast<int>(m_playbackState.transition);
    case Pid::PLAYBACK_STATE_CURVE:
        return static_cast<int>(m_playbackState.curve);
    default:
        return TextBase::getProperty(propertyId);
    }
}

bool StaffTextBase::setProperty(Pid propertyId, const PropertyValue& v)
{
    switch (propertyId) {
    case Pid::PLAYBACK_STATE:
        m_playbackState.type = static_cast<PlaybackStateType>(v.toInt());
        break;
    case Pid::PLAYBACK_STATE_TIME:
        m_playbackState.timeMs = std::max(0, v.toInt());
        break;
    case Pid::PLAYBACK_STATE_TIME_UNIT:
        m_playbackState.timeUnit = static_cast<PlaybackStateTimeUnit>(v.toInt());
        break;
    case Pid::PLAYBACK_STATE_TRANSITION:
        m_playbackState.transition = static_cast<PlaybackStateTransition>(v.toInt());
        break;
    case Pid::PLAYBACK_STATE_CURVE:
        m_playbackState.curve = static_cast<PlaybackStateCurve>(v.toInt());
        break;
    default:
        return TextBase::setProperty(propertyId, v);
    }

    triggerLayout();
    return true;
}

PropertyValue StaffTextBase::propertyDefault(Pid id) const
{
    const PlaybackStateParams defaults;

    switch (id) {
    case Pid::PLAYBACK_STATE:
        return static_cast<int>(defaults.type);
    case Pid::PLAYBACK_STATE_TIME:
        return defaults.timeMs;
    case Pid::PLAYBACK_STATE_TIME_UNIT:
        return static_cast<int>(defaults.timeUnit);
    case Pid::PLAYBACK_STATE_TRANSITION:
        return static_cast<int>(defaults.transition);
    case Pid::PLAYBACK_STATE_CURVE:
        return static_cast<int>(defaults.curve);
    default:
        return TextBase::propertyDefault(id);
    }
}
