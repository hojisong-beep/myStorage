// render.cpp - draws the universe, ships and effects
#include "render.h"
#include "shaders.h"

// ---------------------------------------------------------------------------
void ShaderBox::load(const char* vs, const char* fs) {
    sh = LoadShaderFromMemory(vs, fs);
    mat = LoadMaterialDefault();
    mat.shader = sh;
}
void ShaderBox::set(const char* n, float v) const { SetShaderValue(sh, loc(n), &v, SHADER_UNIFORM_FLOAT); }
void ShaderBox::set(const char* n, Vector2 v) const { SetShaderValue(sh, loc(n), &v, SHADER_UNIFORM_VEC2); }
void ShaderBox::set(const char* n, Vector3 v) const { SetShaderValue(sh, loc(n), &v, SHADER_UNIFORM_VEC3); }
void ShaderBox::set(const char* n, int v) const { SetShaderValue(sh, loc(n), &v, SHADER_UNIFORM_INT); }
void ShaderBox::setMat(const char* n, const Matrix& m) const { SetShaderValueMatrix(sh, loc(n), m); }

static Vector4 V4(Vector3 c, float a) { return {c.x, c.y, c.z, a}; }
static double mix01(double a, double b, double t) { return a + (b - a) * t; }

// ---------------------------------------------------------------------------
// Procedural ship models
// ---------------------------------------------------------------------------
static void plate(MeshBuilder& mb, const std::vector<Vector3>& o, Vector3 thickDir, float thick, Color col, float emis = 0) {
    int n = (int)o.size();
    Vector3 cen = {0, 0, 0};
    for (auto& p : o) cen = Vector3Add(cen, p);
    cen = Vector3Scale(cen, 1.f / n);
    Vector3 h = Vector3Scale(Vector3Normalize(thickDir), thick * 0.5f);
    std::vector<Vector3> a(n), b(n);
    for (int i = 0; i < n; i++) { a[i] = Vector3Add(o[i], h); b[i] = Vector3Subtract(o[i], h); }
    for (int i = 1; i + 1 < n; i++) {
        mb.tri(a[0], a[i], a[i + 1], col, emis, cen);
        mb.tri(b[0], b[i], b[i + 1], col, emis, cen);
    }
    for (int i = 0; i < n; i++) {
        int j = (i + 1) % n;
        mb.quad(a[i], a[j], b[j], b[i], col, emis, cen);
    }
}

