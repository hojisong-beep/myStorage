// shaders.h - all GLSL sources (OpenGL 3.3 core), embedded in the executable
#pragma once

// ---------------------------------------------------------------------------
// Shared noise (Ashima Arts 3D simplex noise, MIT licence) + fbm
// ---------------------------------------------------------------------------
#define GLSL_NOISE R"(
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p,int oct){
  float a=0.5,s=0.0;
  for(int i=0;i<9;i++){ if(i>=oct)break; s+=a*snoise(p); p=p*2.02+vec3(1.7,9.2,3.1); a*=0.5; }
  return s;
}
float ridged(vec3 p,int oct){
  float a=0.5,s=0.0;
  for(int i=0;i<8;i++){ if(i>=oct)break; float n=1.0-abs(snoise(p)); s+=a*n*n; p=p*2.03+vec3(3.1,1.3,7.7); a*=0.5; }
  return s;
}
)"

// ---------------------------------------------------------------------------
// Planets / moons / black hole (procedural surfaces)
// ---------------------------------------------------------------------------
static const char* const PLANET_VS = R"(#version 330
in vec3 vertexPosition;
in vec3 vertexNormal;
uniform mat4 mvp;
uniform mat4 matModel;
out vec3 objN;
out vec3 worldN;
out vec3 worldP;
void main(){
  objN = normalize(vertexPosition);
  worldP = (matModel*vec4(vertexPosition,1.0)).xyz;
  worldN = normalize(mat3(matModel)*vertexNormal);
  gl_Position = mvp*vec4(vertexPosition,1.0);
}
)";

static const char* const PLANET_FS = "#version 330\n" GLSL_NOISE R"(
in vec3 objN;
in vec3 worldN;
in vec3 worldP;
out vec4 finalColor;
uniform vec3 lightDir;     // world, toward the star
uniform vec3 lightCol;
uniform int  ptype;
uniform float seed;
uniform vec3 c1;
uniform vec3 c2;
uniform vec3 c3;
uniform vec3 atmo;
uniform float atmoStrength;
uniform float time;
uniform float detail;      // 0..1 how much fine detail to compute (distance LOD)

