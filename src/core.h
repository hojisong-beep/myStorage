// core.h - math, units, random numbers and formatting shared by the whole game
#pragma once

#include "raylib.h"
#include "raymath.h"
#include "rlgl.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

// ---------------------------------------------------------------------------
// Physical units (SI). The universe origin is the Sun, axes follow the
// galactic coordinate system: +X toward the galactic centre (l=0),
// +Y toward the north galactic pole, -Z toward l=90 (right handed).
// ---------------------------------------------------------------------------
constexpr double C_MS  = 299792458.0;          // speed of light  [m/s]
constexpr double LY_M  = 9.4607304725808e15;   // light year      [m]
constexpr double AU_M  = 1.495978707e11;       // astronomical unit [m]
constexpr double KM    = 1000.0;
constexpr double DAY_S = 86400.0;
constexpr double PI_D  = 3.14159265358979323846;

// ---------------------------------------------------------------------------
// Double precision vector
// ---------------------------------------------------------------------------
struct DVec3 {
    double x = 0, y = 0, z = 0;
    DVec3() = default;
    DVec3(double x_, double y_, double z_) : x(x_), y(y_), z(z_) {}
    explicit DVec3(Vector3 v) : x(v.x), y(v.y), z(v.z) {}
    DVec3 operator+(const DVec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
    DVec3 operator-(const DVec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
    DVec3 operator*(double s) const { return {x * s, y * s, z * s}; }
    DVec3 operator/(double s) const { return {x / s, y / s, z / s}; }
    DVec3 operator-() const { return {-x, -y, -z}; }
    DVec3& operator+=(const DVec3& o) { x += o.x; y += o.y; z += o.z; return *this; }
    DVec3& operator-=(const DVec3& o) { x -= o.x; y -= o.y; z -= o.z; return *this; }
    DVec3& operator*=(double s) { x *= s; y *= s; z *= s; return *this; }
    double len() const { return std::sqrt(x * x + y * y + z * z); }
    double len2() const { return x * x + y * y + z * z; }
    DVec3 norm() const { double l = len(); return l > 0 ? *this / l : DVec3(0, 0, 0); }
    Vector3 f() const { return {(float)x, (float)y, (float)z}; }
};
inline double dot(const DVec3& a, const DVec3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline DVec3 cross(const DVec3& a, const DVec3& b) {
    return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
inline DVec3 rotateByQuat(const DVec3& v, Quaternion q) {
    // v' = q v q*, evaluated in double
    DVec3 u(q.x, q.y, q.z);
    double s = q.w;
    return u * (2.0 * dot(u, v)) + v * (s * s - dot(u, u)) + cross(u, v) * (2.0 * s);
}

// Direction from galactic longitude/latitude (degrees) in world axes.
inline DVec3 galDir(double lDeg, double bDeg) {
    double l = lDeg * PI_D / 180.0, b = bDeg * PI_D / 180.0;
    return {std::cos(b) * std::cos(l), std::sin(b), -std::cos(b) * std::sin(l)};
}

// ---------------------------------------------------------------------------
// Universe position: a light-year part plus a metre part. The light-year part
// only ever changes by multiples of 2^-10 ly, which keeps it exact at any
// distance, so nearby things never jitter even two billion light years out.
// ---------------------------------------------------------------------------
struct UPos {
    DVec3 ly;  // light years
    DVec3 m;   // metres
    static constexpr double Q = 1.0 / 1024.0;  // quantum in ly

    void addMetres(const DVec3& d) { m += d; renorm(); }
    void renorm() {
        const double qm = Q * LY_M;
        auto fix = [&](double& L, double& M) {
            if (std::fabs(M) > qm) {
                double k = std::round(M / qm);
                L += k * Q;
                M -= k * qm;
            }
        };
        fix(ly.x, m.x); fix(ly.y, m.y); fix(ly.z, m.z);
    }
    DVec3 toLy() const { return ly + m / LY_M; }
    static UPos fromLy(const DVec3& p) { UPos u; u.ly = p; return u; }
};
// Vector from b to a in metres.
inline DVec3 relM(const UPos& a, const UPos& b) { return (a.ly - b.ly) * LY_M + (a.m - b.m); }
// Vector from b to a in light years.
inline DVec3 relLy(const UPos& a, const UPos& b) { return (a.ly - b.ly) + (a.m - b.m) / LY_M; }

// ---------------------------------------------------------------------------
// Deterministic random numbers
// ---------------------------------------------------------------------------
inline uint64_t splitmix64(uint64_t x) {
    x += 0x9E3779B97F4A7C15ull;
    x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9ull;
    x = (x ^ (x >> 27)) * 0x94D049BB133111EBull;
    return x ^ (x >> 31);
}
inline uint64_t hash3(int64_t x, int64_t y, int64_t z, uint64_t seed) {
    uint64_t h = splitmix64(seed ^ 0x51ED270B27A3ull);
    h = splitmix64(h ^ (uint64_t)x);
    h = splitmix64(h ^ (uint64_t)y * 0x9E3779B1ull);
    h = splitmix64(h ^ (uint64_t)z * 0x85EBCA77ull);
    return h;
}
struct Rng {
    uint64_t s;
    explicit Rng(uint64_t seed = 1) : s(splitmix64(seed) | 1) {}
    uint64_t next() { s = splitmix64(s); return s; }
    double uni() { return (next() >> 11) * (1.0 / 9007199254740992.0); }
    double range(double a, double b) { return a + (b - a) * uni(); }
    int irange(int a, int b) { return a + (int)(uni() * (b - a + 1) * 0.999999); }
    double normal() {
        double u1 = std::max(uni(), 1e-12), u2 = uni();
        return std::sqrt(-2.0 * std::log(u1)) * std::cos(2.0 * PI_D * u2);
    }
    DVec3 unitVec() {
        double z = range(-1, 1), a = range(0, 2 * PI_D), r = std::sqrt(1 - z * z);
        return {r * std::cos(a), z, r * std::sin(a)};
    }
    bool chance(double p) { return uni() < p; }
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
inline float clampf(float v, float a, float b) { return v < a ? a : (v > b ? b : v); }
inline double clampd(double v, double a, double b) { return v < a ? a : (v > b ? b : v); }
inline float smooth01(float x) { x = clampf(x, 0, 1); return x * x * (3 - 2 * x); }
inline float lerpf(float a, float b, float t) { return a + (b - a) * t; }
inline Vector3 V3(float x, float y, float z) { return {x, y, z}; }

// Approximate blackbody colour (linear RGB, max component 1) for a temperature in K.
inline Vector3 blackbody(float t) {
    t = clampf(t, 1000.f, 40000.f) / 100.f;
    float r, g, b;
    if (t <= 66) r = 255; else r = 329.698727446f * powf(t - 60, -0.1332047592f);
    if (t <= 66) g = 99.4708025861f * logf(t) - 161.1195681661f;
    else g = 288.1221695283f * powf(t - 60, -0.0755148492f);
    if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231f * logf(t - 10) - 305.0447927307f;
    Vector3 c = {clampf(r, 0, 255) / 255.f, clampf(g, 0, 255) / 255.f, clampf(b, 0, 255) / 255.f};
    // sRGB-ish -> linear
    c = {powf(c.x, 2.2f), powf(c.y, 2.2f), powf(c.z, 2.2f)};
    float m = std::max(c.x, std::max(c.y, c.z));
    return {c.x / m, c.y / m, c.z / m};
}

inline std::string fmt(const char* f, ...) {
    char buf[512];
    va_list ap;
    va_start(ap, f);
    vsnprintf(buf, sizeof buf, f, ap);
    va_end(ap);
    return buf;
}

inline std::string fmtDistance(double m) {
    double a = std::fabs(m);
    if (a < 1e4) return fmt("%.0f m", m);
    if (a < 1e9) return fmt("%.0f km", m / KM);
    if (a < 0.02 * LY_M) return fmt("%.2f AU", m / AU_M);
    double ly = m / LY_M;
    if (ly < 1e3) return fmt("%.2f ly", ly);
    if (ly < 1e6) return fmt("%.1f kly", ly / 1e3);
    return fmt("%.2f Mly", ly / 1e6);
}

inline std::string fmtSpeed(double ms) {
    if (ms < 1e4) return fmt("%.0f m/s", ms);
    if (ms < 0.01 * C_MS) return fmt("%.0f km/s", ms / KM);
    double c = ms / C_MS;
    if (c < 1000) return fmt("%.2f c", c);
    double lys = ms / LY_M;
    if (lys < 1.0) return fmt("%.2e c", c);
    if (lys < 1e3) return fmt("%.2e c  (%.1f ly/s)", c, lys);
    return fmt("%.2e c  (%.0f kly/s)", c, lys / 1e3);
}
