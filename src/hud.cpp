// hud.cpp - heads-up display, labels, radar and help
#include "hud.h"
#include <ctime>

static const Color C_HUD = {120, 220, 255, 255};
static const Color C_HUDDIM = {120, 220, 255, 140};
static const Color C_WARN = {255, 110, 90, 255};
static const Color C_GOLD = {255, 215, 110, 255};
static const Color C_GREEN = {130, 255, 170, 255};

static Color alpha(Color c, float a) { c.a = (unsigned char)(c.a * clampf(a, 0, 1)); return c; }

static void text(const std::string& s, float x, float y, float size, Color c, int align = 0) {
    Font f = GetFontDefault();
    float sp = size / 10.f;
    Vector2 m = MeasureTextEx(f, s.c_str(), size, sp);
    if (align == 1) x -= m.x * 0.5f;
    if (align == 2) x -= m.x;
    DrawTextEx(f, s.c_str(), {x + 1, y + 1}, size, sp, {0, 0, 0, (unsigned char)(c.a * 0.7f)});
    DrawTextEx(f, s.c_str(), {x, y}, size, sp, c);
}

static void bar(float x, float y, float w, float h, float v, Color c, const char* label) {
    DrawRectangle((int)x, (int)y, (int)w, (int)h, {0, 0, 0, 120});
    DrawRectangle((int)x, (int)y, (int)(w * clampf(v, 0, 1)), (int)h, c);
    DrawRectangleLines((int)x, (int)y, (int)w, (int)h, alpha(c, 0.8f));
    text(label, x, y - 16, 12, alpha(c, 0.9f));
}

static void bracket(Vector2 p, float r, Color c, float th = 2) {
    float l = r * 0.45f;
    DrawLineEx({p.x - r, p.y - r}, {p.x - r + l, p.y - r}, th, c);
    DrawLineEx({p.x - r, p.y - r}, {p.x - r, p.y - r + l}, th, c);
    DrawLineEx({p.x + r, p.y - r}, {p.x + r - l, p.y - r}, th, c);
    DrawLineEx({p.x + r, p.y - r}, {p.x + r, p.y - r + l}, th, c);
    DrawLineEx({p.x - r, p.y + r}, {p.x - r + l, p.y + r}, th, c);
    DrawLineEx({p.x - r, p.y + r}, {p.x - r, p.y + r - l}, th, c);
    DrawLineEx({p.x + r, p.y + r}, {p.x + r - l, p.y + r}, th, c);
    DrawLineEx({p.x + r, p.y + r}, {p.x + r, p.y + r - l}, th, c);
}

static void diamond(Vector2 p, float r, Color c) {
    DrawLineEx({p.x, p.y - r}, {p.x + r, p.y}, 2, c);
    DrawLineEx({p.x + r, p.y}, {p.x, p.y + r}, 2, c);
    DrawLineEx({p.x, p.y + r}, {p.x - r, p.y}, 2, c);
    DrawLineEx({p.x - r, p.y}, {p.x, p.y - r}, 2, c);
}

// arrow at the screen edge pointing toward an off-screen object
static void edgeArrow(const ViewInfo& v, Vector2 dirPt, Color c, const std::string& label) {
    Vector2 cen = {v.screenW * 0.5f, v.screenH * 0.5f};
    Vector2 d = Vector2Normalize(Vector2Subtract(dirPt, cen));
    float rx = v.screenW * 0.5f - 60, ry = v.screenH * 0.5f - 60;
    float t = std::min(fabsf(d.x) > 1e-4f ? rx / fabsf(d.x) : 1e9f, fabsf(d.y) > 1e-4f ? ry / fabsf(d.y) : 1e9f);
    Vector2 p = Vector2Add(cen, Vector2Scale(d, t));
    Vector2 n = {-d.y, d.x};
    Vector2 a = Vector2Add(p, Vector2Scale(d, 14)), b = Vector2Add(p, Vector2Scale(n, 8)), cc = Vector2Subtract(p, Vector2Scale(n, 8));
    DrawTriangle(a, cc, b, c);
    DrawTriangle(a, b, cc, c);
    if (!label.empty()) text(label, p.x - d.x * 20, p.y - d.y * 20 - 6, 12, c, 1);
}

