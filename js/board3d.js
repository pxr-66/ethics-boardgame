// 3D 棋盘：温馨的木质桌游。主页时缓慢环绕作背景，游戏时切换到对局视角
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PITCH = 1.1, TILE = 1, FONT = '"ZCOOL KuaiLe", "PingFang SC", "Microsoft YaHei", sans-serif';
const coarse = matchMedia('(pointer: coarse)').matches;
const tilePos = i => { const [r, c] = tileRC(i); return new THREE.Vector3((c - 3) * PITCH, 0, (r - 3) * PITCH); };
const BG = '#f6ead8';

let renderer, scene, camera, clock = new THREE.Clock();
let ready = false, mode = 'menu', insets = { top: 0, right: 0, bottom: 0, left: 0 }, onTile = null;
const tiles = [], tokens = new Map(), anims = [];
let dice, diceRest, ring, arrow, currentId = null, camPos = new THREE.Vector3(), camTarget = new THREE.Vector3(), follow = new THREE.Vector3();

// ---------- 画布纹理工具 ----------
function loadImg(src) { const img = new Image(); img.src = src; return img.decode().then(() => img).catch(() => img); }
// 用内联 SVG 生成 data: 地址，避免 file:// 下画布被"污染"导致 WebGL 无法使用纹理
const svgData = key => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(AV_SVG[key] || AV_SVG[AVATARS[0]]);
function iconImg(icon, color, size = 128, sw = 2) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`;
  return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function tex(canvas) { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const mix = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();

function tileTexture(t, img) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const col = TILE_TYPES[t.type].color, zc = ZONES[t.zone].color;
  x.fillStyle = mix(col, '#fffaf0', .5); x.fillRect(0, 0, S, S);
  // 圆点花纹
  x.fillStyle = mix(col, '#ffffff', .3);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if ((i + j) % 2 === 0) { x.beginPath(); x.arc(22 + i * 43, 22 + j * 43, 4, 0, 7); x.fill(); }
  // 图标底圆
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(S / 2, 92, 58, 0, 7); x.fill();
  x.lineWidth = 8; x.strokeStyle = col; x.stroke();
  x.drawImage(img, S / 2 - 42, 50, 84, 84);
  // 名称
  x.fillStyle = mix(col, '#3b2a1e', .75); x.textAlign = 'center'; x.textBaseline = 'middle';
  const name = t.name; let fs = name.length > 4 ? 40 : 46; x.font = `${fs}px ${FONT}`;
  while (x.measureText(name).width > S - 24) { fs -= 2; x.font = `${fs}px ${FONT}`; }
  x.fillText(name, S / 2, 192);
  // 产业链色带
  x.fillStyle = zc; rr(x, 70, S - 26, S - 140, 9, 5); x.fill();
  return tex(c);
}

// 木纹
function woodTexture(base = '#e3b98a', dark = '#c99563', S = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const y0 = rnd() * S, amp = 4 + rnd() * 14, fr = .004 + rnd() * .01;
    x.strokeStyle = dark + (rnd() < .5 ? '33' : '55'); x.lineWidth = 1 + rnd() * 3;
    x.beginPath(); for (let px = 0; px <= S; px += 8) { const py = y0 + Math.sin(px * fr + i) * amp; px ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
  }
  return tex(c);
}

// 桌布：奶油色格纹
function clothTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#f3e3cc'; x.fillRect(0, 0, S, S);
  x.fillStyle = 'rgba(232, 164, 140, .18)';
  for (let i = 0; i < S; i += 64) { x.fillRect(i, 0, 28, S); x.fillRect(0, i, S, 28); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); return t;
}

// 棋盘中央
async function centerTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#fbefdc'; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#e6c49a'; x.lineWidth = 10; x.setLineDash([26, 18]); rr(x, 40, 40, S - 80, S - 80, 70); x.stroke(); x.setLineDash([]);
  // 四个产业链色块（四角）
  ZONES.forEach((z, i) => {
    const cx = [S - 170, 170, 170, S - 170][i], cy = [S - 170, S - 170, 170, 170][i];
    x.fillStyle = mix(z.color, '#ffffff', .35); x.beginPath(); x.arc(cx, cy, 86, 0, 7); x.fill();
    x.fillStyle = mix(z.color, '#3b2a1e', .45); x.font = `44px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(z.name.slice(0, 2), cx, cy - 18); x.fillText(z.name.slice(2), cx, cy + 30);
  });
  const m = await loadImg(svgData('_mascot'));
  x.drawImage(m, S / 2 - 150, 170, 300, 300);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#e9804e'; x.font = `150px ${FONT}`; x.fillText('芯途抉择', S / 2, 590);
  x.fillStyle = '#b48a68'; x.font = `40px ${FONT}`; x.fillText('一起成长，守住底线', S / 2, 700);
  // 走向箭头
  x.strokeStyle = '#e8c9a0'; x.lineWidth = 12; x.lineCap = 'round';
  x.beginPath(); x.arc(S / 2, S / 2 + 40, 300, Math.PI * .15, Math.PI * .85); x.stroke();
  return tex(c);
}