void main(){
  vec3 N = normalize(worldN);
  vec3 V = normalize(-worldP);
  vec3 L = normalize(lightDir);
  vec3 n = normalize(objN);
  vec3 p = n*1.6 + vec3(seed*7.13, seed*3.71, seed*5.17);
  int oct = int(mix(4.0, 8.0, detail));
  float ndl = dot(N,L);
  vec3 col = c1;
  vec3 emis = vec3(0.0);
  float spec = 0.0;
  float wrap = 0.0;

  if(ptype==0){            // rocky / cratered
    float h = fbm(p*1.3, oct)*0.5+0.5;
    float cr = ridged(p*3.0+11.0, oct-2);
    col = mix(c1, c2, smoothstep(0.25,0.75,h));
    col = mix(col, c3, smoothstep(0.55,0.95,cr)*0.6);
    col *= 0.75 + 0.5*fbm(p*9.0, 3)*0.5 + 0.25;
  } else if(ptype==1){     // earth-like
    float h = fbm(p*1.2, oct) + 0.08*fbm(p*9.0,3);
    float land = smoothstep(0.02,0.05,h);
    float lat = abs(n.y);
    vec3 ocean = mix(c1*0.45, c1, smoothstep(-0.35,0.03,h));
    vec3 landc = mix(c2, c3, smoothstep(0.05,0.45,h+0.25*snoise(p*2.3)));
    landc = mix(landc, c3*1.2, smoothstep(0.35,0.6,1.0-lat+0.1*snoise(p*5.0))*0.35);
    col = mix(ocean, landc, land);
    float ice = smoothstep(0.78,0.86, lat + 0.07*fbm(p*4.0,4));
    col = mix(col, vec3(0.85,0.9,0.95), ice);
    spec = (1.0-land)*(1.0-ice);
    // clouds rotate slowly relative to the surface
    float ca = time*0.004;
    vec3 pc = vec3(n.x*cos(ca)-n.z*sin(ca), n.y, n.x*sin(ca)+n.z*cos(ca))*2.1 + seed;
    float cl = smoothstep(0.05,0.55, fbm(pc+vec3(0.0,0.0,fbm(pc*0.7,3)), oct-1)+0.12);
    // night side city lights
    float night = smoothstep(0.05,-0.15, ndl);
    float cities = land*(1.0-ice)*smoothstep(0.55,0.9, snoise(p*38.0)*0.5+0.5)*smoothstep(0.0,0.5,snoise(p*6.0));
    emis += vec3(1.0,0.62,0.25)*cities*night*1.2*(1.0-cl);
    col = mix(col, vec3(0.95), cl*0.9);
    spec *= (1.0-cl);
    wrap = 0.1;
  } else if(ptype==2){     // gas giant
    float lat = n.y;
    float warp = fbm(p*vec3(1.2,3.5,1.2), oct-2);
    float bands = sin((lat*9.0 + warp*0.9)*3.14159 + seed*6.0);
    float fine  = sin((lat*31.0 + warp*1.6)*3.14159);
    col = mix(c1, c2, bands*0.5+0.5);
    col = mix(col, c3, (fine*0.5+0.5)*0.25);
    float storms = smoothstep(0.55,0.85, fbm(p*vec3(3.0,9.0,3.0), 4)*0.5+0.5);
    col = mix(col, c3*1.1, storms*0.35);
    // great spot
    vec3 sp = normalize(vec3(0.6,-0.38,0.7));
    float s = smoothstep(0.985,0.995, dot(n, sp) + 0.004*snoise(p*8.0));
    col = mix(col, vec3(0.62,0.22,0.12), s*step(0.5,fract(seed*3.0))*0.8);
    wrap = 0.05;
  } else if(ptype==3){     // ice giant
    float lat = n.y;
    float w = fbm(p*vec3(1.0,4.0,1.0), 4);
    col = mix(c1, c2, smoothstep(-0.6,0.6, lat*1.4 + w*0.35));
    col = mix(col, c3, smoothstep(0.3,0.8, sin(lat*18.0 + w*2.0)*0.5+0.5)*0.15);
    wrap = 0.08;
  } else if(ptype==4){     // venus-like thick cloud
    vec3 q = p*1.1;
    float w1 = fbm(q, 4);
    float w2 = fbm(q*vec3(1.0,3.0,1.0)+w1*2.0, oct-2);
    col = mix(c1, c2, w2*0.5+0.5);
    col = mix(col, c3, smoothstep(0.2,0.7,w1)*0.3);
    wrap = 0.12;
  } else if(ptype==5){     // lava world
    float h = fbm(p*1.5, oct);
    float cracks = 1.0-smoothstep(0.0,0.06, abs(snoise(p*5.0+h)));
    col = mix(c1, c2, h*0.5+0.5);
    emis += c3*cracks*2.5*(0.6+0.4*sin(time*0.5+h*10.0));
  } else if(ptype==6){     // black hole
    finalColor = vec4(0.0,0.0,0.0,1.0);
    return;
  }

  float diff = clamp((ndl + wrap)/(1.0+wrap), 0.0, 1.0);
  diff = pow(diff, 0.85);
  vec3 H = normalize(L+V);
  float sp = pow(max(dot(N,H),0.0), 60.0)*spec*0.6*step(0.0,ndl);
  vec3 lit = col*diff*lightCol + col*0.006 + sp*lightCol + emis;
  // atmospheric scattering on the limb
  float fres = pow(1.0-max(dot(N,V),0.0), 2.6);
  float sunside = clamp(ndl*0.8+0.35, 0.0, 1.0);
  lit += atmo*fres*sunside*atmoStrength*lightCol;
  lit = mix(lit, atmo*lightCol*sunside*0.35, fres*fres*atmoStrength*0.5);
  finalColor = vec4(lit, 1.0);
}
)";