void Renderer::buildShips() {
    // --- player: "Aurora" ---------------------------------------------------
    {
        MeshBuilder mb;
        Color hull = {205, 210, 220, 255}, dark = {55, 60, 72, 255}, accent = {40, 110, 215, 255};
        Color glow = {120, 220, 255, 255}, orange = {235, 140, 45, 255}, metal = {140, 145, 155, 255};
        // right side parts (mirrored below)
        mb.slab({{1.4f, -2.5f}, {8.9f, 2.6f}, {8.9f, 5.0f}, {1.4f, 6.6f}}, -0.25f, 0.42f, hull);
        mb.slab({{3.0f, 0.2f}, {8.4f, 3.6f}, {8.4f, 4.2f}, {3.0f, 1.3f}}, 0.0f, 0.1f, accent, 0.9f);
        mb.slab({{8.9f, 2.6f}, {9.4f, 3.0f}, {9.4f, 4.9f}, {8.9f, 5.0f}}, -0.25f, 0.35f, orange, 0.25f);
        mb.loft({{-6.0f, 0.03f, 0.03f, 8.7f, -0.3f}, {-4.6f, 0.28f, 0.28f, 8.7f, -0.3f}, {2.5f, 0.34f, 0.34f, 8.7f, -0.3f},
                 {3.4f, 0.25f, 0.25f, 8.7f, -0.3f}}, 6, metal);
        mb.loft({{0.5f, 0.55f, 0.55f, 2.9f, -0.35f}, {2.0f, 0.95f, 0.85f, 2.9f, -0.35f}, {8.2f, 0.95f, 0.85f, 2.9f, -0.35f},
                 {9.3f, 0.8f, 0.72f, 2.9f, -0.35f}}, 10, dark, 0, 0, true, false);
        mb.loft({{9.3f, 0.8f, 0.72f, 2.9f, -0.35f}, {9.5f, 0.66f, 0.6f, 2.9f, -0.35f}}, 10, glow, 2.5f, 0, false, true, glow, 3.0f);
        mb.box({2.9f, 0.55f, 4.5f}, {0.3f, 0.12f, 4.5f}, accent, 0.8f);
        mb.mirrorX();
        // centre parts
        mb.loft({{-13.0f, 0.05f, 0.05f, 0, 0}, {-9.0f, 0.95f, 0.5f, 0, 0}, {-4.0f, 1.65f, 0.95f, 0, 0.1f},
                 {2.0f, 1.95f, 1.1f, 0, 0.1f}, {7.0f, 1.6f, 0.9f, 0, 0}, {8.6f, 1.25f, 0.75f, 0, 0}}, 8, hull, 0, PI / 8, false, true, dark);
        mb.loft({{-8.0f, 0.03f, 0.03f, 0, 0.62f}, {-5.8f, 0.62f, 0.42f, 0, 0.92f}, {-2.6f, 0.78f, 0.52f, 0, 1.05f},
                 {0.2f, 0.52f, 0.34f, 0, 0.92f}}, 8, {25, 45, 80, 255}, 0.35f, PI / 8);
        plate(mb, {{0, 0.9f, 3.0f}, {0, 3.4f, 7.6f}, {0, 3.4f, 9.0f}, {0, 0.9f, 8.6f}}, {1, 0, 0}, 0.22f, hull);
        plate(mb, {{0, 2.6f, 7.3f}, {0, 3.35f, 8.5f}, {0, 3.35f, 8.95f}, {0, 2.6f, 8.8f}}, {1, 0, 0}, 0.3f, orange, 0.3f);
        mb.box({0, -0.9f, -1.0f}, {1.4f, 0.35f, 6.0f}, dark);
        mb.box({0, 1.25f, 3.5f}, {0.5f, 0.2f, 3.0f}, accent, 0.6f);
        playerMesh = mb.build();
    }
    // --- enemy drone ---------------------------------------------------------
    {
        MeshBuilder mb;
        Color body = {70, 22, 28, 255}, blade = {110, 110, 118, 255}, red = {255, 60, 40, 255};
        mb.loft({{-3.2f, 0.02f, 0.02f, 0, 0}, {-1.6f, 2.2f, 2.2f, 0, 0}, {1.6f, 2.2f, 2.2f, 0, 0}, {3.0f, 0.8f, 0.8f, 0, 0}}, 6, body);
        for (int k = 0; k < 3; k++) {
            float a = PI / 2 + k * 2 * PI / 3;
            Vector3 d = {cosf(a), sinf(a), 0};
            Vector3 p0 = Vector3Scale(d, 1.8f), p1 = Vector3Scale(d, 5.6f);
            std::vector<Vector3> o = {{p0.x, p0.y, -1.6f}, {p1.x, p1.y, 0.9f}, {p1.x, p1.y, 2.2f}, {p0.x, p0.y, 1.6f}};
            Vector3 td = {-d.y, d.x, 0};
            plate(mb, o, td, 0.25f, blade);
            plate(mb, {{p1.x * 0.97f, p1.y * 0.97f, 0.9f}, {p1.x, p1.y, 0.95f}, {p1.x, p1.y, 2.1f}, {p1.x * 0.97f, p1.y * 0.97f, 2.1f}}, td, 0.3f, red, 1.5f);
        }
        mb.box({0, 0, -3.1f}, {0.8f, 0.8f, 0.4f}, red, 3.0f);
        mb.loft({{3.0f, 0.8f, 0.8f, 0, 0}, {3.2f, 0.6f, 0.6f, 0, 0}}, 6, red, 2.5f, 0, false, true, red, 3.0f);
        enemyMesh[EK_DRONE] = mb.build();
    }
    // --- enemy raider --------------------------------------------------------
    {
        MeshBuilder mb;
        Color body = {48, 30, 70, 255}, edge = {120, 100, 140, 255}, mag = {255, 60, 200, 255};
        mb.slab({{0, -8.5f}, {6.5f, 3.0f}, {3.8f, 5.2f}, {0, 3.6f}, {-3.8f, 5.2f}, {-6.5f, 3.0f}}, 0, 1.1f, body);
        mb.slab({{0, -7.0f}, {5.2f, 2.5f}, {4.6f, 3.0f}, {0, -5.0f}, {-4.6f, 3.0f}, {-5.2f, 2.5f}}, 0.6f, 0.12f, mag, 1.2f);
        mb.loft({{-4.5f, 0.02f, 0.02f, 0, 0.5f}, {-2.5f, 1.1f, 0.8f, 0, 0.8f}, {1.5f, 1.2f, 0.9f, 0, 0.8f}, {3.0f, 0.4f, 0.3f, 0, 0.6f}}, 6, edge);
        mb.box({2.3f, 0, 4.4f}, {1.2f, 0.7f, 1.2f}, edge);
        mb.box({-2.3f, 0, 4.4f}, {1.2f, 0.7f, 1.2f}, edge);
        mb.box({2.3f, 0, 5.05f}, {0.9f, 0.5f, 0.1f}, mag, 3.0f);
        mb.box({-2.3f, 0, 5.05f}, {0.9f, 0.5f, 0.1f}, mag, 3.0f);
        mb.box({4.0f, -0.1f, -2.0f}, {0.35f, 0.35f, 5.0f}, edge);
        mb.box({-4.0f, -0.1f, -2.0f}, {0.35f, 0.35f, 5.0f}, edge);
        enemyMesh[EK_RAIDER] = mb.build();
    }
    // --- enemy warden (heavy) -----------------------------------------------
    {
        MeshBuilder mb;
        Color body = {70, 68, 64, 255}, plateC = {110, 90, 70, 255}, orange = {255, 130, 30, 255};
        mb.loft({{-14.0f, 1.5f, 1.5f, 0, 0}, {-10.0f, 5.5f, 4.5f, 0, 0}, {6.0f, 6.5f, 5.0f, 0, 0}, {12.0f, 4.0f, 3.2f, 0, 0}}, 6, body, 0, PI / 6);
        for (int k = 0; k < 12; k++) {
            float a = k * 2 * PI / 12;
            Vector3 c = {cosf(a) * 10.5f, sinf(a) * 9.0f, -1.0f};
            mb.box(c, {2.8f, 2.8f, 5.0f}, plateC);
            mb.box(Vector3Add(c, {0, 0, -2.6f}), {1.4f, 1.4f, 0.2f}, orange, 1.8f);
        }
        mb.box({0, 0, -14.2f}, {2.0f, 1.0f, 0.5f}, orange, 3.0f);
        for (int k = 0; k < 3; k++) {
            float a = PI / 2 + k * 2 * PI / 3;
            Vector3 c = {cosf(a) * 2.6f, sinf(a) * 2.2f, 12.3f};
            mb.box(c, {2.0f, 2.0f, 0.4f}, orange, 3.0f);
        }
        enemyMesh[EK_WARDEN] = mb.build();
    }
}

