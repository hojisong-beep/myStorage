// audio.cpp - procedurally synthesised sound effects and a continuous engine/ambient stream
#include "audio.h"
#include <atomic>

static const int RATE = 44100;

static Sound makeSound(const std::vector<float>& s) {
    Wave w = {0};
    w.frameCount = (unsigned int)s.size();
    w.sampleRate = RATE;
    w.sampleSize = 16;
    w.channels = 1;
    short* d = (short*)MemAlloc((unsigned int)(s.size() * sizeof(short)));
    for (size_t i = 0; i < s.size(); i++) d[i] = (short)(clampf(s[i], -1, 1) * 32000);
    w.data = d;
    Sound snd = LoadSoundFromWave(w);
    UnloadWave(w);
    return snd;
}

static std::vector<float> synth(float dur, float (*f)(float t, float& state, Rng& r)) {
    std::vector<float> s((size_t)(dur * RATE));
    float st = 0;
    Rng r(7);
    for (size_t i = 0; i < s.size(); i++) s[i] = f((float)i / RATE, st, r);
    return s;
}

// --- individual effects -----------------------------------------------------
static float phaseA, phaseB, lp1, lp2;

static float fxLaser(float t, float&, Rng& r) {
    float f = 1500 * expf(-t * 20) + 260;
    phaseA += 2 * PI * f / RATE;
    float env = expf(-t * 13) * fminf(1, t * 500);
    return (0.55f * sinf(phaseA) + 0.25f * sinf(phaseA * 2.01f) + 0.08f * (float)r.range(-1, 1)) * env;
}
static float fxEnemyLaser(float t, float&, Rng& r) {
    float f = 720 * expf(-t * 11) + 150;
    phaseA += 2 * PI * f / RATE;
    float saw = fmodf(phaseA / (2 * PI), 1.0f) * 2 - 1;
    float env = expf(-t * 10) * fminf(1, t * 400);
    return (0.35f * saw + 0.3f * sinf(phaseA) + 0.05f * (float)r.range(-1, 1)) * env;
}
static float fxExplosion(float t, float&, Rng& r) {
    float n = (float)r.range(-1, 1);
    float cut = 0.02f + 0.25f * expf(-t * 4);
    lp1 += (n - lp1) * cut;
    lp2 += (lp1 - lp2) * cut;
    phaseA += 2 * PI * (48 + 30 * expf(-t * 8)) / RATE;
    float thump = sinf(phaseA) * expf(-t * 5);
    float env = expf(-t * 2.4f) * fminf(1, t * 200);
    return (lp2 * 2.6f + thump * 0.8f) * env;
}
static float fxBigExplosion(float t, float&, Rng& r) {
    float n = (float)r.range(-1, 1);
    float cut = 0.015f + 0.2f * expf(-t * 2);
    lp1 += (n - lp1) * cut;
    lp2 += (lp1 - lp2) * cut;
    phaseA += 2 * PI * (35 + 25 * expf(-t * 3)) / RATE;
    float env = expf(-t * 1.2f) * fminf(1, t * 100);
    return (lp2 * 3.0f + sinf(phaseA) * 0.9f * expf(-t * 2)) * env;
}
static float fxLock(float t, float&, Rng&) {
    bool on = (t < 0.06f) || (t > 0.1f && t < 0.16f);
    return on ? sinf(2 * PI * 1850 * t) * 0.35f : 0.0f;
}
static float fxWarpIn(float t, float&, Rng& r) {
    float f = 60 + 900 * powf(t / 1.4f, 2.2f);
    phaseA += 2 * PI * f / RATE;
    phaseB += 2 * PI * f * 1.5f / RATE;
    float n = (float)r.range(-1, 1);
    lp1 += (n - lp1) * (0.02f + 0.3f * t / 1.6f);
    float env = t < 1.3f ? powf(t / 1.3f, 1.5f) : expf(-(t - 1.3f) * 5);
    float boom = t > 1.3f ? sinf(2 * PI * 45 * t) * expf(-(t - 1.3f) * 4) * 1.2f : 0;
    return (0.35f * sinf(phaseA) + 0.15f * sinf(phaseB) + lp1 * 1.2f) * env + boom;
}
static float fxWarpOut(float t, float&, Rng& r) {
    float f = 700 * expf(-t * 3) + 50;
    phaseA += 2 * PI * f / RATE;
    float n = (float)r.range(-1, 1);
    lp1 += (n - lp1) * (0.3f * expf(-t * 3) + 0.01f);
    float env = expf(-t * 2.5f) * fminf(1, t * 60);
    return (0.4f * sinf(phaseA) + lp1 * 1.5f) * env;
}
static float fxHit(float t, float&, Rng& r) {
    return (float)r.range(-1, 1) * expf(-t * 40) * 0.8f + sinf(2 * PI * 220 * t) * expf(-t * 30) * 0.4f;
}
static float fxShieldHit(float t, float&, Rng& r) {
    float f = 320 + 80 * sinf(t * 90);
    phaseA += 2 * PI * f / RATE;
    return (sinf(phaseA) * 0.5f + (float)r.range(-1, 1) * 0.2f) * expf(-t * 9);
}
static float fxAlarm(float t, float&, Rng&) {
    float f = fmodf(t, 0.3f) < 0.15f ? 880.f : 660.f;
    return sinf(2 * PI * f * t) * 0.25f * (t < 0.6f ? 1.f : 0.f);
}

