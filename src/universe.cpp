// universe.cpp - Solar System, named stars, galaxies and procedural stars
#include "universe.h"
#include <ctime>

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
static Vector3 lin(float r, float g, float b) { return {r, g, b}; }

static Quaternion quatFromNormal(const DVec3& n, double spin) {
    Quaternion a = QuaternionFromVector3ToVector3({0, 1, 0}, n.norm().f());
    Quaternion s = QuaternionFromAxisAngle({0, 1, 0}, (float)spin);
    return QuaternionNormalize(QuaternionMultiply(a, s));
}

// disc normal for a galaxy seen from the Sun with a given inclination (0 = face on)
static Quaternion orientFromInclination(const DVec3& posLy, double inclDeg, double pa, double spin) {
    DVec3 los = posLy.norm();  // from Sun to galaxy
    DVec3 ref = std::fabs(los.y) < 0.9 ? DVec3(0, 1, 0) : DVec3(1, 0, 0);
    DVec3 p1 = cross(los, ref).norm();
    DVec3 p2 = cross(los, p1).norm();
    DVec3 perp = p1 * std::cos(pa) + p2 * std::sin(pa);
    double i = inclDeg * PI_D / 180.0;
    DVec3 n = (-los) * std::cos(i) + perp * std::sin(i);
    return quatFromNormal(n, spin);
}

static int poisson(Rng& r, double lambda) {
    if (lambda > 30) return std::max(0, (int)std::lround(lambda + std::sqrt(lambda) * r.normal()));
    double L = std::exp(-lambda), p = 1;
    int k = 0;
    do { k++; p *= r.uni(); } while (p > L && k < 200);
    return k - 1;
}

static const char* ROMAN[] = {"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"};

// ---------------------------------------------------------------------------
// Star systems
// ---------------------------------------------------------------------------
void StarSystem::update(double t) {
    for (size_t i = 0; i < bodies.size(); i++) {
        Body& b = bodies[i];
        if (i > 0) {
            double a = b.phase0 + 2 * PI_D * t / b.period;
            double ci = std::cos(b.incl), si = std::sin(b.incl);
            DVec3 local = ex * (std::cos(a) * b.orbitR) + (ey * ci + en * si) * (std::sin(a) * b.orbitR);
            b.rel = (b.parent >= 0 ? bodies[b.parent].rel : DVec3()) + local;
        } else {
            b.rel = DVec3();
        }
        double s = std::fmod(2 * PI_D * t / b.spinPeriod, 2 * PI_D);
        Matrix B = MatrixIdentity();
        B.m0 = (float)ex.x; B.m1 = (float)ex.y; B.m2 = (float)ex.z;
        B.m4 = (float)en.x; B.m5 = (float)en.y; B.m6 = (float)en.z;
        B.m8 = (float)-ey.x; B.m9 = (float)-ey.y; B.m10 = (float)-ey.z;
        b.rot = MatrixMultiply(MatrixMultiply(MatrixRotateY((float)s), MatrixRotateX(b.tilt)), B);
    }
}

static Body makePlanet(const char* name, BodyType type, double radiusKm, double aAU, double periodDays,
                       double L0deg, double spinHours, float tiltDeg, Vector3 c1, Vector3 c2, Vector3 c3,
                       Vector3 atmo, float atmoS, float albedo, float seed) {
    Body b;
    b.name = name;
    b.type = type;
    b.radius = radiusKm * KM;
    b.orbitR = aAU * AU_M;
    b.period = periodDays * DAY_S;
    b.phase0 = L0deg * PI_D / 180.0;
    b.spinPeriod = spinHours * 3600.0;
    b.tilt = tiltDeg * DEG2RAD;
    b.c1 = c1; b.c2 = c2; b.c3 = c3; b.atmo = atmo; b.atmoStrength = atmoS;
    b.albedo = albedo;
    b.seed = seed;
    return b;
}

void BuildSolarSystem(StarSystem& s) {
    s.name = "Solar System";
    s.id = 0;
    s.isSol = true;
    s.posLy = DVec3();
    s.ex = galDir(96.34, -60.19).norm();   // vernal equinox
    s.en = galDir(96.38, 29.81).norm();    // north ecliptic pole
    s.en = (s.en - s.ex * dot(s.en, s.ex)).norm();
    s.ey = cross(s.en, s.ex).norm();

    Body sun;
    sun.name = "Sun";
    sun.type = BT_STAR;
    sun.radius = 6.957e8;
    sun.temp = 5778; sun.lum = 1;
    sun.spinPeriod = 25.4 * DAY_S;
    sun.tilt = 7.25f * DEG2RAD;
    sun.seed = 0.37f;
    s.bodies.push_back(sun);

    s.bodies.push_back(makePlanet("Mercury", BT_ROCKY, 2439.7, 0.387, 87.97, 252.25, 1407.6, 0.03f,
        lin(0.20f, 0.19f, 0.18f), lin(0.42f, 0.40f, 0.37f), lin(0.62f, 0.60f, 0.57f), lin(0, 0, 0), 0, 0.14f, 0.11f));
    s.bodies.push_back(makePlanet("Venus", BT_VENUS, 6051.8, 0.723, 224.70, 181.98, -5832.5, 177.4f,
        lin(0.80f, 0.64f, 0.38f), lin(0.95f, 0.87f, 0.66f), lin(0.65f, 0.48f, 0.28f), lin(1.0f, 0.85f, 0.6f), 0.7f, 0.75f, 0.23f));
    s.bodies.push_back(makePlanet("Earth", BT_EARTH, 6371.0, 1.0, 365.256, 100.46, 23.934, 23.44f,
        lin(0.02f, 0.07f, 0.24f), lin(0.07f, 0.16f, 0.045f), lin(0.42f, 0.33f, 0.2f), lin(0.28f, 0.52f, 1.0f), 1.0f, 0.3f, 0.52f));
    int earth = (int)s.bodies.size() - 1;
    Body moon = makePlanet("Moon", BT_ROCKY, 1737.4, 0.00257, 27.3217, 218.32, 655.7, 6.68f,
        lin(0.26f, 0.26f, 0.25f), lin(0.5f, 0.5f, 0.48f), lin(0.66f, 0.66f, 0.64f), lin(0, 0, 0), 0, 0.12f, 0.77f);
    moon.parent = earth;
    moon.incl = 5.14 * PI_D / 180.0;
    s.bodies.push_back(moon);
    s.bodies.push_back(makePlanet("Mars", BT_ROCKY, 3389.5, 1.524, 686.98, 355.43, 24.62, 25.19f,
        lin(0.40f, 0.14f, 0.06f), lin(0.68f, 0.32f, 0.14f), lin(0.85f, 0.62f, 0.46f), lin(0.9f, 0.6f, 0.4f), 0.25f, 0.25f, 0.63f));
    Body jup = makePlanet("Jupiter", BT_GAS, 69911, 5.203, 4332.59, 34.40, 9.925, 3.13f,
        lin(0.85f, 0.74f, 0.58f), lin(0.58f, 0.38f, 0.24f), lin(0.95f, 0.92f, 0.84f), lin(0.9f, 0.8f, 0.65f), 0.35f, 0.52f, 0.71f);
    s.bodies.push_back(jup);
    Body sat = makePlanet("Saturn", BT_GAS, 58232, 9.537, 10759.22, 49.94, 10.66, 26.73f,
        lin(0.88f, 0.78f, 0.56f), lin(0.72f, 0.6f, 0.38f), lin(0.95f, 0.9f, 0.74f), lin(0.9f, 0.85f, 0.6f), 0.3f, 0.47f, 0.13f);
    sat.rings = true; sat.ringInner = 1.24f; sat.ringOuter = 2.27f; sat.ringCol = lin(0.82f, 0.74f, 0.6f);
    s.bodies.push_back(sat);
    Body ura = makePlanet("Uranus", BT_ICE, 25362, 19.19, 30688.5, 313.23, -17.24, 97.77f,
        lin(0.5f, 0.78f, 0.82f), lin(0.62f, 0.87f, 0.9f), lin(0.8f, 0.95f, 0.95f), lin(0.6f, 0.9f, 1.0f), 0.55f, 0.51f, 0.29f);
    ura.rings = true; ura.ringInner = 1.6f; ura.ringOuter = 2.0f; ura.ringCol = lin(0.25f, 0.27f, 0.3f);
    s.bodies.push_back(ura);
    s.bodies.push_back(makePlanet("Neptune", BT_ICE, 24622, 30.07, 60182, 304.88, 16.11, 28.32f,
        lin(0.12f, 0.26f, 0.78f), lin(0.22f, 0.42f, 0.95f), lin(0.6f, 0.75f, 1.0f), lin(0.4f, 0.6f, 1.0f), 0.6f, 0.41f, 0.91f));
    Body plu = makePlanet("Pluto", BT_ROCKY, 1188.3, 39.48, 90560, 238.93, -153.3, 122.5f,
        lin(0.45f, 0.35f, 0.26f), lin(0.78f, 0.68f, 0.58f), lin(0.92f, 0.9f, 0.86f), lin(0.6f, 0.7f, 0.9f), 0.1f, 0.5f, 0.37f);
    plu.incl = 17.16 * PI_D / 180.0;
    s.bodies.push_back(plu);
}