// ---------------------------------------------------------------------------
// Star surface
// ---------------------------------------------------------------------------
static const char* const STAR_FS = "#version 330\n" GLSL_NOISE R"(
in vec3 objN;
in vec3 worldN;
in vec3 worldP;
out vec4 finalColor;
uniform vec3 starCol;
uniform float intensity;
uniform float time;
uniform float seed;
void main(){
  vec3 N = normalize(worldN);
  vec3 V = normalize(-worldP);
  vec3 n = normalize(objN);
  float t = time*0.05;
  vec3 p = n*6.0 + seed;
  float g = fbm(p + vec3(t, -t*0.7, t*0.3), 5)*0.5+0.5;
  float cells = 1.0 - abs(snoise(n*28.0 + vec3(0.0, t*2.0, 0.0)));
  float spots = smoothstep(0.62,0.72, fbm(n*2.2+seed+vec3(t*0.1), 4)*0.5+0.5);
  float mu = max(dot(N,V), 0.0);
  float limb = 0.35 + 0.65*pow(mu, 0.55);
  vec3 c = starCol*(0.75 + 0.35*g + 0.15*cells);
  c *= 1.0 - spots*0.65;
  c = mix(c, c*vec3(1.1,0.75,0.5), 1.0-mu);
  finalColor = vec4(c*limb*intensity, 1.0);
}
)";

// ---------------------------------------------------------------------------
// Planetary rings / accretion disk
// ---------------------------------------------------------------------------
static const char* const RING_VS = R"(#version 330
in vec3 vertexPosition;
in vec2 vertexTexCoord;
uniform mat4 mvp;
uniform mat4 matModel;
out vec3 objP;
out vec3 worldP;
void main(){
  objP = vertexPosition;
  worldP = (matModel*vec4(vertexPosition,1.0)).xyz;
  gl_Position = mvp*vec4(vertexPosition,1.0);
}
)";

static const char* const RING_FS = "#version 330\n" GLSL_NOISE R"(
in vec3 objP;
in vec3 worldP;
out vec4 finalColor;
uniform vec3 lightObj;     // light dir in ring object space
uniform vec3 lightCol;
uniform vec3 ringCol;
uniform float innerR;      // inner radius, fraction of outer (mesh spans 0.5..1)
uniform float planetR;     // planet radius, fraction of outer
uniform float seed;
uniform int   emissive;    // 1 = accretion disk
uniform float time;
void main(){
  float r = length(objP.xz);
  float t = (r - innerR)/(1.0-innerR);
  if(t < 0.0 || t > 1.0) discard;
  if(emissive==1){
    float ang = atan(objP.z, objP.x);
    float swirl = fbm(vec3(cos(ang)*r*6.0, sin(ang)*r*6.0, time*0.3 - r*4.0), 5)*0.5+0.5;
    float heat = pow(1.0-t, 2.2);
    vec3 hot = mix(vec3(1.0,0.35,0.08), vec3(1.0,0.9,0.75), heat);
    float a = smoothstep(0.0,0.08,t)*smoothstep(1.0,0.4,t);
    vec3 c = hot*(0.4+1.2*swirl)*(0.25+2.2*heat)*a;
    finalColor = vec4(c, 1.0);
    return;
  }
  float b1 = snoise(vec3(t*40.0, seed, 0.0))*0.5+0.5;
  float b2 = snoise(vec3(t*170.0, seed+3.0, 0.0))*0.5+0.5;
  float dens = mix(b1, b2, 0.45);
  dens *= smoothstep(0.0,0.04,t)*smoothstep(1.0,0.93,t);
  dens *= 1.0 - 0.85*smoothstep(0.55,0.57,t)*smoothstep(0.62,0.60,t); // Cassini-like gap
  // planet shadow (object space, units of outer radius)
  vec3 P = objP;
  vec3 Ld = normalize(lightObj);
  float bb = dot(P, Ld);
  float cc = dot(P,P) - planetR*planetR;
  float disc = bb*bb - cc;
  float shadow = 1.0;
  if(disc > 0.0 && (-bb - sqrt(disc)) > 0.0) shadow = 0.08;
  float lit = 0.35 + 0.65*abs(Ld.y);
  vec3 c = ringCol*(0.6+0.6*b2)*lit*shadow*lightCol;
  if(dens < 0.02) discard;
  finalColor = vec4(c, clamp(dens*1.2,0.0,0.95));
}
)";