static std::string simDate(double simTime) {
    time_t t = (time_t)(simTime + 946728000.0);
    struct tm* g = gmtime(&t);
    if (!g) return "";
    char buf[64];
    strftime(buf, sizeof buf, "%Y-%m-%d %H:%M UTC", g);
    return buf;
}

// ---------------------------------------------------------------------------
static void drawLabels(Game& g, const ViewInfo& v, const UPos& cam) {
    Universe& U = g.U;
    const std::string& navName = g.travel.active ? g.travel.target.name : U.nav[g.navSel].name;
    auto label = [&](const DVec3& rel, const std::string& name, Color c, bool dist = true) {
        if (name == navName) return;
        Vector2 p;
        if (!v.project(rel, p)) return;
        if (p.x < 0 || p.y < 0 || p.x > v.screenW || p.y > v.screenH) return;
        DrawCircleLines((int)p.x, (int)p.y, 5, alpha(c, 0.6f));
        text(name, p.x + 9, p.y - 9, 12, c);
        if (dist) text(fmtDistance(rel.len()), p.x + 9, p.y + 3, 10, alpha(c, 0.6f));
    };
    DVec3 camLy = cam.toLy();
    if (camLy.len() < 3.0) {
        for (size_t i = 0; i < U.sol.bodies.size(); i++) {
            const Body& b = U.sol.bodies[i];
            DVec3 rel = relM(U.sol.bodyPos((int)i), cam);
            if (b.parent >= 0 && rel.len() > b.orbitR * 60) continue;
            label(rel, b.name, {170, 210, 255, 210});
        }
    }
    if (U.local) {
        for (size_t i = 0; i < U.local->bodies.size(); i++) {
            const Body& b = U.local->bodies[i];
            DVec3 rel = relM(U.local->bodyPos((int)i), cam);
            if (b.parent >= 0 && rel.len() > b.orbitR * 60) continue;
            label(rel, b.name, {255, 210, 160, 210});
        }
    }
    for (auto& n : U.named) {
        DVec3 rel = (n.pos - camLy) * LY_M;
        double dly = rel.len() / LY_M;
        if (dly < 0.3 || dly > 4000) continue;
        label(rel, n.name, {255, 240, 200, 170});
    }
    if ((camLy).len() > 0.3 && camLy.len() < 4000) label(-camLy * LY_M, "Sun", {255, 240, 200, 170});
    for (size_t i = 0; i < U.galaxies.size(); i++) {
        const Galaxy& gal = U.galaxies[i];
        bool namedGal = gal.name.rfind("PGC", 0) != 0;
        DVec3 relLyV = gal.pos - camLy;
        double d = relLyV.len();
        if ((int)i == U.milkyWay && d < gal.radius * 1.3) continue;
        if (!namedGal && d > gal.radius * 25) continue;
        label(relLyV * LY_M, gal.name, {200, 180, 255, 190});
    }
}

static void drawRadar(Game& g, float cx, float cy, float R) {
    DrawCircle((int)cx, (int)cy, R, {0, 20, 30, 150});
    DrawCircleLines((int)cx, (int)cy, R, C_HUDDIM);
    DrawCircleLines((int)cx, (int)cy, R * 0.5f, alpha(C_HUDDIM, 0.5f));
    DrawLine((int)(cx - R), (int)cy, (int)(cx + R), (int)cy, alpha(C_HUDDIM, 0.3f));
    DrawLine((int)cx, (int)(cy - R), (int)cx, (int)(cy + R), alpha(C_HUDDIM, 0.3f));
    Quaternion inv = QuaternionInvert(g.ship.q);
    const float range = 5000;
    for (size_t i = 0; i < g.enemies.size(); i++) {
        Vector3 l = Vector3RotateByQuaternion(g.enemies[i].pos, inv);
        Vector2 p = {l.x, l.z};
        float d = Vector3Length(l);
        float k = std::min(d, range) / range;
        Vector2 dir = Vector2Length(p) > 1e-3f ? Vector2Normalize(p) : Vector2{0, -1};
        Vector2 s = {cx + dir.x * k * R, cy + dir.y * k * R};
        Color c = (int)i == g.target ? C_GOLD : C_WARN;
        DrawLineEx(s, {s.x, s.y - clampf(l.y / range * R, -R * 0.4f, R * 0.4f)}, 1.5f, alpha(c, 0.6f));
        DrawRectangle((int)s.x - 3, (int)s.y - 3, 6, 6, c);
    }
    DrawTriangle({cx, cy - 6}, {cx - 5, cy + 5}, {cx + 5, cy + 5}, C_HUD);
    text("RADAR 5 km", cx, cy + R + 6, 11, C_HUDDIM, 1);
}