void GenerateStarSystem(StarSystem& s, uint64_t seed, const std::string& starName, float temp, float lum,
                        float radiusSun, bool blackHole) {
    Rng r(seed);
    s.bodies.clear();
    s.id = seed;
    s.name = starName;
    DVec3 n = r.unitVec();
    s.en = n;
    s.ex = cross(n, std::fabs(n.y) < 0.9 ? DVec3(0, 1, 0) : DVec3(1, 0, 0)).norm();
    s.ey = cross(s.en, s.ex).norm();

    Body star;
    star.name = starName;
    star.seed = (float)r.uni();
    star.spinPeriod = r.range(10, 40) * DAY_S;
    if (blackHole) {
        star.type = BT_BLACKHOLE;
        star.radius = 1.2e10;      // Schwarzschild radius of Sgr A*
        star.accretion = true;
        star.ringInner = 2.6f;
        star.ringOuter = 24.f;
        star.temp = 20000; star.lum = 0;
        s.bodies.push_back(star);
        // the S-stars racing around the black hole
        const char* sn[] = {"S2", "S29", "S62", "S4714"};
        for (int i = 0; i < 4; i++) {
            Body b;
            b.name = sn[i];
            b.type = BT_STAR;
            b.temp = (float)r.range(18000, 26000);
            b.lum = (float)r.range(5000, 20000);
            b.radius = r.range(6, 9) * 6.957e8;
            b.orbitR = r.range(300, 1500) * AU_M;
            b.period = r.range(4, 20) * 365.25 * DAY_S / 50.0;   // sped up so motion is visible
            b.phase0 = r.range(0, 2 * PI_D);
            b.incl = r.range(-1.2, 1.2);
            b.seed = (float)r.uni();
            s.bodies.push_back(b);
        }
        return;
    }
    star.type = BT_STAR;
    star.temp = temp;
    star.lum = lum;
    star.radius = radiusSun * 6.957e8;
    s.bodies.push_back(star);

    if (r.uni() < 0.12) return;  // no planets
    int np = r.irange(2, 9);
    double sl = std::sqrt(std::max(lum, 1e-4f));
    double a = r.range(0.04, 0.35) * sl + star.radius * 6 / AU_M;
    double snow = 2.7 * sl;
    double hz = 1.0 * sl;
    for (int i = 0; i < np; i++) {
        Body b;
        b.name = starName + " " + (char)('b' + i);
        b.seed = (float)r.uni();
        b.orbitR = a * AU_M;
        double massSun = std::pow(std::max(lum, 1e-4f), 0.25);
        b.period = 2 * PI_D * std::sqrt(std::pow(b.orbitR, 3) / (1.327e20 * massSun));
        b.phase0 = r.range(0, 2 * PI_D);
        b.incl = r.range(-0.05, 0.05);
        b.spinPeriod = r.range(8, 60) * 3600.0 * (r.uni() < 0.2 ? -1 : 1);
        b.tilt = (float)r.range(0, 0.5);
        b.albedo = (float)r.range(0.1, 0.6);
        double rel = a / hz;
        double u = r.uni();
        if (a > snow * 3.5 && u < 0.6) b.type = BT_ICE;
        else if (a > snow && u < 0.75) b.type = BT_GAS;
        else if (rel < 0.45) b.type = u < 0.5 ? BT_LAVA : BT_ROCKY;
        else if (rel < 0.85) b.type = u < 0.5 ? BT_VENUS : BT_ROCKY;
        else if (rel < 1.6) b.type = u < 0.55 ? BT_EARTH : (u < 0.8 ? BT_ROCKY : BT_VENUS);
        else b.type = u < 0.3 ? BT_ICE : BT_ROCKY;

        auto rc = [&](float lo, float hi) { return (float)r.range(lo, hi); };
        switch (b.type) {
            case BT_GAS:
                b.radius = r.range(40000, 90000) * KM;
                b.c1 = lin(rc(0.6f, 0.95f), rc(0.45f, 0.8f), rc(0.3f, 0.6f));
                b.c2 = lin(rc(0.3f, 0.7f), rc(0.2f, 0.5f), rc(0.1f, 0.4f));
                if (r.uni() < 0.3) b.c2 = lin(rc(0.2f, 0.4f), rc(0.3f, 0.5f), rc(0.5f, 0.8f));
                b.c3 = lin(rc(0.85f, 1.f), rc(0.8f, 0.95f), rc(0.7f, 0.9f));
                b.atmo = lin(0.9f, 0.8f, 0.7f); b.atmoStrength = 0.3f;
                b.spinPeriod = r.range(9, 16) * 3600.0;
                if (r.uni() < 0.4) {
                    b.rings = true; b.ringInner = (float)r.range(1.2, 1.5); b.ringOuter = (float)r.range(1.9, 2.8);
                    b.ringCol = lin(rc(0.5f, 0.9f), rc(0.45f, 0.8f), rc(0.35f, 0.7f));
                }
                break;
            case BT_ICE:
                b.radius = r.range(20000, 30000) * KM;
                b.c1 = lin(rc(0.1f, 0.4f), rc(0.3f, 0.7f), rc(0.7f, 0.95f));
                b.c2 = lin(rc(0.3f, 0.6f), rc(0.6f, 0.85f), rc(0.85f, 1.f));
                b.c3 = lin(0.8f, 0.92f, 1.f);
                b.atmo = lin(0.5f, 0.75f, 1.f); b.atmoStrength = 0.55f;
                if (r.uni() < 0.25) {
                    b.rings = true; b.ringInner = 1.5f; b.ringOuter = (float)r.range(1.8, 2.3);
                    b.ringCol = lin(0.35f, 0.38f, 0.42f);
                }
                break;
            case BT_EARTH:
                b.radius = r.range(4500, 9000) * KM;
                b.c1 = lin(rc(0.01f, 0.05f), rc(0.05f, 0.12f), rc(0.18f, 0.32f));
                b.c2 = lin(rc(0.04f, 0.2f), rc(0.1f, 0.25f), rc(0.02f, 0.08f));
                if (r.uni() < 0.3) b.c2 = lin(rc(0.25f, 0.4f), rc(0.08f, 0.15f), rc(0.1f, 0.2f));  // alien flora
                b.c3 = lin(rc(0.35f, 0.55f), rc(0.28f, 0.42f), rc(0.18f, 0.28f));
                b.atmo = lin(rc(0.25f, 0.45f), rc(0.45f, 0.65f), 1.f); b.atmoStrength = 1.0f;
                break;
            case BT_VENUS:
                b.radius = r.range(4000, 8000) * KM;
                b.c1 = lin(rc(0.6f, 0.9f), rc(0.5f, 0.75f), rc(0.3f, 0.5f));
                b.c2 = lin(rc(0.85f, 1.f), rc(0.8f, 0.95f), rc(0.6f, 0.8f));
                b.c3 = lin(rc(0.5f, 0.7f), rc(0.4f, 0.55f), rc(0.2f, 0.35f));
                b.atmo = lin(1.f, 0.85f, 0.6f); b.atmoStrength = 0.7f;
                break;
            case BT_LAVA:
                b.radius = r.range(2500, 7000) * KM;
                b.c1 = lin(0.06f, 0.05f, 0.05f); b.c2 = lin(0.18f, 0.12f, 0.1f);
                b.c3 = lin(1.f, rc(0.25f, 0.45f), 0.05f);
                b.atmo = lin(1.f, 0.4f, 0.2f); b.atmoStrength = 0.3f;
                break;
            default:
                b.type = BT_ROCKY;
                b.radius = r.range(1500, 7000) * KM;
                b.c1 = lin(rc(0.15f, 0.35f), rc(0.12f, 0.3f), rc(0.1f, 0.25f));
                b.c2 = lin(rc(0.35f, 0.7f), rc(0.3f, 0.6f), rc(0.25f, 0.5f));
                b.c3 = lin(rc(0.6f, 0.85f), rc(0.55f, 0.8f), rc(0.5f, 0.75f));
                if (r.uni() < 0.4) { b.atmo = lin(0.8f, 0.6f, 0.45f); b.atmoStrength = (float)r.range(0.05, 0.3); }
                break;
        }
        s.bodies.push_back(b);
        int pi = (int)s.bodies.size() - 1;
        // moons around the big ones
        if (b.type == BT_GAS || b.type == BT_ICE || (b.type == BT_EARTH && r.uni() < 0.5)) {
            int nm = b.type == BT_EARTH ? 1 : r.irange(0, 3);
            for (int m = 0; m < nm; m++) {
                Body mo;
                mo.name = b.name + " " + ROMAN[m];
                mo.type = r.uni() < 0.15 ? BT_LAVA : BT_ROCKY;
                mo.parent = pi;
                mo.radius = r.range(800, 2800) * KM;
                mo.orbitR = b.radius * r.range(6, 30) * (m + 1) * 0.7;
                double pm = 1.327e20 * 3e-6 * (b.radius / 6.4e6) * (b.radius / 6.4e6);
                mo.period = 2 * PI_D * std::sqrt(std::pow(mo.orbitR, 3) / pm);
                mo.phase0 = r.range(0, 2 * PI_D);
                mo.incl = r.range(-0.1, 0.1);
                mo.spinPeriod = mo.period;
                mo.seed = (float)r.uni();
                mo.c1 = lin(rc(0.2f, 0.35f), rc(0.2f, 0.3f), rc(0.18f, 0.28f));
                mo.c2 = lin(rc(0.45f, 0.65f), rc(0.42f, 0.6f), rc(0.38f, 0.55f));
                mo.c3 = lin(0.7f, 0.68f, 0.65f);
                if (mo.type == BT_LAVA) { mo.c1 = lin(0.1f, 0.08f, 0.02f); mo.c2 = lin(0.5f, 0.45f, 0.1f); mo.c3 = lin(1.f, 0.5f, 0.1f); }
                mo.albedo = 0.3f;
                s.bodies.push_back(mo);
            }
        }
        a *= r.range(1.5, 2.1);
    }
}