// ---------------------------------------------------------------------------
// Ships (vertex coloured, flat shaded, emissive via texcoord.x)
// ---------------------------------------------------------------------------
static const char* const SHIP_VS = R"(#version 330
in vec3 vertexPosition;
in vec3 vertexNormal;
in vec2 vertexTexCoord;
in vec4 vertexColor;
uniform mat4 mvp;
uniform mat4 matModel;
out vec3 wN;
out vec3 wP;
out vec4 vCol;
out float vEmis;
void main(){
  wN = normalize(mat3(matModel)*vertexNormal);
  wP = (matModel*vec4(vertexPosition,1.0)).xyz;
  vCol = vertexColor;
  vEmis = vertexTexCoord.x;
  gl_Position = mvp*vec4(vertexPosition,1.0);
}
)";

static const char* const SHIP_FS = R"(#version 330
in vec3 wN;
in vec3 wP;
in vec4 vCol;
in float vEmis;
out vec4 finalColor;
uniform vec3 lightDir;
uniform vec3 lightCol;
uniform vec3 ambient;
uniform vec3 viewPos;
uniform vec3 tint;
uniform vec3 emisCol;
uniform float flash;
uniform float emisBoost;
void main(){
  vec3 N = normalize(wN);
  vec3 L = normalize(lightDir);
  vec3 V = normalize(viewPos - wP);
  if(dot(N,V) < 0.0) N = -N;
  vec3 base = pow(vCol.rgb, vec3(2.2))*tint;
  float diff = max(dot(N,L),0.0);
  vec3 H = normalize(L+V);
  float spec = pow(max(dot(N,H),0.0), 40.0)*0.8;
  float rim = pow(1.0-max(dot(N,V),0.0), 4.0);
  vec3 c = base*(diff*lightCol + ambient) + spec*lightCol*diff + rim*ambient*2.5;
  c += mix(base, emisCol, 0.6)*vEmis*emisBoost;
  c += vec3(1.0,0.6,0.3)*flash;
  finalColor = vec4(c,1.0);
}
)";

// ---------------------------------------------------------------------------
// Generic HDR billboard (glows, lasers, sparks, rings, flares).
// vertexNormal = stretch vector (world), vertexTexCoord2 = (size, shape),
// vertexTangent = HDR colour.
// ---------------------------------------------------------------------------
static const char* const SPRITE_VS = R"(#version 330
in vec3 vertexPosition;
in vec2 vertexTexCoord;
in vec3 vertexNormal;
in vec2 vertexTexCoord2;
in vec4 vertexTangent;
uniform mat4 matView;
uniform mat4 matProjection;
out vec2 lc;
out vec4 col;
out float hl;
flat out int shape;
void main(){
  vec4 c = matView*vec4(vertexPosition,1.0);
  vec3 s = mat3(matView)*vertexNormal;
  float size = vertexTexCoord2.x;
  float L = length(s);
  vec3 pos;
  hl = 0.0;
  vec3 toCam = normalize(-c.xyz);
  vec3 side = vec3(0.0);
  if(L > 1e-5){
    vec3 d = s/L;
    side = cross(d, toCam);
    float sl = length(side);
    if(sl > 0.05){
      side /= sl;
      pos = c.xyz + d*(vertexTexCoord.x*(L*0.5+size)) + side*(vertexTexCoord.y*size);
      hl = L*0.5/size;
      lc = vec2(vertexTexCoord.x*(hl+1.0), vertexTexCoord.y);
    } else {
      pos = c.xyz + vec3(vertexTexCoord*size, 0.0);
      lc = vertexTexCoord;
    }
  } else {
    pos = c.xyz + vec3(vertexTexCoord*size, 0.0);
    lc = vertexTexCoord;
  }
  col = vertexTangent;
  shape = int(vertexTexCoord2.y+0.5);
  gl_Position = matProjection*vec4(pos,1.0);
}
)";

