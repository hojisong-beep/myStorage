// gfx.cpp - low level rendering helpers
#include "gfx.h"
#include "shaders.h"

#if defined(GRAPHICS_API_OPENGL_ES2)
#error "desktop OpenGL 3.3 required"
#endif
#include "external/glad.h"   // declarations only; raylib provides the loader

void GfxClearDepth() {
    rlDrawRenderBatchActive();
    glClear(GL_DEPTH_BUFFER_BIT);
}

// ---------------------------------------------------------------------------
// QuadBatch
// ---------------------------------------------------------------------------
void QuadBatch::init(int maxQuads, unsigned attribFlags, bool isDynamic) {
    capacity = maxQuads;
    flags = attribFlags;
    dynamic = isDynamic;
    count = 0;
    int nv = maxQuads * 4;
    pos.assign(nv * 3, 0.f);
    uv.assign(nv * 2, 0.f);
    if (flags & NORMAL) nrm.assign(nv * 3, 0.f);
    if (flags & COLOR) col.assign(nv * 4, 255);
    if (flags & TEX2) uv2.assign(nv * 2, 0.f);
    if (flags & TANGENT) tan.assign(nv * 4, 0.f);

    int chunks = (maxQuads + CHUNK - 1) / CHUNK;
    for (int ci = 0; ci < chunks; ci++) {
        int q = std::min(CHUNK, maxQuads - ci * CHUNK);
        Mesh m = {0};
        m.vertexCount = q * 4;
        m.triangleCount = q * 2;
        m.vertices = (float*)MemAlloc(m.vertexCount * 3 * sizeof(float));
        m.texcoords = (float*)MemAlloc(m.vertexCount * 2 * sizeof(float));
        if (flags & NORMAL) m.normals = (float*)MemAlloc(m.vertexCount * 3 * sizeof(float));
        if (flags & COLOR) m.colors = (unsigned char*)MemAlloc(m.vertexCount * 4);
        if (flags & TEX2) m.texcoords2 = (float*)MemAlloc(m.vertexCount * 2 * sizeof(float));
        if (flags & TANGENT) m.tangents = (float*)MemAlloc(m.vertexCount * 4 * sizeof(float));
        m.indices = (unsigned short*)MemAlloc(q * 6 * sizeof(unsigned short));
        for (int i = 0; i < q; i++) {
            unsigned short b = (unsigned short)(i * 4);
            m.indices[i * 6 + 0] = b; m.indices[i * 6 + 1] = b + 1; m.indices[i * 6 + 2] = b + 2;
            m.indices[i * 6 + 3] = b; m.indices[i * 6 + 4] = b + 2; m.indices[i * 6 + 5] = b + 3;
        }
        UploadMesh(&m, dynamic);
        meshes.push_back(m);
    }
}

void QuadBatch::unload() {
    for (auto& m : meshes) UnloadMesh(m);
    meshes.clear();
}

int QuadBatch::addCentered(Vector3 c) {
    if (count >= capacity) return -1;
    int q = count++;
    static const float corners[8] = {-1, -1, 1, -1, 1, 1, -1, 1};
    for (int k = 0; k < 4; k++) {
        int vi = q * 4 + k;
        pos[vi * 3 + 0] = c.x; pos[vi * 3 + 1] = c.y; pos[vi * 3 + 2] = c.z;
        uv[vi * 2 + 0] = corners[k * 2]; uv[vi * 2 + 1] = corners[k * 2 + 1];
    }
    return q;
}

int QuadBatch::addQuad(const Vector3 p[4], const Vector2 t[4]) {
    if (count >= capacity) return -1;
    int q = count++;
    for (int k = 0; k < 4; k++) {
        int vi = q * 4 + k;
        pos[vi * 3 + 0] = p[k].x; pos[vi * 3 + 1] = p[k].y; pos[vi * 3 + 2] = p[k].z;
        uv[vi * 2 + 0] = t[k].x; uv[vi * 2 + 1] = t[k].y;
    }
    return q;
}