// ---------------------------------------------------------------------------
// Galaxies
// ---------------------------------------------------------------------------
double Galaxy::starDensity(const DVec3& p) const {
    DVec3 d = rotateByQuat(p - pos, QuaternionInvert(orient)) / radius;
    const double K = 0.026;
    if (type == GAL_ELLIPTICAL) {
        double rr = d.len();
        if (rr > 1.5) return 0;
        return K * 4.0 * std::exp(-rr / 0.13);
    }
    double r = std::sqrt(d.x * d.x + d.z * d.z), h = std::fabs(d.y);
    if (r > 1.6 || h > 0.5) return 0;
    double thick = type == GAL_IRREGULAR ? 0.06 : 0.012;
    double disc = std::exp(-r / 0.28) * std::exp(-h / thick);
    double bulge = 3.0 * std::exp(-(r * r + (h / 0.6) * (h / 0.6)) / (0.1 * 0.1));
    return K * (disc + bulge);
}

static void addCloud(QuadBatch& q, Vector3 p, float size, Vector3 c, float bright) {
    int i = q.addCentered(p);
    if (i < 0) return;
    q.setNormal(i, {size, 0, 0});
    q.setColor(i, {(unsigned char)(clampf(c.x, 0, 1) * 255), (unsigned char)(clampf(c.y, 0, 1) * 255),
                   (unsigned char)(clampf(c.z, 0, 1) * 255), (unsigned char)(clampf(bright, 0, 1) * 255)});
}