static const char* const SPRITE_FS = R"(#version 330
in vec2 lc;
in vec4 col;
in float hl;
flat in int shape;
out vec4 finalColor;
void main(){
  float dx = max(abs(lc.x)-hl, 0.0);
  float d = length(vec2(dx, lc.y));
  vec3 c = col.rgb;
  float a;
  if(shape==1){            // ring / shockwave
    a = exp(-pow((d-0.82)*9.0,2.0));
  } else if(shape==2){     // laser bolt: white hot core, coloured halo
    a = exp(-d*d*5.0);
    float core = exp(-d*d*40.0);
    c = mix(c, vec3(1.0)*max(max(c.r,c.g),c.b), core*0.8);
    a += core*1.5;
  } else if(shape==3){     // star flare with diffraction spikes
    a = exp(-d*d*14.0)*1.6 + 0.02/(d*d*30.0+0.02)*0.4;
    float sx = exp(-abs(lc.y)*55.0)*pow(max(1.0-abs(lc.x),0.0),3.0);
    float sy = exp(-abs(lc.x)*55.0)*pow(max(1.0-abs(lc.y),0.0),3.0);
    a += (sx+sy)*0.7;
    a *= smoothstep(1.0,0.8,d);
  } else if(shape==4){     // hard disc (shield bubble rim / flash)
    a = smoothstep(1.0,0.9,d)*(0.25+0.75*pow(d,6.0));
  } else {                 // soft glow
    a = exp(-d*d*4.5);
  }
  finalColor = vec4(c*a*col.a, 0.0);
}
)";

// ---------------------------------------------------------------------------
// Galaxy particle clouds (stars: additive, dust: multiplicative)
// ---------------------------------------------------------------------------
static const char* const CLOUD_VS = R"(#version 330
in vec3 vertexPosition;
in vec2 vertexTexCoord;
in vec3 vertexNormal;
in vec4 vertexColor;
uniform mat4 matView;
uniform mat4 matProjection;
uniform mat4 galModel;
uniform float galScale;
uniform float screenH;
uniform float minPx;
uniform float intensity;
out vec2 uv;
out vec4 col;
void main(){
  vec4 wp = galModel*vec4(vertexPosition,1.0);
  vec4 vp = matView*wp;
  float size = vertexNormal.x*galScale;
  float dist = length(vp.xyz);
  float k = 1.0;
  if(minPx > 0.0){
    float px = size/max(dist,1e-9)*matProjection[1][1]*screenH*0.5;
    if(px < minPx){ float r = px/minPx; k = r*r; size *= minPx/max(px,1e-9); }
    k *= smoothstep(2.0*vertexNormal.x*galScale, 10.0*vertexNormal.x*galScale, dist);
  }
  vp.xy += vertexTexCoord*size;
  gl_Position = matProjection*vp;
  uv = vertexTexCoord;
  col = vec4(vertexColor.rgb, vertexColor.a*k*intensity);
}
)";

static const char* const CLOUD_FS = R"(#version 330
in vec2 uv;
in vec4 col;
out vec4 finalColor;
uniform int dust;
void main(){
  float r2 = dot(uv,uv);
  if(r2 > 1.0) discard;
  float a = exp(-r2*4.0) - 0.0183;
  if(dust==1){
    float o = clamp(a*col.a, 0.0, 1.0);
    finalColor = vec4(mix(vec3(1.0), col.rgb, o), 1.0);
  } else {
    finalColor = vec4(col.rgb*a*col.a, 0.0);
  }
}
)";

