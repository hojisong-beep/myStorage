// main.cpp - Cosmic Voyager: a 3D space travel and combat simulator
#include "hud.h"
#include "render.h"
#include <cstring>

int main(int argc, char** argv) {
    bool startAuto = false;
    const char* shot = nullptr;
    const char* gotoName = nullptr;
    float shotAt = 3.0f;
    int camMode = -1;
    int winW = 1600, winH = 900;
    bool fullscreen = false;
    bool noHud = false;
    int enemies = 0;
    int tourStep = 0;
    double warpLvl = -99;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--auto")) startAuto = true;
        else if (!strcmp(argv[i], "--fullscreen")) fullscreen = true;
        else if (!strcmp(argv[i], "--nohud")) noHud = true;
        else if (!strcmp(argv[i], "--tour") && i + 1 < argc) tourStep = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--enemies") && i + 1 < argc) enemies = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--warp") && i + 1 < argc) warpLvl = atof(argv[++i]);
        else if (!strcmp(argv[i], "--shot") && i + 1 < argc) shot = argv[++i];
        else if (!strcmp(argv[i], "--at") && i + 1 < argc) shotAt = (float)atof(argv[++i]);
        else if (!strcmp(argv[i], "--goto") && i + 1 < argc) gotoName = argv[++i];
        else if (!strcmp(argv[i], "--cam") && i + 1 < argc) camMode = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--size") && i + 2 < argc) { winW = atoi(argv[++i]); winH = atoi(argv[++i]); }
    }

    SetConfigFlags(FLAG_MSAA_4X_HINT | FLAG_WINDOW_RESIZABLE | (shot ? 0 : FLAG_VSYNC_HINT));
    SetTraceLogLevel(LOG_WARNING);
    InitWindow(winW, winH, "Cosmic Voyager");
    SetExitKey(KEY_NULL);
    if (fullscreen) ToggleFullscreen();

    Game* game = new Game();
    game->init();
    Renderer* rend = new Renderer();
    rend->init(*game);

    if (gotoName) {
        int i = game->U.findNav(gotoName);
        if (i >= 0) {
            const NavTarget& t = game->U.nav[i];
            game->ship.pos = game->U.navArrival(t, game->ship.pos);
            DVec3 to = relM(game->U.navPos(t), game->ship.pos);
            game->ship.q = QuaternionFromVector3ToVector3({0, 0, -1}, to.norm().f());
            game->camQ = game->ship.q;
            game->U.update(0, game->ship.pos);
            game->navSel = i;
        }
    }
    if (camMode >= 0) game->camMode = (CamMode)camMode;
    if (startAuto) game->setAuto(true);
    game->tourStep = tourStep;
    if (camMode >= 0) game->camMode = (CamMode)camMode;
    if (enemies > 0) game->spawnWave(enemies);
    if (warpLvl > -99) {
        game->ship.drive = DRIVE_WARP;
        game->ship.warpLevel = game->ship.warpTarget = warpLvl;
    }
    if (!shot) DisableCursor();

    double simT = 0;
    while (!WindowShouldClose()) {
        float dt = shot ? 1.0f / 30.0f : std::min(GetFrameTime(), 0.05f);
        game->update(dt);
        if (game->quitArm < 0) break;
        simT += dt;

        BeginDrawing();
        rend->render(*game, dt);
        if (!noHud) DrawHUD(*game, *rend);
        EndDrawing();

        if (shot && simT >= shotAt) {
            Image img = LoadImageFromScreen();
            ExportImage(img, shot);
            UnloadImage(img);
            break;
        }
    }
    rend->shutdown();
    game->audio.shutdown();
    CloseWindow();
    return 0;
}