void QuadBatch::setNormal(int q, Vector3 n) {
    if (q < 0) return;
    for (int k = 0; k < 4; k++) { int vi = (q * 4 + k) * 3; nrm[vi] = n.x; nrm[vi + 1] = n.y; nrm[vi + 2] = n.z; }
}
void QuadBatch::setColor(int q, Color c) {
    if (q < 0) return;
    for (int k = 0; k < 4; k++) { int vi = (q * 4 + k) * 4; col[vi] = c.r; col[vi + 1] = c.g; col[vi + 2] = c.b; col[vi + 3] = c.a; }
}
void QuadBatch::setTex2(int q, Vector2 t) {
    if (q < 0) return;
    for (int k = 0; k < 4; k++) { int vi = (q * 4 + k) * 2; uv2[vi] = t.x; uv2[vi + 1] = t.y; }
}
void QuadBatch::setTangent(int q, Vector4 t) {
    if (q < 0) return;
    for (int k = 0; k < 4; k++) { int vi = (q * 4 + k) * 4; tan[vi] = t.x; tan[vi + 1] = t.y; tan[vi + 2] = t.z; tan[vi + 3] = t.w; }
}

void QuadBatch::upload() {
    for (size_t ci = 0; ci < meshes.size(); ci++) {
        int first = (int)ci * CHUNK;
        int n = std::min(CHUNK, count - first);
        if (n <= 0) break;
        Mesh& m = meshes[ci];
        int v0 = first * 4, nv = n * 4;
        UpdateMeshBuffer(m, 0, &pos[v0 * 3], nv * 3 * sizeof(float), 0);
        UpdateMeshBuffer(m, 1, &uv[v0 * 2], nv * 2 * sizeof(float), 0);
        if (flags & NORMAL) UpdateMeshBuffer(m, 2, &nrm[v0 * 3], nv * 3 * sizeof(float), 0);
        if (flags & COLOR) UpdateMeshBuffer(m, 3, &col[v0 * 4], nv * 4, 0);
        if (flags & TANGENT) UpdateMeshBuffer(m, 4, &tan[v0 * 4], nv * 4 * sizeof(float), 0);
        if (flags & TEX2) UpdateMeshBuffer(m, 5, &uv2[v0 * 2], nv * 2 * sizeof(float), 0);
    }
}

void QuadBatch::draw(const Material& mat) {
    for (size_t ci = 0; ci < meshes.size(); ci++) {
        int n = std::min(CHUNK, count - (int)ci * CHUNK);
        if (n <= 0) break;
        Mesh m = meshes[ci];
        m.triangleCount = n * 2;
        DrawMesh(m, mat, MatrixIdentity());
    }
}

void SpriteBatch::add(Vector3 p, float size, Vector4 c, int shape, Vector3 stretch) {
    int q = qb.addCentered(p);
    if (q < 0) return;
    qb.setNormal(q, stretch);
    qb.setTex2(q, {size, (float)shape});
    qb.setTangent(q, c);
}

// ---------------------------------------------------------------------------
// MeshBuilder
// ---------------------------------------------------------------------------
void MeshBuilder::tri(Vector3 a, Vector3 b, Vector3 cc, Color col, float emis, Vector3 inside) {
    Vector3 nn = Vector3CrossProduct(Vector3Subtract(b, a), Vector3Subtract(cc, a));
    float l = Vector3Length(nn);
    if (l < 1e-9f) return;
    nn = Vector3Scale(nn, 1.f / l);
    Vector3 cen = Vector3Scale(Vector3Add(Vector3Add(a, b), cc), 1.f / 3.f);
    if (Vector3DotProduct(nn, Vector3Subtract(cen, inside)) < 0) {
        std::swap(b, cc);
        nn = Vector3Negate(nn);
    }
    for (Vector3 p : {a, b, cc}) {
        v.push_back(p.x); v.push_back(p.y); v.push_back(p.z);
        n.push_back(nn.x); n.push_back(nn.y); n.push_back(nn.z);
        t.push_back(emis); t.push_back(0);
        c.push_back(col.r); c.push_back(col.g); c.push_back(col.b); c.push_back(col.a);
    }
}