// ---------------------------------------------------------------------------
// Far galaxies: textured quads from the impostor atlas
// ---------------------------------------------------------------------------
static const char* const IMPOSTOR_VS = R"(#version 330
in vec3 vertexPosition;
in vec2 vertexTexCoord;
in vec4 vertexTangent;
uniform mat4 mvp;
out vec2 uv;
out vec4 col;
void main(){
  uv = vertexTexCoord;
  col = vertexTangent;
  gl_Position = mvp*vec4(vertexPosition,1.0);
}
)";

static const char* const IMPOSTOR_FS = R"(#version 330
in vec2 uv;
in vec4 col;
out vec4 finalColor;
uniform sampler2D texture0;
void main(){
  vec3 t = texture(texture0, uv).rgb;
  finalColor = vec4(t*col.rgb*col.a, 0.0);
}
)";

// ---------------------------------------------------------------------------
// Star field with relativistic-looking motion streaks
// ---------------------------------------------------------------------------
static const char* const STARS_VS = R"(#version 330
in vec3 vertexPosition;
in vec2 vertexTexCoord;
in vec3 vertexNormal;
in vec4 vertexColor;
uniform mat4 matView;
uniform mat4 matProjection;
uniform vec3 camOffset;
uniform vec3 blurVec;
uniform vec2 screen;
uniform float fluxScale;
uniform float fadeR;
uniform float maxStreak;
out vec2 lc;
out vec3 col;
out float hl;
void main(){
  vec3 p0 = vertexPosition + camOffset;
  float lum = vertexNormal.x;
  float d2 = dot(p0,p0);
  float I = fluxScale*pow(lum/max(d2,1e-16), 0.5);
  if(fadeR > 0.0) I *= smoothstep(fadeR, fadeR*0.8, sqrt(d2));
  I *= vertexNormal.y;
  vec4 v0 = matView*vec4(p0,1.0);
  if(v0.z > -1e-12 || I < 0.002){ gl_Position = vec4(3.0,3.0,3.0,1.0); lc=vec2(0.0); col=vec3(0.0); hl=0.0; return; }
  vec4 v1 = matView*vec4(p0+blurVec,1.0);
  if(v1.z > v0.z*0.05){
    float t = (v0.z*0.05 - v0.z)/(v1.z - v0.z);
    v1 = mix(v0, v1, t);
  }
  vec4 c0 = matProjection*v0;
  vec4 c1 = matProjection*v1;
  vec2 s0 = c0.xy/c0.w*screen*0.5;
  vec2 s1 = c1.xy/c1.w*screen*0.5;
  vec2 d = s1 - s0;
  float L = length(d);
  if(L > maxStreak){ d *= maxStreak/L; L = maxStreak; }
  vec2 ax = L > 0.01 ? d/L : vec2(1.0,0.0);
  vec2 pe = vec2(-ax.y, ax.x);
  float r = clamp(1.25 + 1.3*log2(1.0 + I*1.5), 1.25, 12.0);
  float peak = min(I, 2.5) + min(max(I-2.5,0.0)*0.05, 12.0);
  peak *= r/(r+L*0.7);
  vec2 sp = s0 + d*0.5 + ax*vertexTexCoord.x*(L*0.5 + r) + pe*vertexTexCoord.y*r;
  gl_Position = vec4(sp/(screen*0.5), 0.0, 1.0);
  hl = L*0.5/r;
  lc = vec2(vertexTexCoord.x*(hl+1.0), vertexTexCoord.y);
  col = vertexColor.rgb*peak;
}
)";

static const char* const STARS_FS = R"(#version 330
in vec2 lc;
in vec3 col;
in float hl;
out vec4 finalColor;
void main(){
  float dx = max(abs(lc.x)-hl, 0.0);
  float d = length(vec2(dx, lc.y));
  float a = exp(-d*d*3.2);
  finalColor = vec4(col*a, 0.0);
}
)";