static Vector3 mix3(Vector3 a, Vector3 b, float t) { return Vector3Lerp(a, b, t); }

void GenGalaxyParticles(const Galaxy& g, QuadBatch& S, QuadBatch& D, int nS, int nD, bool mw) {
    Rng r(g.seed * 7919ull + 17);
    S.init(nS, QuadBatch::NORMAL | QuadBatch::COLOR, false);
    D.init(std::max(nD, 1), QuadBatch::NORMAL | QuadBatch::COLOR, false);
    const Vector3 young = {0.62f, 0.76f, 1.0f}, old = {1.0f, 0.83f, 0.62f}, core = {1.0f, 0.74f, 0.46f};
    const Vector3 hii = {1.0f, 0.38f, 0.55f}, dustC = {0.42f, 0.28f, 0.17f};
    float armOff = (float)r.range(0, 2 * PI);
    float barAng = mw ? 0.5f : (float)r.range(0, PI);
    auto T = [&](Vector3 c) { return Vector3Multiply(c, g.tint); };

    // irregular: clumps
    std::vector<Vector3> clumps;
    if (g.type == GAL_IRREGULAR)
        for (int i = 0; i < 9; i++) clumps.push_back({(float)r.range(-0.5, 0.5), (float)r.range(-0.08, 0.08), (float)r.range(-0.5, 0.5)});

    for (int i = 0; i < nS; i++) {
        double u = r.uni();
        Vector3 p;
        float size, bright;
        Vector3 c;
        if (g.type == GAL_ELLIPTICAL) {
            float s = (float)(0.16 * std::exp(r.normal() * 0.45));
            p = {(float)r.normal() * s, (float)r.normal() * s * 0.72f, (float)r.normal() * s * 0.86f};
            float rr = Vector3Length(p);
            if (rr > 1.1f) { i--; continue; }
            c = mix3(core, old, clampf(rr * 2, 0, 1));
            size = (float)r.range(0.03, 0.09);
            bright = (float)(0.25 + 0.5 * std::exp(-rr * 3));
            addCloud(S, p, size, T(c), bright);
            continue;
        }
        if (g.type == GAL_IRREGULAR) {
            Vector3 cc = clumps[r.irange(0, (int)clumps.size() - 1)];
            float s = (float)r.range(0.08, 0.25);
            p = {cc.x + (float)r.normal() * s, cc.y + (float)r.normal() * s * 0.3f, cc.z + (float)r.normal() * s};
            if (Vector3Length(p) > 1.1f) { i--; continue; }
            bool h = r.uni() < 0.06;
            c = h ? hii : mix3(young, old, (float)r.uni() * 0.5f);
            size = h ? (float)r.range(0.01, 0.02) : (float)r.range(0.02, 0.06);
            bright = h ? 1.f : (float)r.range(0.2, 0.55);
            addCloud(S, p, size, T(c), bright);
            continue;
        }
        double bulgeFrac = g.type == GAL_LENTICULAR ? 0.4 : (g.type == GAL_BARRED ? 0.24 : 0.17);
        if (u < bulgeFrac) {
            if (g.type == GAL_BARRED && r.uni() < 0.5) {
                float x = (float)r.range(-0.3, 0.3);
                p = {x, (float)r.normal() * 0.025f, (float)r.normal() * 0.045f};
                float ca = cosf(barAng), sa = sinf(barAng);
                p = {p.x * ca - p.z * sa, p.y, p.x * sa + p.z * ca};
            } else {
                float s = 0.085f;
                p = {(float)r.normal() * s, (float)r.normal() * s * 0.62f, (float)r.normal() * s};
            }
            c = mix3(core, old, (float)r.uni() * 0.5f);
            size = (float)r.range(0.025, 0.06);
            bright = (float)r.range(0.22, 0.45);
            addCloud(S, p, size, T(c), bright);
            continue;
        }
        double rad = -0.3 * std::log(1 - r.uni() * 0.97);
        if (rad > 1.05) { i--; continue; }
        rad = std::max(rad, 0.03);
        double armStart = g.type == GAL_BARRED ? 0.2 : 0.1;
        bool inArm = g.type != GAL_LENTICULAR && rad > armStart * 0.8 && r.uni() < 0.7;
        int k = r.irange(0, g.arms - 1);
        double th0 = armOff + k * 2 * PI_D / g.arms + g.twist * std::log(std::max(rad, armStart) / armStart);
        double th = inArm ? th0 + r.normal() * 0.16 * (0.45 + rad) : r.range(0, 2 * PI_D);
        if (mw && inArm && (k % 2 == 1) && r.uni() < 0.45) th = r.range(0, 2 * PI_D);  // minor arms weaker
        float y = (float)(r.normal() * 0.012 * (1 + rad));
        p = {(float)(rad * std::cos(th)), y, (float)(-rad * std::sin(th))};
        double kind = r.uni();
        float yt = clampf((float)(rad * 1.8 - 0.2), 0, 1);
        if (inArm && rad > 0.12 && kind < 0.06) {            // glowing nebulae (HII regions)
            c = hii;
            size = (float)r.range(0.004, 0.009);
            bright = (float)r.range(0.6, 1.0);
        } else if (kind < 0.30) {                            // smooth diffuse light
            c = mix3(old, young, yt * (inArm ? 0.7f : 0.3f));
            size = (float)r.range(0.03, 0.06);
            bright = (float)r.range(0.06, 0.12);
        } else {                                             // star clouds / clusters
            c = inArm ? mix3(old, young, yt) : mix3(old, young, yt * 0.35f);
            size = (float)r.range(0.005, 0.016);
            bright = inArm ? (float)r.range(0.3, 0.7) : (float)r.range(0.15, 0.35);
        }
        addCloud(S, p, size, T(c), bright);
    }
    // dust lanes
    for (int i = 0; i < nD; i++) {
        if (g.type == GAL_ELLIPTICAL) break;
        Vector3 p;
        if (g.type == GAL_IRREGULAR) {
            Vector3 cc = clumps[r.irange(0, (int)clumps.size() - 1)];
            p = {cc.x + (float)r.normal() * 0.15f, cc.y + (float)r.normal() * 0.02f, cc.z + (float)r.normal() * 0.15f};
        } else {
            double rad = r.range(0.08, 0.95);
            int k = r.irange(0, g.arms - 1);
            double th;
            if (g.type == GAL_LENTICULAR) th = r.range(0, 2 * PI_D), rad = 0.3 + r.normal() * 0.05;
            else {
                double armStart = g.type == GAL_BARRED ? 0.2 : 0.1;
                rad = std::max(rad, armStart);
                th = armOff + k * 2 * PI_D / g.arms + g.twist * std::log(rad / armStart) - 0.12 + r.normal() * 0.11;
            }
            p = {(float)(rad * std::cos(th)), (float)(r.normal() * 0.006), (float)(-rad * std::sin(th))};
        }
        if (g.type == GAL_IRREGULAR && r.uni() < 0.6) continue;
        addCloud(D, p, (float)r.range(0.02, 0.05), dustC, (float)r.range(0.1, 0.3));
    }
    S.upload();
    D.upload();
}