function badgeTexture(img, color) {
  const S = 160, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(80, 80, 76, 0, 7); x.fill();
  x.fillStyle = color; x.beginPath(); x.arc(80, 80, 70, 0, 7); x.fill();
  x.save(); x.beginPath(); x.arc(80, 80, 62, 0, 7); x.clip(); x.drawImage(img, 18, 18, 124, 124); x.restore();
  return tex(c);
}

function diceMaterials() {
  const pips = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
    5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.28, .22], [.72, .22], [.28, .5], [.72, .5], [.28, .78], [.72, .78]] };
  const mat = n => {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    x.fillStyle = '#fffaf2'; x.fillRect(0, 0, S, S);
    for (const [u, v] of pips[n]) {
      x.fillStyle = n === 1 ? '#ef7f7f' : '#6b4a3a';
      if (n === 1) { // 1 点画成爱心
        const cx = u * S, cy = v * S + 6, s = 2.6; x.beginPath(); x.moveTo(cx, cy + 14 * s);
        x.bezierCurveTo(cx - 22 * s, cy, cx - 12 * s, cy - 14 * s, cx, cy - 6 * s); x.bezierCurveTo(cx + 12 * s, cy - 14 * s, cx + 22 * s, cy, cx, cy + 14 * s); x.fill();
      } else { x.beginPath(); x.arc(u * S, v * S, 22, 0, 7); x.fill(); }
    }
    return new THREE.MeshStandardMaterial({ map: tex(c), roughness: .45 });
  };
  // BoxGeometry 面顺序：+x -x +y -y +z -z
  return [mat(2), mat(5), mat(1), mat(6), mat(3), mat(4)];
}
const FACE_NORMAL = { 2: [1, 0, 0], 5: [-1, 0, 0], 1: [0, 1, 0], 6: [0, -1, 0], 3: [0, 0, 1], 4: [0, 0, -1] };
// ---------- 场景搭建 ----------
async function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.75 : 2));
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = .95;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 16, 34);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
  scene.environmentIntensity = .35;
  camera = new THREE.PerspectiveCamera(38, 1, .1, 200);
  camera.position.set(0, 12, 12);

  // 暖色灯光：像午后的窗边
  scene.add(new THREE.HemisphereLight('#fff4e0', '#d9b48e', .9));
  const sun = new THREE.DirectionalLight('#ffe2bd', 1.9); sun.position.set(6, 12, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 }); sun.shadow.bias = -.0004; sun.shadow.radius = 6;
  scene.add(sun);

  // 桌布
  const table = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ map: clothTexture(), roughness: 1 }));
  table.rotation.x = -Math.PI / 2; table.position.y = -.42; table.receiveShadow = true; scene.add(table);

  // 木质棋盘
  const wood = woodTexture();
  const base = new THREE.Mesh(new RoundedBoxGeometry(8.6, .36, 8.6, 6, .2), new THREE.MeshStandardMaterial({ map: wood, color: '#e2b384', roughness: .7 }));
  base.position.y = -.24; base.castShadow = base.receiveShadow = true; scene.add(base);
  const centerMap = await centerTexture();
  const center = new THREE.Mesh(new RoundedBoxGeometry(5.2, .06, 5.2, 4, .03), [0, 0, 0, 0, 0, 0].map((_, i) => i === 2
    ? new THREE.MeshStandardMaterial({ map: centerMap, roughness: .9 }) : new THREE.MeshStandardMaterial({ color: '#f2dcc0', roughness: .9 })));
  center.position.y = -.03; center.receiveShadow = true; scene.add(center);

  // 格子：圆润的彩色方块
  const geo = new RoundedBoxGeometry(TILE, .2, TILE, 4, .1);
  const imgs = {};
  for (const [k, v] of Object.entries(TILE_TYPES)) imgs[k] = await iconImg(v.icon, mix(v.color, '#3b2a1e', .15), 128, 2.2);
  for (const t of BOARD) {
    const col = TILE_TYPES[t.type].color;
    const side = new THREE.MeshStandardMaterial({ color: mix(col, '#8a5a3a', .15), roughness: .6 });
    const top = new THREE.MeshStandardMaterial({ map: tileTexture(t, imgs[t.type]), roughness: .7, emissive: '#fff1d6', emissiveIntensity: 0 });
    const m = new THREE.Mesh(geo, [side, side, top, side, side, side]);
    m.position.copy(tilePos(t.i)); m.castShadow = m.receiveShadow = true; m.userData = { i: t.i, top };
    scene.add(m); tiles.push(m);
  }

  // 装饰：小盆栽、书本、马克杯，让桌面更温馨
  decor();

  // 骰子
  dice = new THREE.Mesh(new RoundedBoxGeometry(.62, .62, .62, 5, .14), diceMaterials());
  diceRest = new THREE.Vector3(0, .32, 1.5); dice.position.copy(diceRest); dice.castShadow = true; scene.add(dice);
  dice.visible = false;

  // 当前玩家：脚下光圈 + 头顶跳动的小箭头
  ring = new THREE.Mesh(new THREE.RingGeometry(.34, .46, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring); ring.visible = false;
  arrow = new THREE.Mesh(new THREE.ConeGeometry(.14, .26, 4), new THREE.MeshStandardMaterial({ color: '#ff9a6b', roughness: .4, emissive: '#ff9a6b', emissiveIntensity: .3 }));
  arrow.rotation.x = Math.PI; scene.add(arrow); arrow.visible = false;

  // 点击格子
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!down || mode !== 'game' || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10) return;
    const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(tiles)[0];
    if (hit && onTile) onTile(hit.object.userData.i);
  });
  addEventListener('resize', resize); resize();
  // 页面切到后台时停止渲染，省电
  document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : loop));
  renderer.setAnimationLoop(loop);
  ready = true;
}

