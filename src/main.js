// One card falls through the page. Everything on screen is a pure function of scroll position p (0..1).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const webgl = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();
if (webgl) start();

// Depth is 0..1 across the light's 15 unit range, the map spans 8 units, the softbox is ~2.75 wide at 8 away.
// So one unit of depth gap gives a penumbra radius of 15 * (2.75 / 8) / 2 / 8 = .32 in map space.
const PCSS = /* glsl */`
  vec2 pcssDisk( int i, float n, float phi ) {
    float r = sqrt( ( float( i ) + 0.5 ) / n ), t = float( i ) * 2.399963 + phi;
    return vec2( cos( t ), sin( t ) ) * r;
  }
  float pcss( sampler2D map, vec3 c ) {
    float phi = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) * 6.2831853;
    float sum = 0.0, hits = 0.0;
    for ( int i = 0; i < 32; i ++ ) { // fixed pattern: a per-pixel one makes the penumbra width itself noisy
      float d = texture2D( map, c.xy + pcssDisk( i, 32.0, 0.0 ) * 0.05 ).r;
      if ( d < c.z ) { sum += d; hits += 1.0; }
    }
    if ( hits < 0.5 ) return 1.0;
    float radius = clamp( ( c.z - sum / hits ) * 0.32, 0.0006, 0.06 ), lit = 0.0;
    for ( int i = 0; i < 24; i ++ ) lit += step( c.z, texture2D( map, c.xy + pcssDisk( i, 24.0, phi ) * radius ).r );
    return lit / 24.0;
  }
`;
const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
THREE.ShaderChunk.shadowmap_pars_fragment = chunk
  .replace('#ifdef USE_SHADOWMAP', `#ifdef USE_SHADOWMAP
${PCSS}`)
  .replace('shadow = step( shadowCoord.z, depth );', 'shadow = pcss( shadowMap, shadowCoord.xyz );');
console.assert(THREE.ShaderChunk.shadowmap_pars_fragment.includes('float pcss'), 'three.js shadow chunk changed, PCSS not applied');