// ---------------------------------------------------------------------------
// Universe
// ---------------------------------------------------------------------------
struct NamedDef { const char* name; double l, b, d; float temp, lum, rad; };
static const NamedDef NAMED[] = {
    {"Proxima Centauri", 313.94, -1.93, 4.244, 3042, 0.0017f, 0.154f},
    {"Alpha Centauri", 315.73, -0.68, 4.37, 5790, 1.52f, 1.22f},
    {"Barnard's Star", 31.01, 14.06, 5.96, 3134, 0.0035f, 0.196f},
    {"Sirius", 227.23, -8.89, 8.6, 9940, 25.4f, 1.71f},
    {"Epsilon Eridani", 195.84, -48.05, 10.5, 5084, 0.34f, 0.735f},
    {"Tau Ceti", 173.10, -73.44, 11.9, 5344, 0.52f, 0.79f},
    {"Altair", 47.74, -8.91, 16.7, 7700, 10.6f, 1.8f},
    {"Vega", 67.45, 19.24, 25.0, 9602, 40.f, 2.36f},
    {"Fomalhaut", 20.49, -64.91, 25.1, 8590, 16.6f, 1.84f},
    {"Pollux", 192.23, 23.40, 33.8, 4666, 43.f, 9.1f},
    {"Arcturus", 15.10, 69.11, 36.7, 4286, 170.f, 25.4f},
    {"TRAPPIST-1", 69.71, -56.64, 40.7, 2566, 0.00055f, 0.119f},
    {"Capella", 162.59, 4.57, 42.9, 4970, 79.f, 11.9f},
    {"Aldebaran", 180.97, -20.25, 65.3, 3910, 439.f, 44.f},
    {"Canopus", 261.21, -25.29, 310, 7400, 10700.f, 71.f},
    {"Polaris", 123.28, 26.46, 433, 6015, 1260.f, 37.5f},
    {"Betelgeuse", 199.79, -8.96, 548, 3600, 126000.f, 764.f},
    {"Antares", 351.95, 15.06, 550, 3660, 75900.f, 680.f},
    {"Rigel", 209.24, -25.25, 860, 12100, 120000.f, 78.9f},
    {"Deneb", 84.28, 1.99, 2600, 8525, 196000.f, 203.f},
    {"Eta Carinae", 287.60, -0.63, 7500, 36000, 4.6e6f, 240.f},
};

struct GalDef { const char* name; double l, b, d; float R; GalType type; double incl; int arms; float twist; Vector3 tint; };
static const GalDef GALS[] = {
    {"Large Magellanic Cloud", 280.47, -32.89, 163000, 7000, GAL_IRREGULAR, 35, 1, 2, {0.9f, 0.95f, 1.1f}},
    {"Small Magellanic Cloud", 302.8, -44.3, 200000, 3500, GAL_IRREGULAR, 60, 1, 2, {0.9f, 0.95f, 1.1f}},
    {"Andromeda Galaxy (M31)", 121.17, -21.57, 2.54e6, 110000, GAL_SPIRAL, 77, 2, 4.2f, {1.05f, 1.0f, 0.95f}},
    {"Triangulum Galaxy (M33)", 133.61, -31.33, 2.73e6, 30000, GAL_SPIRAL, 55, 2, 3.0f, {0.95f, 1.0f, 1.1f}},
    {"Bode's Galaxy (M81)", 142.09, 40.90, 11.8e6, 45000, GAL_SPIRAL, 59, 2, 3.8f, {1.05f, 1.0f, 0.95f}},
    {"Cigar Galaxy (M82)", 141.41, 40.57, 11.5e6, 20000, GAL_IRREGULAR, 82, 1, 2, {1.1f, 0.9f, 0.9f}},
    {"Centaurus A", 309.52, 19.42, 12.0e6, 50000, GAL_ELLIPTICAL, 0, 1, 1, {1.05f, 0.95f, 0.85f}},
    {"Pinwheel Galaxy (M101)", 102.04, 59.77, 20.9e6, 85000, GAL_SPIRAL, 18, 4, 3.4f, {0.95f, 1.0f, 1.1f}},
    {"Whirlpool Galaxy (M51)", 104.85, 68.56, 23.0e6, 38000, GAL_SPIRAL, 22, 2, 4.8f, {1.0f, 1.0f, 1.05f}},
    {"Sombrero Galaxy (M104)", 298.46, 51.15, 31.1e6, 25000, GAL_LENTICULAR, 84, 2, 3, {1.1f, 0.98f, 0.85f}},
    {"NGC 1300", 212.0, -51.4, 61.0e6, 55000, GAL_BARRED, 35, 2, 3.2f, {1.0f, 1.0f, 1.05f}},
    {"M87 (Virgo A)", 283.78, 74.49, 53.5e6, 60000, GAL_ELLIPTICAL, 0, 1, 1, {1.1f, 0.95f, 0.8f}},
};

static int atlasSlotFor(GalType t, uint32_t seed) {
    switch (t) {
        case GAL_ELLIPTICAL: return 4;
        case GAL_LENTICULAR: return 5;
        case GAL_IRREGULAR: return 6;
        case GAL_BARRED: return 3;
        default: return (int)(seed % 3);  // three spiral variants
    }
}

