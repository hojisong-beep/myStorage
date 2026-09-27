cmake_minimum_required(VERSION 3.16)
project(CosmicVoyager CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

# raylib is downloaded automatically (no git needed)
include(FetchContent)
set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(BUILD_GAMES OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(CUSTOMIZE_BUILD OFF CACHE BOOL "" FORCE)
set(RAYLIB_SOURCE_DIR "" CACHE PATH "Use a local raylib source tree instead of downloading")
if(RAYLIB_SOURCE_DIR)
  FetchContent_Declare(raylib SOURCE_DIR ${RAYLIB_SOURCE_DIR})
else()
  FetchContent_Declare(raylib
    URL https://github.com/raysan5/raylib/archive/refs/tags/5.5.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
endif()
FetchContent_MakeAvailable(raylib)

add_executable(CosmicVoyager
  src/main.cpp
  src/game.cpp
  src/universe.cpp
  src/render.cpp
  src/hud.cpp
  src/gfx.cpp
  src/audio.cpp)
target_link_libraries(CosmicVoyager PRIVATE raylib)
target_include_directories(CosmicVoyager PRIVATE ${raylib_SOURCE_DIR}/src)

if(MSVC)
  target_compile_options(CosmicVoyager PRIVATE /O2 /W3 /utf-8)
  set_target_properties(CosmicVoyager PROPERTIES WIN32_EXECUTABLE TRUE)
  target_link_options(CosmicVoyager PRIVATE /ENTRY:mainCRTStartup)
else()
  target_compile_options(CosmicVoyager PRIVATE -O2 -Wall -Wno-missing-field-initializers)
endif()
if(APPLE)
  target_link_libraries(CosmicVoyager PRIVATE "-framework IOKit" "-framework Cocoa" "-framework OpenGL")
endif()