// --- continuous engine + ambient pad ------------------------------------------
static std::atomic<float> aThrottle{0}, aWarp{0}, aBoost{0}, aMaster{1};

static void streamCallback(void* buffer, unsigned int frames) {
    static double t = 0;
    static float p1 = 0, p2 = 0, p3 = 0, nlp = 0, nlp2 = 0, sThr = 0, sWarp = 0, sBoost = 0;
    static Rng rng(99);
    static const float padF[5] = {55.0f, 82.41f, 110.0f, 164.81f, 207.65f};
    static float padP[5] = {0};
    short* out = (short*)buffer;
    float thr = aThrottle.load(), warp = aWarp.load(), boost = aBoost.load(), master = aMaster.load();
    for (unsigned int i = 0; i < frames; i++) {
        sThr += (thr - sThr) * 0.0005f;
        sWarp += (warp - sWarp) * 0.0003f;
        sBoost += (boost - sBoost) * 0.001f;
        float base = 42 + 30 * sThr + 25 * sBoost + 20 * sWarp;
        p1 += 2 * PI * base / RATE;
        p2 += 2 * PI * base * 2.003f / RATE;
        p3 += 2 * PI * (base * 0.5f) / RATE;
        float n = (float)rng.range(-1, 1);
        float cut = 0.01f + 0.05f * sThr + 0.08f * sWarp + 0.05f * sBoost;
        nlp += (n - nlp) * cut;
        nlp2 += (nlp - nlp2) * cut;
        float engine = (0.22f * sinf(p1) + 0.1f * sinf(p2) + 0.25f * sinf(p3) * sWarp) * (0.3f + 0.7f * sThr);
        engine += nlp2 * (0.6f * sThr + 1.4f * sWarp + 0.8f * sBoost);
        // ambient pad with slow breathing
        float pad = 0;
        for (int k = 0; k < 5; k++) {
            padP[k] += 2 * PI * padF[k] / RATE;
            float lfo = 0.5f + 0.5f * sinf((float)(t * (0.05 + 0.017 * k)) + k * 1.3f);
            pad += sinf(padP[k]) * lfo;
        }
        pad *= 0.018f;
        float s = (engine * 0.55f + pad) * master;
        out[i] = (short)(clampf(s, -1, 1) * 30000);
        t += 1.0 / RATE;
        if (p1 > 1e4f) { p1 = fmodf(p1, 2 * PI); p2 = fmodf(p2, 2 * PI); p3 = fmodf(p3, 2 * PI); }
        for (int k = 0; k < 5; k++) if (padP[k] > 1e4f) padP[k] = fmodf(padP[k], 2 * PI);
    }
}

void Audio::init() {
    InitAudioDevice();
    ok = IsAudioDeviceReady();
    if (!ok) return;
    struct { SfxId id; float dur; float (*f)(float, float&, Rng&); } defs[] = {
        {SFX_LASER, 0.25f, fxLaser}, {SFX_ENEMY_LASER, 0.3f, fxEnemyLaser}, {SFX_EXPLOSION, 1.8f, fxExplosion},
        {SFX_BIG_EXPLOSION, 3.5f, fxBigExplosion}, {SFX_LOCK, 0.18f, fxLock}, {SFX_WARP_IN, 2.0f, fxWarpIn},
        {SFX_WARP_OUT, 1.4f, fxWarpOut}, {SFX_HIT, 0.12f, fxHit}, {SFX_SHIELD_HIT, 0.4f, fxShieldHit},
        {SFX_ALARM, 0.62f, fxAlarm},
    };
    for (auto& d : defs) {
        phaseA = phaseB = lp1 = lp2 = 0;
        sfx[d.id] = makeSound(synth(d.dur, d.f));
    }
    SetAudioStreamBufferSizeDefault(4096);
    stream = LoadAudioStream(RATE, 16, 1);
    SetAudioStreamCallback(stream, streamCallback);
    PlayAudioStream(stream);
}

void Audio::shutdown() {
    if (!ok) return;
    StopAudioStream(stream);
    UnloadAudioStream(stream);
    for (auto& s : sfx) UnloadSound(s);
    CloseAudioDevice();
    ok = false;
}

void Audio::play(SfxId id, float volume, float pitch) {
    if (!ok) return;
    SetSoundVolume(sfx[id], clampf(volume, 0, 1));
    SetSoundPitch(sfx[id], pitch);
    PlaySound(sfx[id]);
}

void Audio::setEngine(float throttle, float warp, float boost, float master) {
    aThrottle = throttle;
    aWarp = warp;
    aBoost = boost;
    aMaster = master;
}