void MeshBuilder::quad(Vector3 a, Vector3 b, Vector3 cc, Vector3 d, Color col, float emis, Vector3 inside) {
    tri(a, b, cc, col, emis, inside);
    tri(a, cc, d, col, emis, inside);
}

void MeshBuilder::loft(const std::vector<LoftRing>& rings, int sides, Color col, float emis, float angle0,
                       bool capStart, bool capEnd, Color capCol, float capEmis) {
    if (capCol.a == 0) capCol = col;
    auto pt = [&](const LoftRing& r, int k) {
        float a = angle0 + 2.f * PI * k / sides;
        return Vector3{r.cx + cosf(a) * r.rx, r.cy + sinf(a) * r.ry, r.z};
    };
    for (size_t i = 0; i + 1 < rings.size(); i++) {
        const LoftRing &r0 = rings[i], &r1 = rings[i + 1];
        Vector3 inside = {(r0.cx + r1.cx) * 0.5f, (r0.cy + r1.cy) * 0.5f, (r0.z + r1.z) * 0.5f};
        for (int k = 0; k < sides; k++) {
            Vector3 a = pt(r0, k), b = pt(r0, k + 1), c2 = pt(r1, k + 1), d = pt(r1, k);
            quad(a, b, c2, d, col, emis, inside);
        }
    }
    auto cap = [&](const LoftRing& r, float dir) {
        if (r.rx < 1e-4f && r.ry < 1e-4f) return;
        Vector3 cen = {r.cx, r.cy, r.z};
        Vector3 inside = {r.cx, r.cy, r.z - dir};
        for (int k = 0; k < sides; k++) tri(cen, pt(r, k), pt(r, k + 1), capCol, capEmis, inside);
    };
    if (capStart) cap(rings.front(), rings.front().z < rings.back().z ? -1.f : 1.f);
    if (capEnd) cap(rings.back(), rings.back().z > rings.front().z ? 1.f : -1.f);
}

void MeshBuilder::box(Vector3 ce, Vector3 s, Color col, float emis) {
    Vector3 h = Vector3Scale(s, 0.5f);
    Vector3 p[8];
    for (int i = 0; i < 8; i++)
        p[i] = {ce.x + ((i & 1) ? h.x : -h.x), ce.y + ((i & 2) ? h.y : -h.y), ce.z + ((i & 4) ? h.z : -h.z)};
    int f[6][4] = {{0, 1, 3, 2}, {4, 5, 7, 6}, {0, 1, 5, 4}, {2, 3, 7, 6}, {0, 2, 6, 4}, {1, 3, 7, 5}};
    for (auto& q : f) quad(p[q[0]], p[q[1]], p[q[2]], p[q[3]], col, emis, ce);
}

void MeshBuilder::slab(const std::vector<Vector2>& o, float y, float thick, Color col, float emis, float taper) {
    int n = (int)o.size();
    Vector2 cen = {0, 0};
    for (auto& p : o) { cen.x += p.x; cen.y += p.y; }
    cen.x /= n; cen.y /= n;
    Vector3 inside = {cen.x, y, cen.y};
    std::vector<Vector3> top(n), bot(n);
    for (int i = 0; i < n; i++) {
        top[i] = {o[i].x, y + thick * 0.5f, o[i].y};
        bot[i] = {o[i].x, y - thick * 0.5f, o[i].y};
        // taper thickness toward the outline edges farther from centre (in x)
        if (taper != 1.0f) {
            float k = lerpf(1.0f, taper, clampf(fabsf(o[i].x - cen.x) / 10.f, 0, 1));
            top[i].y = y + thick * 0.5f * k;
            bot[i].y = y - thick * 0.5f * k;
        }
    }
    for (int i = 1; i + 1 < n; i++) {
        tri(top[0], top[i], top[i + 1], col, emis, inside);
        tri(bot[0], bot[i], bot[i + 1], col, emis, inside);
    }
    for (int i = 0; i < n; i++) {
        int j = (i + 1) % n;
        quad(top[i], top[j], bot[j], bot[i], col, emis, inside);
    }
}