void Universe::init() {
    // current real date -> seconds since J2000
    simTime = (double)std::time(nullptr) - 946728000.0;
    BuildSolarSystem(sol);
    sol.update(simTime);

    for (auto& d : NAMED) {
        NamedStar s;
        s.name = d.name;
        s.pos = galDir(d.l, d.b) * d.d;
        s.temp = d.temp; s.lum = d.lum; s.radiusSun = d.rad;
        s.seed = splitmix64(std::hash<std::string>{}(d.name));
        named.push_back(s);
    }
    {
        NamedStar bh;
        bh.name = "Sagittarius A*";
        bh.pos = DVec3(26000, 0, 0);
        bh.temp = 20000; bh.lum = 1e5f; bh.radiusSun = 17.f;
        bh.blackHole = true;
        bh.seed = 0x5A6A;
        named.push_back(bh);
    }

    // Milky Way
    Galaxy mw;
    mw.name = "Milky Way";
    mw.pos = DVec3(26000, 0, 0);
    mw.radius = 52000;
    mw.type = GAL_BARRED;
    mw.orient = QuaternionFromAxisAngle({0, 1, 0}, 2.6f);
    mw.seed = 42;
    mw.arms = 4;
    mw.twist = 2.6f;
    mw.atlasSlot = 7;
    galaxies.push_back(mw);
    milkyWay = 0;

    Rng r(12345);
    for (auto& d : GALS) {
        Galaxy g;
        g.name = d.name;
        g.pos = galDir(d.l, d.b) * d.d;
        g.radius = d.R;
        g.type = d.type;
        g.orient = orientFromInclination(g.pos, d.incl, r.range(0, 6.28), r.range(0, 6.28));
        g.seed = (uint32_t)r.next();
        g.arms = d.arms; g.twist = d.twist * 0.65f; g.tint = d.tint;
        g.atlasSlot = atlasSlotFor(g.type, g.seed);
        galaxies.push_back(g);
    }
    // procedural galaxies: clusters + field
    auto randGal = [&](DVec3 pos, bool cluster) {
        Galaxy g;
        g.pos = pos;
        double u = r.uni();
        if (cluster) g.type = u < 0.45 ? GAL_ELLIPTICAL : (u < 0.65 ? GAL_LENTICULAR : (u < 0.9 ? GAL_SPIRAL : GAL_BARRED));
        else g.type = u < 0.55 ? GAL_SPIRAL : (u < 0.75 ? GAL_BARRED : (u < 0.85 ? GAL_ELLIPTICAL : (u < 0.93 ? GAL_IRREGULAR : GAL_LENTICULAR)));
        g.radius = (float)(r.range(12000, 70000) * (g.type == GAL_IRREGULAR ? 0.4 : 1.0));
        g.orient = quatFromNormal(r.unitVec(), r.range(0, 6.28));
        g.seed = (uint32_t)r.next();
        g.arms = r.uni() < 0.7 ? 2 : r.irange(3, 4);
        g.twist = (float)r.range(1.8, 3.4);
        float w = (float)r.range(-0.08, 0.08);
        g.tint = {1.0f + w, 1.0f, 1.0f - w};
        g.atlasSlot = atlasSlotFor(g.type, g.seed);
        g.name = fmt("PGC %u", (unsigned)(g.seed % 900000 + 10000));
        galaxies.push_back(g);
    };
    DVec3 virgo = galDir(283.78, 74.49) * 54e6;
    for (int i = 0; i < 160; i++) randGal(virgo + DVec3(r.normal(), r.normal(), r.normal()) * 3.5e6, true);
    for (int c = 0; c < 45; c++) {
        DVec3 cen = r.unitVec() * r.range(25e6, 300e6);
        int n = r.irange(15, 70);
        double spread = r.range(2e6, 6e6);
        for (int i = 0; i < n; i++) randGal(cen + DVec3(r.normal(), r.normal(), r.normal()) * spread, true);
    }
    for (int i = 0; i < 900; i++) {
        DVec3 p = r.unitVec() * (std::cbrt(r.uni()) * 300e6);
        if (p.len() < 4e6) continue;
        randGal(p, false);
    }

    tiers[0].luminousOnly = false;
    tiers[0].lumFrac = 1.0;
    tiers[0].radiusMin = 6; tiers[0].radiusMax = 60;
    tiers[0].maxStars = 24000;
    tiers[0].salt = 101;
    tiers[1].luminousOnly = true;
    tiers[1].lumFrac = 0.0006;
    tiers[1].radiusMin = 150; tiers[1].radiusMax = 1400;
    tiers[1].maxStars = 30000;
    tiers[1].salt = 202;
    for (auto& t : tiers) t.qb.init(t.maxStars, QuadBatch::NORMAL | QuadBatch::COLOR, true);

    rebuildNav();
}

double Universe::starDensity(const DVec3& p) const {
    double d = 0;
    for (int gi : nearGalaxies) d += galaxies[gi].starDensity(p);
    return d;
}

int Universe::galaxyAt(const DVec3& p) const {
    int best = -1;
    double bestR = 1e30;
    for (size_t i = 0; i < galaxies.size(); i++) {
        const Galaxy& g = galaxies[i];
        DVec3 d = p - g.pos;
        if (std::fabs(d.x) > g.radius * 1.3 || std::fabs(d.y) > g.radius * 1.3 || std::fabs(d.z) > g.radius * 1.3) continue;
        DVec3 l = rotateByQuat(d, QuaternionInvert(g.orient)) / g.radius;
        bool in;
        if (g.type == GAL_ELLIPTICAL) in = l.len() < 0.8;
        else in = std::sqrt(l.x * l.x + l.z * l.z) < 1.08 && std::fabs(l.y) < 0.2;
        if (in && d.len() < bestR) { bestR = d.len(); best = (int)i; }
    }
    return best;
}

std::string Universe::regionName(const UPos& cam) const {
    DVec3 camLy = cam.toLy();
    if (local) {
        double d = relM(cam, UPos::fromLy(local->posLy)).len();
        if (d < 0.05 * LY_M) return local->name + (local->bodies[0].type == BT_BLACKHOLE ? " - Galactic Nucleus" : " System");
    }
    double ds = camLy.len();
    if (ds < 0.0025) return "Solar System";
    if (ds < 0.03) return "Solar System - Kuiper Belt / Heliopause";
    if (ds < 1.6) return "Solar System - Oort Cloud";
    int g = galaxyAt(camLy);
    if (g == milkyWay) {
        const Galaxy& mw = galaxies[milkyWay];
        DVec3 d = camLy - mw.pos;
        if (d.len() < 4000) return "Milky Way - Galactic Core";
        if (ds < 3000) return "Milky Way - Orion Arm";
        return "Milky Way - Galactic Disk";
    }
    if (g >= 0) return galaxies[g].name;
    DVec3 mwd = camLy - galaxies[milkyWay].pos;
    if (mwd.len() < 300000) return "Milky Way - Galactic Halo";
    if (mwd.len() < 5e6) return "Local Group - Intergalactic Space";
    if ((camLy - galDir(283.78, 74.49) * 54e6).len() < 9e6) return "Virgo Cluster";
    return "Intergalactic Void";
}

