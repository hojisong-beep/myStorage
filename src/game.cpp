// game.cpp - flight model, combat, AI, autopilot and the automatic tour
#include "game.h"

static Rng grng(20260927);

// itinerary for AUTO mode: from home, out through the galaxy, across the cosmos and back
static const char* TOUR[] = {
    "Moon", "Mars", "Jupiter", "Saturn", "Neptune", "Alpha Centauri", "Sirius", "Vega", "Betelgeuse",
    "Rigel", "Sagittarius A*", "Large Magellanic Cloud", "Milky Way", "Andromeda Galaxy (M31)",
    "Triangulum Galaxy (M33)", "Whirlpool Galaxy (M51)", "Sombrero Galaxy (M104)", "M87 (Virgo A)",
    "Pinwheel Galaxy (M101)", "Milky Way", "Sun", "Earth",
};
static const int TOUR_N = sizeof(TOUR) / sizeof(TOUR[0]);

struct EnemyStats { const char* name; float hp, speed, turn, fireCd, dmg, radius; };
static const EnemyStats ESTATS[EK_COUNT] = {
    {"Drone", 30, 380, 2.2f, 1.1f, 4, 5},
    {"Raider", 60, 320, 1.6f, 0.75f, 5, 8},
    {"Warden", 180, 200, 0.8f, 0.4f, 6, 16},
};

float Enemy::radius() const { return ESTATS[kind].radius; }

double Ship::speed() const {
    if (drive == DRIVE_WARP) return C_MS * std::pow(10.0, warpLevel);
    return Vector3Length(vel);
}
DVec3 Ship::velocity() const {
    if (drive == DRIVE_WARP) return DVec3(fwd()) * speed();
    return DVec3(vel);
}

static bool segSphere(Vector3 a, Vector3 b, Vector3 c, float r) {
    Vector3 ab = Vector3Subtract(b, a);
    float l2 = Vector3DotProduct(ab, ab);
    float t = l2 > 0 ? clampf(Vector3DotProduct(Vector3Subtract(c, a), ab) / l2, 0, 1) : 0;
    Vector3 p = Vector3Add(a, Vector3Scale(ab, t));
    return Vector3DistanceSqr(p, c) < r * r;
}

static float angleBetween(Vector3 a, Vector3 b) {
    float d = Vector3DotProduct(Vector3Normalize(a), Vector3Normalize(b));
    return acosf(clampf(d, -1, 1));
}

// ---------------------------------------------------------------------------
void Game::init() {
    U.init();
    audio.init();

    // start in a high orbit around Earth on its day side, looking at the planet
    int earth = U.findNav("Earth");
    const NavTarget& et = U.nav[earth];
    UPos ep = U.navPos(et);
    double R = U.navRadius(et);
    DVec3 toSun = (-relM(ep, UPos())).norm();
    DVec3 side = cross(toSun, U.sol.en).norm();
    DVec3 off = (toSun * 0.55 + side * 0.8 + U.sol.en * 0.25).norm() * (R * 3.4);
    ship.pos = ep;
    ship.pos.addMetres(off);
    Vector3 look = (-off).norm().f();
    ship.q = QuaternionFromVector3ToVector3({0, 0, -1}, look);
    camQ = ship.q;

    navSel = U.findNav("Mars");
    navSelName = "Mars";
    for (int i = 0; i < 600; i++)
        dust.push_back({(float)grng.range(-150, 150), (float)grng.range(-150, 150), (float)grng.range(-150, 150)});
    msg("Welcome aboard. Press P for AUTO mode, H for help.", {255, 230, 140, 255});
}

void Game::msg(const std::string& s, Color c) {
    msgs.push_back({s, 0, c});
    if (msgs.size() > 7) msgs.erase(msgs.begin());
}