void MeshBuilder::mirrorX() {
    size_t nv = v.size() / 3;
    for (size_t tIdx = 0; tIdx < nv; tIdx += 3) {
        // mirrored triangle with reversed winding
        size_t idx[3] = {tIdx, tIdx + 2, tIdx + 1};
        for (size_t k : idx) {
            v.push_back(-v[k * 3]); v.push_back(v[k * 3 + 1]); v.push_back(v[k * 3 + 2]);
            n.push_back(-n[k * 3]); n.push_back(n[k * 3 + 1]); n.push_back(n[k * 3 + 2]);
            t.push_back(t[k * 2]); t.push_back(t[k * 2 + 1]);
            for (int j = 0; j < 4; j++) c.push_back(c[k * 4 + j]);
        }
    }
}

Mesh MeshBuilder::build() {
    Mesh m = {0};
    m.vertexCount = (int)(v.size() / 3);
    m.triangleCount = m.vertexCount / 3;
    m.vertices = (float*)MemAlloc(v.size() * sizeof(float));
    m.normals = (float*)MemAlloc(n.size() * sizeof(float));
    m.texcoords = (float*)MemAlloc(t.size() * sizeof(float));
    m.colors = (unsigned char*)MemAlloc(c.size());
    memcpy(m.vertices, v.data(), v.size() * sizeof(float));
    memcpy(m.normals, n.data(), n.size() * sizeof(float));
    memcpy(m.texcoords, t.data(), t.size() * sizeof(float));
    memcpy(m.colors, c.data(), c.size());
    UploadMesh(&m, false);
    return m;
}

Mesh GenAnnulus(float inner, float outer, int seg) {
    Mesh m = {0};
    m.vertexCount = seg * 6;
    m.triangleCount = seg * 2;
    m.vertices = (float*)MemAlloc(m.vertexCount * 3 * sizeof(float));
    m.normals = (float*)MemAlloc(m.vertexCount * 3 * sizeof(float));
    m.texcoords = (float*)MemAlloc(m.vertexCount * 2 * sizeof(float));
    int vi = 0;
    auto put = [&](float r, float a) {
        m.vertices[vi * 3] = cosf(a) * r; m.vertices[vi * 3 + 1] = 0; m.vertices[vi * 3 + 2] = sinf(a) * r;
        m.normals[vi * 3] = 0; m.normals[vi * 3 + 1] = 1; m.normals[vi * 3 + 2] = 0;
        m.texcoords[vi * 2] = (r - inner) / (outer - inner); m.texcoords[vi * 2 + 1] = a / (2 * PI);
        vi++;
    };
    for (int i = 0; i < seg; i++) {
        float a0 = 2 * PI * i / seg, a1 = 2 * PI * (i + 1) / seg;
        put(inner, a0); put(outer, a1); put(outer, a0);
        put(inner, a0); put(inner, a1); put(outer, a1);
    }
    UploadMesh(&m, false);
    return m;
}

// ---------------------------------------------------------------------------
// Render targets
// ---------------------------------------------------------------------------
RenderTexture2D LoadRT(int w, int h, bool hdr, bool depth) {
    RenderTexture2D t = {0};
    t.id = rlLoadFramebuffer();
    if (t.id == 0) return LoadRenderTexture(w, h);
    rlEnableFramebuffer(t.id);
    int fmt = hdr ? PIXELFORMAT_UNCOMPRESSED_R16G16B16A16 : PIXELFORMAT_UNCOMPRESSED_R8G8B8A8;
    t.texture.id = rlLoadTexture(NULL, w, h, fmt, 1);
    t.texture.width = w; t.texture.height = h; t.texture.format = fmt; t.texture.mipmaps = 1;
    if (t.texture.id == 0 && hdr) {
        fmt = PIXELFORMAT_UNCOMPRESSED_R8G8B8A8;
        t.texture.id = rlLoadTexture(NULL, w, h, fmt, 1);
        t.texture.format = fmt;
    }
    if (depth) {
        t.depth.id = rlLoadTextureDepth(w, h, true);
        t.depth.width = w; t.depth.height = h; t.depth.format = 19; t.depth.mipmaps = 1;
    }
    rlFramebufferAttach(t.id, t.texture.id, RL_ATTACHMENT_COLOR_CHANNEL0, RL_ATTACHMENT_TEXTURE2D, 0);
    if (depth) rlFramebufferAttach(t.id, t.depth.id, RL_ATTACHMENT_DEPTH, RL_ATTACHMENT_RENDERBUFFER, 0);
    bool ok = rlFramebufferComplete(t.id);
    rlDisableFramebuffer();
    if (!ok) {
        TraceLog(LOG_WARNING, "HDR framebuffer incomplete, falling back to 8 bit");
        UnloadRenderTexture(t);
        t = LoadRenderTexture(w, h);
    }
    SetTextureFilter(t.texture, TEXTURE_FILTER_BILINEAR);
    SetTextureWrap(t.texture, TEXTURE_WRAP_CLAMP);
    return t;
}

