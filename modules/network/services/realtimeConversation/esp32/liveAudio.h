/*
 * Copyright (c) 2024-2026 Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Runtime.
 *
 *   The Moddable SDK Runtime is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   The Moddable SDK Runtime is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 *
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with the Moddable SDK Runtime.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

#ifndef MOD_LIVE_AUDIO_H
#define MOD_LIVE_AUDIO_H

#include <stdatomic.h>
#include "esp_webrtc.h"

typedef struct LiveAudio LiveAudio;
typedef struct {
	unsigned captured, rendered, underruns, overruns;
	unsigned micLevel, cleanLevel, referenceLevel;
	unsigned outputIdleMs, silenceMs, maxSilenceMs;
} LiveAudioStats;

int liveAudioOpen(LiveAudio **audio, esp_webrtc_media_provider_t *provider);
void liveAudioStop(LiveAudio *audio);
void liveAudioClose(LiveAudio *audio);
void liveAudioMute(LiveAudio *audio, bool mute);
void liveAudioVolume(LiveAudio *audio, unsigned volume);
void liveAudioStats(LiveAudio *audio, LiveAudioStats *stats);
int liveAudioError(LiveAudio *audio);
const char *liveAudioStage(LiveAudio *audio);

#endif