// ---------------------------------------------------------------------------
void Renderer::init(Game& g) {
    planet.load(PLANET_VS, PLANET_FS);
    star.load(PLANET_VS, STAR_FS);
    ring.load(RING_VS, RING_FS);
    ship.load(SHIP_VS, SHIP_FS);
    sprite.load(SPRITE_VS, SPRITE_FS);
    cloud.load(CLOUD_VS, CLOUD_FS);
    impostor.load(IMPOSTOR_VS, IMPOSTOR_FS);
    stars.load(STARS_VS, STARS_FS);

    sphere = GenMeshSphere(1.0f, 96, 128);
    annulus = GenAnnulus(0.1f, 1.0f, 256);
    buildShips();

    post.init(GetScreenWidth(), GetScreenHeight());
    spritesLocal.init(12000);
    spritesFar.init(512);
    points.init(4096, QuadBatch::NORMAL | QuadBatch::COLOR, true);
    impostors.init(8000, QuadBatch::TANGENT, true);

    Universe& U = g.U;
    GenGalaxyParticles(U.galaxies[U.milkyWay], mwCloud.stars, mwCloud.dust, 150000, 45000, true);
    mwCloud.galaxy = U.milkyWay;
    mwCloud.ready = true;
    buildAtlas(U);
}

void Renderer::shutdown() {
    mwCloud.unload();
    otherCloud.unload();
    post.unloadTargets();
    UnloadRenderTexture(atlas);
}

// Render one template galaxy per atlas slot, face on, with an orthographic camera.
void Renderer::buildAtlas(Universe& U) {
    const int S = 512;
    atlas = LoadRenderTexture(S * 4, S * 2);
    BeginTextureMode(atlas);
    ClearBackground(BLACK);
    EndTextureMode();
    for (int slot = 0; slot < 8; slot++) {
        Galaxy g;
        g.pos = DVec3();
        g.radius = 1;
        g.orient = QuaternionIdentity();
        g.seed = 1000 + slot * 77;
        g.arms = 2;
        g.twist = 4;
        switch (slot) {
            case 0: g.type = GAL_SPIRAL; g.arms = 2; g.twist = 2.4f; break;
            case 1: g.type = GAL_SPIRAL; g.arms = 2; g.twist = 3.4f; break;
            case 2: g.type = GAL_SPIRAL; g.arms = 3; g.twist = 2.8f; break;
            case 3: g.type = GAL_BARRED; g.arms = 2; g.twist = 2.2f; break;
            case 4: g.type = GAL_ELLIPTICAL; break;
            case 5: g.type = GAL_LENTICULAR; break;
            case 6: g.type = GAL_IRREGULAR; break;
            default: g = U.galaxies[U.milkyWay]; g.pos = DVec3(); g.radius = 1; g.orient = QuaternionIdentity(); break;
        }
        QuadBatch st, du;
        GenGalaxyParticles(g, st, du, 45000, 14000, slot == 7);
        BeginTextureMode(atlas);
        int x = (slot % 4) * S, y = (slot / 4) * S;
        rlViewport(x, y, S, S);
        rlMatrixMode(RL_PROJECTION);
        rlPushMatrix();
        rlLoadIdentity();
        rlMultMatrixf(MatrixToFloat(MatrixOrtho(-1.1, 1.1, -1.1, 1.1, 0.01, 100.0)));
        rlMatrixMode(RL_MODELVIEW);
        rlLoadIdentity();
        rlMultMatrixf(MatrixToFloat(MatrixLookAt({0, 10, 0}, {0, 0, 0}, {0, 0, -1})));
        rlDisableDepthTest();
        cloud.setMat("galModel", MatrixIdentity());
        cloud.set("galScale", 1.0f);
        cloud.set("screenH", (float)S);
        cloud.set("minPx", 0.0f);
        cloud.set("intensity", g.type == GAL_ELLIPTICAL ? 0.025f : (g.type == GAL_LENTICULAR ? 0.07f : (g.type == GAL_IRREGULAR ? 0.1f : 0.13f)));
        cloud.set("dust", 0);
        SetBlend(BL_ADD);
        st.draw(cloud.mat);
        cloud.set("dust", 1);
        cloud.set("intensity", 0.6f);
        SetBlend(BL_MULTIPLY);
        du.draw(cloud.mat);
        SetBlend(BL_ALPHA);
        rlDrawRenderBatchActive();
        rlMatrixMode(RL_PROJECTION);
        rlPopMatrix();
        rlMatrixMode(RL_MODELVIEW);
        rlLoadIdentity();
        EndTextureMode();
        st.unload();
        du.unload();
    }
    if (getenv("CV_ATLAS")) {
        Image im = LoadImageFromTexture(atlas.texture);
        ExportImage(im, getenv("CV_ATLAS"));
        UnloadImage(im);
    }
    GenTextureMipmaps(&atlas.texture);
    SetTextureFilter(atlas.texture, TEXTURE_FILTER_TRILINEAR);
    impostor.mat.maps[MATERIAL_MAP_DIFFUSE].texture = atlas.texture;
}