function decor() {
  const std = (color, rough = .7) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh; };
  // 盆栽
  const pot = new THREE.Group();
  const p1 = new THREE.Mesh(new THREE.CylinderGeometry(.42, .32, .6, 24), std('#e9a07a')); p1.position.y = .3; pot.add(p1);
  const p2 = new THREE.Mesh(new THREE.CylinderGeometry(.46, .46, .1, 24), std('#f0b392')); p2.position.y = .6; pot.add(p2);
  [[0, 1, 0, .38], [.22, .88, .1, .26], [-.2, .9, -.08, .28], [.05, 1.25, -.05, .22]].forEach(([x, y, z, r]) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), std('#8cc78a', .8)); l.position.set(x, y, z); pot.add(l);
  });
  pot.traverse(o => { o.castShadow = o.receiveShadow = true; }); pot.position.set(5.8, -.42, -4.4); scene.add(pot);
  // 书本叠
  add(new THREE.Mesh(new RoundedBoxGeometry(1.5, .22, 1.1, 2, .04), std('#7fb2d9')), -5.9, -.31, 4.3).rotation.y = .3;
  add(new THREE.Mesh(new RoundedBoxGeometry(1.3, .2, 1, 2, .04), std('#f2c46b')), -5.85, -.1, 4.3).rotation.y = .1;
  add(new THREE.Mesh(new RoundedBoxGeometry(1.2, .18, .9, 2, .04), std('#e88aa8')), -5.8, .09, 4.3).rotation.y = .45;
  // 马克杯
  const mug = add(new THREE.Mesh(new THREE.CylinderGeometry(.34, .3, .7, 24), std('#fffaf2', .4)), 5.6, -.07, 4.6);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.18, .05, 8, 20), std('#fffaf2', .4)); handle.position.set(.36, 0, 0); handle.castShadow = true; mug.add(handle);
  const tea = new THREE.Mesh(new THREE.CircleGeometry(.29, 24), std('#c98a5a', .3)); tea.rotation.x = -Math.PI / 2; tea.position.y = .3; mug.add(tea);
  // 散落的硬币
  [[-5.2, -4.8], [-4.7, -5.3], [-5.6, -5.4]].forEach(([x, z], i) => {
    const c = add(new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .06, 24), new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: .6, roughness: .35 })), x, -.39 + i * .065, z);
    c.rotation.z = (i - 1) * .1;
  });
}
// ---------- 相机 ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  applyView();
}
// 让棋盘落在没被 UI 遮挡的区域里：用 setViewOffset 平移画面中心
function applyView() {
  const w = innerWidth, h = innerHeight;
  if (mode === 'game') {
    const cx = (insets.left - insets.right) / 2, cy = (insets.top - insets.bottom) / 2;
    camera.setViewOffset(w, h, -cx, -cy, w, h);
    const aw = Math.max(200, w - insets.left - insets.right), ah = Math.max(200, h - insets.top - insets.bottom);
    // 让约 8.6 单位宽的棋盘装进可用区域：可见高度 = 2·d·tan(fov/2)，按可用区域占比折算
    const need = 8.6, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const byH = need * (camera.aspect < 1 ? .8 : .85) / (2 * tanH * (ah / h));
    const byW = need * (camera.aspect < 1 ? 1.0 : 1.03) / (2 * tanH * (w / h) * (aw / w));
    camera.userData.dist = Math.min(32, Math.max(8, Math.max(byH, byW)));
    // 雾跟着相机距离走，棋盘始终清晰
    scene.fog.near = camera.userData.dist + 4; scene.fog.far = camera.userData.dist + 24;
  } else { camera.clearViewOffset(); scene.fog.near = 16; scene.fog.far = 34; }
}

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function tween(ms, fn, done) { anims.push({ t0: performance.now(), ms, fn, done }); }

