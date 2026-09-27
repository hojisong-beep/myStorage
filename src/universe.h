// universe.h - the simulated universe: Solar System, stars, galaxies
#pragma once
#include "core.h"
#include "gfx.h"
#include <memory>

// shader surface types (must match PLANET_FS)
enum BodyType { BT_ROCKY = 0, BT_EARTH = 1, BT_GAS = 2, BT_ICE = 3, BT_VENUS = 4, BT_LAVA = 5, BT_BLACKHOLE = 6, BT_STAR = 10 };

struct Body {
    std::string name;
    BodyType type = BT_ROCKY;
    double radius = 1e6;       // m
    int parent = -1;           // index of body it orbits (-1: the system centre)
    double orbitR = 0;         // m
    double period = 1;         // s
    double phase0 = 0;         // rad
    double incl = 0;           // rad, inclination relative to system plane
    double spinPeriod = DAY_S; // s
    float tilt = 0;            // rad
    float seed = 0;
    Vector3 c1{}, c2{}, c3{}, atmo{};
    float atmoStrength = 0;
    bool rings = false;
    float ringInner = 0, ringOuter = 0;  // in planet radii
    Vector3 ringCol{};
    bool accretion = false;    // black hole disk
    float albedo = 0.3f;
    // star properties (type == BT_STAR)
    float temp = 5778, lum = 1;
    // runtime
    DVec3 rel;                 // position relative to the system centre [m]
    Matrix rot = MatrixIdentity();
};

struct StarSystem {
    uint64_t id = 0;
    std::string name;
    DVec3 posLy;               // system centre [ly]
    std::vector<Body> bodies;  // bodies[0] is the star (or black hole)
    DVec3 ex{1, 0, 0}, ey{0, 0, -1}, en{0, 1, 0};  // orbital plane basis
    bool isSol = false;
    void update(double t);
    UPos bodyPos(int i) const {
        UPos u = UPos::fromLy(posLy);
        u.m = bodies[i].rel;
        u.renorm();
        return u;
    }
    const Body& star() const { return bodies[0]; }
};

struct NamedStar {
    std::string name;
    DVec3 pos;          // ly
    float temp, lum;    // K, solar luminosities
    float radiusSun;    // solar radii
    bool blackHole = false;
    uint64_t seed;
};

enum GalType { GAL_SPIRAL, GAL_BARRED, GAL_ELLIPTICAL, GAL_LENTICULAR, GAL_IRREGULAR };
struct Galaxy {
    std::string name;
    DVec3 pos;          // ly
    float radius;       // ly
    GalType type;
    Quaternion orient;  // local +Y is the disc normal
    uint32_t seed;
    Vector3 tint{1, 1, 1};
    float bright = 1;
    int arms = 2;
    float twist = 4;
    int atlasSlot = 0;
    DVec3 normal() const { return DVec3(Vector3RotateByQuaternion({0, 1, 0}, orient)); }
    double starDensity(const DVec3& pLy) const;  // stars per cubic ly
};

// particle clouds representing a galaxy up close
struct GalaxyCloud {
    int galaxy = -1;
    QuadBatch stars, dust;
    bool ready = false;
    void unload() { if (ready) { stars.unload(); dust.unload(); ready = false; } galaxy = -1; }
};
void GenGalaxyParticles(const Galaxy& g, QuadBatch& stars, QuadBatch& dust, int nStars, int nDust, bool milkyWay);

// procedurally generated stars around the camera
struct StarRec {
    DVec3 pos;          // ly
    float lum, temp;
    uint64_t id;
    int tier, index;
};
struct StarTier {
    double cellSize = 5, radius = 40, lumFrac = 1;
    double radiusMin = 5, radiusMax = 60;
    bool luminousOnly = false;
    int maxStars = 30000;
    uint64_t salt = 1;
    DVec3 anchor;
    int64_t ax = INT64_MIN, ay = 0, az = 0;
    double builtRadius = 0;
    QuadBatch qb;
    std::vector<StarRec> stars;
    bool dirty = false;
};

enum NavKind { NAV_SOL, NAV_STAR, NAV_GALAXY, NAV_LOCAL };
struct NavTarget {
    NavKind kind;
    int index;
    std::string name;
};

struct Universe {
    double simTime = 0;                 // seconds since J2000
    StarSystem sol;
    std::vector<NamedStar> named;
    std::vector<Galaxy> galaxies;
    int milkyWay = 0;
    std::unique_ptr<StarSystem> local;  // active non-solar star system
    uint64_t localId = 0;
    int localNamed = -1;                // index into named, or -1 for procedural
    StarTier tiers[2];
    std::vector<int> nearGalaxies;      // galaxies whose star density matters now
    std::vector<NavTarget> nav;

    void init();
    void update(double dt, const UPos& cam);

    double starDensity(const DVec3& pLy) const;
    int galaxyAt(const DVec3& pLy) const;          // galaxy containing the point, -1 if none
    std::string regionName(const UPos& cam) const;

    // navigation
    void rebuildNav();
    UPos navPos(const NavTarget& t) const;
    double navRadius(const NavTarget& t) const;    // physical radius [m]
    UPos navArrival(const NavTarget& t, const UPos& from) const;  // where to stop
    std::string navDescription(const NavTarget& t) const;
    int findNav(const std::string& name) const;

    // all bodies of currently relevant systems (for collisions / speed governor)
    struct BodyRef { const StarSystem* sys; int idx; };
    std::vector<BodyRef> activeBodies(const UPos& cam) const;

private:
    void updateTier(StarTier& t, const DVec3& camLy, int tierIndex);
    void activateSystems(const UPos& cam);
};

void BuildSolarSystem(StarSystem& s);
void GenerateStarSystem(StarSystem& s, uint64_t seed, const std::string& starName, float temp, float lum,
                        float radiusSun, bool blackHole);