void PostFX::init(int w, int h) {
    down = LoadShaderFromMemory(nullptr, DOWN_FS);
    up = LoadShaderFromMemory(nullptr, UP_FS);
    comp = LoadShaderFromMemory(nullptr, COMPOSITE_FS);
    locDownTexel = GetShaderLocation(down, "texel");
    locDownThr = GetShaderLocation(down, "threshold");
    locUpTexel = GetShaderLocation(up, "texel");
    locUpWeight = GetShaderLocation(up, "weight");
    locBloomTex = GetShaderLocation(comp, "bloomTex");
    locBloomStr = GetShaderLocation(comp, "bloomStrength");
    locExposure = GetShaderLocation(comp, "exposure");
    locWarp = GetShaderLocation(comp, "warp");
    locTime = GetShaderLocation(comp, "time");
    locDamage = GetShaderLocation(comp, "damage");
    resize(w, h);
}

void PostFX::unloadTargets() {
    if (scene.id) UnloadRenderTexture(scene);
    for (auto& l : lv) if (l.id) UnloadRenderTexture(l);
    scene = {};
    for (auto& l : lv) l = {};
}

void PostFX::resize(int w, int h) {
    unloadTargets();
    width = std::max(w, 16);
    height = std::max(h, 16);
    scene = LoadRT(width, height, true, true);
    int lw = width, lh = height;
    for (int i = 0; i < LEVELS; i++) {
        lw = std::max(lw / 2, 2);
        lh = std::max(lh / 2, 2);
        lv[i] = LoadRT(lw, lh, true, false);
    }
}

void PostFX::begin() { BeginTextureMode(scene); }
void PostFX::end() { EndTextureMode(); }

static void blit(Texture2D src, RenderTexture2D dst) {
    DrawTexturePro(src, {0, 0, (float)src.width, -(float)src.height},
                   {0, 0, (float)dst.texture.width, (float)dst.texture.height}, {0, 0}, 0, WHITE);
}