// ---------------------------------------------------------------------------
// Galaxies
// ---------------------------------------------------------------------------
void Renderer::drawCloud(const Galaxy& gal, GalaxyCloud& c, const DVec3& camLy, float alpha) {
    if (!c.ready || alpha <= 0.001f) return;
    Vector3 rel = (gal.pos - camLy).f();
    Matrix m = MatrixMultiply(MatrixMultiply(MatrixScale(gal.radius, gal.radius, gal.radius), QuaternionToMatrix(gal.orient)),
                              MatrixTranslate(rel.x, rel.y, rel.z));
    cloud.setMat("galModel", m);
    cloud.set("galScale", gal.radius);
    cloud.set("screenH", (float)view.screenH);
    cloud.set("minPx", 1.6f);
    // inside a galaxy we look through a long column of the disc: expose for that
    double dr = (gal.pos - camLy).len() / gal.radius;
    float inside = (float)mix01(0.08, 1.0, clampd((dr - 0.7) / 1.3, 0, 1));
    cloud.set("intensity", 0.5f * alpha * gal.bright * inside);
    cloud.set("dust", 0);
    SetBlend(BL_ADD);
    c.stars.draw(cloud.mat);
    cloud.set("dust", 1);
    cloud.set("intensity", 0.75f * alpha);
    SetBlend(BL_MULTIPLY);
    c.dust.draw(cloud.mat);
    SetBlend(BL_ALPHA);
}

void Renderer::drawGalaxies(Game& g, const DVec3& camLy) {
    Universe& U = g.U;
    // pick the nearest non-Milky-Way galaxy for detailed particles
    int nearest = -1;
    double nd = 1e30;
    for (size_t i = 0; i < U.galaxies.size(); i++) {
        if ((int)i == U.milkyWay) continue;
        const Galaxy& gal = U.galaxies[i];
        double d = (gal.pos - camLy).len() / gal.radius;
        if (d < 5.5 && d < nd) { nd = d; nearest = (int)i; }
    }
    if (nearest != otherCloud.galaxy) {
        otherCloud.unload();
        if (nearest >= 0) {
            const Galaxy& gal = U.galaxies[nearest];
            GenGalaxyParticles(gal, otherCloud.stars, otherCloud.dust, 80000, 22000, false);
            otherCloud.galaxy = nearest;
            otherCloud.ready = true;
        }
    }

    BeginLayer(view, 1e-4, 1e10);
    rlDisableDepthTest();
    rlDisableDepthMask();
    rlDisableBackfaceCulling();

    impostors.clear();
    float ppr = view.pixelsPerRadian();
    Vector3 fwd = view.fwd;
    for (size_t i = 0; i < U.galaxies.size(); i++) {
        const Galaxy& gal = U.galaxies[i];
        DVec3 relD = gal.pos - camLy;
        double d = relD.len();
        double R = gal.radius;
        bool hasCloud = ((int)i == U.milkyWay) || ((int)i == otherCloud.galaxy);
        float cloudA = hasCloud ? 1.0f - smooth01((float)((d / R - 3.0) / 2.0)) : 0.0f;
        float impA = 1.0f - cloudA;
        if (impA <= 0.01f) continue;
        if (dot(relD, DVec3(fwd)) < -R) continue;
        Vector3 rel = relD.f();
        float px = (float)(R / d * ppr);
        int slot = gal.atlasSlot;
        float su = (slot % 4) * 0.25f, sv = (slot / 4) * 0.5f;
        float brightK = 1.1f * impA * gal.bright;
        Vector3 tint = gal.tint;
        const float minPx = 2.2f;
        auto addBillboard = [&](float sizeLy, int sl, Vector4 col) {
            float u0 = (sl % 4) * 0.25f, v0 = (sl / 4) * 0.5f;
            Vector3 r = Vector3Scale(view.right, sizeLy), u = Vector3Scale(view.up, sizeLy);
            Vector3 p[4] = {Vector3Subtract(Vector3Subtract(rel, r), u), Vector3Subtract(Vector3Add(rel, r), u),
                            Vector3Add(Vector3Add(rel, r), u), Vector3Add(Vector3Subtract(rel, r), u)};
            Vector2 t[4] = {{u0, v0}, {u0 + 0.25f, v0}, {u0 + 0.25f, v0 + 0.5f}, {u0, v0 + 0.5f}};
            int q = impostors.addQuad(p, t);
            impostors.setTangent(q, col);
        };
        if (px < minPx) {
            float k = (px / minPx) * (px / minPx);
            float size = (float)(minPx / ppr * d);
            addBillboard(size, 4, V4(Vector3Scale(tint, 1.4f * brightK * k), 1));
            continue;
        }
        if (gal.type == GAL_ELLIPTICAL) {
            addBillboard((float)R, slot, V4(Vector3Scale(tint, brightK), 1));
            continue;
        }
        // disc in its own plane
        Vector3 ax = Vector3Scale(Vector3RotateByQuaternion({1, 0, 0}, gal.orient), (float)R);
        Vector3 az = Vector3Scale(Vector3RotateByQuaternion({0, 0, 1}, gal.orient), (float)R);
        Vector3 p[4] = {Vector3Subtract(Vector3Subtract(rel, ax), az), Vector3Subtract(Vector3Add(rel, ax), az),
                        Vector3Add(Vector3Add(rel, ax), az), Vector3Add(Vector3Subtract(rel, ax), az)};
        Vector2 t[4] = {{su, sv}, {su + 0.25f, sv}, {su + 0.25f, sv + 0.5f}, {su, sv + 0.5f}};
        int q = impostors.addQuad(p, t);
        // an edge-on disc gets dimmer per area but brighter per pixel: keep it simple
        impostors.setTangent(q, V4(Vector3Scale(tint, brightK), 1));
        // soft bulge glow so edge-on galaxies keep their core
        addBillboard((float)R * 0.3f, 4, V4(Vector3Scale(tint, brightK * 0.35f), 1));
    }
    SetBlend(BL_ADD);
    impostors.upload();
    impostors.draw(impostor.mat);
    SetBlend(BL_ALPHA);

    // particle clouds
    for (GalaxyCloud* c : {&mwCloud, &otherCloud}) {
        if (!c->ready) continue;
        const Galaxy& gal = U.galaxies[c->galaxy];
        double d = (gal.pos - camLy).len() / gal.radius;
        float a = 1.0f - smooth01((float)((d - 3.0) / 2.0));
        drawCloud(gal, *c, camLy, a);
    }
    rlEnableDepthMask();
    rlEnableBackfaceCulling();
    EndLayer();
}

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------
void Renderer::drawStars(Game& g, const UPos& cam) {
    Universe& U = g.U;
    DVec3 camLy = cam.toLy();
    DVec3 v = g.ship.velocity() / LY_M;  // ly per second
    double blurT = 0.04;
    DVec3 blur = v * blurT;

    BeginLayer(view, 1e-12, 1e6);
    rlDisableDepthTest();
    rlDisableDepthMask();
    rlDisableBackfaceCulling();
    SetBlend(BL_ADD);
    stars.set("screen", Vector2{(float)view.screenW, (float)view.screenH});
    stars.set("fluxScale", 2.6f);
    stars.set("maxStreak", view.screenH * 0.45f);
    stars.set("blurVec", blur.f());
    for (auto& t : U.tiers) {
        if (t.dirty) { t.qb.upload(); t.dirty = false; }
        stars.set("camOffset", (t.anchor - camLy).f());
        stars.set("fadeR", (float)t.radius);
        t.qb.draw(stars.mat);
    }
    // exact-position points: named stars, the Sun, planets as dots of light
    points.clear();
    auto addPoint = [&](const DVec3& relLyV, float lum, Vector3 col) {
        int q = points.addCentered(relLyV.f());
        if (q < 0) return;
        points.setNormal(q, {lum, 1, 0});
        points.setColor(q, {(unsigned char)(col.x * 255), (unsigned char)(col.y * 255), (unsigned char)(col.z * 255), 255});
    };
    for (auto& n : U.named) {
        if (n.blackHole) continue;
        addPoint(n.pos - camLy, n.lum, blackbody(n.temp));
    }
    addPoint(-camLy, 1.0f, blackbody(5778));
    auto addSystem = [&](const StarSystem& s) {
        const Body& st = s.bodies[0];
        for (size_t i = 1; i < s.bodies.size(); i++) {
            const Body& b = s.bodies[i];
            DVec3 rel = relLy(s.bodyPos((int)i), cam);
            if (b.type == BT_STAR) { addPoint(rel, b.lum, blackbody(b.temp)); continue; }
            double ds = (b.rel - st.rel).len();
            double ratio = b.radius / std::max(ds, 1.0);
            float lumEff = (float)(std::max(st.lum, 1e-3f) * b.albedo * ratio * ratio * 0.25);
            Vector3 c = Vector3Lerp(b.c2, {1, 1, 1}, 0.4f);
            addPoint(rel, lumEff, c);
        }
        if (!s.isSol && st.type == BT_STAR) addPoint(relLy(s.bodyPos(0), cam), st.lum, blackbody(st.temp));
    };
    if (camLy.len() < 2.0) addSystem(U.sol);
    if (U.local) addSystem(*U.local);
    points.upload();
    stars.set("camOffset", Vector3{0, 0, 0});
    stars.set("fadeR", 0.0f);
    points.draw(stars.mat);
    SetBlend(BL_ALPHA);
    rlEnableDepthMask();
    rlEnableBackfaceCulling();
    EndLayer();
}

