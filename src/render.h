// render.h - draws the universe, ships and effects
#pragma once
#include "game.h"
#include "gfx.h"

struct ShaderBox {
    Shader sh{};
    Material mat{};
    int loc(const char* name) const { return GetShaderLocation(sh, name); }
    void load(const char* vs, const char* fs);
    void set(const char* name, float v) const;
    void set(const char* name, Vector2 v) const;
    void set(const char* name, Vector3 v) const;
    void set(const char* name, int v) const;
    void setMat(const char* name, const Matrix& m) const;
};

struct Renderer {
    ShaderBox planet, star, ring, ship, sprite, cloud, impostor, stars;
    Mesh sphere{}, annulus{};
    Mesh playerMesh{}, enemyMesh[EK_COUNT]{};
    PostFX post;
    SpriteBatch spritesLocal, spritesFar;
    QuadBatch points;       // exact-position stars and planets (stars shader)
    QuadBatch impostors;    // far galaxies
    GalaxyCloud mwCloud, otherCloud;
    RenderTexture2D atlas{};
    ViewInfo view;
    float time = 0;

    void init(Game& g);
    void shutdown();
    void render(Game& g, float dt);

private:
    void buildShips();
    void buildAtlas(Universe& U);
    void drawGalaxies(Game& g, const DVec3& camLy);
    void drawStars(Game& g, const UPos& cam);
    void drawOrbits(Game& g, const UPos& cam);
    void drawBodies(Game& g, const UPos& cam);
    void drawLocal(Game& g);
    void drawCloud(const Galaxy& gal, GalaxyCloud& c, const DVec3& camLy, float alpha);
};