UPos Game::cameraUPos() const {
    UPos p = ship.pos;
    p.addMetres(DVec3(camPos));
    return p;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
void Game::setAuto(bool on) {
    autoMode = on;
    if (on) {
        manualCam = camMode;
        camMode = CAM_CINEMATIC;
        showHelp = false;
        tour = TOUR_PLAN;
        tourTimer = 0;
        cancelTravel();
        msg("AUTO mode engaged - sit back and enjoy the journey", {120, 255, 160, 255});
    } else {
        camMode = manualCam;
        cancelTravel();
        ship.boost = false;
        msg("Manual control", {255, 220, 120, 255});
    }
}

void Game::handleInput(float dt) {
    if (IsKeyPressed(KEY_ESCAPE)) {
        if (quitArm > 0) { quitArm = -1; return; }
        quitArm = 2.5f;
        msg("Press ESC again to quit", {255, 150, 120, 255});
    }
    if (quitArm > 0) quitArm = std::max(0.f, quitArm - dt);
    if (IsKeyPressed(KEY_F11)) ToggleFullscreen();
    if (IsKeyPressed(KEY_H) || IsKeyPressed(KEY_F1)) showHelp = !showHelp;
    if (IsKeyPressed(KEY_L)) showLabels = !showLabels;
    if (IsKeyPressed(KEY_O)) showOrbits = !showOrbits;
    if (IsKeyPressed(KEY_PAUSE) || IsKeyPressed(KEY_F2)) paused = !paused;
    if (IsKeyPressed(KEY_P)) setAuto(!autoMode);
    if (IsKeyPressed(KEY_C)) {
        camMode = (CamMode)((camMode + 1) % CAM_COUNT);
        static const char* cn[] = {"Chase camera", "Cockpit camera", "Cinematic camera"};
        msg(cn[camMode]);
    }
    int navN = (int)U.nav.size();
    if (navSel >= navN || U.nav[navSel].name != navSelName) {
        int i = U.findNav(navSelName);
        navSel = i >= 0 ? i : std::min(navSel, navN - 1);
    }
    if (IsKeyPressed(KEY_N)) navSel = (navSel + 1) % navN;
    if (IsKeyPressed(KEY_B)) navSel = (navSel + navN - 1) % navN;
    navSelName = U.nav[navSel].name;

    // free look with the right mouse button (all modes)
    if (IsMouseButtonDown(MOUSE_BUTTON_RIGHT)) {
        Vector2 d = GetMouseDelta();
        lookYaw -= d.x * 0.005f;
        lookPitch = clampf(lookPitch - d.y * 0.005f, -1.3f, 1.3f);
    } else {
        lookYaw *= expf(-dt * 3);
        lookPitch *= expf(-dt * 3);
    }

    if (IsKeyPressed(KEY_T)) {
        // cycle through enemies in range
        int n = (int)enemies.size();
        for (int k = 1; k <= n; k++) {
            int i = (target + k + n) % n;
            if (Vector3Length(enemies[i].pos) < LOCK_RANGE) {
                target = i; targetId = enemies[i].id; lockT = 0; locked = false;
                break;
            }
        }
    }

    if (autoMode) return;

    if (IsKeyPressed(KEY_G)) {
        startTravel(U.nav[navSel]);
    }
    if (IsKeyPressed(KEY_J) || IsKeyPressed(KEY_TAB)) {
        if (ship.drive == DRIVE_WARP) dropWarp();
        else if (ship.spool <= 0) engageWarp();
    }

    // throttle / warp factor
    float thr = 0;
    if (IsKeyDown(KEY_W)) thr += 1;
    if (IsKeyDown(KEY_S)) thr -= 1;
    float wheel = GetMouseWheelMove();
    if (ship.drive == DRIVE_WARP) {
        ship.warpTarget = clampd(ship.warpTarget + thr * 2.0 * dt + wheel * 0.5, WARP_MIN_LEVEL, WARP_MAX_LEVEL);
        if (IsKeyPressed(KEY_X)) ship.warpTarget = WARP_MIN_LEVEL;
        if (thr != 0 || wheel != 0) cancelTravel();
    } else {
        ship.throttle = clampf(ship.throttle + thr * 0.6f * dt + wheel * 0.1f, 0, 1);
        if (IsKeyPressed(KEY_X)) ship.throttle = 0;
    }
    ship.boost = IsKeyDown(KEY_LEFT_SHIFT) || IsKeyDown(KEY_RIGHT_SHIFT);

    // steering: mouse virtual stick + keys
    Vector2 md = GetMouseDelta();
    if (!IsMouseButtonDown(MOUSE_BUTTON_RIGHT) && IsCursorHidden()) {
        stick.x += md.x * 0.0025f;
        stick.y += md.y * 0.0025f;
        float l = Vector2Length(stick);
        if (l > 1) stick = Vector2Scale(stick, 1 / l);
    }
    if (IsMouseButtonPressed(MOUSE_BUTTON_MIDDLE) || IsKeyPressed(KEY_Z)) stick = {0, 0};
    float pitch = 0, yaw = 0, roll = 0;
    Vector2 s = stick;
    float sl = Vector2Length(s);
    if (sl < 0.06f) s = {0, 0};
    pitch -= s.y;
    yaw -= s.x;
    if (IsKeyDown(KEY_UP)) pitch -= 1;
    if (IsKeyDown(KEY_DOWN)) pitch += 1;
    if (IsKeyDown(KEY_LEFT) || IsKeyDown(KEY_A)) yaw += 1;
    if (IsKeyDown(KEY_RIGHT) || IsKeyDown(KEY_D)) yaw -= 1;
    if (IsKeyDown(KEY_Q)) roll += 1;
    if (IsKeyDown(KEY_E)) roll -= 1;
    pitch = clampf(pitch, -1, 1);
    yaw = clampf(yaw, -1, 1);
    bool steering = fabsf(pitch) > 0.15f || fabsf(yaw) > 0.15f || fabsf(roll) > 0.1f;
    if (travel.active && steering) cancelTravel();
    if (!travel.active) {
        float k = ship.drive == DRIVE_WARP ? 0.6f : 1.0f;
        Vector3 want = {pitch * 1.3f * k, yaw * 1.1f * k, roll * 2.2f};
        ship.angVel = Vector3Lerp(ship.angVel, want, clampf(dt * 5, 0, 1));
    }
}

// ---------------------------------------------------------------------------
// Drives
// ---------------------------------------------------------------------------
void Game::engageWarp() {
    if (!ship.alive || ship.drive == DRIVE_WARP || ship.spool > 0) return;
    ship.spool = 1.3f;
    audio.play(SFX_WARP_IN, 0.8f);
    if (!travel.active) msg("Warp drive charging...");
}

void Game::dropWarp(bool quiet) {
    if (ship.drive != DRIVE_WARP) { ship.spool = 0; return; }
    ship.drive = DRIVE_IMPULSE;
    ship.vel = Vector3Scale(ship.fwd(), (float)std::min(ship.speed(), 300.0));
    ship.warpLevel = WARP_MIN_LEVEL;
    if (!quiet) audio.play(SFX_WARP_OUT, 0.8f);
    shake += 0.4f;
    if (!autoMode && grng.chance(0.35)) ambushTimer = 4.f;
}

void Game::cancelTravel() {
    if (travel.active && !autoMode) msg("Autopilot disengaged");
    travel.active = false;
    travel.phase = AP_IDLE;
}

void Game::startTravel(const NavTarget& t) {
    travel.active = true;
    travel.target = t;
    travel.phase = AP_ALIGN;
    travel.timer = 0;
    travel.arrival = U.navArrival(t, ship.pos);
    travel.startDist = relM(travel.arrival, ship.pos).len();
    msg("Course set: " + t.name + "  (" + fmtDistance(travel.startDist) + ")", {150, 230, 255, 255});
}

void Game::steerToward(Vector3 dir, float dt, float rate) {
    Quaternion inv = QuaternionInvert(ship.q);
    Vector3 d = Vector3RotateByQuaternion(Vector3Normalize(dir), inv);
    float yawErr = atan2f(-d.x, -d.z);
    float pitchErr = atan2f(d.y, -d.z);
    // bank into turns and slowly level to the galactic "up"
    Vector3 lu = Vector3RotateByQuaternion({0, 1, 0}, inv);
    float rollErr = atan2f(-lu.x, lu.y) * 0.4f - yawErr * 0.5f;
    Vector3 want = {clampf(pitchErr * 2.2f, -rate, rate), clampf(yawErr * 2.2f, -rate, rate), clampf(rollErr * 1.5f, -1.2f, 1.2f)};
    ship.angVel = Vector3Lerp(ship.angVel, want, clampf(dt * 4, 0, 1));
}

// ---------------------------------------------------------------------------
void Game::updateShip(float dt) {
    if (!ship.alive) {
        ship.respawn -= dt;
        if (ship.respawn <= 0) {
            ship.alive = true;
            ship.hull = 100;
            ship.shield = 100;
            enemies.clear();
            bolts.clear();
            ship.vel = {0, 0, 0};
            msg("Emergency systems restored the ship", {120, 255, 160, 255});
        }
        return;
    }
    // rotation (body frame)
    Vector3 w = ship.angVel;
    float wl = Vector3Length(w);
    if (wl > 1e-6f) {
        Quaternion dq = QuaternionFromAxisAngle(Vector3Scale(w, 1 / wl), wl * dt);
        ship.q = QuaternionNormalize(QuaternionMultiply(ship.q, dq));
    }

    if (ship.spool > 0) {
        ship.spool -= dt;
        if (ship.spool <= 0) {
            ship.spool = 0;
            ship.drive = DRIVE_WARP;
            ship.warpLevel = std::max(WARP_MIN_LEVEL, std::log10(std::max(Vector3Length(ship.vel), 1.f) / C_MS));
            shake += 0.6f;
            if (!travel.active) msg("Warp drive engaged - W/S or mouse wheel sets warp factor");
        }
    }

    auto bodies = U.activeBodies(ship.pos);
    Vector3 fwd = ship.fwd();
    DVec3 step;
    if (ship.drive == DRIVE_IMPULSE) {
        float top = ship.boost ? BOOST_MAX : ship.throttle * IMPULSE_MAX;
        Vector3 tv = Vector3Scale(fwd, top);
        ship.vel = Vector3Lerp(ship.vel, tv, clampf(dt * (ship.boost ? 1.6f : 1.1f), 0, 1));
        step = DVec3(ship.vel) * dt;
    } else {
        // safety governor: never approach a planet or star faster than it can be avoided
        double cap = C_MS * std::pow(10.0, WARP_MAX_LEVEL);
        for (auto& br : bodies) {
            const Body& b = br.sys->bodies[br.idx];
            DVec3 c = relM(br.sys->bodyPos(br.idx), ship.pos);
            double d = c.len() - b.radius;
            if (d > 2e13) continue;
            double app = dot(DVec3(fwd), c.norm());
            if (app < 0.2) continue;
            cap = std::min(cap, std::max(d, 0.0) * 2.5 / app + 3000.0);
        }
        double rateUp = 2.0, rateDown = 6.0;
        if (ship.warpLevel < ship.warpTarget) ship.warpLevel = std::min(ship.warpTarget, ship.warpLevel + rateUp * dt);
        else ship.warpLevel = std::max(ship.warpTarget, ship.warpLevel - rateDown * dt);
        double sp = C_MS * std::pow(10.0, ship.warpLevel);
        if (sp > cap) { sp = cap; ship.warpLevel = std::log10(sp / C_MS); }
        step = DVec3(fwd) * (sp * dt);
    }

    // collision with planets / stars along this step
    double stepLen = step.len();
    for (auto& br : bodies) {
        const Body& b = br.sys->bodies[br.idx];
        DVec3 c = relM(br.sys->bodyPos(br.idx), ship.pos);
        double R = b.radius * (b.type == BT_BLACKHOLE ? 8.0 : 1.015) + 50.0;
        double t = stepLen > 0 ? clampd(dot(c, step) / (stepLen * stepLen), 0, 1) : 0;
        DVec3 closest = step * t;
        if ((c - closest).len() < R && dot(c, step) > 0 && c.len() > R * 0.99) {
            // stop at the edge of the sphere
            double a = stepLen * stepLen, bq = -2 * dot(c, step), cq = c.len2() - R * R;
            double disc = bq * bq - 4 * a * cq;
            double tt = disc > 0 ? (-bq - std::sqrt(disc)) / (2 * a) : 0;
            step = step * clampd(tt - 1e-4, 0, 1);
            if (ship.drive == DRIVE_WARP) {
                dropWarp();
                msg("EMERGENCY DROP - gravity well of " + b.name, {255, 140, 100, 255});
                cancelTravel();
            }
            ship.vel = {0, 0, 0};
            break;
        }
    }
    ship.pos.addMetres(step);
    // never stay inside a body
    for (auto& br : bodies) {
        const Body& b = br.sys->bodies[br.idx];
        DVec3 c = relM(br.sys->bodyPos(br.idx), ship.pos);
        double R = b.radius * (b.type == BT_BLACKHOLE ? 8.0 : 1.015) + 50.0;
        if (c.len() < R) {
            DVec3 out = (-c).norm();
            ship.pos.addMetres(out * (R - c.len()));
            float vin = Vector3DotProduct(ship.vel, out.f());
            if (vin < 0) ship.vel = Vector3Subtract(ship.vel, Vector3Scale(out.f(), vin));
        }
    }

    // shields
    ship.shieldDelay -= dt;
    if (ship.shieldDelay <= 0) ship.shield = std::min(100.f, ship.shield + 14 * dt);
    ship.hull = std::min(100.f, ship.hull + 0.4f * dt);
    ship.gunCd -= dt;
    ship.hitFlash = std::max(0.f, ship.hitFlash - dt * 3);
}

// ---------------------------------------------------------------------------
// Autopilot
// ---------------------------------------------------------------------------
void Game::updateTravel(float dt) {
    if (!travel.active || !ship.alive) return;
    travel.timer += dt;
    // planets move, so re-aim at them; stars and galaxies keep the arrival point fixed
    if (travel.target.kind == NAV_SOL || travel.target.kind == NAV_LOCAL) travel.arrival = U.navArrival(travel.target, ship.pos);
    DVec3 to = relM(travel.arrival, ship.pos);
    double dist = to.len();
    DVec3 dir = to / std::max(dist, 1e-9);

    // go around planets/stars that sit on the straight line
    for (auto& br : U.activeBodies(ship.pos)) {
        if ((travel.target.kind == NAV_SOL && br.sys->isSol && br.idx == travel.target.index) ||
            (travel.target.kind == NAV_LOCAL && !br.sys->isSol && br.idx == travel.target.index))
            continue;
        const Body& b = br.sys->bodies[br.idx];
        DVec3 c = relM(br.sys->bodyPos(br.idx), ship.pos);
        double proj = dot(c, dir);
        if (proj <= 0 || proj > dist) continue;
        DVec3 perp = c - dir * proj;
        double R = b.radius * (b.type == BT_BLACKHOLE ? 12 : 1.0);
        if (perp.len() < R * 2.5) {
            DVec3 away = perp.len() > 1 ? (-perp).norm() : cross(dir, DVec3(0, 1, 0)).norm();
            DVec3 wp = c + away * (R * 4.0);
            dir = wp.norm();
            break;
        }
    }

    Vector3 fwd = ship.fwd();
    float ang = angleBetween(fwd, dir.f());
    if (travel.phase == AP_ALIGN) {
        steerToward(dir.f(), dt, 1.4f);
        ship.throttle = 0.2f;
        if (dist < 3000) {
            travel.phase = AP_ARRIVED;
        } else if (ship.drive == DRIVE_WARP) {
            travel.phase = AP_WARP;
        } else if (ang < 4 * DEG2RAD || (travel.timer > 6 && ang < 20 * DEG2RAD)) {
            engageWarp();
            travel.phase = AP_WARP;
        }
    } else if (travel.phase == AP_WARP) {
        steerToward(dir.f(), dt, ship.drive == DRIVE_WARP ? 1.8f : 1.2f);
        if (ship.drive == DRIVE_WARP) {
            double desired = dist * 1.8;
            if (ang > 30 * DEG2RAD) desired *= 0.05;  // slow down to turn
            ship.warpTarget = clampd(std::log10(std::max(desired, 1.0) / C_MS), WARP_MIN_LEVEL, WARP_MAX_LEVEL);
            if (dist < 60e3) {
                dropWarp();
                travel.phase = AP_ARRIVED;
                msg("Arrived: " + travel.target.name, {150, 255, 190, 255});
            }
        } else if (ship.spool <= 0) {
            // spool finished but drive not engaged (e.g. killed) - retry
            if (dist < 3000) travel.phase = AP_ARRIVED;
            else engageWarp();
        }
    } else if (travel.phase == AP_ARRIVED) {
        if (!autoMode) travel.active = false;
    }
}

void Game::updateTour(float dt) {
    tourTimer -= dt;
    int alive = (int)enemies.size();
    switch (tour) {
        case TOUR_PLAN: {
            if (alive > 0) { tour = TOUR_COMBAT; break; }
            NavTarget t{};
            bool ok = false;
            if (tourLocalVisit && U.local) {
                // visit a planet of the star system we just reached
                std::vector<int> cand;
                for (auto& n : U.nav)
                    if (n.kind == NAV_LOCAL && U.local->bodies[n.index].type != BT_STAR && U.local->bodies[n.index].parent <= 0 && n.index > 0)
                        cand.push_back((int)(&n - &U.nav[0]));
                if (!cand.empty()) { t = U.nav[cand[grng.irange(0, (int)cand.size() - 1)]]; ok = true; }
            }
            tourLocalVisit = false;
            if (!ok) {
                int i = U.findNav(TOUR[tourStep % TOUR_N]);
                tourStep++;
                if (i < 0) break;
                t = U.nav[i];
                if (t.kind == NAV_STAR && !U.named[t.index].blackHole) tourLocalVisit = grng.chance(0.6);
            }
            startTravel(t);
            tour = TOUR_TRAVEL;
            tourStatus = "En route to " + t.name;
            break;
        }
        case TOUR_TRAVEL:
            if (alive > 0 && ship.drive == DRIVE_IMPULSE) {
                ship.spool = 0;   // abort the jump and fight
                travel.phase = AP_ALIGN;
                travel.timer = 0;
                tour = TOUR_COMBAT;
                break;
            }
            if (!travel.active || travel.phase == AP_ARRIVED) {
                travel.active = false;
                tour = TOUR_SIGHTSEE;
                tourTimer = 16;
                tourStatus = "Observing " + travel.target.name;
                if (grng.chance(0.6)) ambushTimer = (float)grng.range(3, 6);
            }
            break;
        case TOUR_SIGHTSEE: {
            UPos tp = U.navPos(travel.target);
            DVec3 to = relM(tp, ship.pos);
            steerToward(Vector3Normalize(Vector3Add(to.norm().f(), Vector3Scale(ship.right(), 0.35f))), dt, 0.25f);
            ship.throttle = 0.15f;
            ship.boost = false;
            if (alive > 0) { tour = TOUR_COMBAT; break; }
            if (tourTimer <= 0 && ambushTimer <= 0) tour = TOUR_PLAN;
            break;
        }
        case TOUR_COMBAT:
            tourStatus = fmt("Engaging hostiles (%d left)", alive);
            if (!ship.alive) break;
            updateCombatPilot(dt);
            if (alive == 0) {
                ship.boost = false;
                tour = TOUR_SIGHTSEE;
                tourTimer = 6;
                tourStatus = "Area secured";
                if (travel.phase != AP_ARRIVED && travel.active) {
                    tour = TOUR_TRAVEL;
                    tourStatus = "En route to " + travel.target.name;
                }
            }
            break;
    }
}

void Game::updateCombatPilot(float dt) {
    static float evadeT = 0;
    static Vector3 evadeDir = {0, 0, 1};
    const Enemy* e = nullptr;
    if (target >= 0 && target < (int)enemies.size()) e = &enemies[target];
    else {
        float best = 1e30f;
        for (auto& en : enemies) {
            float d = Vector3Length(en.pos);
            if (d < best) { best = d; e = &en; }
        }
    }
    if (!e) return;
    float dist = Vector3Length(e->pos);
    if (evadeT > 0) {
        evadeT -= dt;
        steerToward(evadeDir, dt, 1.8f);
        ship.throttle = 1.0f;
        ship.boost = true;
        return;
    }
    Vector3 aim = locked ? leadPoint : e->pos;
    steerToward(aim, dt, 1.7f);
    if (dist < 220) {
        evadeT = 1.4f;
        Vector3 side = Vector3CrossProduct(e->pos, ship.up());
        evadeDir = Vector3Normalize(Vector3Add(Vector3Normalize(side), Vector3Scale(ship.fwd(), 0.4f)));
    }
    ship.boost = dist > 2000;
    ship.throttle = dist > 800 ? 1.0f : 0.45f;
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
void Game::spawnWave(int n, bool announce) {
    Vector3 fwd = ship.fwd();
    for (int i = 0; i < n; i++) {
        Enemy e;
        double u = grng.uni();
        e.kind = u < 0.55 ? EK_DRONE : (u < 0.88 ? EK_RAIDER : EK_WARDEN);
        if (kills < 3 && e.kind == EK_WARDEN) e.kind = EK_RAIDER;
        Vector3 dir = Vector3Normalize(Vector3Add(Vector3Scale(fwd, 0.9f), grng.unitVec().f()));
        e.pos = Vector3Scale(dir, (float)grng.range(2200, 4200));
        e.q = QuaternionFromVector3ToVector3({0, 0, -1}, Vector3Normalize(Vector3Negate(e.pos)));
        e.vel = Vector3Add(ship.vel, Vector3Scale(Vector3Normalize(Vector3Negate(e.pos)), ESTATS[e.kind].speed * 0.5f));
        e.hp = e.maxHp = ESTATS[e.kind].hp;
        e.fireCd = (float)grng.range(1.5, 3.0);
        e.spawnT = 1.0f;
        e.id = nextId++;
        enemies.push_back(e);
        // warp-in flash
        parts.push_back({e.pos, e.vel, 0.6f, 0.6f, 6, 60, {3, 1.2f, 1.2f, 1}, {0, 0, 0, 0}, SH_FLARE, 0, 0});
    }
    if (announce) {
        msg(fmt("WARNING: %d hostile ships dropping out of warp!", n), {255, 110, 90, 255});
        audio.play(SFX_ALARM, 0.6f);
    }
}

void Game::explode(Vector3 p, float s, Vector3 v) {
    parts.push_back({p, v, 0.25f, 0.25f, 30 * s, 60 * s, {8, 5, 2.5f, 1}, {0, 0, 0, 0}, SH_GLOW, 0, 0});
    parts.push_back({p, v, 0.8f, 0.8f, 6 * s, 140 * s, {1.2f, 1.6f, 3.0f, 1}, {0, 0, 0, 0}, SH_RING, 0, 0});
    for (int i = 0; i < 14; i++) {
        Vector3 d = Vector3Scale(grng.unitVec().f(), (float)grng.range(10, 45) * s);
        float life = (float)grng.range(0.7, 1.6);
        parts.push_back({p, Vector3Add(v, d), life, life, (float)grng.range(5, 10) * s, (float)grng.range(18, 34) * s,
                         {4.0f, 1.8f, 0.5f, 1}, {0.4f, 0.08f, 0.02f, 0}, SH_GLOW, 1.2f, 0});
    }
    for (int i = 0; i < 45; i++) {
        Vector3 d = Vector3Scale(grng.unitVec().f(), (float)grng.range(120, 520) * s);
        float life = (float)grng.range(0.4, 1.3);
        parts.push_back({p, Vector3Add(v, d), life, life, 0.9f * s, 0.4f * s, {6, 3.5f, 1.4f, 1}, {1.5f, 0.3f, 0.05f, 0},
                         SH_GLOW, 1.5f, 0.045f});
    }
    for (int i = 0; i < 16; i++) {
        Vector3 d = Vector3Scale(grng.unitVec().f(), (float)grng.range(20, 90) * s);
        float life = (float)grng.range(1.8, 3.5);
        parts.push_back({p, Vector3Add(v, d), life, life, 1.4f * s, 0.6f * s, {3, 1.4f, 0.4f, 1}, {0.3f, 0.05f, 0, 0},
                         SH_GLOW, 0.4f, 0.0f});
    }
    float dist = Vector3Length(p);
    audio.play(s > 2 ? SFX_BIG_EXPLOSION : SFX_EXPLOSION, clampf(1.2f - dist / 4000.f, 0.15f, 1.0f), (float)grng.range(0.85, 1.1));
    shake += clampf(s * 40 / (dist + 50), 0, 1.0f);
}

void Game::damagePlayer(float d, Vector3 from) {
    if (!ship.alive) return;
    ship.shieldDelay = 2.5f;
    shake += 0.25f;
    if (ship.shield > 0) {
        ship.shield -= d;
        audio.play(SFX_SHIELD_HIT, 0.5f, (float)grng.range(0.9, 1.1));
        parts.push_back({Vector3Scale(Vector3Normalize(from), 11), ship.vel, 0.35f, 0.35f, 14, 18, {0.5f, 1.2f, 3.0f, 1},
                         {0, 0, 0, 0}, SH_DISC, 0, 0});
        if (ship.shield < 0) { ship.hull += ship.shield; ship.shield = 0; }
    } else {
        ship.hull -= d;
        ship.hitFlash = 1;
        damageFx = 1;
        audio.play(SFX_HIT, 0.8f);
    }
    if (ship.hull <= 0) {
        ship.hull = 0;
        ship.alive = false;
        ship.respawn = 4.5f;
        deaths++;
        explode({0, 0, 0}, 3.0f, ship.vel);
        msg("SHIP DESTROYED", {255, 80, 60, 255});
        cancelTravel();
        if (autoMode) tour = TOUR_PLAN;
    }
}

void Game::fireGuns(bool autoFire) {
    if (ship.gunCd > 0 || !ship.alive || ship.drive != DRIVE_IMPULSE) return;
    Vector3 fwd = ship.fwd();
    ship.gunSide ^= 1;
    Vector3 gun = Vector3RotateByQuaternion({ship.gunSide ? 8.6f : -8.6f, -0.3f, -3.0f}, ship.q);
    Vector3 dir = fwd;
    if (locked && target >= 0) {
        Vector3 aim = Vector3Subtract(leadPoint, gun);
        if (angleBetween(aim, fwd) < GIMBAL) dir = Vector3Normalize(aim);
        else if (autoFire) return;
    } else if (autoFire) return;
    ship.gunCd = 0.085f;
    Bolt b;
    b.pos = gun;
    b.vel = Vector3Add(ship.vel, Vector3Scale(dir, BOLT_SPEED));
    b.life = 1.1f;
    b.fromPlayer = true;
    b.damage = 9;
    bolts.push_back(b);
    parts.push_back({gun, ship.vel, 0.07f, 0.07f, 3.0f, 1.0f, {0.8f, 3.0f, 1.6f, 1}, {0, 0, 0, 0}, SH_GLOW, 0, 0});
    audio.play(SFX_LASER, 0.28f, (float)grng.range(0.95, 1.06));
}

void Game::updateTargeting(float dt) {
    // keep the current target if still valid
    if (targetId) {
        target = -1;
        for (size_t i = 0; i < enemies.size(); i++)
            if (enemies[i].id == targetId) target = (int)i;
        if (target >= 0 && Vector3Length(enemies[target].pos) > LOCK_RANGE * 1.25f) target = -1;
        if (target < 0) { targetId = 0; locked = false; lockT = 0; }
    }
    if (!playerCanFight()) { locked = false; lockT = 0; return; }
    if (target < 0) {
        // automatic acquisition: nearest enemy in range, preferring those ahead
        float best = 1e30f;
        Vector3 fwd = ship.fwd();
        for (size_t i = 0; i < enemies.size(); i++) {
            float d = Vector3Length(enemies[i].pos);
            if (d > LOCK_RANGE) continue;
            float score = d * (1.6f - Vector3DotProduct(fwd, Vector3Scale(enemies[i].pos, 1 / d)));
            if (score < best) { best = score; target = (int)i; }
        }
        if (target >= 0) { targetId = enemies[target].id; lockT = 0; locked = false; }
    }
    if (target < 0) return;
    Enemy& e = enemies[target];
    lockT += dt;
    if (!locked && lockT > 0.5f) {
        locked = true;
        audio.play(SFX_LOCK, 0.5f);
    }
    // intercept for the bolts: |P + V t| = s t
    Vector3 P = e.pos;
    Vector3 V = Vector3Subtract(e.vel, ship.vel);
    float s = BOLT_SPEED;
    float a = Vector3DotProduct(V, V) - s * s;
    float b = 2 * Vector3DotProduct(P, V);
    float c = Vector3DotProduct(P, P);
    float t = Vector3Length(P) / s;
    float disc = b * b - 4 * a * c;
    if (disc >= 0 && fabsf(a) > 1e-3f) {
        float t1 = (-b - sqrtf(disc)) / (2 * a), t2 = (-b + sqrtf(disc)) / (2 * a);
        float tt = t1 > 0 ? t1 : t2;
        if (t1 > 0 && t2 > 0) tt = std::min(t1, t2);
        if (tt > 0) t = tt;
    }
    leadPoint = Vector3Add(P, Vector3Scale(V, t));
}

void Game::updateEnemies(float dt) {
    Vector3 pv = ship.drive == DRIVE_WARP ? ship.velocity().f() : ship.vel;
    for (size_t i = 0; i < enemies.size(); i++) {
        Enemy& e = enemies[i];
        const EnemyStats& st = ESTATS[e.kind];
        e.hitFlash = std::max(0.f, e.hitFlash - dt * 4);
        e.spawnT = std::max(0.f, e.spawnT - dt);
        Vector3 toP = Vector3Negate(e.pos);
        float dist = Vector3Length(toP);
        Vector3 desired;
        e.stateT -= dt;
        if (e.state == 0) {
            // attack run with a sideways offset so they don't all fly the same line
            Vector3 off = Vector3Scale(Vector3Normalize(Vector3CrossProduct(toP, {0.3f, 1, 0.1f})), 150.f * sinf((float)time * 0.7f + e.id));
            desired = Vector3Normalize(Vector3Add(toP, off));
            if (dist < 300 + st.radius * 10 && ship.alive) {
                e.state = 1;
                e.stateT = (float)grng.range(1.5, 3.0);
                e.evadeDir = Vector3Normalize(Vector3Add(grng.unitVec().f(), Vector3Scale(Vector3Normalize(e.pos), 1.2f)));
            }
        } else {
            desired = e.evadeDir;
            if (e.stateT <= 0) e.state = 0;
        }
        if (!ship.alive) desired = Vector3Normalize(Vector3Add(e.pos, {0, 0.3f, 0}));
        // separation
        for (size_t j = 0; j < enemies.size(); j++) {
            if (j == i) continue;
            Vector3 d = Vector3Subtract(e.pos, enemies[j].pos);
            float l = Vector3Length(d);
            if (l < 120 && l > 0.1f) desired = Vector3Add(desired, Vector3Scale(d, 0.6f / l));
        }
        desired = Vector3Normalize(desired);
        Vector3 f = Vector3RotateByQuaternion({0, 0, -1}, e.q);
        float ang = angleBetween(f, desired);
        if (ang > 1e-4f) {
            Vector3 axis = Vector3CrossProduct(f, desired);
            if (Vector3Length(axis) < 1e-6f) axis = Vector3RotateByQuaternion({0, 1, 0}, e.q);
            float stepA = std::min(ang, st.turn * dt);
            e.q = QuaternionNormalize(QuaternionMultiply(QuaternionFromAxisAngle(Vector3Normalize(axis), stepA), e.q));
            // bank
            e.q = QuaternionNormalize(QuaternionMultiply(e.q, QuaternionFromAxisAngle({0, 0, 1}, clampf(ang, 0, 0.5f) * dt * 2)));
        }
        f = Vector3RotateByQuaternion({0, 0, -1}, e.q);
        Vector3 wantV = Vector3Add(Vector3Scale(f, st.speed), e.state == 0 && dist > 3000 ? Vector3Scale(pv, 0.9f) : Vector3Scale(pv, 0.5f));
        e.vel = Vector3Lerp(e.vel, wantV, clampf(dt * 1.5f, 0, 1));
        e.pos = Vector3Add(e.pos, Vector3Scale(Vector3Subtract(e.vel, pv), dt));

        // weapons
        e.fireCd -= dt;
        if (ship.alive && ship.drive == DRIVE_IMPULSE && e.state == 0 && dist < 1700 && e.spawnT <= 0 &&
            angleBetween(f, toP) < 14 * DEG2RAD && e.fireCd <= 0) {
            e.fireCd = st.fireCd * (float)grng.range(0.7, 1.3);
            float es = 2300;
            Vector3 relV = Vector3Subtract(e.vel, pv);
            float tt = dist / es;
            Vector3 aimDir = Vector3Normalize(Vector3Subtract(Vector3Scale(toP, 1.0f / tt), relV));
            Vector3 jitter = Vector3Scale(grng.unitVec().f(), 0.045f);
            aimDir = Vector3Normalize(Vector3Add(aimDir, jitter));
            Bolt b;
            b.pos = Vector3Add(e.pos, Vector3Scale(f, st.radius));
            b.vel = Vector3Add(e.vel, Vector3Scale(aimDir, es));
            b.life = 1.6f;
            b.fromPlayer = false;
            b.damage = st.dmg;
            bolts.push_back(b);
            audio.play(SFX_ENEMY_LASER, clampf(0.5f - dist / 5000.f, 0.08f, 0.5f), (float)grng.range(0.9, 1.1));
        }
    }
    // lost contact (we warped away)
    size_t before = enemies.size();
    enemies.erase(std::remove_if(enemies.begin(), enemies.end(), [](const Enemy& e) { return Vector3Length(e.pos) > 60000; }),
                  enemies.end());
    if (before > 0 && enemies.empty()) msg("Hostiles left behind");
}

void Game::updateBolts(float dt) {
    Vector3 pv = ship.drive == DRIVE_WARP ? ship.velocity().f() : ship.vel;
    for (auto& b : bolts) {
        Vector3 old = b.pos;
        b.pos = Vector3Add(b.pos, Vector3Scale(Vector3Subtract(b.vel, pv), dt));
        b.life -= dt;
        if (b.life <= 0) continue;
        if (b.fromPlayer) {
            for (auto& e : enemies) {
                if (e.hp <= 0) continue;
                if (segSphere(old, b.pos, e.pos, e.radius() * 1.15f)) {
                    e.hp -= b.damage;
                    e.hitFlash = 1;
                    b.life = 0;
                    for (int k = 0; k < 6; k++) {
                        Vector3 d = Vector3Scale(grng.unitVec().f(), (float)grng.range(60, 200));
                        parts.push_back({b.pos, Vector3Add(e.vel, d), 0.35f, 0.35f, 0.6f, 0.2f, {2, 5, 3, 1}, {0.2f, 1, 0.5f, 0},
                                         SH_GLOW, 2, 0.04f});
                    }
                    parts.push_back({b.pos, e.vel, 0.12f, 0.12f, 6, 10, {2, 4, 2.5f, 1}, {0, 0, 0, 0}, SH_GLOW, 0, 0});
                    audio.play(SFX_HIT, 0.25f, (float)grng.range(1.2, 1.6));
                    break;
                }
            }
        } else if (ship.alive) {
            if (segSphere(old, b.pos, {0, 0, 0}, 9.5f)) {
                b.life = 0;
                damagePlayer(b.damage, b.pos);
            }
        }
    }
    bolts.erase(std::remove_if(bolts.begin(), bolts.end(), [](const Bolt& b) { return b.life <= 0; }), bolts.end());
    // destroyed enemies
    for (size_t i = 0; i < enemies.size();) {
        if (enemies[i].hp <= 0) {
            Enemy& e = enemies[i];
            float sc = e.kind == EK_WARDEN ? 2.2f : (e.kind == EK_RAIDER ? 1.3f : 1.0f);
            explode(e.pos, sc, e.vel);
            kills++;
            msg(fmt("%s destroyed", ESTATS[e.kind].name), {255, 200, 120, 255});
            if (e.id == targetId) { targetId = 0; target = -1; locked = false; }
            enemies.erase(enemies.begin() + i);
        } else i++;
    }
}

void Game::updateParticles(float dt) {
    Vector3 pv = ship.drive == DRIVE_WARP ? ship.velocity().f() : ship.vel;
    for (auto& p : parts) {
        p.pos = Vector3Add(p.pos, Vector3Scale(Vector3Subtract(p.vel, pv), dt));
        p.vel = Vector3Scale(p.vel, expf(-p.drag * dt));
        p.life -= dt;
    }
    parts.erase(std::remove_if(parts.begin(), parts.end(), [](const Particle& p) { return p.life <= 0 || Vector3Length(p.pos) > 80000; }),
                parts.end());
    // space dust wraps around the ship
    if (ship.drive == DRIVE_IMPULSE) {
        for (auto& d : dust) {
            d = Vector3Subtract(d, Vector3Scale(pv, dt));
            for (int k = 0; k < 3; k++) {
                float* c = k == 0 ? &d.x : (k == 1 ? &d.y : &d.z);
                if (*c > 150) *c -= 300;
                if (*c < -150) *c += 300;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
void Game::updateCamera(float dt) {
    Quaternion look = QuaternionMultiply(QuaternionFromAxisAngle({0, 1, 0}, lookYaw), QuaternionFromAxisAngle({1, 0, 0}, lookPitch));
    float warpK = warpVisual;
    if (camMode == CAM_CHASE) {
        camQ = QuaternionSlerp(camQ, ship.q, clampf(dt * 5.0f, 0, 1));
        Quaternion q = QuaternionNormalize(QuaternionMultiply(camQ, look));
        Vector3 off = {0, 6.5f + warpK * 1.0f, 27.f + warpK * 8.f + (ship.boost ? 3.f : 0.f)};
        camPos = Vector3RotateByQuaternion(off, q);
        cineAngle = 0;
        viewQ = q;
    } else if (camMode == CAM_COCKPIT) {
        camQ = ship.q;
        viewQ = QuaternionNormalize(QuaternionMultiply(ship.q, look));
        camPos = Vector3RotateByQuaternion({0, 1.2f, -5.2f}, ship.q);
    } else {
        cineAngle += dt * (ship.drive == DRIVE_WARP ? 0.05f : 0.11f);
        float a = cineAngle;
        float R = 48 + 10 * sinf(a * 0.37f);
        Vector3 local;
        if (ship.drive == DRIVE_WARP || ship.spool > 0)
            local = {sinf(a * 2.1f) * 16.f, 7.f + 3.f * sinf(a * 1.3f), 34.f};  // behind: see the stars rushing at us
        else if (autoMode && tour == TOUR_SIGHTSEE) {
            float b = 0.75f * sinf(a * 1.7f);   // swing across the rear arc: destination stays in view
            local = {sinf(b) * R, 9.f + 6.f * sinf(a * 0.9f), cosf(b) * R};
        }
        else
            local = {sinf(a) * R, 8.f + 12.f * sinf(a * 0.61f), cosf(a) * R};
        camQ = QuaternionSlerp(camQ, ship.q, clampf(dt * 2.0f, 0, 1));
        Vector3 target = Vector3RotateByQuaternion({0, 0, -6}, camQ);
        Vector3 desiredPos = Vector3RotateByQuaternion(local, camQ);
        camPos = Vector3Lerp(camPos, desiredPos, clampf(dt * 3.0f, 0, 1));
        Vector3 up = Vector3RotateByQuaternion({0, 1, 0}, camQ);
        Matrix v = MatrixLookAt(camPos, target, up);
        Quaternion q = QuaternionInvert(QuaternionFromMatrix(v));
        viewQ = QuaternionNormalize(QuaternionMultiply(q, look));
    }
    // camera shake
    shake = std::max(0.f, shake - dt * 1.8f);
    float sk = std::min(shake, 1.2f) * 0.012f + warpK * 0.0015f;
    if (sk > 0) {
        Quaternion jq = QuaternionFromEuler((float)grng.range(-1, 1) * sk, (float)grng.range(-1, 1) * sk, (float)grng.range(-1, 1) * sk);
        viewQ = QuaternionNormalize(QuaternionMultiply(viewQ, jq));
    }
    float targetFov = 62 + warpK * 16 + (ship.boost && ship.drive == DRIVE_IMPULSE ? 5 : 0);
    fov = lerpf(fov, targetFov, clampf(dt * 2.5f, 0, 1));
}

// ---------------------------------------------------------------------------
void Game::update(float dt) {
    frame++;
    handleInput(dt);
    if (paused) return;
    time += dt;

    if (!(autoMode && tour == TOUR_COMBAT)) updateTravel(dt);
    if (autoMode) updateTour(dt);
    updateShip(dt);
    U.update(dt, cameraUPos());

    updateTargeting(dt);
    if (autoMode) {
        if (locked && target >= 0 && Vector3Length(enemies[target].pos) < 2700) fireGuns(true);
    } else if (IsKeyDown(KEY_SPACE) || IsMouseButtonDown(MOUSE_BUTTON_LEFT)) {
        fireGuns(false);
    }
    updateEnemies(dt);
    updateBolts(dt);
    updateParticles(dt);

    // encounters
    if (ambushTimer > 0) {
        ambushTimer -= dt;
        if (ambushTimer <= 0 && ship.alive && ship.drive == DRIVE_IMPULSE) spawnWave(grng.irange(2, 5));
    }
    if (!autoMode && ship.drive == DRIVE_IMPULSE && enemies.empty() && ship.alive) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
            spawnWave(grng.irange(2, 5));
            spawnTimer = (float)grng.range(50, 100);
        }
    }

    float wv = 0;
    if (ship.drive == DRIVE_WARP) wv = clampf((float)(ship.warpLevel + 2.0) / 6.0f, 0.0f, 1.0f);
    else if (ship.spool > 0) wv = 0.12f * (1 - ship.spool / 1.3f);
    warpVisual = lerpf(warpVisual, wv, clampf(dt * 3, 0, 1));
    damageFx = std::max(0.f, damageFx - dt * 1.5f);
    updateCamera(dt);

    audio.setEngine(ship.drive == DRIVE_IMPULSE ? ship.throttle : 1.0f, warpVisual, ship.boost ? 1.f : 0.f, ship.alive ? 1.f : 0.3f);
    for (auto& m : msgs) m.t += dt;
    msgs.erase(std::remove_if(msgs.begin(), msgs.end(), [](const Message& m) { return m.t > 7; }), msgs.end());
}