function start() {
  document.documentElement.classList.add('gl');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(pointer: coarse)').matches;

  // Scene units match the Blender set: same card, same camera lens, same layouts as the slides.
  const CW = 0.9, CH = CW * 1016 / 638, CT = 0.013, CR = 0.035;
  const FOV = 21.2, STEP = 14, rad = THREE.MathUtils.degToRad;
  const Y = [0, -STEP, -STEP * 2, -STEP * 3];
  const BG = ['#d91e25', '#d91e25', '#dedede', '#fde100'];

  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('stage'), alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.5 : 2));
  renderer.toneMapping = THREE.NeutralToneMapping; // the same view transform as the renders, so art colours match
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap; // raw depth, which the PCSS pass below needs
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);

  // Reflections: a studio with two softboxes over a pale table. Flat, the card mirrors the dim ceiling and the
  // art stays clear; tilted toward edge-on, Fresnel makes it mirror the bright set, as a real card does.
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x5a5652);
  const box = (w, h, power, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(power, power, power), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); room.add(m);
  };
  box(40, 40, 0.6, [0, 0, -3]);
  box(5, 6.5, 5, [-4.7, -3, 8]);
  box(1.6, 8, 3.5, [0, 5, 8]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(room, 0.02).texture;
  scene.environmentIntensity = 0.55;

  // One softbox key. The soft shadow is computed the way a real source makes it: penumbra width
  // grows with the gap between the receiver and whatever blocks the light (PCSS).
  const KEY = new THREE.Vector3(-0.7, -0.45, 1.2).normalize().multiplyScalar(8);
  const key = new THREE.DirectionalLight(0xfff5e6, 2.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 16 });
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  // Card model
  const loader = new THREE.TextureLoader();
  let dirty = true, loaded = 0;
  const art = (url, then) => {
    const t = loader.load(url, () => { then?.(); if (++loaded === 3) warm(); dirty = true; });
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const frontArt = art(import.meta.env.BASE_URL + 'art/front.png'), packArt = art(import.meta.env.BASE_URL + 'art/pack.jpg');
  const backArt = art(import.meta.env.BASE_URL + 'art/back.png', () => layers.forEach(l => l.paint()));

  const outline = new THREE.Shape();
  { const w = CW / 2, h = CH / 2, r = CR;
    outline.moveTo(-w + r, -h); outline.lineTo(w - r, -h); outline.absarc(w - r, -h + r, r, -Math.PI / 2, 0);
    outline.lineTo(w, h - r); outline.absarc(w - r, h - r, r, 0, Math.PI / 2);
    outline.lineTo(-w + r, h); outline.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI);
    outline.lineTo(-w, -h + r); outline.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5); }
  const face = new THREE.ShapeGeometry(outline, 8);
  { const p = face.attributes.position, uv = face.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / CW + 0.5, p.getY(i) / CH + 0.5); }
  const rim = new THREE.ExtrudeGeometry(outline, { depth: CT, bevelEnabled: false, curveSegments: 8 });
  rim.translate(0, 0, -CT / 2);

  // Gloss laminate over the print: a clear coat, soft-edged like the renders, never a mirror.
  const gloss = map => new THREE.MeshPhysicalMaterial({ map, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.14 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xdcd4c7, roughness: 0.85 });
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const frontM = gloss(frontArt), backM = gloss(backArt);

  function card(top = frontM, under = backM) {
    const g = new THREE.Group();
    const a = new THREE.Mesh(face, top), b = new THREE.Mesh(face, under), edge = new THREE.Mesh(rim, [hidden, paper]);
    a.position.z = CT / 2 + 0.0002;
    b.position.z = -CT / 2 - 0.0002;
    b.rotation.y = Math.PI;
    edge.castShadow = true;
    a.castShadow = true;
    a.receiveShadow = b.receiveShadow = true;
    g.add(a, b, edge);
    return g;
  }

  const casters = []; // what blocks the softbox from the table
  function stack(top, x, y, turn, count) {
    const g = new THREE.Group();
    const r = (s => () => (s = s * 16807 % 2147483647) / 2147483647 - 0.5)(7); // the same jitter on every load
    for (let i = 0; i < count; i++) {
      const last = i === count - 1, c = last ? card(top, top) : new THREE.Mesh(rim, paper);
      c.castShadow = true;
      c.position.set(last ? 0 : r() * 0.018, last ? 0 : r() * 0.018, CT / 2 + i * CT * 1.03);
      c.rotation.z = last ? 0 : rad(r() * 1.4);
      g.add(c);
    }
    g.position.set(x, y, 0);
    g.rotation.z = turn;
    scene.add(g);
    g.updateMatrix();
    casters.push(new THREE.ExtrudeGeometry(outline, { depth: count * CT * 1.03, bevelEnabled: false, curveSegments: 4 }).applyMatrix4(g.matrix));
  }
  stack(backM, -0.30, Y[0] - 0.1, rad(11), 10);
  stack(frontM, -0.5, Y[3] - 0.02, rad(-8), 14);

  // The real pack, its back photo on top at the photo's own ratio.
  { const w = CH * 1208 / 2132, d = w * 22 / 56 * 0.78;
    const side = new THREE.MeshPhysicalMaterial({ color: 0x1a0d0d, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.08 });
    const top = new THREE.MeshPhysicalMaterial({ map: packArt, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.08 });
    const pack = new THREE.Mesh(new RoundedBoxGeometry(w, CH, d, 3, 0.008), [side, side, side, side, top, side]);
    pack.position.set(-0.5, Y[1] + 0.2, d / 2);
    pack.rotation.z = rad(-9);
    pack.castShadow = pack.receiveShadow = true;
    scene.add(pack);
    pack.updateMatrix();
    const solid = new THREE.BoxGeometry(w, CH, d).applyMatrix4(pack.matrix);
    casters.push(solid); }

  const heroBack = backM.clone(); // its own copy, so the hero can fade into the layers without fading the stacks
  heroBack.transparent = true;
  const hero = card(frontM, heroBack);
  hero.rotation.order = 'ZXY'; // turn on the table, then tilt, then the flip along the card's long axis
  scene.add(hero);

  // Table shadow, made the way a softbox makes one: project every caster from 64 points spread across the
  // light and add them up. Contact stays sharp and height blurs it, with no noise and one draw call.
  // Depth steps down per light point, so overlapping casters count once per point (a union, not a sum).
  // The loose card sums into red and the resting objects into green: high up its 64 copies would show as
  // ghost edges, so the table blurs red by the gap between copies at that height, and green stays sharp.
  const SAMPLES = 64, REACH = 5;
  const lightU = new THREE.Vector3().crossVectors(KEY, new THREE.Vector3(0, 0, 1)).normalize();
  const lightV = new THREE.Vector3().crossVectors(lightU, KEY).normalize();
  const points = Array.from({ length: SAMPLES }, (_, i) => KEY.clone() // R2 sequence: even, but no grid lines
    .addScaledVector(lightU, (((i + 0.5) * 0.7548776662) % 1 * 2 - 1) * 1.2)
    .addScaledVector(lightV, (((i + 0.5) * 0.5698402910) % 1 * 2 - 1) * 1.55));
  const tag = (g, part) => {
    const flat = g.index ? g.toNonIndexed() : g, out = new THREE.BufferGeometry();
    out.setAttribute('position', flat.attributes.position);
    out.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(flat.attributes.position.count).fill(part), 1));
    return out;
  };
  const instanced = g => {
    const out = new THREE.InstancedBufferGeometry().copy(g);
    out.instanceCount = SAMPLES;
    return out;
  };
  const shadowMat = new THREE.ShaderMaterial({
    uniforms: { points: { value: points }, hero: { value: new THREE.Matrix4() }, aim: { value: new THREE.Vector2() } },
    vertexShader: `
      uniform vec3 points[${SAMPLES}]; uniform mat4 hero; uniform vec2 aim; attribute float part; varying float vPart;
      void main() {
        vPart = part;
        vec3 w = ( part > 0.5 ? hero * vec4( position, 1.0 ) : vec4( position, 1.0 ) ).xyz;
        vec3 l = points[ gl_InstanceID ] + vec3( aim, 0.0 );
        vec2 hit = l.xy + ( w.xy - l.xy ) * l.z / ( l.z - w.z );
        gl_Position = vec4( ( hit - aim ) / ${REACH}.0, 0.98 - 1.96 * float( gl_InstanceID ) / ${SAMPLES}.0, 1.0 );
      }`,
    fragmentShader: `varying float vPart; void main() { gl_FragColor = vec4( vPart, 1.0 - vPart, 0.0, 0.0 ) / ${SAMPLES}.0; }`,
    side: THREE.DoubleSide, depthFunc: THREE.LessDepth,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const cardMat = shadowMat.clone(); // one flat sheet can't overlap itself, so it needs no depth union
  cardMat.uniforms = shadowMat.uniforms;
  cardMat.depthTest = false;
  const shadowScene = new THREE.Scene(), shadowCam = new THREE.Camera();
  const tableShadow = new THREE.Mesh(instanced(mergeGeometries(casters.map(g => tag(g, 0)))), shadowMat);
  const cardShadow = new THREE.Mesh(instanced(tag(face, 1)), cardMat);
  tableShadow.frustumCulled = cardShadow.frustumCulled = false;
  shadowScene.add(tableShadow, cardShadow);
  const shadowRT = new THREE.WebGLRenderTarget(2048, 2048, { depthBuffer: true });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(REACH * 2, REACH * 2), new THREE.ShaderMaterial({
    uniforms: { map: { value: shadowRT.texture }, spread: { value: 0 }, tint: { value: new THREE.Color(0x1a0505) } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: `
      uniform sampler2D map; uniform float spread; uniform vec3 tint; varying vec2 vUv;
      void main() {
        float card = 0.0;
        for ( int i = 0; i < 12; i++ ) { // fixed spiral: the same every frame, so it can't crawl or speckle
          float r = sqrt( ( float( i ) + 0.5 ) / 12.0 ), a = float( i ) * 2.399963;
          card += texture2D( map, vUv + spread * r * vec2( cos( a ), sin( a ) ) ).r;
        }
        float table = texture2D( map, vUv ).g;
        gl_FragColor = vec4( tint, 0.62 * ( 1.0 - ( 1.0 - card / 12.0 ) * ( 1.0 - table ) ) );
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  }));
  ground.renderOrder = -1;
  scene.add(ground);

  // Slide 3's layers: the same cut rectangles, cut live from the same texture.
  const CUTS = [[[0, 0, 638, 66], [0, 346, 638, 76]], [[292, 68, 346, 233]], [[0, 66, 292, 280]], [[158, 590, 321, 378]], [[0, 426, 638, 590]]];
  const ANCHOR = [[620, 385], [600, 200], [270, 300], [465, 760], [620, 640]];
  const local = ([px, py]) => new THREE.Vector3((px / 638 - 0.5) * CW, (0.5 - py / 1016) * CH, 0);
  const exploded = new THREE.Group();
  exploded.position.set(0, Y[2], 0);
  exploded.rotation.z = rad(-45);
  exploded.visible = false;
  scene.add(exploded);
  const edgePts = outline.getPoints(8).map(p => new THREE.Vector3(p.x, p.y, 0));
  const layers = CUTS.map((cuts, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = 638; canvas.height = 1016;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const g = new THREE.Group();
    const sheet = new THREE.Mesh(face, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const print = new THREE.Mesh(face, new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.14, alphaTest: 0.02 }));
    print.position.z = 0.0005;
    print.castShadow = i === CUTS.length - 1;
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edgePts), new THREE.LineBasicMaterial({ color: 0x0d0c0e, transparent: true, opacity: 0 }));
    g.add(sheet, print, line);
    exploded.add(g);
    return { g, sheet, line, paint() {
      const c = canvas.getContext('2d');
      for (const [x, y, w, h] of cuts) c.drawImage(backArt.image, x, y, w, h, x, y, w, h);
      tex.needsUpdate = true;
    } };
  });
  const posts = [[7, 7], [631, 7], [631, 1009], [7, 1009]].map(c => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([local(c), local(c)]), new THREE.LineDashedMaterial({ color: 0x0d0c0e, dashSize: 0.03, gapSize: 0.05, transparent: true }));
    exploded.add(l);
    return l;
  });

  // Compile every shader and upload every texture now, so nothing stalls the first time it scrolls into view.
  function warm() {
    exploded.visible = true;
    renderer.compile(scene, camera);
    exploded.visible = false;
    for (const t of [frontArt, backArt, packArt]) renderer.initTexture(t);
  }

  // Hero poses at each station. lean(): bottom edge on the table, like the Blender leaning().
  const lean = (bx, by, turn, tilt, flip) => {
    const up = new THREE.Vector3(0, CH / 2, 0).applyEuler(new THREE.Euler(tilt, 0, turn, 'ZXY'));
    return { x: bx + up.x, y: by + up.y, z: up.z + CT, turn, tilt, flip };
  };
  const POSE = [
    lean(0.14, Y[0] - 1.14, rad(-7), rad(26), 0),
    { x: 0.52, y: Y[1] + 0.12, z: CT / 2, turn: rad(4), tilt: 0, flip: Math.PI },
    { x: 0, y: Y[2], z: CT / 2, turn: rad(-45), tilt: 0, flip: Math.PI * 3 },
    lean(0.46, Y[3] - 1.27, rad(6), rad(10.1), Math.PI * 5),
  ];

  // Scroll map: [start, end] of each fall, then slide 3's explode and collapse.
  const FALL = [[0.08, 0.30], [0.38, 0.58], [0.80, 0.94]];
  const EXPLODE = [0.60, 0.68], COLLAPSE = [0.73, 0.79];
  const PEAK = [1.1, 1.5, 0.9];  // how high each fall travels above the table
  const WOBBLE = [0.15, 0.4, 0.25];
  const AT = [0.04, 0.34, 0.66, 0.97]; // the middle of each slide's hold, for text timing

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const span = (p, [a, b]) => clamp((p - a) / (b - a));
  const smooth = t => t * t * (3 - 2 * t);
  const mix = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - (1 - t) ** 3; // slows before it lands

  function heroPose(p) {
    let i = 0;
    while (i < 3 && p > FALL[i][1]) i++;
    if (i === 3) return { ...POSE[3] };
    const raw = span(p, FALL[i]);
    if (raw === 0) return { ...POSE[i] };
    const a = POSE[i], b = POSE[i + 1], t = smooth(raw), spin = easeOut(raw);
    return {
      x: mix(a.x, b.x, t) + Math.sin(raw * Math.PI * 2) * 0.12, // real cards drift as they tumble
      y: mix(a.y, b.y, t),
      z: mix(a.z, b.z, t) + Math.sin(raw * Math.PI) * PEAK[i],
      turn: mix(a.turn, b.turn, t) + Math.sin(raw * Math.PI) * 0.35,
      tilt: mix(a.tilt, b.tilt, t) + Math.sin(raw * Math.PI * 2) * WOBBLE[i],
      flip: mix(a.flip, b.flip, spin),
    };
  }

  let aspect = 1, portrait = true, view = [], W = 0, H = 0;
  function resize() {
    const w = innerWidth, h = innerHeight;
    if (phone && w === W && Math.abs(h - H) < 130) return; // a phone's address bar sliding away is not a resize
    W = w; H = h;
    dirty = true;
    renderer.setSize(w, h);
    camera.aspect = aspect = w / h;
    portrait = aspect < 1;
    const k = 2 * Math.tan(rad(FOV / 2));
    const fit = portrait ? Math.max(2.75 / (aspect * k), 8.4) : 3.4 / k; // distance that frames the set
    const sideways = portrait ? 0 : fit * k * aspect * 0.19; // landscape: set moves right of the text
    view = [
      { x: -sideways, y: Y[0] + (portrait ? -0.1 : 0), d: fit, lean: 0.53 },
      { x: -sideways, y: Y[1] + (portrait ? -0.1 : 0.1), d: fit, lean: 0.53 },
      { x: portrait ? 0.82 : 0, y: Y[2] + (portrait ? 0.75 : 0.72), d: fit * (portrait ? 1.55 : 1.42), lean: 0.95 },
      { x: -sideways, y: Y[3] + (portrait ? -0.2 : -0.1), d: fit, lean: 0.55 },
    ];
    camera.updateProjectionMatrix();
    camera.mouseScale = fit * 0.006;
  }
  addEventListener('resize', resize);
  resize();

  function camView(p) {
    let i = 0;
    while (i < 3 && p > FALL[i][1]) i++;
    if (i === 3) return view[3];
    const t = smooth(span(p, FALL[i])), a = view[i], b = view[i + 1];
    return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), d: mix(a.d, b.d, t), lean: mix(a.lean, b.lean, t) };
  }

  // Text panels: arrive, hold, leave, each element at its own speed for parallax.
  const panels = [...document.querySelectorAll('.panel')].map(el => ({
    el, at: AT[+el.dataset.at], at0: +el.dataset.at, parts: [...el.querySelectorAll('[data-depth]')].map(n => ({ n, depth: +n.dataset.depth })),
  }));
  const HOLD = [[0, 0.07], [0.29, 0.385], [0.6, 0.74], [0.93, 1]];
  const labels = [...document.querySelectorAll('.labels > div')];
  const tags = [...document.querySelectorAll('.tag')].map((el, i) => [el, new THREE.Vector3(i ? 0.52 : -0.5, Y[1] - CH / 2 - 0.1, 0)]);
  const leaders = document.getElementById('leaders');
  const polys = labels.map(() => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', '#0d0c0e'); s.setAttribute('stroke-width', '2');
    leaders.append(s);
    return s;
  });
  let spots = [];
  const measure = () => {
    spots = labels.map(el => {
      const box = el.offsetParent.getBoundingClientRect();
      return [box.left + el.offsetLeft - 12, box.top + el.offsetTop + 14];
    });
    leaders.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    dirty = true;
  };
  addEventListener('resize', measure);
  document.fonts.ready.then(measure);
  const dots = labels.map(() => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('r', '5'); c.setAttribute('fill', '#0d0c0e'); c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '2');
    leaders.append(c);
    return c;
  });

  const bgA = new THREE.Color(), bgB = new THREE.Color();
  let lastBg = '';
  const root = document.documentElement.style;
  const target = new THREE.Vector3(), mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => { mouse.tx = e.clientX / innerWidth - 0.5; mouse.ty = e.clientY / innerHeight - 0.5; });

  function draw(p) {
    // Hero and layers
    const open = smooth(span(p, EXPLODE)) * (1 - smooth(span(p, COLLAPSE)));
    const pose = heroPose(p);
    const tilt = pose.tilt + mouse.y * 0.05 * (1 - open), flip = pose.flip + mouse.x * 0.09 * (1 - open);
    // The card can't pass through the table: keep its lowest corner on or above it
    const clearance = CH / 2 * Math.abs(Math.sin(tilt)) + CW / 2 * Math.abs(Math.sin(flip) * Math.cos(tilt)) + CT / 2;
    hero.position.set(pose.x, pose.y, Math.max(pose.z, clearance));
    hero.rotation.set(tilt, flip, pose.turn);
    hero.visible = open < 0.12;
    hero.children[2].visible = open === 0;
    heroBack.opacity = 1 - open / 0.12;
    exploded.visible = open > 0;
    const gap = 0.56 * open;
    layers.forEach((l, i) => {
      l.g.position.z = CT + (4 - i) * gap;
      l.sheet.material.opacity = 0.45 * clamp(open * 3);
      l.line.material.opacity = clamp(open * 3);
    });
    posts.forEach(l => {
      const pos = l.geometry.attributes.position;
      pos.setZ(0, CT); pos.setZ(1, CT + 4 * gap); pos.needsUpdate = true;
      l.computeLineDistances();
      l.material.opacity = clamp(open * 3);
    });

    // Camera
    const c = camView(p);
    target.set(c.x + mouse.x * camera.mouseScale, c.y - mouse.y * camera.mouseScale, 0);
    camera.up.set(0, 1, 0);
    camera.position.set(target.x, target.y - Math.sin(c.lean) * c.d, Math.cos(c.lean) * c.d);
    camera.lookAt(target);
    camera.updateMatrixWorld();

    // Lights travel with the shot, so every shadow stays inside the map
    key.position.set(KEY.x + c.x, KEY.y + c.y, KEY.z);
    key.target.position.set(c.x, c.y, 0);
    hero.updateMatrixWorld();
    shadowMat.uniforms.hero.value.copy(hero.matrixWorld);
    shadowMat.uniforms.aim.value.set(c.x, c.y);
    ground.position.set(c.x, c.y, 0.001);
    ground.material.uniforms.spread.value = 0.35 * hero.position.z / Math.max(KEY.z - hero.position.z, 1) / (REACH * 2);
    renderer.setRenderTarget(shadowRT);
    renderer.render(shadowScene, shadowCam);
    renderer.setRenderTarget(null);

    // Background colour shifts during the falls
    let seg = 0;
    while (seg < 2 && p > FALL[seg][1]) seg++;
    bgA.set(BG[seg]); bgB.set(BG[seg + 1]);
    const bg = '#' + bgA.lerp(bgB, smooth(span(p, FALL[seg]))).getHexString();
    if (bg !== lastBg) root.setProperty('--bg', lastBg = bg);

    // Text
    const vh = innerHeight;
    for (const panel of panels) {
      const { el, at0, parts } = panel;
      const [a, b] = HOLD[at0];
      const fade = 0.05;
      const inn = at0 === 0 ? 1 : clamp((p - a + fade) / fade), out = at0 === 3 ? 1 : clamp((b + fade - p) / fade);
      const o = Math.min(inn, out);
      const drift = (1 - inn) * vh * 0.16 - (1 - out) * vh * 0.16;
      if (panel.o === o && panel.drift === drift) continue;
      panel.o = o; panel.drift = drift;
      el.classList.toggle('on', o > 0);
      el.toggleAttribute('inert', o < 0.5);
      if (o <= 0) continue;
      for (const { n, depth } of parts) {
        n.style.transform = `translate3d(0,${drift * depth}px,0)`;
        n.style.opacity = o;
      }
    }

    // Slide 2: tags sit under their objects wherever the camera puts them
    tags.forEach(([el, spot]) => {
      const s = spot.clone().project(camera);
      el.style.left = (s.x + 1) / 2 * W + 'px';
      el.style.top = (1 - s.y) / 2 * H + 'px';
    });

    // Slide 3: labels appear with their layer, leaders track the 3D anchors
    const showLeaders = exploded.visible && open > 0.25;
    leaders.style.opacity = clamp((open - 0.25) * 3);
    labels.forEach((el, i) => {
      const lit = clamp(open * 6 - i * 0.6);
      el.style.opacity = polys[i].style.opacity = dots[i].style.opacity = lit;
      el.style.transform = `translate3d(${(1 - lit) * 24}px,0,0)`;
      polys[i].style.display = dots[i].style.display = showLeaders ? '' : 'none';
      if (!showLeaders) return;
      const s = local(ANCHOR[i]);
      s.z = 0.002;
      layers[i].g.localToWorld(s);
      s.project(camera);
      const x = (s.x + 1) / 2 * W, y = (1 - s.y) / 2 * H;
      const [lx, ly] = spots[i];
      polys[i].setAttribute('points', `${x},${y} ${lx - 28},${ly} ${lx},${ly}`);
      dots[i].setAttribute('cx', x); dots[i].setAttribute('cy', y);
    });

    renderer.render(scene, camera);
  }

  // Reduced motion: no tumbling, each slide simply appears as you pass it.
  const STOPS = [0, 0.33, 0.68, 1];
  const target_p = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? clamp(scrollY / max) : 0;
    return still ? STOPS.reduce((best, s) => Math.abs(s - p) < Math.abs(best - p) ? s : best) : p;
  };
  let p = target_p(), last = 0;
  renderer.setAnimationLoop(t => {
    const dt = Math.min(t - last, 1000);
    last = t;
    const goal = target_p(), ease = 1 - Math.exp(-dt / 260);
    const from = p, mx = mouse.x, my = mouse.y;
    p = still ? goal : p + (goal - p) * (1 - Math.exp(-dt / 170)); // smooths wheel steps at any frame rate
    if (Math.abs(goal - p) < 0.00002) p = goal;
    mouse.x += (mouse.tx - mouse.x) * ease;
    mouse.y += (mouse.ty - mouse.y) * ease;
    // Nothing moved, nothing drawn: an idle page stays cool, so the GPU isn't throttled when the scroll comes
    if (!dirty && p === from && Math.abs(mouse.x - mx) + Math.abs(mouse.y - my) < 0.0002) return;
    dirty = false;
    draw(p);
  });
}
