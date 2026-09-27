// gfx.h - low level rendering helpers
#pragma once
#include "core.h"

// Depth-only clear etc. need a couple of raw GL calls; raylib already loads GL
// through glad, so we just reuse its function pointers.
void GfxClearDepth();

// ---------------------------------------------------------------------------
// A large batch of quads split into <=16k-quad meshes (16 bit indices).
// Every quad has 4 vertices; attributes are optional.
// ---------------------------------------------------------------------------
struct QuadBatch {
    enum : unsigned { NORMAL = 1, COLOR = 2, TEX2 = 4, TANGENT = 8 };
    static constexpr int CHUNK = 16000;

    std::vector<Mesh> meshes;
    int capacity = 0;
    int count = 0;
    unsigned flags = 0;
    bool dynamic = false;

    std::vector<float> pos, uv, nrm, uv2, tan;
    std::vector<unsigned char> col;

    void init(int maxQuads, unsigned attribFlags, bool isDynamic);
    void unload();
    void clear() { count = 0; }
    bool full() const { return count >= capacity; }

    // quad whose 4 vertices share one centre; corners (-1,-1),(1,-1),(1,1),(-1,1) go in uv
    int addCentered(Vector3 c);
    // explicit corners (counter clockwise) and texcoords
    int addQuad(const Vector3 p[4], const Vector2 t[4]);

    void setNormal(int q, Vector3 n);
    void setColor(int q, Color c);
    void setTex2(int q, Vector2 t);
    void setTangent(int q, Vector4 t);

    void upload();                   // send the first `count` quads to the GPU
    void draw(const Material& mat);  // draw `count` quads
};

// ---------------------------------------------------------------------------
// Additive HDR sprites (sprite shader)
// ---------------------------------------------------------------------------
enum SpriteShape { SH_GLOW = 0, SH_RING = 1, SH_LASER = 2, SH_FLARE = 3, SH_DISC = 4 };
struct SpriteBatch {
    QuadBatch qb;
    void init(int maxQuads) { qb.init(maxQuads, QuadBatch::NORMAL | QuadBatch::TEX2 | QuadBatch::TANGENT, true); }
    void clear() { qb.clear(); }
    void add(Vector3 p, float size, Vector4 hdrColor, int shape = SH_GLOW, Vector3 stretch = {0, 0, 0});
    void draw(const Material& mat) { qb.upload(); qb.draw(mat); }
};

// ---------------------------------------------------------------------------
// Flat shaded, vertex coloured procedural meshes
// ---------------------------------------------------------------------------
struct LoftRing { float z, rx, ry, cx, cy; };
struct MeshBuilder {
    std::vector<float> v, n, t;
    std::vector<unsigned char> c;
    void tri(Vector3 a, Vector3 b, Vector3 cc, Color col, float emis, Vector3 inside);
    void quad(Vector3 a, Vector3 b, Vector3 cc, Vector3 d, Color col, float emis, Vector3 inside);
    void loft(const std::vector<LoftRing>& rings, int sides, Color col, float emis = 0,
              float angle0 = 0, bool capStart = true, bool capEnd = true, Color capCol = {0, 0, 0, 0}, float capEmis = 0);
    void box(Vector3 center, Vector3 size, Color col, float emis = 0);
    // convex slab from a convex outline in the XZ plane (y = centre height)
    void slab(const std::vector<Vector2>& outlineXZ, float y, float thick, Color col, float emis = 0, float taper = 1.0f);
    void mirrorX();  // duplicate everything mirrored across x=0
    Mesh build();
};

Mesh GenAnnulus(float inner, float outer, int segments);

// ---------------------------------------------------------------------------
// Render targets and post processing
// ---------------------------------------------------------------------------
RenderTexture2D LoadRT(int w, int h, bool hdr, bool depth);

struct PostFX {
    RenderTexture2D scene{};
    static constexpr int LEVELS = 6;
    RenderTexture2D lv[LEVELS]{};
    int width = 0, height = 0;
    Shader down{}, up{}, comp{};
    int locDownTexel = -1, locDownThr = -1, locUpTexel = -1, locUpWeight = -1;
    int locBloomTex = -1, locBloomStr = -1, locExposure = -1, locWarp = -1, locTime = -1, locDamage = -1;

    void init(int w, int h);
    void resize(int w, int h);
    void unloadTargets();
    void begin();  // start drawing the HDR scene
    void end();
    void present(float exposure, float bloom, float warp, float damage, float time);
};

// ---------------------------------------------------------------------------
// Camera-relative "layers": each layer has its own clip range, all share the
// camera rotation. The camera always sits at the origin of a layer.
// ---------------------------------------------------------------------------
struct ViewInfo {
    Quaternion q{0, 0, 0, 1};
    Matrix rot{};          // world -> view rotation
    Vector3 fwd{}, right{}, up{};
    float fovy = 60;       // degrees
    float aspect = 16.f / 9.f;
    int screenW = 1280, screenH = 720;
    void setup(Quaternion orient, float fovDeg, int w, int h);
    // project a camera-relative direction/position; returns false when behind
    bool project(const DVec3& rel, Vector2& out) const;
    float pixelsPerRadian() const { return screenH * 0.5f / tanf(fovy * DEG2RAD * 0.5f); }
};

void BeginLayer(const ViewInfo& v, double nearP, double farP, Vector3 translate = {0, 0, 0});
void EndLayer();

enum BlendKind { BL_ALPHA, BL_ADD, BL_MULTIPLY };
void SetBlend(BlendKind k);