void Universe::updateTier(StarTier& t, const DVec3& cam, int ti) {
    double dens = starDensity(cam) * t.lumFrac;
    double target = t.maxStars * 0.55;
    double R = dens > 1e-12 ? std::cbrt(target / (4.18879 * dens)) : t.radiusMax;
    R = clampd(R, t.radiusMin, t.radiusMax);
    double cell = std::pow(2.0, std::round(std::log2(R / 7.0)));
    int64_t cx = (int64_t)std::floor(cam.x / cell), cy = (int64_t)std::floor(cam.y / cell), cz = (int64_t)std::floor(cam.z / cell);
    bool rebuild = cell != t.cellSize || cx != t.ax || cy != t.ay || cz != t.az || std::fabs(R - t.builtRadius) > 0.25 * R;
    if (!rebuild) return;
    t.cellSize = cell;
    t.radius = R;
    t.builtRadius = R;
    t.ax = cx; t.ay = cy; t.az = cz;
    t.anchor = DVec3((cx + 0.5) * cell, (cy + 0.5) * cell, (cz + 0.5) * cell);
    t.stars.clear();
    t.qb.clear();
    int n = (int)std::ceil(R / cell);
    double reach = R + cell * 0.87;
    for (int ix = -n; ix <= n; ix++)
        for (int iy = -n; iy <= n; iy++)
            for (int iz = -n; iz <= n; iz++) {
                DVec3 corner((cx + ix) * cell, (cy + iy) * cell, (cz + iz) * cell);
                DVec3 cen = corner + DVec3(cell, cell, cell) * 0.5;
                if ((cen - cam).len() > reach) continue;
                double lam = starDensity(cen) * t.lumFrac * cell * cell * cell;
                if (lam < 1e-5) continue;
                Rng rng(hash3(cx + ix, cy + iy, cz + iz, t.salt ^ (uint64_t)(cell * 1024)));
                int k = poisson(rng, lam);
                for (int j = 0; j < k; j++) {
                    DVec3 pos = corner + DVec3(rng.uni(), rng.uni(), rng.uni()) * cell;
                    float lum, temp;
                    double u = rng.uni();
                    if (!t.luminousOnly) {
                        if (u < 0.76) { temp = (float)rng.range(2800, 3800); lum = (float)std::pow(10.0, rng.range(-3, -1.2)); }
                        else if (u < 0.88) { temp = (float)rng.range(3900, 5200); lum = (float)rng.range(0.1, 0.6); }
                        else if (u < 0.956) { temp = (float)rng.range(5200, 6000); lum = (float)rng.range(0.6, 1.5); }
                        else if (u < 0.986) { temp = (float)rng.range(6000, 7500); lum = (float)rng.range(1.5, 5); }
                        else if (u < 0.992) { temp = (float)rng.range(7500, 10000); lum = (float)rng.range(5, 30); }
                        else if (u < 0.9935) { temp = (float)rng.range(10000, 28000); lum = (float)std::pow(10.0, rng.range(1.5, 4)); }
                        else if (u < 0.9985) { temp = (float)rng.range(3300, 4800); lum = (float)std::pow(10.0, rng.range(1.5, 2.8)); }
                        else { temp = (float)rng.range(8000, 20000); lum = (float)std::pow(10.0, rng.range(-3, -2)); }
                    } else {
                        if (u < 0.45) { temp = (float)rng.range(7500, 10000); lum = (float)rng.range(10, 60); }
                        else if (u < 0.7) { temp = (float)rng.range(10000, 25000); lum = (float)std::pow(10.0, rng.range(2, 4)); }
                        else if (u < 0.93) { temp = (float)rng.range(3300, 4800); lum = (float)std::pow(10.0, rng.range(2, 3)); }
                        else { temp = rng.uni() < 0.5 ? (float)rng.range(3300, 3900) : (float)rng.range(15000, 30000); lum = (float)std::pow(10.0, rng.range(4, 5.3)); }
                    }
                    if ((pos - cam).len() > R) continue;
                    if (pos.len() < 0.5) continue;  // keep the Sun's neighbourhood clean
                    uint64_t id = rng.next();
                    int q = t.qb.addCentered((pos - t.anchor).f());
                    if (q < 0) goto done;
                    Vector3 c = blackbody(temp);
                    t.qb.setNormal(q, {lum, id == localId ? 0.f : 1.f, 0});
                    t.qb.setColor(q, {(unsigned char)(c.x * 255), (unsigned char)(c.y * 255), (unsigned char)(c.z * 255), 255});
                    t.stars.push_back({pos, lum, temp, id, ti, q});
                }
            }
done:
    t.dirty = true;
}

void Universe::activateSystems(const UPos& cam) {
    DVec3 camLy = cam.toLy();
    double best = 0.3;
    int bestNamed = -1;
    const StarRec* bestRec = nullptr;
    for (size_t i = 0; i < named.size(); i++) {
        double d = (named[i].pos - camLy).len();
        if (d < best) { best = d; bestNamed = (int)i; }
    }
    for (auto& t : tiers)
        for (auto& s : t.stars) {
            double d = (s.pos - camLy).len();
            if (d < best) { best = d; bestRec = &s; bestNamed = -1; }
        }
    uint64_t id = 0;
    if (bestRec) id = bestRec->id;
    else if (bestNamed >= 0) id = named[bestNamed].seed;
    if (id == 0) {
        // hysteresis: keep the current system until we are clearly away from it
        if (local && (local->posLy - camLy).len() < 0.4) return;
        if (local) { local.reset(); localId = 0; localNamed = -1; rebuildNav(); }
        return;
    }
    if (id == localId) return;
    auto sys = std::make_unique<StarSystem>();
    if (bestRec) {
        float rs = std::pow(bestRec->lum, 0.45f);
        std::string nm = fmt("HD %llu", (unsigned long long)(id % 900000 + 100000));
        GenerateStarSystem(*sys, id, nm, bestRec->temp, bestRec->lum, rs, false);
        sys->posLy = bestRec->pos;
    } else {
        const NamedStar& n = named[bestNamed];
        GenerateStarSystem(*sys, n.seed, n.name, n.temp, n.lum, n.radiusSun, n.blackHole);
        sys->posLy = n.pos;
    }
    // un-hide the previous system's star, hide the new one
    for (auto& t : tiers) {
        bool changed = false;
        for (auto& s : t.stars) {
            if (s.id == localId || s.id == id) {
                t.qb.nrm[(s.index * 4) * 3 + 1] = s.id == id ? 0.f : 1.f;
                for (int k = 1; k < 4; k++) t.qb.nrm[(s.index * 4 + k) * 3 + 1] = s.id == id ? 0.f : 1.f;
                changed = true;
            }
        }
        if (changed) t.dirty = true;
    }
    local = std::move(sys);
    localId = id;
    localNamed = bestNamed;
    local->update(simTime);
    rebuildNav();
}