static void drawHelp(float x, float y) {
    const char* lines[] = {
        "CONTROLS",
        "Mouse          steer (virtual stick)   Z/Mid-click: centre",
        "Arrows / A D   pitch / yaw        Q E   roll",
        "W / S, wheel   throttle  (in warp: warp factor)",
        "Shift          afterburner        X     full stop",
        "J or Tab       engage / drop warp drive",
        "Space / LMB    fire lasers (auto-aim on locked target)",
        "T              next target (auto-lock within 3.5 km)",
        "N / B          select destination   G  autopilot to it",
        "P              AUTO mode (tour + combat, no input needed)",
        "C              camera: chase / cockpit / cinematic",
        "Right mouse    look around",
        "L labels   O orbits   F2 pause   F11 fullscreen",
        "H              hide this help      Esc x2  quit",
    };
    float w = 470, h = 20.f + 17.f * (sizeof(lines) / sizeof(lines[0]));
    DrawRectangle((int)x - 10, (int)y - 10, (int)w, (int)h, {0, 10, 20, 170});
    DrawRectangleLines((int)x - 10, (int)y - 10, (int)w, (int)h, C_HUDDIM);
    for (size_t i = 0; i < sizeof(lines) / sizeof(lines[0]); i++)
        text(lines[i], x, y + i * 17.f, i == 0 ? 14.f : 12.f, i == 0 ? C_GOLD : C_HUD);
}