// ---------------------------------------------------------------------------
// Orbit lines
// ---------------------------------------------------------------------------
void Renderer::drawOrbits(Game& g, const UPos& cam) {
    if (!g.showOrbits) return;
    Universe& U = g.U;
    auto drawSys = [&](const StarSystem& s, Color col) {
        DVec3 starRel = relM(s.bodyPos(0), cam);
        if (starRel.len() > 0.02 * LY_M) return;
        BeginLayer(view, 1e-7, 1e4);
        rlDisableDepthTest();
        for (size_t i = 1; i < s.bodies.size(); i++) {
            const Body& b = s.bodies[i];
            if (b.type == BT_STAR && s.bodies[0].type == BT_BLACKHOLE) continue;
            DVec3 centre = b.parent >= 0 ? relM(s.bodyPos(b.parent), cam) : starRel;
            // moons only when close to their planet
            if (b.parent >= 0 && centre.len() > b.orbitR * 30) continue;
            // the orbit we are sitting on would just be a line through the screen
            if (relM(s.bodyPos((int)i), cam).len() < b.orbitR * 0.03) continue;
            double ci = std::cos(b.incl), si = std::sin(b.incl);
            const int N = 360;
            Vector3 prev{};
            Color c = b.parent >= 0 ? Color{col.r, col.g, col.b, (unsigned char)(col.a / 2)} : col;
            for (int k = 0; k <= N; k++) {
                double a = 2 * PI_D * k / N;
                DVec3 p = centre + s.ex * (std::cos(a) * b.orbitR) + (s.ey * ci + s.en * si) * (std::sin(a) * b.orbitR);
                Vector3 pv = (p / AU_M).f();
                if (k > 0) DrawLine3D(prev, pv, c);
                prev = pv;
            }
        }
        EndLayer();
    };
    drawSys(U.sol, {70, 110, 170, 80});
    if (U.local) drawSys(*U.local, {150, 110, 70, 110});
}

// ---------------------------------------------------------------------------
// Planets, moons, stars, black holes
// ---------------------------------------------------------------------------
struct BodyDraw { const StarSystem* sys; int idx; DVec3 rel; double d; };