function loop() {
  const t = clock.getElapsedTime(), now = performance.now();
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i], k = Math.min(1, (now - a.t0) / a.ms); a.fn(k);
    if (k >= 1) { anims.splice(i, 1); a.done && a.done(); }
  }
  // 相机：主页缓慢环绕；游戏时略微俯视，竖屏更接近正上方
  if (mode === 'menu') {
    const a = t * .05 + .6;
    camPos.set(Math.sin(a) * 11.5, 7.2 + Math.sin(t * .2) * .4, Math.cos(a) * 11.5);
    camTarget.set(0, -.8, 0);
  } else {
    const d = camera.userData.dist || 13;
    follow.lerp(currentId && tokens.get(currentId) ? tokens.get(currentId).position.clone().multiplyScalar(.1) : new THREE.Vector3(), .03);
    const tilt = camera.aspect < 1 ? .4 : .55, lift = Math.sqrt(1 - tilt * tilt);
    camPos.set(follow.x, d * lift, follow.z + d * tilt);
    camTarget.set(follow.x, 0, follow.z + .2);
  }
  camera.position.lerp(camPos, mode === 'menu' ? .02 : .06);
  const look = camera.userData.look || camTarget.clone(); look.lerp(camTarget, .06); camera.userData.look = look; camera.lookAt(look);

  // 格子：高亮时轻轻弹起、发暖光
  for (const m of tiles) {
    const u = m.userData;
    u.top.emissiveIntensity += ((u.hl ? .35 + .1 * Math.sin(t * 5) : 0) - u.top.emissiveIntensity) * .15;
    m.position.y += ((u.hl ? .12 : 0) - m.position.y) * .15;
  }
  // 棋子：当前玩家轻轻摇摆
  for (const [id, tk] of tokens) {
    if (!tk || tk.userData.moving) continue;
    const isCur = id === currentId;
    tk.position.y += ((isCur ? .1 + Math.abs(Math.sin(t * 3.2)) * .12 : 0) - tk.position.y) * .25;
    tk.rotation.z = isCur ? Math.sin(t * 3.2) * .06 : 0;
  }
  const cur = currentId && tokens.get(currentId);
  ring.visible = arrow.visible = !!cur && mode === 'game';
  if (cur) {
    ring.position.set(cur.position.x, .115, cur.position.z); const s = 1 + .12 * Math.sin(t * 4); ring.scale.set(s, s, s);
    ring.material.opacity = .55 + .3 * Math.sin(t * 4);
    arrow.position.set(cur.position.x, cur.position.y + 1.62 + Math.sin(t * 4) * .08, cur.position.z); arrow.rotation.y = t * 2;
  }
  if (dice.visible && !dice.userData.rolling) dice.rotation.y += .002;
  renderer.render(scene, camera);
}