// ---------------------------------------------------------------------------
// Post processing (use raylib's default vertex shader)
// ---------------------------------------------------------------------------
static const char* const DOWN_FS = R"(#version 330
in vec2 fragTexCoord;
out vec4 finalColor;
uniform sampler2D texture0;
uniform vec2 texel;
uniform float threshold;
void main(){
  vec2 uv = fragTexCoord;
  vec3 c = texture(texture0, uv).rgb*4.0;
  c += texture(texture0, uv+vec2(-1.0,-1.0)*texel).rgb;
  c += texture(texture0, uv+vec2( 1.0,-1.0)*texel).rgb;
  c += texture(texture0, uv+vec2(-1.0, 1.0)*texel).rgb;
  c += texture(texture0, uv+vec2( 1.0, 1.0)*texel).rgb;
  c /= 8.0;
  if(threshold > 0.0){
    float br = max(c.r, max(c.g, c.b));
    float soft = clamp(br - threshold*0.5, 0.0, threshold);
    soft = soft*soft/(4.0*threshold + 1e-4);
    float contrib = max(soft, br - threshold)/max(br, 1e-4);
    c *= contrib;
    c = min(c, vec3(60.0));
  }
  finalColor = vec4(c, 1.0);
}
)";

static const char* const UP_FS = R"(#version 330
in vec2 fragTexCoord;
out vec4 finalColor;
uniform sampler2D texture0;
uniform vec2 texel;
uniform float weight;
void main(){
  vec2 uv = fragTexCoord;
  vec3 c = texture(texture0, uv).rgb*4.0;
  c += texture(texture0, uv+vec2(-1.0, 0.0)*texel).rgb*2.0;
  c += texture(texture0, uv+vec2( 1.0, 0.0)*texel).rgb*2.0;
  c += texture(texture0, uv+vec2( 0.0,-1.0)*texel).rgb*2.0;
  c += texture(texture0, uv+vec2( 0.0, 1.0)*texel).rgb*2.0;
  c += texture(texture0, uv+vec2(-1.0,-1.0)*texel).rgb;
  c += texture(texture0, uv+vec2( 1.0,-1.0)*texel).rgb;
  c += texture(texture0, uv+vec2(-1.0, 1.0)*texel).rgb;
  c += texture(texture0, uv+vec2( 1.0, 1.0)*texel).rgb;
  finalColor = vec4(c/16.0*weight, 1.0);
}
)";

static const char* const COMPOSITE_FS = R"(#version 330
in vec2 fragTexCoord;
out vec4 finalColor;
uniform sampler2D texture0;
uniform sampler2D bloomTex;
uniform float bloomStrength;
uniform float exposure;
uniform float warp;
uniform float time;
uniform float damage;
vec3 aces(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
}
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec2 uv = fragTexCoord;
  vec2 cc = uv-0.5;
  vec3 hdr;
  if(warp > 0.001){
    float k = warp*0.006;
    hdr.r = texture(texture0, 0.5+cc*(1.0+k)).r;
    hdr.g = texture(texture0, uv).g;
    hdr.b = texture(texture0, 0.5+cc*(1.0-k)).b;
  } else hdr = texture(texture0, uv).rgb;
  vec3 bloom = texture(bloomTex, uv).rgb;
  vec3 c = hdr + bloom*bloomStrength;
  c *= exposure;
  c = aces(c);
  c = pow(c, vec3(1.0/2.2));
  float vig = smoothstep(0.95, 0.25, length(cc*vec2(1.0,0.8)));
  c *= mix(0.72, 1.0, vig);
  if(damage > 0.0) c = mix(c, c*vec3(1.4,0.5,0.4), damage*(1.0-vig)*0.8);
  c += (hash(uv*1000.0+time)-0.5)/255.0;
  finalColor = vec4(c, 1.0);
}
)";