void PostFX::present(float exposure, float bloom, float warp, float damage, float time) {
    // down sample chain (first step extracts the bright parts)
    Texture2D src = scene.texture;
    for (int i = 0; i < LEVELS; i++) {
        BeginTextureMode(lv[i]);
        ClearBackground(BLACK);
        BeginShaderMode(down);
        Vector2 texel = {1.f / src.width, 1.f / src.height};
        float thr = (i == 0) ? 1.0f : 0.0f;
        SetShaderValue(down, locDownTexel, &texel, SHADER_UNIFORM_VEC2);
        SetShaderValue(down, locDownThr, &thr, SHADER_UNIFORM_FLOAT);
        rlSetBlendFactors(RL_ONE, RL_ZERO, RL_FUNC_ADD);
        BeginBlendMode(BLEND_CUSTOM);
        blit(src, lv[i]);
        EndBlendMode();
        EndShaderMode();
        EndTextureMode();
        src = lv[i].texture;
    }
    // up sample and accumulate
    for (int i = LEVELS - 1; i > 0; i--) {
        BeginTextureMode(lv[i - 1]);
        BeginShaderMode(up);
        Vector2 texel = {1.f / lv[i].texture.width, 1.f / lv[i].texture.height};
        float w = 1.0f;
        SetShaderValue(up, locUpTexel, &texel, SHADER_UNIFORM_VEC2);
        SetShaderValue(up, locUpWeight, &w, SHADER_UNIFORM_FLOAT);
        rlSetBlendFactors(RL_ONE, RL_ONE, RL_FUNC_ADD);
        BeginBlendMode(BLEND_CUSTOM);
        blit(lv[i].texture, lv[i - 1]);
        EndBlendMode();
        EndShaderMode();
        EndTextureMode();
    }
    // composite to the back buffer
    BeginShaderMode(comp);
    SetShaderValueTexture(comp, locBloomTex, lv[0].texture);
    float bs = bloom / (float)LEVELS;
    SetShaderValue(comp, locBloomStr, &bs, SHADER_UNIFORM_FLOAT);
    SetShaderValue(comp, locExposure, &exposure, SHADER_UNIFORM_FLOAT);
    SetShaderValue(comp, locWarp, &warp, SHADER_UNIFORM_FLOAT);
    SetShaderValue(comp, locTime, &time, SHADER_UNIFORM_FLOAT);
    SetShaderValue(comp, locDamage, &damage, SHADER_UNIFORM_FLOAT);
    DrawTexturePro(scene.texture, {0, 0, (float)scene.texture.width, -(float)scene.texture.height},
                   {0, 0, (float)GetScreenWidth(), (float)GetScreenHeight()}, {0, 0}, 0, WHITE);
    EndShaderMode();
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------
void ViewInfo::setup(Quaternion orient, float fovDeg, int w, int h) {
    q = QuaternionNormalize(orient);
    fovy = fovDeg;
    screenW = w; screenH = h;
    aspect = (float)w / (float)h;
    fwd = Vector3RotateByQuaternion({0, 0, -1}, q);
    up = Vector3RotateByQuaternion({0, 1, 0}, q);
    right = Vector3RotateByQuaternion({1, 0, 0}, q);
    rot = QuaternionToMatrix(QuaternionInvert(q));
}

bool ViewInfo::project(const DVec3& rel, Vector2& out) const {
    double z = rel.x * fwd.x + rel.y * fwd.y + rel.z * fwd.z;
    double x = rel.x * right.x + rel.y * right.y + rel.z * right.z;
    double y = rel.x * up.x + rel.y * up.y + rel.z * up.z;
    float f = pixelsPerRadian();
    if (z <= 0) {
        // behind: give the direction on screen for edge arrows
        double l = std::sqrt(x * x + y * y) + 1e-30;
        out = {(float)(screenW * 0.5 + x / l * 1e5), (float)(screenH * 0.5 - y / l * 1e5)};
        return false;
    }
    out = {(float)(screenW * 0.5 + x / z * f), (float)(screenH * 0.5 - y / z * f)};
    return true;
}

void BeginLayer(const ViewInfo& v, double nearP, double farP, Vector3 translate) {
    rlDrawRenderBatchActive();
    rlMatrixMode(RL_PROJECTION);
    rlPushMatrix();
    rlLoadIdentity();
    Matrix proj = MatrixPerspective(v.fovy * DEG2RAD, v.aspect, nearP, farP);
    rlMultMatrixf(MatrixToFloat(proj));
    rlMatrixMode(RL_MODELVIEW);
    rlLoadIdentity();
    Matrix view = MatrixMultiply(MatrixTranslate(-translate.x, -translate.y, -translate.z), v.rot);
    rlMultMatrixf(MatrixToFloat(view));
    rlEnableDepthTest();
}

void EndLayer() {
    rlDrawRenderBatchActive();
    rlMatrixMode(RL_PROJECTION);
    rlPopMatrix();
    rlMatrixMode(RL_MODELVIEW);
    rlLoadIdentity();
    rlDisableDepthTest();
}

void SetBlend(BlendKind k) {
    rlDrawRenderBatchActive();
    if (k == BL_ALPHA) {
        rlSetBlendMode(RL_BLEND_ALPHA);
        return;
    }
    if (k == BL_ADD) rlSetBlendFactors(RL_ONE, RL_ONE, RL_FUNC_ADD);
    else rlSetBlendFactors(RL_DST_COLOR, RL_ZERO, RL_FUNC_ADD);
    rlSetBlendMode(RL_BLEND_CUSTOM);
}