// ---------- 棋子：圆滚滚的小人，头顶戴着玩家头像 ----------
async function makeToken(p, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .45 });
  const light = new THREE.MeshStandardMaterial({ color: mix(color, '#ffffff', .45), roughness: .45 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.3, .33, .1, 32), light); base.position.y = .05; base.castShadow = true; g.add(base);
  const body = new THREE.Mesh(new THREE.SphereGeometry(.26, 32, 20), mat); body.scale.set(1, 1.15, 1); body.position.y = .36; body.castShadow = true; g.add(body);
  const img = await loadImg(svgData(p.avatar));
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(img, color), transparent: true }));
  sp.scale.set(.62, .62, 1); sp.position.y = .98; g.add(sp);
  scene.add(g); return g;
}
function slot(pos, idx, n) {
  const c = tilePos(pos); if (n <= 1) return c;
  const offs = [[-.22, -.2], [.22, -.2], [-.22, .22], [.22, .22], [0, 0], [0, -.3]];
  const o = offs[idx % 6]; return c.add(new THREE.Vector3(o[0], 0, o[1]));
}
async function setPlayers(players, positions) {
  const ids = new Set(players.map(p => p.id));
  for (const [id, tk] of tokens) if (!ids.has(id)) { tk && scene.remove(tk); tokens.delete(id); }
  for (const p of players) if (!tokens.has(p.id)) {
    const role = ROLES.find(r => r.id === p.role); tokens.set(p.id, null);
    tokens.set(p.id, await makeToken(p, role ? role.color : '#f2b544'));
  }
  layout(players, positions);
}
function layout(players, positions) {
  const groups = {};
  players.forEach(p => (groups[positions[p.id]] = groups[positions[p.id]] || []).push(p.id));
  for (const [pos, ids] of Object.entries(groups)) ids.forEach((id, k) => {
    const tk = tokens.get(id); if (!tk || tk.userData.moving) return;
    const v = slot(+pos, k, ids.length); tk.position.x = v.x; tk.position.z = v.z;
  });
}
// 一格一格蹦过去
function hop(id, from, steps, onStep) {
  return new Promise(res => {
    const tk = tokens.get(id); if (!tk) return res();
    tk.userData.moving = true; let i = 0;
    const next = () => {
      if (i >= steps) { tk.userData.moving = false; flash((from + steps) % BOARD.length); return res(); }
      i++; const a = tk.position.clone(), b = tilePos((from + i) % BOARD.length);
      tween(280, k => {
        const e = ease(k); tk.position.x = a.x + (b.x - a.x) * e; tk.position.z = a.z + (b.z - a.z) * e;
        tk.position.y = Math.sin(k * Math.PI) * .6; const sq = 1 + Math.sin(k * Math.PI) * .08; tk.scale.set(1 / sq, sq, 1 / sq);
      }, () => { tk.scale.set(1, 1, 1); onStep && onStep(i); next(); });
    };
    next();
  });
}
function flash(i) {
  const m = tiles[i]; if (!m) return; m.userData.hl = true;
  clearTimeout(m.userData.ht); m.userData.ht = setTimeout(() => { m.userData.hl = false; }, 1400);
}
function highlight(i) { tiles.forEach(m => { m.userData.hl = m.userData.i === i; clearTimeout(m.userData.ht); }); }

// 掷骰：抛起 + 翻滚 + 落定到指定点数朝上
function roll(n) {
  return new Promise(res => {
    dice.visible = true; dice.userData.rolling = true;
    const up = new THREE.Vector3(...FACE_NORMAL[n]);
    const target = new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
    target.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2));
    const spin = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    const start = new THREE.Vector3(-1.4, 2.6, 2.6), end = diceRest.clone().add(new THREE.Vector3(Math.random() - .5, 0, Math.random() * .4 - .2));
    tween(1100, k => {
      const e = 1 - Math.pow(1 - k, 3);
      dice.position.lerpVectors(start, end, e);
      const b = k < .55 ? Math.sin(k / .55 * Math.PI) * 1.4 * (1 - k) : Math.abs(Math.sin((k - .55) / .45 * Math.PI)) * .3 * (1 - k);
      dice.position.y = end.y + b + (1 - e) * 1.2;
      dice.quaternion.copy(target).multiply(new THREE.Quaternion().setFromAxisAngle(spin, (1 - e) * 14));
    }, () => { dice.quaternion.copy(target); dice.userData.rolling = false; res(); });
  });
}

function setMode(m, ins) { mode = m; if (ins) insets = ins; applyView(); }
function setInsets(ins) { insets = ins; applyView(); }
function setCurrent(id) {
  currentId = id; const tk = tokens.get(id);
  const c = tk && tk.children[1].material.color; if (c) ring.material.color.copy(c);
}
function showDice(v) { dice.visible = v; }
function onTileClick(fn) { onTile = fn; }
function clear() { for (const tk of tokens.values()) tk && scene.remove(tk); tokens.clear(); currentId = null; dice.visible = false; tiles.forEach(m => m.userData.hl = false); }

window.Board3D = { get ready() { return ready; }, init, setMode, setInsets, setPlayers, layout, hop, roll, highlight, flash, setCurrent, showDice, onTileClick, clear };
window.dispatchEvent(new Event('board3d-ready'));