void Renderer::drawBodies(Game& g, const UPos& cam) {
    Universe& U = g.U;
    std::vector<BodyDraw> list;
    float ppr = view.pixelsPerRadian();
    auto collect = [&](const StarSystem& s) {
        for (size_t i = 0; i < s.bodies.size(); i++) {
            const Body& b = s.bodies[i];
            DVec3 rel = relM(s.bodyPos((int)i), cam);
            double d = rel.len();
            double px = b.radius / d * ppr;
            bool isStar = b.type == BT_STAR || b.type == BT_BLACKHOLE;
            if (px < 0.35 && !(isStar && d < 3 * LY_M)) continue;
            list.push_back({&s, (int)i, rel, d});
        }
    };
    if (cam.toLy().len() < 3.0) collect(U.sol);
    if (U.local) collect(*U.local);
    std::sort(list.begin(), list.end(), [](const BodyDraw& a, const BodyDraw& b) { return a.d > b.d; });

    for (auto& bd : list) {
        const StarSystem& s = *bd.sys;
        const Body& b = s.bodies[bd.idx];
        const Body& st = s.bodies[0];
        double k = 1000.0 / bd.d;
        Vector3 c = (bd.rel * k).f();
        float Rs = (float)(b.radius * k);
        float extent = Rs;
        if (b.rings) extent = Rs * b.ringOuter;
        if (b.accretion) extent = Rs * b.ringOuter;
        extent *= 1.05f;
        // clip range from the view-space depth of the centre (not its distance)
        double zc = c.x * view.fwd.x + c.y * view.fwd.y + c.z * view.fwd.z;
        double nearP = std::max(zc - extent, 0.02);
        double farP = std::max(zc + extent, nearP + 1.0);
        float px = (float)(b.radius / bd.d * ppr);
        BeginLayer(view, nearP, farP);
        GfxClearDepth();
        rlEnableDepthTest();
        rlEnableDepthMask();
        Matrix model = MatrixMultiply(MatrixMultiply(MatrixScale(Rs, Rs, Rs), b.rot), MatrixTranslate(c.x, c.y, c.z));
        Vector3 starCol = blackbody(b.type == BT_STAR ? b.temp : st.temp);

        // light from the system's star
        DVec3 toStar = st.rel - b.rel;
        Vector3 L = toStar.len() > 0 ? toStar.norm().f() : Vector3{0, 1, 0};
        double dsAU = std::max(toStar.len() / AU_M, 1e-3);
        float Li = (float)clampd(1.7 * std::pow(std::max((double)st.lum, 1e-4), 0.35) * std::pow(1.0 / dsAU, 0.4), 0.22, 3.5);
        if (st.type == BT_BLACKHOLE) Li = 1.2f, starCol = {1.0f, 0.8f, 0.6f};
        Vector3 lightCol = Vector3Scale(Vector3Lerp(starCol, {1, 1, 1}, 0.3f), Li);

        bool drawSphere = px > 0.5f;
        if (b.type == BT_STAR) {
            if (drawSphere) {
                star.set("starCol", starCol);
                star.set("intensity", 3.5f);
                star.set("time", time);
                star.set("seed", b.seed * 10);
                DrawMesh(sphere, star.mat, model);
            }
            // corona + diffraction flare (painted over by nearer bodies)
            rlDisableDepthTest();
            rlDisableDepthMask();
            spritesFar.clear();
            float pxUnit = 1000.0f / ppr;
            float glow = Rs * 1.8f + 8 * pxUnit;
            float flare = Rs * 3.0f + 60 * pxUnit * std::min(1.0f, (float)std::pow(b.lum, 0.15));
            spritesFar.add(c, glow, V4(Vector3Scale(starCol, 1.6f), 1), SH_GLOW);
            spritesFar.add(c, flare, V4(Vector3Scale(starCol, 0.9f), 1), SH_FLARE);
            SetBlend(BL_ADD);
            spritesFar.draw(sprite.mat);
            SetBlend(BL_ALPHA);
            EndLayer();
            continue;
        }
        if (drawSphere) {
            planet.set("lightDir", L);
            planet.set("lightCol", lightCol);
            planet.set("ptype", (int)b.type);
            planet.set("seed", b.seed);
            planet.set("c1", b.c1);
            planet.set("c2", b.c2);
            planet.set("c3", b.c3);
            planet.set("atmo", b.atmo);
            planet.set("atmoStrength", b.atmoStrength);
            planet.set("time", (float)std::fmod(U.simTime, 100000.0));
            planet.set("detail", clampf(px / 300.f, 0, 1));
            DrawMesh(sphere, planet.mat, model);
        }
        if ((b.rings || b.accretion) && px * (b.ringOuter) > 0.8f) {
            float outer = Rs * b.ringOuter;
            Matrix rm = MatrixMultiply(MatrixMultiply(MatrixScale(outer, outer, outer), b.rot), MatrixTranslate(c.x, c.y, c.z));
            Matrix inv = MatrixTranspose(b.rot);
            Vector3 lo = Vector3Transform(L, inv);
            ring.set("lightObj", lo);
            ring.set("lightCol", lightCol);
            ring.set("ringCol", b.ringCol);
            ring.set("innerR", b.ringInner / b.ringOuter);
            ring.set("planetR", 1.0f / b.ringOuter);
            ring.set("seed", b.seed * 13);
            ring.set("time", time);
            ring.set("emissive", b.accretion ? 1 : 0);
            rlDisableBackfaceCulling();
            rlDisableDepthMask();
            if (b.accretion) SetBlend(BL_ADD);
            DrawMesh(annulus, ring.mat, rm);
            SetBlend(BL_ALPHA);
            rlEnableDepthMask();
            rlEnableBackfaceCulling();
        }
        if (b.type == BT_BLACKHOLE) {
            rlDisableDepthTest();
            rlDisableDepthMask();
            spritesFar.clear();
            float pxUnit = 1000.0f / ppr;
            spritesFar.add(c, Rs * 1.35f + 2 * pxUnit, {3.0f, 2.2f, 1.5f, 1}, SH_RING);
            spritesFar.add(c, Rs * 30.f + 40 * pxUnit, {0.15f, 0.1f, 0.07f, 1}, SH_GLOW);
            SetBlend(BL_ADD);
            spritesFar.draw(sprite.mat);
            SetBlend(BL_ALPHA);
        }
        EndLayer();
    }
}

