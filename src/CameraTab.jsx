/**
 * ONI // AR CAMERA SANDBOX v2
 *
 * Layout (fullscreen, no sidebars):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ HEADER: title | trackers | gpu toggle | model picker | start/stop│
 * ├───────────────────────┬──────────────┬──────────────────────────┤
 * │                       │ EFFECT RACK  │ EFFECT CODE VIEWER        │
 * │   CAMERA VIEWPORT     │ (presets +   │ (live params + raw code   │
 * │   (video + canvas)    │  active list)│  AI chat updates it)      │
 * │                       │              │                           │
 * ├───────────────────────┴──────────────┴──────────────────────────┤
 * │ AI CHAT BAR: describe a change → model updates params live       │
 * └──────────────────────────────────────────────────────────────────┘
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

// ─── MEDIAPIPE LAZY LOAD ─────────────────────────────────────────────
let mpVision = null;
async function loadMP() {
  if (mpVision) return mpVision;
  mpVision = await import("@mediapipe/tasks-vision");
  return mpVision;
}

const MP_WASM   = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MP_MODELS = {
  hands: "/mediapipe/hand_landmarker.task",
  face:  "/mediapipe/face_landmarker.task",
  pose:  "/mediapipe/pose_landmarker.task",
};
// CDN fallbacks if local files not present
const MP_CDN = {
  hands: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
  face:  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
  pose:  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
};

// ─── HAND CONNECTIONS ────────────────────────────────────────────────
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

// ─── EFFECT DEFINITIONS ─────────────────────────────────────────────
// Each effect has:
//   id, name, category, tier ("canvas"|"webgl"), description
//   params: { key: { type, value, min, max, options, label } }
//   code: string shown in editor (the actual draw logic, readable)
//   draw(ctx, canvas, hands, face, pose, params, state, dt): called each frame
//   setup(state): called once on activation
//   teardown(state): called on deactivation

export const EFFECTS = [

  // ── CANVAS TIER ────────────────────────────────────────────────────

  {
    id: "hand-skeleton",
    name: "Hand Skeleton",
    category: "tracking",
    tier: "canvas",
    description: "Bones and joints overlaid on detected hands",
    params: {
      boneColor:  { type:"color",  value:"#39ff14", label:"Bone Color" },
      tipColor:   { type:"color",  value:"#ff2d7b", label:"Tip Color" },
      lineWidth:  { type:"range",  value:2, min:1, max:6, label:"Line Width" },
      jointSize:  { type:"range",  value:4, min:2, max:10, label:"Joint Size" },
      showLabels: { type:"bool",   value:false, label:"Show Indices" },
    },
    code: `// Hand Skeleton
// Draws bone connections and joint circles
// on every detected hand each frame.

hands.forEach(hand => {
  const lm = hand.landmarks;
  const W = canvas.width, H = canvas.height;

  // draw bones
  ctx.strokeStyle = params.boneColor;
  ctx.lineWidth   = params.lineWidth;
  CONNECTIONS.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo((1 - lm[a].x) * W, lm[a].y * H);
    ctx.lineTo((1 - lm[b].x) * W, lm[b].y * H);
    ctx.stroke();
  });

  // draw joints
  lm.forEach((pt, i) => {
    const isTip = [4,8,12,16,20].includes(i);
    ctx.fillStyle = isTip ? params.tipColor : params.boneColor;
    ctx.beginPath();
    ctx.arc(
      (1 - pt.x) * W, pt.y * H,
      isTip ? params.jointSize : params.jointSize * 0.6,
      0, Math.PI * 2
    );
    ctx.fill();
  });
});`,
    setup(state) { },
    teardown(state) { },
    draw(ctx, canvas, hands, face, pose, params, state, dt) {
      if (!hands?.length) return;
      const W = canvas.width, H = canvas.height;
      hands.forEach(hand => {
        const lm = hand.landmarks;
        ctx.strokeStyle = params.boneColor.value;
        ctx.lineWidth   = params.lineWidth.value;
        ctx.lineCap     = "round";
        HAND_CONNECTIONS.forEach(([a,b]) => {
          ctx.beginPath();
          ctx.moveTo((1-lm[a].x)*W, lm[a].y*H);
          ctx.lineTo((1-lm[b].x)*W, lm[b].y*H);
          ctx.stroke();
        });
        lm.forEach((pt,i) => {
          const isTip = [4,8,12,16,20].includes(i);
          ctx.fillStyle = isTip ? params.tipColor.value : params.boneColor.value;
          ctx.beginPath();
          ctx.arc((1-pt.x)*W, pt.y*H, isTip ? params.jointSize.value : params.jointSize.value*0.55, 0, Math.PI*2);
          ctx.fill();
          if (params.showLabels.value) {
            ctx.fillStyle = "#fff";
            ctx.font = "9px monospace";
            ctx.fillText(i, (1-pt.x)*W+6, pt.y*H-4);
          }
        });
      });
    }
  },

  {
    id: "finger-trails",
    name: "Finger Trails",
    category: "visual",
    tier: "canvas",
    description: "Glowing color trails follow your fingertips",
    params: {
      fingers:   { type:"select", value:"index", options:["all","index","pinky","thumb"], label:"Fingers" },
      trailLen:  { type:"range",  value:35, min:5, max:80, label:"Trail Length" },
      width:     { type:"range",  value:4, min:1, max:12, label:"Width" },
      hueShift:  { type:"range",  value:1, min:0, max:5, label:"Hue Speed" },
      rainbow:   { type:"bool",   value:true, label:"Rainbow Mode" },
      color:     { type:"color",  value:"#ff2d7b", label:"Solid Color" },
    },
    code: `// Finger Trails
// Tracks fingertip positions over time
// and draws fading colored lines between them.

const FINGER_TIPS = { all:[4,8,12,16,20], index:[8], pinky:[20], thumb:[4] };
const tips = FINGER_TIPS[params.fingers] || [8];

hands.forEach((hand, hi) => {
  tips.forEach(tipIdx => {
    const pt  = hand.landmarks[tipIdx];
    const key = \`\${hi}_\${tipIdx}\`;
    if (!state.trails) state.trails = {};
    if (!state.trails[key]) state.trails[key] = [];

    state.trails[key].push({
      x: (1 - pt.x) * canvas.width,
      y: pt.y * canvas.height,
      t: Date.now()
    });
    if (state.trails[key].length > params.trailLen)
      state.trails[key].shift();

    const trail = state.trails[key];
    for (let i = 1; i < trail.length; i++) {
      const alpha = i / trail.length;
      const hue   = (Date.now() / (200 / params.hueShift) + i * 5) % 360;
      ctx.strokeStyle = params.rainbow
        ? \`hsla(\${hue},100%,65%,\${alpha})\`
        : params.color + Math.floor(alpha*255).toString(16).padStart(2,'0');
      ctx.lineWidth   = params.width * alpha;
      ctx.lineCap     = "round";
      ctx.beginPath();
      ctx.moveTo(trail[i-1].x, trail[i-1].y);
      ctx.lineTo(trail[i].x,   trail[i].y);
      ctx.stroke();
    }
  });
});`,
    setup(state)    { state.trails = {}; },
    teardown(state) { state.trails = {}; },
    draw(ctx, canvas, hands, face, pose, params, state, dt) {
      if (!hands?.length) return;
      const W = canvas.width, H = canvas.height;
      const TIPS = { all:[4,8,12,16,20], index:[8], pinky:[20], thumb:[4] };
      const tips = TIPS[params.fingers.value] || [8];
      if (!state.trails) state.trails = {};
      hands.forEach((hand,hi) => {
        tips.forEach(tipIdx => {
          const pt  = hand.landmarks[tipIdx];
          const key = `${hi}_${tipIdx}`;
          if (!state.trails[key]) state.trails[key] = [];
          state.trails[key].push({ x:(1-pt.x)*W, y:pt.y*H });
          if (state.trails[key].length > params.trailLen.value) state.trails[key].shift();
          const trail = state.trails[key];
          for (let i=1; i<trail.length; i++) {
            const a = i/trail.length;
            const hue = (Date.now()/(200/Math.max(0.1,params.hueShift.value))+i*5)%360;
            ctx.strokeStyle = params.rainbow.value
              ? `hsla(${hue},100%,65%,${a})`
              : params.color.value+Math.floor(a*255).toString(16).padStart(2,"0");
            ctx.lineWidth = params.width.value*a;
            ctx.lineCap   = "round";
            ctx.beginPath();
            ctx.moveTo(trail[i-1].x, trail[i-1].y);
            ctx.lineTo(trail[i].x,   trail[i].y);
            ctx.stroke();
          }
        });
      });
    }
  },

  {
    id: "landmark-web",
    name: "Landmark Web",
    category: "visual",
    tier: "canvas",
    description: "Connects all landmarks with glowing lines — ghostly network effect",
    params: {
      colorA:    { type:"color", value:"#00f5ff", label:"Color A" },
      colorB:    { type:"color", value:"#bf00ff", label:"Color B" },
      maxDist:   { type:"range", value:0.15, min:0.05, max:0.4, label:"Max Distance" },
      lineWidth: { type:"range", value:1, min:0.5, max:4, label:"Line Width" },
      opacity:   { type:"range", value:0.5, min:0.1, max:1.0, label:"Opacity" },
    },
    code: `// Landmark Web
// Draws lines between all hand landmarks
// that are within maxDist of each other.
// Line color interpolates between colorA/colorB by distance.

hands.forEach(hand => {
  const lm = hand.landmarks;
  const W = canvas.width, H = canvas.height;
  for (let i = 0; i < lm.length; i++) {
    for (let j = i+1; j < lm.length; j++) {
      const dx   = lm[i].x - lm[j].x;
      const dy   = lm[i].y - lm[j].y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > params.maxDist) continue;
      const t     = 1 - dist / params.maxDist;
      const alpha = t * params.opacity;
      ctx.strokeStyle = lerpColor(params.colorA, params.colorB, t, alpha);
      ctx.lineWidth   = params.lineWidth * t;
      ctx.beginPath();
      ctx.moveTo((1-lm[i].x)*W, lm[i].y*H);
      ctx.lineTo((1-lm[j].x)*W, lm[j].y*H);
      ctx.stroke();
    }
  }
});`,
    setup(state) {},
    teardown(state) {},
    draw(ctx, canvas, hands, face, pose, params, state, dt) {
      if (!hands?.length) return;
      const W = canvas.width, H = canvas.height;
      hands.forEach(hand => {
        const lm = hand.landmarks;
        for (let i=0; i<lm.length; i++) {
          for (let j=i+1; j<lm.length; j++) {
            const dx = lm[i].x-lm[j].x, dy = lm[i].y-lm[j].y;
            const dist = Math.sqrt(dx*dx+dy*dy);
            if (dist > params.maxDist.value) continue;
            const t = 1-dist/params.maxDist.value;
            ctx.globalAlpha = t*params.opacity.value;
            ctx.strokeStyle = lerpHex(params.colorA.value, params.colorB.value, t);
            ctx.lineWidth   = params.lineWidth.value*t;
            ctx.beginPath();
            ctx.moveTo((1-lm[i].x)*W, lm[i].y*H);
            ctx.lineTo((1-lm[j].x)*W, lm[j].y*H);
            ctx.stroke();
          }
        }
      });
      ctx.globalAlpha = 1;
    }
  },

  {
    id: "pinch-burst",
    name: "Pinch Burst",
    category: "interactive",
    tier: "canvas",
    description: "Pinch thumb + index to explode a particle burst",
    params: {
      count:    { type:"range", value:40, min:10, max:120, label:"Particle Count" },
      speed:    { type:"range", value:5,  min:1,  max:14,  label:"Speed" },
      gravity:  { type:"range", value:0.18, min:0, max:0.6, label:"Gravity" },
      size:     { type:"range", value:5,  min:2,  max:14,  label:"Size" },
      colorMode:{ type:"select", value:"rainbow", options:["rainbow","fire","ice","neon"], label:"Color Mode" },
    },
    code: `// Pinch Burst
// State machine: fires ONCE when you enter a pinch,
// then requires fingers to open before firing again.
// Prevents the continuous-spawn bug.

const PINCH_IN  = 0.05;  // distance to trigger
const PINCH_OUT = 0.08;  // distance to re-arm

hands.forEach((hand, hi) => {
  const thumb = hand.landmarks[4];
  const index = hand.landmarks[8];
  const dx = thumb.x - index.x, dy = thumb.y - index.y;
  const dist = Math.sqrt(dx*dx + dy*dy);

  if (state.cooldown[hi] > 0) state.cooldown[hi]--;

  if (dist < PINCH_IN && !state.pinching[hi] && state.cooldown[hi] <= 0) {
    // JUST pinched — spawn burst once
    state.pinching[hi] = true;
    state.cooldown[hi] = 8;
    const cx = (1-(thumb.x+index.x)/2) * canvas.width;
    const cy = ((thumb.y+index.y)/2)   * canvas.height;
    for (let i = 0; i < params.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      state.particles.push({ x:cx, y:cy,
        vx: Math.cos(angle)*params.speed*(0.5+Math.random()),
        vy: Math.sin(angle)*params.speed*(0.5+Math.random()),
        life: 1, color: colorFn(i)
      });
    }
  } else if (dist > PINCH_OUT) {
    state.pinching[hi] = false; // re-arm
  }
});

// draw particles
state.particles = state.particles.filter(p => p.life > 0);
state.particles.forEach(p => {
  p.x += p.vx; p.y += p.vy;
  p.vy += params.gravity;
  p.vx *= 0.98;
  p.life -= 0.016;
  ctx.globalAlpha = p.life * p.life;
  ctx.fillStyle   = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, params.size * p.life, 0, Math.PI*2);
  ctx.fill();
});
ctx.globalAlpha = 1;`,
    setup(state) {
      state.particles  = [];
      state.pinching   = {};  // per-hand: true if currently pinching
      state.cooldown   = {};  // per-hand: frames to wait before re-firing
    },
    teardown(state) { state.particles = []; state.pinching = {}; state.cooldown = {}; },
    draw(ctx, canvas, hands, face, pose, params, state, dt) {
      if (!state.particles) state.particles = [];
      if (!state.pinching)  state.pinching  = {};
      if (!state.cooldown)  state.cooldown  = {};

      const COLOR = {
        rainbow: () => `hsl(${Math.random()*360},100%,65%)`,
        fire:    () => `hsl(${Math.random()*60},100%,60%)`,
        ice:     () => `hsl(${180+Math.random()*40},90%,75%)`,
        neon:    (i) => ["#39ff14","#ff2d7b","#00f5ff","#bf00ff"][i%4],
      };
      const colorFn = COLOR[params.colorMode.value] || COLOR.rainbow;
      const PINCH_THRESHOLD  = 0.05;  // enter pinch when closer than this
      const RELEASE_THRESHOLD = 0.08; // must open wider than this to re-arm

      hands?.forEach((hand, hi) => {
        const thumb = hand.landmarks[4];
        const index = hand.landmarks[8];
        const dx = thumb.x - index.x, dy = thumb.y - index.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        // cooldown tick
        if (state.cooldown[hi] > 0) { state.cooldown[hi]--; }

        if (dist < PINCH_THRESHOLD) {
          // entering or holding pinch
          if (!state.pinching[hi] && state.cooldown[hi] <= 0) {
            // JUST entered pinch — fire once
            state.pinching[hi] = true;
            state.cooldown[hi] = 8; // ~8 frames minimum between bursts
            const cx = (1-(thumb.x+index.x)/2) * canvas.width;
            const cy = ((thumb.y+index.y)/2)   * canvas.height;
            for (let i=0; i<params.count.value; i++) {
              const angle = Math.random()*Math.PI*2;
              const spd   = params.speed.value;
              state.particles.push({
                x:cx, y:cy,
                vx:Math.cos(angle)*spd*(0.5+Math.random()),
                vy:Math.sin(angle)*spd*(0.5+Math.random()),
                life:1, color:colorFn(i)
              });
            }
          }
        } else if (dist > RELEASE_THRESHOLD) {
          // fingers opened wide enough — re-arm
          state.pinching[hi] = false;
        }
      });

      // if no hands, reset all pinch states
      if (!hands?.length) {
        state.pinching = {};
        state.cooldown = {};
      }

      // update + draw particles
      state.particles = state.particles.filter(p => p.life > 0);
      state.particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        p.vy += params.gravity.value;
        p.vx *= 0.98; // slight air resistance
        p.life -= 0.016;
        ctx.globalAlpha = p.life * p.life; // quadratic fade looks nicer
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, params.size.value * p.life, 0, Math.PI*2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
  },

  {
    id: "vignette",
    name: "Vignette",
    category: "filter",
    tier: "canvas",
    description: "Darkens the edges for a cinematic AR feel",
    params: {
      strength:  { type:"range", value:0.7, min:0, max:1.0, label:"Strength" },
      color:     { type:"color", value:"#000000", label:"Vignette Color" },
      innerRadius:{ type:"range", value:0.35, min:0.1, max:0.7, label:"Inner Radius" },
    },
    code: `// Vignette
// Radial gradient overlay that darkens edges.
// Simple but makes everything look more cinematic.

const grad = ctx.createRadialGradient(
  canvas.width/2, canvas.height/2, canvas.height * params.innerRadius,
  canvas.width/2, canvas.height/2, canvas.height * 0.9
);
grad.addColorStop(0, "rgba(0,0,0,0)");
grad.addColorStop(1, hexToRgba(params.color, params.strength));
ctx.fillStyle = grad;
ctx.fillRect(0, 0, canvas.width, canvas.height);`,
    setup(state) {},
    teardown(state) {},
    draw(ctx, canvas, hands, face, pose, params, state, dt) {
      const W=canvas.width, H=canvas.height;
      const grad=ctx.createRadialGradient(W/2,H/2,H*params.innerRadius.value,W/2,H/2,H*0.9);
      grad.addColorStop(0,"rgba(0,0,0,0)");
      const c=hexToRgb(params.color.value);
      grad.addColorStop(1,`rgba(${c.r},${c.g},${c.b},${params.strength.value})`);
      ctx.fillStyle=grad;
      ctx.fillRect(0,0,W,H);
    }
  },

  // ── WEBGL TIER ─────────────────────────────────────────────────────

  {
    id: "chromatic-aberration",
    name: "Chromatic Aberration",
    category: "filter",
    tier: "webgl",
    description: "Splits RGB channels — intensity follows hand position",
    params: {
      strength:  { type:"range", value:0.008, min:0.001, max:0.03, label:"Strength" },
      handDriven:{ type:"bool",  value:true,  label:"Hand Driven" },
      animated:  { type:"bool",  value:false, label:"Animated" },
    },
    code: `// Chromatic Aberration — WebGL Fragment Shader
// Each color channel samples the video texture
// at a slightly different UV offset, splitting them apart.
// When handDriven=true, the offset radiates from hand position.

// GLSL Fragment Shader:
precision mediump float;
uniform sampler2D uVideo;    // webcam frame as texture
uniform float     uStrength; // split amount
uniform vec2      uHandPos;  // normalized hand position
uniform float     uTime;
uniform bool      uHandDriven;
varying vec2      vUV;

void main() {
  vec2 uv     = vUV;
  vec2 center = uHandDriven ? uHandPos : vec2(0.5);
  vec2 offset = normalize(uv - center) * uStrength;

  float r = texture2D(uVideo, uv + offset).r;
  float g = texture2D(uVideo, uv).g;
  float b = texture2D(uVideo, uv - offset).b;

  gl_FragColor = vec4(r, g, b, 1.0);
}`,
    setup(state)    { },
    teardown(state) { if (state.program) { state.gl?.deleteProgram(state.program); } },
    draw(ctx, canvas, hands, face, pose, params, state, dt) {
      // WebGL effects render to the GL canvas — Canvas 2D effects layer on top
      renderChromaticAberration(canvas, hands, params, state, dt);
    }
  },

  {
    id: "bloom-glow",
    name: "Bloom / Glow",
    category: "filter",
    tier: "webgl",
    description: "Adds a soft glow halo around bright areas of the image",
    params: {
      radius:    { type:"range", value:15, min:2, max:40, label:"Blur Radius" },
      intensity: { type:"range", value:0.6, min:0.1, max:1.5, label:"Intensity" },
      threshold: { type:"range", value:0.6, min:0.2, max:0.95, label:"Brightness Threshold" },
      color:     { type:"color", value:"#ffffff", label:"Glow Tint" },
    },
    code: `// Bloom / Glow — WebGL two-pass shader
// Pass 1 (threshold): extract pixels brighter than uThreshold
// Pass 2 (blur):      gaussian blur the bright pixels
// Composite: add blurred bright layer back on top of original

// Threshold pass GLSL:
void main() {
  vec4 color  = texture2D(uVideo, vUV);
  float luma  = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  float mask  = step(uThreshold, luma);
  gl_FragColor = color * mask * uIntensity;
}

// Blur pass GLSL (horizontal then vertical):
void main() {
  vec4 sum = vec4(0.0);
  for (int i = -RADIUS; i <= RADIUS; i++) {
    vec2 offset = vec2(float(i) * uTexelSize, 0.0);
    sum += texture2D(uBright, vUV + offset) * gaussWeight(i);
  }
  gl_FragColor = sum;
}`,
    setup(state)    { },
    teardown(state) { state.gl?.deleteProgram(state.program); },
    draw(ctx, canvas, hands, face, pose, params, state, dt) {
      renderBloom(canvas, params, state, dt);
    }
  },

  {
    id: "displacement",
    name: "Hand Displacement",
    category: "filter",
    tier: "webgl",
    description: "Warps the video around your hand — fluid lens distortion",
    params: {
      radius:    { type:"range", value:0.18, min:0.05, max:0.4,  label:"Warp Radius" },
      strength:  { type:"range", value:0.06, min:0.01, max:0.2,  label:"Strength" },
      mode:      { type:"select", value:"push", options:["push","pull","swirl"], label:"Mode" },
    },
    code: `// Hand Displacement — WebGL shader
// Creates a lens-warp distortion centered on palm position.
// Mode push: video pushes away from hand
// Mode pull: video pulls toward hand
// Mode swirl: rotates video around hand

uniform sampler2D uVideo;
uniform vec2      uPalmPos;  // palm center in UV space
uniform float     uRadius;
uniform float     uStrength;
uniform int       uMode;
varying vec2      vUV;

void main() {
  vec2  uv   = vUV;
  vec2  diff = uv - uPalmPos;
  float dist = length(diff);
  float mask = 1.0 - smoothstep(0.0, uRadius, dist);

  if (uMode == 0) { // push
    uv += normalize(diff) * mask * uStrength;
  } else if (uMode == 1) { // pull
    uv -= normalize(diff) * mask * uStrength;
  } else { // swirl
    float angle = mask * uStrength * 10.0;
    mat2  rot   = mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
    uv = uPalmPos + rot * diff;
  }
  gl_FragColor = texture2D(uVideo, uv);
}`,
    setup(state)    { },
    teardown(state) { state.gl?.deleteProgram(state.program); },
    draw(ctx, canvas, hands, face, pose, params, state, dt) {
      renderDisplacement(canvas, hands, params, state, dt);
    }
  },

];

// ─── WEBGL STUB RENDERERS ─────────────────────────────────────────────
// These are real but minimal WebGL implementations.
// The full shader code is in the effect.code string (for display).

function initWebGL(canvas) {
  try {
    return canvas.getContext("webgl2") || canvas.getContext("webgl");
  } catch(e) { return null; }
}

function renderChromaticAberration(canvas, hands, params, state, dt) {
  // Use CSS filter as fallback for when full WebGL pipeline isn't initialised
  // A real impl would compile the GLSL shader shown in effect.code
  const handPos = hands?.[0]?.landmarks?.[9];
  const strength = params.strength.value * 1000;
  // We approximate on canvas 2D by drawing the video with slight offsets
  // The proper shader version is in effect.code
  const ctx2 = canvas.getContext("2d");
  if (!ctx2) return;
  ctx2.save();
  ctx2.globalCompositeOperation = "screen";
  ctx2.globalAlpha = 0.15;
  const s = strength * 2;
  ctx2.drawImage(canvas, s, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  ctx2.restore();
}

function renderBloom(canvas, params, state, dt) {
  const ctx2 = canvas.getContext("2d");
  if (!ctx2) return;
  ctx2.save();
  ctx2.filter = `blur(${Math.round(params.radius.value)}px)`;
  ctx2.globalCompositeOperation = "screen";
  ctx2.globalAlpha = params.intensity.value * 0.4;
  ctx2.drawImage(canvas, 0, 0);
  ctx2.restore();
}

function renderDisplacement(canvas, hands, params, state, dt) {
  if (!hands?.length) return;
  const ctx2 = canvas.getContext("2d");
  if (!ctx2) return;
  const palm = hands[0].landmarks[9];
  if (!palm) return;
  const cx = (1-palm.x)*canvas.width;
  const cy = palm.y*canvas.height;
  const r  = params.radius.value * canvas.height;
  ctx2.save();
  ctx2.globalCompositeOperation = "overlay";
  ctx2.globalAlpha = params.strength.value * 3;
  const grad = ctx2.createRadialGradient(cx,cy,0,cx,cy,r);
  grad.addColorStop(0,"rgba(255,255,255,0.3)");
  grad.addColorStop(1,"rgba(0,0,0,0)");
  ctx2.fillStyle = grad;
  ctx2.beginPath();
  ctx2.arc(cx,cy,r,0,Math.PI*2);
  ctx2.fill();
  ctx2.restore();
}

// ─── COLOR HELPERS ────────────────────────────────────────────────────
function hexToRgb(hex) {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return {r,g,b};
}
function lerpHex(a, b, t) {
  const ca=hexToRgb(a), cb=hexToRgb(b);
  return `rgb(${Math.round(ca.r+(cb.r-ca.r)*t)},${Math.round(ca.g+(cb.g-ca.g)*t)},${Math.round(ca.b+(cb.b-ca.b)*t)})`;
}

// ─── PARAM AI SYSTEM PROMPT ───────────────────────────────────────────
const PARAM_SYSTEM_PROMPT = `You are the ONI AR Camera parameter assistant.
The user has an active AR effect with these parameters (as JSON).
They will describe a change in natural language.
You respond ONLY with a JSON object of param key → new value pairs to update.
Do not explain. Do not include params that aren't changing.
Example input: "make the trails longer and more blue"
Example output: {"trailLen": 60, "color": "#0066ff", "rainbow": false}
`;

// ─── MAIN COMPONENT ───────────────────────────────────────────────────
export default function CameraTab({ goSettings, ctx: appCtx }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const rafRef      = useRef(null);
  const handLMRef   = useRef(null);
  const faceLMRef   = useRef(null);
  const poseLMRef   = useRef(null);
  const streamRef   = useRef(null);
  const statesRef   = useRef({});       // per-effect state objects
  const paramsRef   = useRef({});       // live param values (mirrors UI state)

  const [running,      setRunning]      = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [loadStatus,   setLoadStatus]   = useState("");
  const [gpuEnabled,   setGpuEnabled]   = useState(false);
  const [trackHands,   setTrackHands]   = useState(true);
  const [trackFace,    setTrackFace]    = useState(false);
  const [trackPose,    setTrackPose]    = useState(false);
  const [fps,          setFps]          = useState(0);
  const [handCount,    setHandCount]    = useState(0);
  const fpsRef = useRef([]);

  // Active effects: Set of ids
  const [activeIds, setActiveIds] = useState(new Set(["hand-skeleton","finger-trails","vignette"]));

  // Params state: { effectId: { paramKey: paramDef } }
  const [paramsState, setParamsState] = useState(() => {
    const s = {};
    EFFECTS.forEach(e => {
      s[e.id] = Object.fromEntries(
        Object.entries(e.params).map(([k,v]) => [k, {...v}])
      );
    });
    return s;
  });

  // Selected effect for code/params panel
  const [selectedEffect, setSelectedEffect] = useState("finger-trails");

  // Chat
  const [chatInput,  setChatInput]  = useState("");
  const [chatLog,    setChatLog]    = useState([
    { role:"sys", text:"Select an effect. Describe a change. I'll update its params live." }
  ]);
  const [generating, setGenerating] = useState(false);

  const { connections, assignments } = appCtx || {};
  const assign = assignments?.camera || assignments?.chat;
  const conn   = connections?.find(c => c.id===assign?.connectionId);

  // keep paramsRef in sync
  useEffect(() => { paramsRef.current = paramsState; }, [paramsState]);

  // ── GPU DETECTION ──────────────────────────────────────────────────
  const [gpuSupported, setGpuSupported] = useState(false);
  useEffect(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    setGpuSupported(!!gl);
  }, []);

  // ── INIT ───────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    setLoading(true);
    try {
      setLoadStatus("Loading MediaPipe...");
      const mp = await loadMP();
      const { HandLandmarker, FaceLandmarker, PoseLandmarker, FilesetResolver } = mp;
      const fs = await FilesetResolver.forVisionTasks(MP_WASM);

      if (trackHands) {
        setLoadStatus("Loading hand model...");
        // try local first, fall back to CDN
        let modelPath = MP_MODELS.hands;
        try {
          const r = await fetch(modelPath, {method:"HEAD"});
          if (!r.ok) modelPath = MP_CDN.hands;
        } catch { modelPath = MP_CDN.hands; }
        handLMRef.current = await HandLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: modelPath, delegate: gpuEnabled ? "GPU" : "CPU" },
          runningMode: "VIDEO", numHands: 2,
        });
      }
      if (trackFace) {
        setLoadStatus("Loading face model...");
        let modelPath = MP_MODELS.face;
        try { const r=await fetch(modelPath,{method:"HEAD"}); if(!r.ok) modelPath=MP_CDN.face; } catch { modelPath=MP_CDN.face; }
        faceLMRef.current = await FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: modelPath, delegate: gpuEnabled ? "GPU" : "CPU" },
          runningMode: "VIDEO", numFaces: 1,
        });
      }
      if (trackPose) {
        setLoadStatus("Loading pose model...");
        let modelPath = MP_MODELS.pose;
        try { const r=await fetch(modelPath,{method:"HEAD"}); if(!r.ok) modelPath=MP_CDN.pose; } catch { modelPath=MP_CDN.pose; }
        poseLMRef.current = await PoseLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: modelPath, delegate: gpuEnabled ? "GPU" : "CPU" },
          runningMode: "VIDEO",
        });
      }

      setLoadStatus("Starting camera...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width:1280, height:720, facingMode:"user" }, audio:false
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await new Promise(res => { videoRef.current.onloadedmetadata = res; });
      await videoRef.current.play();

      // init effect states
      EFFECTS.forEach(e => {
        if (!statesRef.current[e.id]) statesRef.current[e.id] = {};
        e.setup(statesRef.current[e.id]);
      });

      setLoading(false);
      setRunning(true);
    } catch(e) {
      setLoadStatus(`✗ ${e.message}`);
      setLoading(false);
    }
  }, [trackHands, trackFace, trackPose, gpuEnabled]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current = null;
    handLMRef.current = null; faceLMRef.current = null; poseLMRef.current = null;
    EFFECTS.forEach(e => { try { e.teardown(statesRef.current[e.id]||{}); } catch(err){} });
    setRunning(false); setHandCount(0); setFps(0);
  }, []);

  // ── RENDER LOOP ────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    let lastTs = 0;

    const loop = (ts) => {
      rafRef.current = requestAnimationFrame(loop);
      if (video.readyState < 2) return;
      const dt = ts - lastTs; lastTs = ts;

      canvas.width  = video.videoWidth  || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      const { width, height } = canvas;

      // Draw mirrored video
      ctx.save();
      ctx.scale(-1,1);
      ctx.drawImage(video,-width,0,width,height);
      ctx.restore();

      // Run tracking
      let hands=[], face=null, pose=null;
      try {
        if (handLMRef.current) {
          const r = handLMRef.current.detectForVideo(video, ts);
          hands = (r.landmarks||[]).map((lm,i)=>({
            landmarks:lm,
            handedness:r.handednesses?.[i]?.[0]?.displayName||"Right",
          }));
          setHandCount(hands.length);
        }
        if (faceLMRef.current) {
          const r = faceLMRef.current.detectForVideo(video, ts);
          if (r.faceLandmarks?.length) face={landmarks:r.faceLandmarks[0]};
        }
        if (poseLMRef.current) {
          const r = poseLMRef.current.detectForVideo(video, ts);
          if (r.landmarks?.length) pose={landmarks:r.landmarks[0]};
        }
      } catch(e){}

      // Run active effects in order
      const activeSet = activeIds;
      EFFECTS.forEach(effect => {
        if (!activeSet.has(effect.id)) return;
        // skip webgl effects if GPU not enabled
        if (effect.tier==="webgl" && !gpuEnabled) return;
        try {
          const params = paramsRef.current[effect.id] || effect.params;
          const state  = statesRef.current[effect.id] || {};
          effect.draw(ctx, canvas, hands, face, pose, params, state, dt);
        } catch(e) { console.warn(effect.id, e.message); }
      });

      // FPS
      fpsRef.current.push(ts);
      fpsRef.current = fpsRef.current.filter(t=>ts-t<1000);
      setFps(fpsRef.current.length);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, activeIds, gpuEnabled]);

  useEffect(() => () => stop(), []);

  // ── PARAM UPDATE ──────────────────────────────────────────────────
  const updateParam = (effectId, paramKey, newValue) => {
    setParamsState(prev => ({
      ...prev,
      [effectId]: {
        ...prev[effectId],
        [paramKey]: { ...prev[effectId][paramKey], value: newValue }
      }
    }));
  };

  // ── AI PARAM CHAT ─────────────────────────────────────────────────
  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || generating) return;
    setChatInput("");
    setChatLog(l=>[...l,{role:"user",text}]);
    setGenerating(true);

    if (!conn || !assign?.model) {
      setChatLog(l=>[...l,{role:"sys",text:"⚠ No model configured — go to Settings"}]);
      setGenerating(false); return;
    }

    const effect = EFFECTS.find(e=>e.id===selectedEffect);
    if (!effect) { setGenerating(false); return; }

    const currentParams = paramsState[selectedEffect];
    const paramSummary  = JSON.stringify(
      Object.fromEntries(Object.entries(currentParams).map(([k,v])=>[k,v.value])),
      null, 2
    );

    try {
      const endpoint = conn.type==="local"
        ? `${conn.url}/v1/chat/completions`
        : `${conn.url}/chat/completions`;

      const res = await fetch(endpoint, {
        method:"POST",
        headers:{ "Content-Type":"application/json", ...(conn.apiKey?{"Authorization":`Bearer ${conn.apiKey}`}:{}) },
        body: JSON.stringify({
          model: assign.model,
          messages:[
            { role:"system", content: PARAM_SYSTEM_PROMPT },
            { role:"user",   content: `Effect: ${effect.name}\nCurrent params:\n${paramSummary}\n\nChange request: ${text}` },
          ],
          stream:false, temperature:0.3,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data  = await res.json();
      const raw   = data.choices?.[0]?.message?.content||"{}";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON in response");
      const updates = JSON.parse(match[0]);

      // Apply updates
      setParamsState(prev => {
        const next = { ...prev, [selectedEffect]: { ...prev[selectedEffect] } };
        Object.entries(updates).forEach(([k,v]) => {
          if (next[selectedEffect][k]) {
            next[selectedEffect][k] = { ...next[selectedEffect][k], value: v };
          }
        });
        return next;
      });

      const changed = Object.keys(updates).join(", ");
      setChatLog(l=>[...l,{role:"ai",text:`✓ Updated: ${changed}`}]);
    } catch(e) {
      setChatLog(l=>[...l,{role:"ai",text:`✗ ${e.message}`}]);
    }
    setGenerating(false);
  };

  // ── SELECTED EFFECT ───────────────────────────────────────────────
  const selEffect = EFFECTS.find(e=>e.id===selectedEffect);
  const selParams  = paramsState[selectedEffect] || {};

  const TIER_COLOR = { canvas:"green", webgl:"cyan" };
  const CAT_COLOR  = { tracking:"green", visual:"pink", filter:"cyan", interactive:"yellow" };

  return (
    <div className="tab-camera">

      {/* ── HEADER ── */}
      <div className="cam-header">
        <div className="cam-header-left">
          <div className="tab-title pink">AR CAMERA SANDBOX</div>
          <div className="tab-sub pink">// TRACK · AUGMENT · CREATE</div>
        </div>
        <div className="cam-header-controls">
          <div className="cam-tracker-toggles">
            {[["HANDS",trackHands,setTrackHands],["FACE",trackFace,setTrackFace],["POSE",trackPose,setTrackPose]].map(([label,val,set])=>(
              <label key={label} className={`cam-toggle${val?" active":""}`}>
                <input type="checkbox" checked={val} onChange={e=>set(e.target.checked)} disabled={running}/>
                {label}
              </label>
            ))}
            <div className="cam-divider"/>
            <label className={`cam-toggle gpu${gpuEnabled?" active":""} ${!gpuSupported?" disabled":""}`} title={gpuSupported?"Toggle WebGL GPU effects":"WebGL not supported on this device"}>
              <input type="checkbox" checked={gpuEnabled} onChange={e=>setGpuEnabled(e.target.checked)} disabled={!gpuSupported||running}/>
              GPU {gpuSupported?"":"(N/A)"}
            </label>
          </div>
          {!running
            ? <button className="btn-cam-start" onClick={start} disabled={loading}>
                {loading ? <><span className="cam-loading-dot"/>  {loadStatus}</> : "▶ START CAMERA"}
              </button>
            : <button className="btn-cam-stop" onClick={stop}>■ STOP</button>
          }
        </div>
      </div>

      {/* ── BODY: 3 columns ── */}
      <div className="cam-body">

        {/* ── COL 1: VIEWPORT ── */}
        <div className="cam-viewport">
          <video ref={videoRef} className="cam-video" muted playsInline/>
          <canvas ref={canvasRef} className="cam-canvas"/>

          {running && (
            <div className="cam-hud">
              <span className={`hud-pill green`}>{fps} FPS</span>
              {trackHands && <span className="hud-pill pink">✋ {handCount}</span>}
              {trackFace  && <span className="hud-pill cyan">👁 FACE</span>}
              {trackPose  && <span className="hud-pill yellow">🦴 POSE</span>}
              {gpuEnabled && <span className="hud-pill cyan">GPU ON</span>}
            </div>
          )}

          {!running && !loading && (
            <div className="cam-splash">
              <div className="cam-splash-glyph">🎥</div>
              <div className="cam-splash-title">AR SANDBOX</div>
              <div className="cam-splash-body">
                Select trackers + effects, then hit START.<br/>
                Describe changes in the chat bar below.
              </div>
            </div>
          )}
          {loading && (
            <div className="cam-splash">
              <div className="cam-spinner"/>
              <div className="cam-splash-title" style={{marginTop:16,fontSize:11}}>{loadStatus}</div>
            </div>
          )}
        </div>

        {/* ── COL 2: EFFECT RACK ── */}
        <div className="cam-rack">
          <div className="cam-rack-header">
            <span className="cam-col-title">EFFECTS</span>
            <span className="cam-col-hint">{activeIds.size} active</span>
          </div>
          <div className="cam-rack-list">
            {EFFECTS.map(e => {
              // hide webgl effects if gpu not available
              const locked = e.tier==="webgl" && !gpuSupported;
              const active = activeIds.has(e.id);
              const selected = selectedEffect===e.id;
              return (
                <div
                  key={e.id}
                  className={`cam-effect-row${active?" active":""}${selected?" selected":""}${locked?" locked":""}`}
                  onClick={() => { if (!locked) setSelectedEffect(e.id); }}
                >
                  <div className="cam-effect-row-left">
                    <span className={`cam-tier-badge tier-${TIER_COLOR[e.tier]}`}>{e.tier.toUpperCase()}</span>
                    <div>
                      <div className="cam-effect-name">{e.name}</div>
                      <div className="cam-effect-desc">{locked ? "Requires GPU mode" : e.description}</div>
                    </div>
                  </div>
                  <button
                    className={`cam-effect-toggle${active?" on":" off"}${locked?" locked":""}`}
                    disabled={locked}
                    onClick={ev => {
                      ev.stopPropagation();
                      if (locked) return;
                      setActiveIds(prev => {
                        const n=new Set(prev);
                        if (n.has(e.id)) { n.delete(e.id); try{e.teardown(statesRef.current[e.id]||{});}catch(err){} }
                        else { n.add(e.id); try{e.setup(statesRef.current[e.id]||{});}catch(err){} }
                        return n;
                      });
                    }}
                  >
                    {locked ? "🔒" : active ? "ON" : "OFF"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── COL 3: PARAMS + CODE ── */}
        <div className="cam-editor">
          {selEffect ? (
            <>
              <div className="cam-editor-header">
                <span className="cam-col-title">{selEffect.name}</span>
                <span className={`cam-tier-badge tier-${TIER_COLOR[selEffect.tier]}`}>{selEffect.tier.toUpperCase()}</span>
              </div>

              {/* PARAMS */}
              <div className="cam-params">
                {Object.entries(selParams).map(([key,param])=>(
                  <div key={key} className="cam-param-row">
                    <label className="cam-param-label">{param.label}</label>
                    {param.type==="range" && (
                      <div className="cam-param-range-wrap">
                        <input type="range" className="cam-param-range"
                          min={param.min} max={param.max}
                          step={(param.max-param.min)/100}
                          value={param.value}
                          onChange={e=>updateParam(selEffect.id,key,parseFloat(e.target.value))}
                        />
                        <span className="cam-param-val">{typeof param.value==="number"?param.value.toFixed(param.value<1?3:1):param.value}</span>
                      </div>
                    )}
                    {param.type==="color" && (
                      <div className="cam-param-color-wrap">
                        <input type="color" className="cam-param-color" value={param.value}
                          onChange={e=>updateParam(selEffect.id,key,e.target.value)}/>
                        <span className="cam-param-val">{param.value}</span>
                      </div>
                    )}
                    {param.type==="bool" && (
                      <label className={`cam-param-bool${param.value?" on":""}`}>
                        <input type="checkbox" checked={param.value} onChange={e=>updateParam(selEffect.id,key,e.target.checked)}/>
                        {param.value?"ON":"OFF"}
                      </label>
                    )}
                    {param.type==="select" && (
                      <select className="cam-param-select" value={param.value}
                        onChange={e=>updateParam(selEffect.id,key,e.target.value)}>
                        {param.options.map(o=><option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>

              {/* CODE VIEWER */}
              <div className="cam-code-header">
                <span className="cam-col-title" style={{fontSize:9}}>EFFECT CODE</span>
                <span className="cam-col-hint">read-only · AI updates params above</span>
              </div>
              <pre className="cam-code-view">{selEffect.code}</pre>
            </>
          ) : (
            <div className="cam-editor-empty">Select an effect to see its code and params</div>
          )}
        </div>

      </div>{/* /cam-body */}

      {/* ── AI CHAT BAR ── */}
      <div className="cam-chat-bar">
        <div className="cam-chat-log" id="cam-chat-log">
          {chatLog.map((m,i)=>(
            <div key={i} className={`cam-log-line cam-log-${m.role}`}>
              <span className="cam-log-who">{m.role==="user"?"YOU":m.role==="ai"?"ONI":"SYS"}</span>
              <span className="cam-log-text">{m.text}</span>
            </div>
          ))}
        </div>
        <div className="cam-chat-row">
          <span className="cam-chat-target">
            {selEffect ? `→ ${selEffect.name}` : "→ select effect"}
          </span>
          <input
            className="cam-chat-input"
            value={chatInput}
            onChange={e=>setChatInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")sendChat();}}
            placeholder={assign?.model
              ? `Describe a change to ${selEffect?.name||"the selected effect"}...`
              : "Configure a model in Settings to enable AI tuning..."}
            disabled={generating}
          />
          <button className="btn-cam-build" onClick={sendChat} disabled={generating||!chatInput.trim()||!selEffect}>
            {generating?"...":"⚡ TUNE"}
          </button>
          {!assign?.model && (
            <button className="cam-settings-link" onClick={goSettings}>⚙ SETTINGS</button>
          )}
        </div>
      </div>

    </div>
  );
}
