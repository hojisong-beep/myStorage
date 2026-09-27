// audio.h - procedurally synthesised sound (no audio files needed)
#pragma once
#include "core.h"

enum SfxId { SFX_LASER, SFX_ENEMY_LASER, SFX_EXPLOSION, SFX_BIG_EXPLOSION, SFX_LOCK, SFX_WARP_IN,
             SFX_WARP_OUT, SFX_HIT, SFX_SHIELD_HIT, SFX_ALARM, SFX_COUNT };

struct Audio {
    bool ok = false;
    Sound sfx[SFX_COUNT]{};
    AudioStream stream{};
    void init();
    void shutdown();
    void play(SfxId id, float volume = 1.0f, float pitch = 1.0f);
    // engine: throttle 0..1, warp 0..1 (how deep into warp), boost 0/1
    void setEngine(float throttle, float warp, float boost, float master);
};