void Universe::update(double dt, const UPos& cam) {
    simTime += dt;
    sol.update(simTime);
    if (local) local->update(simTime);
    DVec3 camLy = cam.toLy();
    nearGalaxies.clear();
    for (size_t i = 0; i < galaxies.size(); i++) {
        const Galaxy& g = galaxies[i];
        if ((g.pos - camLy).len() < g.radius * 1.7 + 3000) nearGalaxies.push_back((int)i);
    }
    for (int i = 0; i < 2; i++) updateTier(tiers[i], camLy, i);
    activateSystems(cam);
}

std::vector<Universe::BodyRef> Universe::activeBodies(const UPos& cam) const {
    std::vector<BodyRef> out;
    if (cam.toLy().len() < 0.5)
        for (size_t i = 0; i < sol.bodies.size(); i++) out.push_back({&sol, (int)i});
    if (local)
        for (size_t i = 0; i < local->bodies.size(); i++) out.push_back({local.get(), (int)i});
    return out;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
void Universe::rebuildNav() {
    nav.clear();
    for (size_t i = 0; i < sol.bodies.size(); i++) nav.push_back({NAV_SOL, (int)i, sol.bodies[i].name});
    if (local)
        for (size_t i = 0; i < local->bodies.size(); i++) {
            if (localNamed >= 0 && i == 0) continue;  // the star itself is listed below
            nav.push_back({NAV_LOCAL, (int)i, local->bodies[i].name});
        }
    for (size_t i = 0; i < named.size(); i++) nav.push_back({NAV_STAR, (int)i, named[i].name});
    for (size_t i = 0; i < galaxies.size(); i++) {
        if (i != (size_t)milkyWay && galaxies[i].name.rfind("PGC", 0) == 0) continue;
        nav.push_back({NAV_GALAXY, (int)i, galaxies[i].name});
    }
}

int Universe::findNav(const std::string& name) const {
    for (size_t i = 0; i < nav.size(); i++)
        if (nav[i].name == name) return (int)i;
    for (size_t i = 0; i < nav.size(); i++)
        if (nav[i].name.find(name) != std::string::npos) return (int)i;
    return -1;
}

UPos Universe::navPos(const NavTarget& t) const {
    switch (t.kind) {
        case NAV_SOL: return sol.bodyPos(t.index);
        case NAV_LOCAL: return local ? local->bodyPos(t.index) : UPos();
        case NAV_STAR: return UPos::fromLy(named[t.index].pos);
        case NAV_GALAXY: return UPos::fromLy(galaxies[t.index].pos);
    }
    return UPos();
}

double Universe::navRadius(const NavTarget& t) const {
    switch (t.kind) {
        case NAV_SOL: return sol.bodies[t.index].radius;
        case NAV_LOCAL: return local ? local->bodies[t.index].radius : 1e6;
        case NAV_STAR: return named[t.index].blackHole ? 1.2e10 : named[t.index].radiusSun * 6.957e8;
        case NAV_GALAXY: return galaxies[t.index].radius * LY_M;
    }
    return 1e6;
}

UPos Universe::navArrival(const NavTarget& t, const UPos& from) const {
    UPos target = navPos(t);
    double R = navRadius(t);
    DVec3 dir = relM(from, target).norm();
    if (dir.len2() < 0.5) dir = DVec3(0, 0, 1);
    if (t.kind == NAV_GALAXY) {
        const Galaxy& g = galaxies[t.index];
        DVec3 n = g.normal();
        DVec3 fromLy = relLy(from, target);
        if (dot(fromLy, n) < 0) n = -n;
        double k = g.type == GAL_ELLIPTICAL ? 2.2 : 1.5;
        if (t.index == milkyWay && fromLy.len() < g.radius * 1.2) k = 1.6;
        DVec3 off = (n * 0.8 + dir * 0.6).norm() * (g.radius * k);
        return UPos::fromLy(g.pos + off);
    }
    double stand;
    bool star = (t.kind == NAV_STAR) || ((t.kind == NAV_SOL || t.kind == NAV_LOCAL) && t.index == 0 &&
                                         (t.kind == NAV_SOL || (local && local->bodies[0].type != BT_BLACKHOLE)));
    if (t.kind == NAV_STAR && named[t.index].blackHole) stand = R * 60;
    else if (t.kind == NAV_LOCAL && local && local->bodies[t.index].type == BT_BLACKHOLE) stand = R * 60;
    else if (star) stand = std::max(R * 10, 0.02 * AU_M);
    else {
        stand = R * 4.0;
        const Body* b = nullptr;
        if (t.kind == NAV_SOL) b = &sol.bodies[t.index];
        else if (local) b = &local->bodies[t.index];
        if (b && b->rings) stand = R * 5.5;
        if (b && b->type == BT_STAR) stand = R * 10;
    }
    UPos out = target;
    // approach slightly from above the orbital plane for a nicer view
    out.addMetres(dir * stand);
    return out;
}

std::string Universe::navDescription(const NavTarget& t) const {
    switch (t.kind) {
        case NAV_SOL: return t.index == 0 ? "Star (G2V)" : (t.index == 4 ? "Moon of Earth" : "Solar System planet");
        case NAV_LOCAL: {
            if (!local) return "";
            const Body& b = local->bodies[t.index];
            if (b.type == BT_BLACKHOLE) return "Supermassive black hole";
            if (b.type == BT_STAR) return "Star";
            static const char* names[] = {"Rocky world", "Ocean world", "Gas giant", "Ice giant", "Cloud world", "Lava world"};
            return b.parent > 0 ? "Moon" : names[b.type];
        }
        case NAV_STAR: {
            const NamedStar& n = named[t.index];
            if (n.blackHole) return "Supermassive black hole, 4 million solar masses";
            return fmt("Star, %.0f K, %.3g L_sun", n.temp, n.lum);
        }
        case NAV_GALAXY: {
            static const char* gt[] = {"Spiral galaxy", "Barred spiral galaxy", "Elliptical galaxy", "Lenticular galaxy", "Irregular galaxy"};
            return gt[galaxies[t.index].type];
        }
    }
    return "";
}
