// game.h - ship, combat, autopilot and the automatic tour mode
#pragma once
#include "audio.h"
#include "core.h"
#include "universe.h"

constexpr float IMPULSE_MAX = 420.f;     // m/s
constexpr float BOOST_MAX = 1100.f;      // m/s
constexpr double WARP_MIN_LEVEL = -5.0;  // 10^-5 c  (3 km/s)
constexpr double WARP_MAX_LEVEL = 14.0;  // 10^14 c  (~3 million ly/s)
constexpr float LOCK_RANGE = 3500.f;     // m, automatic targeting range
constexpr float BOLT_SPEED = 4200.f;     // m/s
constexpr float GIMBAL = 32.f * DEG2RAD; // how far the guns can swivel toward a target

enum DriveMode { DRIVE_IMPULSE, DRIVE_WARP };
enum CamMode { CAM_CHASE, CAM_COCKPIT, CAM_CINEMATIC, CAM_COUNT };
enum EnemyKind { EK_DRONE, EK_RAIDER, EK_WARDEN, EK_COUNT };

struct Ship {
    UPos pos;
    Quaternion q{0, 0, 0, 1};
    Vector3 vel{0, 0, 0};       // impulse velocity (world axes) m/s
    Vector3 angVel{0, 0, 0};    // local rad/s (pitch, yaw, roll)
    float throttle = 0.35f;
    bool boost = false;
    DriveMode drive = DRIVE_IMPULSE;
    double warpTarget = 0.0;    // log10(speed / c) requested
    double warpLevel = -5.0;    // current log10(speed / c)
    float spool = 0;            // >0 while the warp drive charges
    float shield = 100, hull = 100;
    float shieldDelay = 0;
    float gunCd = 0;
    int gunSide = 0;
    bool alive = true;
    float respawn = 0;
    float hitFlash = 0;
    Vector3 fwd() const { return Vector3RotateByQuaternion({0, 0, -1}, q); }
    Vector3 up() const { return Vector3RotateByQuaternion({0, 1, 0}, q); }
    Vector3 right() const { return Vector3RotateByQuaternion({1, 0, 0}, q); }
    double speed() const;       // m/s
    DVec3 velocity() const;     // full velocity m/s (world)
};

struct Enemy {
    EnemyKind kind;
    Vector3 pos, vel;           // relative to the player (player is always at 0)
    Quaternion q;
    float hp, maxHp;
    float fireCd;
    int state = 0;
    float stateT = 0;
    Vector3 evadeDir{0, 0, 0};
    float hitFlash = 0;
    float spawnT = 0;
    uint32_t id;
    float radius() const;
};

struct Bolt {
    Vector3 pos, vel;           // relative to player / world velocity
    float life;
    bool fromPlayer;
    float damage;
};

struct Particle {
    Vector3 pos, vel;
    float life, maxLife;
    float size0, size1;
    Vector4 c0, c1;
    int shape;
    float drag;
    float stretch;              // velocity stretch factor (seconds)
};

struct Message {
    std::string text;
    float t;
    Color col;
};

enum AutoPhase { AP_IDLE, AP_ALIGN, AP_WARP, AP_ARRIVED };
struct Travel {
    bool active = false;
    NavTarget target{};
    UPos arrival;
    AutoPhase phase = AP_IDLE;
    float timer = 0;
    double startDist = 0;
};

enum TourState { TOUR_PLAN, TOUR_TRAVEL, TOUR_SIGHTSEE, TOUR_COMBAT };

struct Game {
    Universe U;
    Audio audio;
    Ship ship;
    std::vector<Enemy> enemies;
    std::vector<Bolt> bolts;
    std::vector<Particle> parts;

    // targeting
    int target = -1;            // enemy index
    uint32_t targetId = 0;
    float lockT = 0;
    bool locked = false;
    Vector3 leadPoint{0, 0, 0};

    // navigation
    int navSel = 0;
    std::string navSelName;         // keeps the selection when the list changes
    Travel travel;
    bool autoMode = false;
    TourState tour = TOUR_PLAN;
    int tourStep = 0;
    float tourTimer = 0;
    bool tourLocalVisit = false;
    std::string tourStatus;

    // camera
    CamMode camMode = CAM_CHASE;
    CamMode manualCam = CAM_CHASE;
    Quaternion camQ{0, 0, 0, 1};
    Quaternion viewQ{0, 0, 0, 1};   // final camera orientation
    Vector3 camPos{0, 0, 0};    // relative to the ship
    float lookYaw = 0, lookPitch = 0;
    float cineAngle = 0;
    float shake = 0;
    float fov = 65;

    // input
    Vector2 stick{0, 0};

    // misc state
    double time = 0;
    float spawnTimer = 40;
    float ambushTimer = -1;
    int kills = 0, deaths = 0;
    uint32_t nextId = 1;
    std::vector<Message> msgs;
    bool showHelp = true;
    bool showLabels = true;
    bool showOrbits = true;
    bool paused = false;
    float quitArm = 0;
    float warpVisual = 0;       // 0..1 smoothed warp intensity
    float damageFx = 0;
    std::vector<Vector3> dust;
    uint64_t frame = 0;

    void init();
    void update(float dt);
    void msg(const std::string& s, Color c = {140, 220, 255, 255});
    UPos cameraUPos() const;

    // control
    void handleInput(float dt);
    void engageWarp();
    void dropWarp(bool quiet = false);
    void startTravel(const NavTarget& t);
    void cancelTravel();
    void setAuto(bool on);

    // simulation parts
    void updateShip(float dt);
    void updateTravel(float dt);
    void updateTour(float dt);
    void updateCombatPilot(float dt);
    void updateEnemies(float dt);
    void updateBolts(float dt);
    void updateParticles(float dt);
    void updateTargeting(float dt);
    void updateCamera(float dt);
    void spawnWave(int n, bool announce = true);
    void fireGuns(bool autoFire);
    void explode(Vector3 p, float scale, Vector3 vel);
    void damagePlayer(float d, Vector3 from);
    void steerToward(Vector3 dir, float dt, float rate);
    bool playerCanFight() const { return ship.alive && ship.drive == DRIVE_IMPULSE; }
};