void DrawHUD(Game& g, const Renderer& r) {
    const ViewInfo& v = r.view;
    int W = v.screenW, H = v.screenH;
    UPos cam = g.cameraUPos();
    Universe& U = g.U;
    const Ship& sh = g.ship;

    if (g.showLabels) drawLabels(g, v, cam);

    // navigation target
    if (!U.nav.empty()) {
        const NavTarget& nt = g.travel.active ? g.travel.target : U.nav[g.navSel];
        DVec3 rel = relM(U.navPos(nt), cam);
        Vector2 p;
        Color c = g.travel.active ? C_GREEN : C_GOLD;
        if (v.project(rel, p) && p.x > 0 && p.y > 0 && p.x < W && p.y < H) {
            diamond(p, 11, c);
            text(nt.name, p.x, p.y + 14, 13, c, 1);
            text(fmtDistance(rel.len()), p.x, p.y + 29, 11, alpha(c, 0.8f), 1);
        } else {
            edgeArrow(v, p, c, nt.name);
        }
    }

    // flight path marker and crosshair
    Vector2 cen = {W * 0.5f, H * 0.5f};
    if (sh.alive) {
        Vector2 fp;
        DVec3 fwdRel = DVec3(Vector3Subtract(Vector3Scale(sh.fwd(), 3000), g.camPos));
        if (v.project(fwdRel, fp)) {
            DrawCircleLines((int)fp.x, (int)fp.y, 9, C_HUD);
            DrawLineEx({fp.x - 20, fp.y}, {fp.x - 11, fp.y}, 2, C_HUD);
            DrawLineEx({fp.x + 11, fp.y}, {fp.x + 20, fp.y}, 2, C_HUD);
            DrawLineEx({fp.x, fp.y - 11}, {fp.x, fp.y - 17}, 2, C_HUD);
        }
        if (!g.autoMode && IsCursorHidden()) {
            Vector2 sp = {cen.x + g.stick.x * 160, cen.y + g.stick.y * 160};
            DrawCircleLines((int)cen.x, (int)cen.y, 160, alpha(C_HUDDIM, 0.15f));
            DrawLineEx(cen, sp, 1, alpha(C_HUDDIM, 0.3f));
            DrawCircle((int)sp.x, (int)sp.y, 3, C_HUD);
        }
    }

    // enemies
    for (size_t i = 0; i < g.enemies.size(); i++) {
        const Enemy& e = g.enemies[i];
        DVec3 rel = DVec3(Vector3Subtract(e.pos, g.camPos));
        Vector2 p;
        bool on = v.project(rel, p) && p.x > 0 && p.y > 0 && p.x < W && p.y < H;
        bool isT = (int)i == g.target;
        float d = Vector3Length(e.pos);
        Color c = isT ? (g.locked ? C_WARN : C_GOLD) : alpha(C_WARN, 0.75f);
        if (on) {
            float rr = std::max(10.f, e.radius() / (float)rel.len() * v.pixelsPerRadian() * 1.4f);
            if (isT) {
                float anim = g.locked ? 0 : (1 - clampf(g.lockT / 0.5f, 0, 1)) * 30;
                bracket(p, rr + 4 + anim, c, 2);
                text(g.locked ? "LOCKED" : "LOCKING", p.x, p.y - rr - 24, 12, c, 1);
                text(fmtDistance(d), p.x, p.y + rr + 8, 11, c, 1);
                float hp = e.hp / e.maxHp;
                DrawRectangle((int)(p.x - 20), (int)(p.y + rr + 22), 40, 4, {0, 0, 0, 150});
                DrawRectangle((int)(p.x - 20), (int)(p.y + rr + 22), (int)(40 * hp), 4, c);
            } else {
                DrawCircleLines((int)p.x, (int)p.y, rr, c);
            }
        } else if (isT || d < LOCK_RANGE) {
            edgeArrow(v, p, c, isT ? fmtDistance(d) : "");
        }
    }
    if (g.locked && g.target >= 0) {
        Vector2 lp;
        if (v.project(DVec3(Vector3Subtract(g.leadPoint, g.camPos)), lp)) {
            DrawCircleLines((int)lp.x, (int)lp.y, 6, C_GREEN);
            DrawCircle((int)lp.x, (int)lp.y, 2, C_GREEN);
        }
    }

    // --- top left: location ---
    text(U.regionName(cam), 20, 16, 20, C_HUD);
    text(simDate(U.simTime), 20, 42, 12, C_HUDDIM);
    double dSun = cam.toLy().len();
    text("Distance from Sun: " + fmtDistance(dSun * LY_M), 20, 58, 12, C_HUDDIM);

    // --- top centre: mode ---
    if (g.autoMode) {
        float pulse = 0.7f + 0.3f * sinf((float)g.time * 3);
        text("AUTO", W * 0.5f, 14, 24, alpha(C_GREEN, pulse), 1);
        text(g.tourStatus, W * 0.5f, 42, 14, C_GREEN, 1);
        text("P: take manual control", W * 0.5f, 60, 11, alpha(C_GREEN, 0.6f), 1);
    } else if (g.travel.active) {
        text("AUTOPILOT", W * 0.5f, 14, 20, C_GREEN, 1);
        text("-> " + g.travel.target.name, W * 0.5f, 38, 13, C_GREEN, 1);
    }
    if (g.paused) text("PAUSED", W * 0.5f, H * 0.35f, 40, C_GOLD, 1);

    // --- top right: destination panel ---
    if (!U.nav.empty()) {
        const NavTarget& nt = g.travel.active ? g.travel.target : U.nav[g.navSel];
        double dist = relM(U.navPos(nt), cam).len();
        float x = W - 20.f;
        text("DESTINATION  (N/B select, G go)", x, 16, 11, C_HUDDIM, 2);
        text(nt.name, x, 30, 18, C_GOLD, 2);
        text(U.navDescription(nt), x, 52, 11, C_HUDDIM, 2);
        text(fmtDistance(dist), x, 66, 14, C_HUD, 2);
        double sp = sh.speed();
        if (sp > 1) {
            double eta = dist / sp;
            std::string e = eta < 120 ? fmt("%.0f s", eta) : eta < 7200 ? fmt("%.0f min", eta / 60) : eta < 86400 * 365 ? fmt("%.1f h", eta / 3600) : fmt("%.2g years", eta / (86400 * 365.25));
            text("time at current speed: " + e, x, 84, 11, C_HUDDIM, 2);
        }
    }

    // --- bottom centre: speed ---
    {
        float y = H - 92.f;
        std::string mode = sh.drive == DRIVE_WARP ? "WARP DRIVE" : (sh.spool > 0 ? "WARP CHARGING" : (sh.boost ? "AFTERBURNER" : "IMPULSE"));
        Color mc = sh.drive == DRIVE_WARP ? Color{170, 150, 255, 255} : (sh.spool > 0 ? C_GOLD : C_HUD);
        text(mode, W * 0.5f, y, 13, mc, 1);
        text(fmtSpeed(sh.speed()), W * 0.5f, y + 16, 26, mc, 1);
        float bw = 360, bx = W * 0.5f - bw * 0.5f, by = y + 50;
        DrawRectangle((int)bx, (int)by, (int)bw, 8, {0, 0, 0, 130});
        if (sh.drive == DRIVE_WARP) {
            auto pos = [&](double lvl) { return bx + (float)((lvl - WARP_MIN_LEVEL) / (WARP_MAX_LEVEL - WARP_MIN_LEVEL)) * bw; };
            DrawRectangle((int)bx, (int)by, (int)(pos(sh.warpLevel) - bx), 8, mc);
            DrawRectangle((int)pos(sh.warpTarget) - 1, (int)by - 4, 3, 16, C_GOLD);
            struct { double lvl; const char* s; } ticks[] = {{0, "c"}, {3, "1000c"}, {std::log10(LY_M / C_MS), "1 ly/s"}, {std::log10(1e3 * LY_M / C_MS), "1 kly/s"}, {std::log10(1e6 * LY_M / C_MS), "1 Mly/s"}};
            for (auto& t : ticks) {
                float tx = pos(t.lvl);
                DrawLine((int)tx, (int)by - 2, (int)tx, (int)by + 10, alpha(C_HUD, 0.6f));
                text(t.s, tx, by + 12, 10, C_HUDDIM, 1);
            }
        } else {
            float v = sh.boost ? 1.0f : sh.throttle;
            DrawRectangle((int)bx, (int)by, (int)(bw * v), 8, mc);
            text("THROTTLE", bx, by + 12, 10, C_HUDDIM);
        }
        if (sh.spool > 0) {
            float k = 1 - sh.spool / 1.3f;
            DrawRectangle((int)bx, (int)by - 12, (int)(bw * k), 3, C_GOLD);
        }
    }

    // --- bottom left: ship status ---
    {
        float x = 24, y = H - 110.f;
        bar(x, y, 220, 10, sh.shield / 100.f, {90, 180, 255, 255}, "SHIELDS");
        bar(x, y + 32, 220, 10, sh.hull / 100.f, sh.hull < 30 ? C_WARN : Color{150, 255, 170, 255}, "HULL");
        text(fmt("Kills %d   Losses %d", g.kills, g.deaths), x, y + 54, 12, C_HUDDIM);
        if (!sh.alive) text(fmt("Rebuilding ship... %.0f", std::max(0.f, sh.respawn)), W * 0.5f, H * 0.42f, 26, C_WARN, 1);
    }

    // --- bottom right: radar ---
    drawRadar(g, W - 110.f, H - 120.f, 85);

    // --- messages ---
    float my = 100;
    for (auto& m : g.msgs) {
        float a = m.t < 5 ? 1.f : 1.f - (m.t - 5) / 2.f;
        text(m.text, 20, my, 14, alpha(m.col, a));
        my += 20;
    }

    if (g.showHelp) drawHelp(W - 480.f, 120.f);
    if (g.camMode == CAM_COCKPIT) {
        DrawRectangleGradientV(0, H - 60, W, 60, {0, 0, 0, 0}, {10, 20, 30, 200});
        DrawLineEx({0, (float)H - 40}, {W * 0.3f, (float)H - 60}, 3, {60, 80, 100, 200});
        DrawLineEx({(float)W, (float)H - 40}, {W * 0.7f, (float)H - 60}, 3, {60, 80, 100, 200});
    }
    text(fmt("%d FPS", GetFPS()), W - 70.f, H - 18.f, 10, alpha(C_HUDDIM, 0.6f));
}