// ---------------------------------------------------------------------------
// Local space: ships, lasers, explosions, dust, warp effects
// ---------------------------------------------------------------------------
void Renderer::drawLocal(Game& g) {
    Universe& U = g.U;
    const Ship& sh = g.ship;
    UPos shipPos = sh.pos;

    // key light: brightest nearby star
    Vector3 L = Vector3Normalize(Vector3Add(Vector3Scale(view.up, 0.6f), Vector3Scale(view.right, -0.4f)));
    Vector3 lightCol = {0.25f, 0.28f, 0.35f};
    float bestFlux = 0;
    auto consider = [&](const StarSystem& s) {
        for (size_t i = 0; i < s.bodies.size(); i++) {
            const Body& b = s.bodies[i];
            if (b.type != BT_STAR) continue;
            DVec3 rel = relM(s.bodyPos((int)i), shipPos);
            double dau = rel.len() / AU_M;
            float flux = (float)(b.lum / std::max(dau * dau, 1e-6));
            if (flux > bestFlux) {
                bestFlux = flux;
                L = rel.norm().f();
                float Li = clampf(1.3f * powf(flux, 0.2f), 0.35f, 3.0f);
                lightCol = Vector3Scale(Vector3Lerp(blackbody(b.temp), {1, 1, 1}, 0.35f), Li);
            }
        }
    };
    if (shipPos.toLy().len() < 3) consider(U.sol);
    if (U.local) consider(*U.local);
    if (bestFlux < 1e-4f) {
        // deep space: faint galaxy light plus a rim light so the hull stays readable
        lightCol = {0.35f, 0.4f, 0.55f};
    }
    Vector3 ambient = {0.035f, 0.04f, 0.055f};

    BeginLayer(view, 0.5, 120000, g.camPos);
    GfxClearDepth();
    rlEnableDepthTest();
    rlEnableDepthMask();
    ship.set("lightDir", L);
    ship.set("lightCol", lightCol);
    ship.set("ambient", ambient);
    ship.set("viewPos", g.camPos);

    if (sh.alive && g.camMode != CAM_COCKPIT) {
        ship.set("tint", Vector3{1, 1, 1});
        ship.set("emisCol", Vector3{0.5f, 0.9f, 1.4f});
        ship.set("flash", sh.hitFlash * 0.6f);
        ship.set("emisBoost", 1.6f);
        DrawMesh(playerMesh, ship.mat, QuaternionToMatrix(sh.q));
    }
    static const Vector3 ecol[EK_COUNT] = {{3.0f, 0.5f, 0.3f}, {2.6f, 0.5f, 2.2f}, {3.0f, 1.3f, 0.3f}};
    for (auto& e : g.enemies) {
        ship.set("tint", Vector3{1, 1, 1});
        ship.set("emisCol", ecol[e.kind]);
        ship.set("flash", e.hitFlash * 1.2f);
        ship.set("emisBoost", 1.8f);
        float sc = e.spawnT > 0 ? 1.0f - e.spawnT * e.spawnT * 0.9f : 1.0f;
        Matrix m = MatrixMultiply(MatrixMultiply(MatrixScale(sc, sc, sc), QuaternionToMatrix(e.q)), MatrixTranslate(e.pos.x, e.pos.y, e.pos.z));
        DrawMesh(enemyMesh[e.kind], ship.mat, m);
    }

    // additive effects
    spritesLocal.clear();
    Vector3 pv = sh.drive == DRIVE_WARP ? sh.velocity().f() : sh.vel;
    if (sh.alive) {
        float thr = sh.drive == DRIVE_WARP ? 1.0f : (sh.boost ? 1.4f : sh.throttle);
        float flick = 0.85f + 0.15f * sinf(time * 60.f) * sinf(time * 37.f);
        Vector3 back = Vector3RotateByQuaternion({0, 0, 1}, sh.q);
        for (int s = -1; s <= 1; s += 2) {
            Vector3 ex = Vector3RotateByQuaternion({2.9f * s, -0.35f, 9.7f}, sh.q);
            float len = 1.5f + thr * 9.0f + g.warpVisual * 10.f;
            Vector3 cen = Vector3Add(ex, Vector3Scale(back, len * 0.5f));
            spritesLocal.add(cen, 0.5f + 0.2f * thr, V4(Vector3Scale({0.3f, 0.8f, 2.4f}, (0.6f + thr * 0.9f) * flick), 1), SH_GLOW, Vector3Scale(back, len));
            spritesLocal.add(ex, 0.45f, V4(Vector3Scale({1.2f, 1.8f, 2.6f}, 0.9f * flick), 1), SH_GLOW);
            spritesLocal.add(ex, 1.4f + 0.6f * thr, V4(Vector3Scale({0.1f, 0.25f, 0.7f}, 0.5f * flick), 1), SH_GLOW);
        }
        // navigation lights
        float blink = fmodf(time, 1.4f) < 0.12f ? 4.0f : 0.0f;
        spritesLocal.add(Vector3RotateByQuaternion({-9.4f, -0.2f, 4.0f}, sh.q), 0.35f, {3.0f * (blink + 0.3f), 0.2f, 0.2f, 1}, SH_GLOW);
        spritesLocal.add(Vector3RotateByQuaternion({9.4f, -0.2f, 4.0f}, sh.q), 0.35f, {0.2f, 3.0f * (blink + 0.3f), 0.4f, 1}, SH_GLOW);
    }
    for (auto& e : g.enemies) {
        Vector3 back = Vector3RotateByQuaternion({0, 0, 1}, e.q);
        float r = e.radius();
        spritesLocal.add(Vector3Add(e.pos, Vector3Scale(back, r * 0.75f)), r * 0.35f, V4(ecol[e.kind], 1), SH_GLOW, Vector3Scale(back, r * 0.8f));
    }
    for (auto& b : g.bolts) {
        Vector3 rv = Vector3Subtract(b.vel, pv);
        Vector3 dir = Vector3Normalize(rv);
        Vector4 c = b.fromPlayer ? Vector4{0.5f, 3.5f, 1.4f, 1} : Vector4{4.0f, 0.7f, 0.35f, 1};
        spritesLocal.add(b.pos, b.fromPlayer ? 0.8f : 1.0f, c, SH_LASER, Vector3Scale(dir, b.fromPlayer ? 34.f : 26.f));
    }
    for (auto& p : g.parts) {
        float t = 1.0f - p.life / p.maxLife;
        float size = lerpf(p.size0, p.size1, t);
        Vector4 c = {lerpf(p.c0.x, p.c1.x, t), lerpf(p.c0.y, p.c1.y, t), lerpf(p.c0.z, p.c1.z, t), lerpf(p.c0.w, p.c1.w, t)};
        if (p.shape == SH_RING || p.shape == SH_FLARE || p.shape == SH_DISC) c.w = 1 - t;
        Vector3 st = p.stretch > 0 ? Vector3Scale(Vector3Subtract(p.vel, pv), p.stretch) : Vector3{0, 0, 0};
        spritesLocal.add(p.pos, size, c, p.shape, st);
    }
    // space dust gives a sense of speed at sub-light
    if (sh.drive == DRIVE_IMPULSE) {
        Vector3 st = Vector3Scale(Vector3Negate(pv), 0.02f);
        for (auto& d : g.dust) {
            Vector3 rp = Vector3Subtract(d, g.camPos);
            float dist = Vector3Length(rp);
            float a = clampf(1.0f - dist / 150.f, 0, 1) * clampf(dist / 8.f, 0, 1);
            if (a <= 0.01f) continue;
            spritesLocal.add(d, 0.08f, {0.6f * a, 0.6f * a, 0.7f * a, 1}, SH_GLOW, st);
        }
    }
    // warp tunnel streaks
    if (g.warpVisual > 0.02f) {
        Vector3 f = sh.fwd(), r = sh.right(), u = sh.up();
        float w = g.warpVisual;
        for (int i = 0; i < 260; i++) {
            uint64_t h = splitmix64(i * 7919ull + 13);
            float ang = (h & 0xffff) / 65535.f * 2 * PI;
            float rad = 25 + ((h >> 16) & 0xffff) / 65535.f * 140;
            float ph = ((h >> 32) & 0xffff) / 65535.f;
            float speed = 1800 + ((h >> 48) & 0xff) * 12.f;
            float z = fmodf(ph * 1600 + time * speed * (0.4f + w), 1600.f);
            Vector3 pos = Vector3Add(Vector3Add(Vector3Scale(r, cosf(ang) * rad), Vector3Scale(u, sinf(ang) * rad)), Vector3Scale(f, 900 - z));
            float bright = w * clampf(z / 200.f, 0, 1) * clampf((1600 - z) / 300.f, 0, 1);
            Vector3 col = (h & 3) == 0 ? Vector3{2.2f, 1.6f, 1.2f} : Vector3{0.8f, 1.3f, 3.0f};
            spritesLocal.add(pos, 0.35f + w * 0.4f, V4(Vector3Scale(col, bright), 1), SH_GLOW, Vector3Scale(f, -(40 + 160 * w)));
        }
    }
    rlDisableDepthMask();
    rlDisableBackfaceCulling();
    SetBlend(BL_ADD);
    spritesLocal.draw(sprite.mat);
    SetBlend(BL_ALPHA);
    rlEnableBackfaceCulling();
    rlEnableDepthMask();
    EndLayer();
}

// ---------------------------------------------------------------------------
void Renderer::render(Game& g, float dt) {
    time += dt;
    int w = GetScreenWidth(), h = GetScreenHeight();
    if (w != post.width || h != post.height) post.resize(w, h);
    view.setup(g.viewQ, g.fov, w, h);
    UPos cam = g.cameraUPos();
    DVec3 camLy = cam.toLy();

    static int mask = getenv("CV_LAYERS") ? atoi(getenv("CV_LAYERS")) : 31;
    post.begin();
    ClearBackground(BLACK);
    if (mask & 1) drawGalaxies(g, camLy);
    if (mask & 2) drawStars(g, cam);
    if (mask & 4) drawOrbits(g, cam);
    if (mask & 8) drawBodies(g, cam);
    if (mask & 16) drawLocal(g);
    post.end();

    float exposure = 1.0f;
    post.present(exposure, 0.9f, g.warpVisual, g.damageFx, time);
}
