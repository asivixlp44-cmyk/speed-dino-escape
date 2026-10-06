import {
    T, V3, scene, mat, box, aabb, UNIT, solids, kills, triggers, tickers,
    texFrom, billboard, textPlane, camera, signBoard,
} from './engine.js';
import { S, actions, net } from './state.js';
import { lavaMaterial, studWallMaterial, dottedWallMaterial, checkerMaterial } from './textures.js';
import { emitTread, flame } from './fx.js';
import { buildDino, walkDino } from './dino.js';
import {
    CFG, LOBBY, STAGES, TREADMILLS, TREAD_GEO, PASSES, DINOS, CHASER_LOOK, KING_LOOK, PTERO_LOOK, EGG_MINUTES, FREE_BOOST_MINUTES,
    dinoById, fmt, sci, clamp, clock, rngFrom, buxText,
} from '../../shared/config.js';

const HX = LOBBY.halfX, HZ = LOBBY.halfZ;
// Colours read off the reference: red carpet, yellow studded paths, tan dotted sandstone walls,
// bright blocky trees, lavender checker panels, grey stone ramps
const LC = {
    carpet: 0xe0182a, carpetDark: 0xb8101e, path: 0xffd640, pathDark: 0xe8b820, sand: 0xc89a66, sandDark: 0xa87a4a,
    trunk: 0x8a5a32, leaf: 0x34d04a, leafDark: 0x22a83a, grass: 0x4cd23c, dirt: 0x8a5a36, stone: 0x9a98aa, stoneDark: 0x77768a,
    lavender: 0xbcb4f0, gold: 0xf2c230, basalt: 0x4a3c3c, wood: 0xa86a3a, woodDark: 0x7a4a26, red: 0xe8182c,
};

export const SPAWN = new V3(LOBBY.spawn.x, LOBBY.spawn.y, LOBBY.spawn.z);
export const pickups = [];
export let beltTex;
const shopItems = [];
const treadItems = [];
const boards = {};
const signs = {};

// =====================================================================================
// Decor batching: thousands of little scenery boxes (trees, clouds, flowers) merged into
// one vertex-coloured mesh, so the jungle costs a single draw call
// =====================================================================================
const batch = [];
function deco(sx, sy, sz, x, y, z, color, ry) { batch.push({ sx, sy, sz, x, y, z, color, ry: ry || 0 }); }
function flushDecor() {
    if (!batch.length) return;
    const base = new T.BoxGeometry(1, 1, 1).toNonIndexed();
    const n = base.attributes.position.count;
    const pos = new Float32Array(batch.length * n * 3), nor = new Float32Array(batch.length * n * 3), col = new Float32Array(batch.length * n * 3);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), nm = new T.Matrix3(), c = new T.Color();
    batch.forEach((b, i) => {
        m4.compose(new T.Vector3(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.ry, 0)), new T.Vector3(b.sx, b.sy, b.sz));
        nm.getNormalMatrix(m4);
        c.set(b.color);
        for (let k = 0; k < n; k++) {
            v.fromBufferAttribute(base.attributes.position, k).applyMatrix4(m4);
            pos.set([v.x, v.y, v.z], (i * n + k) * 3);
            v.fromBufferAttribute(base.attributes.normal, k).applyMatrix3(nm).normalize();
            nor.set([v.x, v.y, v.z], (i * n + k) * 3);
            // Tops a touch lighter, like Roblox's soft studless parts
            const shade = v.y > 0.5 ? 1.08 : 1;
            col.set([c.r * shade, c.g * shade, c.b * shade], (i * n + k) * 3);
        }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(nor, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const mesh = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    batch.length = 0;
}

// Blocky pine from the reference: brown trunk, three stacked green tiers and a little top
function tree(x, y, z, s, rng) {
    s = s || 1;
    const lc = rng && rng() < 0.4 ? LC.leafDark : LC.leaf;
    deco(1.2 * s, 4 * s, 1.2 * s, x, y + 2 * s, z, LC.trunk);
    deco(6.4 * s, 2.4 * s, 6.4 * s, x, y + 4.6 * s, z, lc);
    deco(4.8 * s, 2.2 * s, 4.8 * s, x, y + 6.8 * s, z, lc === LC.leaf ? LC.leafDark : LC.leaf);
    deco(3.2 * s, 2 * s, 3.2 * s, x, y + 8.9 * s, z, lc);
    deco(1.6 * s, 1.4 * s, 1.6 * s, x, y + 10.6 * s, z, LC.leafDark);
}
// Puffy blocky cloud
function cloud(x, y, z, s, rng) {
    deco(12 * s, 3 * s, 7 * s, x, y, z, 0xffffff);
    deco(7 * s, 3 * s, 5 * s, x - 3 * s, y + 2 * s, z + rng() * 2, 0xffffff);
    deco(6 * s, 2.6 * s, 5 * s, x + 3.5 * s, y + 1.6 * s, z - rng() * 2, 0xf4f8ff);
}
function flowers(x, z, rng) {
    const cs = [0xff4a8a, 0xffd028, 0xffffff, 0xb45aff];
    for (let i = 0; i < 3; i++) {
        const px = x + (rng() - 0.5) * 3, pz = z + (rng() - 0.5) * 3;
        deco(0.2, 0.8, 0.2, px, 0.4, pz, LC.leafDark);
        deco(0.6, 0.4, 0.6, px, 0.9, pz, cs[Math.floor(rng() * cs.length)]);
    }
}
function bush(x, y, z, s) {
    deco(2.6 * s, 1.6 * s, 2.6 * s, x, y + 0.8 * s, z, LC.leafDark);
    deco(1.8 * s, 1.2 * s, 1.8 * s, x + 0.4 * s, y + 1.8 * s, z - 0.3 * s, LC.leaf);
}
// A line of trees standing on top of a wall (the reference's walls always have greenery above)
function treeLine(rng, x0, z0, x1, z1, y, step) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.floor(len / step));
    for (let i = 0; i <= n; i++) {
        const k = i / n;
        tree(x0 + (x1 - x0) * k + (rng() - 0.5) * 3, y, z0 + (z1 - z0) * k + (rng() - 0.5) * 3, 0.9 + rng() * 0.6, rng);
    }
}

// =====================================================================================
// Shared helpers
// =====================================================================================
function texturedBox(sx, sy, sz, x, y, z, material) {
    const m = new T.Mesh(UNIT, material);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
    return m;
}
// Solid box with a studded texture on every face
function studBox(sx, sy, sz, x, y, z, color, o) {
    const m = texturedBox(sx, sy, sz, x, y, z, studWallMaterial(color, Math.max(sx, sz) / 4, sy / 4));
    if (!(o && o.decor)) solids.push(aabb(x, y, z, sx, sy, sz));
    return m;
}
// Tan dotted sandstone wall (solid)
function sandWall(sx, sy, sz, x, y, z, color) {
    texturedBox(sx, sy, sz, x, y, z, dottedWallMaterial(color || LC.sand, Math.max(sx, sz) / 6, sy / 6));
    solids.push(aabb(x, y, z, sx, sy, sz));
}
function lavaPit(w, z0, z1) {
    const len = z1 - z0;
    texturedBox(w, 1, len, 0, -6.5, z0 + len / 2, lavaMaterial(w / 14, len / 14));
    const k = aabb(0, -22, z0 + len / 2, w, 34, len); k.active = true; kills.push(k);
}
// Glowing lava column (Stage 4 walls)
function lavaPillar(x, z, top) {
    const sy = top + 8;
    texturedBox(3, sy, 3, x, -8 + sy / 2, z, lavaMaterial(1, sy / 6));
    const k = aabb(x, -8 + sy / 2, z, 3, sy, 3); k.active = true; kills.push(k);
}
const CONE = new T.ConeGeometry(1, 1, 6);
function cone(x, y, z, r, h, color, o) {
    const m = new T.Mesh(CONE, mat(color, o));
    m.scale.set(r, h, r); m.position.set(x, y + h / 2, z); m.castShadow = true;
    scene.add(m);
    return m;
}
// Blue sneaker worth +Speed, the reference's speed icon, with its label floating underneath
function addPickup(stageIdx, x, y, z, amount) {
    const g = new T.Group();
    const body = new T.Mesh(UNIT, mat(0x2a8cff)); body.scale.set(1.6, 1, 2.8); body.position.y = 0.3; g.add(body);
    const sole = new T.Mesh(UNIT, mat(0xffffff)); sole.scale.set(1.75, 0.35, 3); sole.position.y = -0.3; g.add(sole);
    const ankle = new T.Mesh(UNIT, mat(0x2a8cff)); ankle.scale.set(1.5, 1, 1.2); ankle.position.set(0, 1, -0.8); g.add(ankle);
    const toe = new T.Mesh(UNIT, mat(0xffffff)); toe.scale.set(1.62, 0.5, 0.6); toe.position.set(0, 0, 1.2); g.add(toe);
    const lace = new T.Mesh(UNIT, mat(0x9fe0ff)); lace.scale.set(1.2, 0.2, 1.2); lace.position.set(0, 0.85, 0.1); g.add(lace);
    g.position.set(x, y + 2.4, z);
    scene.add(g);
    billboard([{ t: '+' + amount + ' Speed', c: '#2a8cff', s: '#ffffff', px: 64 }], 4.2, 512, new V3(x, y + 0.9, z));
    const id = stageIdx + ':' + pickups.filter((p) => p.stage === stageIdx).length;
    pickups.push({ id, stage: stageIdx, g, base: y + 2.4, amount, respawnAt: 0, phase: Math.random() * 6 });
}
// Side walls of an open-air stage, with trees standing on top of them
function sideWalls(s, rng, o) {
    o = o || {};
    const mid = s.zS + s.len / 2, h = o.h || 26, bottom = o.bottom ?? -10;
    const wm = o.mat || dottedWallMaterial(o.color || LC.sand, s.len / 6, (h - bottom) / 6);
    for (const sx of [-1, 1]) {
        texturedBox(3, h - bottom, s.len, sx * (s.w / 2 + 1.5), (h + bottom) / 2, mid, wm);
        solids.push(aabb(sx * (s.w / 2 + 1.5), (h + bottom) / 2, mid, 3, h - bottom, s.len));
        if (o.trees !== false) treeLine(rng, sx * (s.w / 2 + 6), s.zS + 4, sx * (s.w / 2 + 6), s.zE - 4, h, 9);
        if (o.trim) box(1, 0.8, s.len, sx * (s.w / 2 + 0.2), h - 0.4, mid, o.trim, { decor: true });
    }
}
// The "Stage N" gate across the start of a stage, with the doorway through it
const STAGE_H = 44;
function stageWall(prev, s, wallMat) {
    const half = Math.max(prev.w, s.w) / 2 + 3, D = s.door / 2, DH = 22, z = s.zS + 1;
    texturedBox(half - D, STAGE_H + 12, 2, -(half + D) / 2, STAGE_H / 2 - 6, z, wallMat);
    texturedBox(half - D, STAGE_H + 12, 2, (half + D) / 2, STAGE_H / 2 - 6, z, wallMat);
    texturedBox(D * 2, STAGE_H - DH + 4, 2, 0, (STAGE_H + DH + 4) / 2, z, wallMat);
    solids.push(aabb(-(half + D) / 2, STAGE_H / 2 - 6, z, half - D, STAGE_H + 12, 2), aabb((half + D) / 2, STAGE_H / 2 - 6, z, half - D, STAGE_H + 12, 2));
    solids.push(aabb(0, (STAGE_H + DH + 4) / 2, z, D * 2, STAGE_H - DH + 4, 2));
    // Gold frame round the doorway
    box(D * 2 + 2, 1.2, 2.6, 0, DH + 0.6, z, LC.gold, { decor: true });
    for (const sx of [-1, 1]) box(1.2, DH, 2.6, sx * (D + 0.6), DH / 2, z, LC.gold, { decor: true });
    const lines = [{ t: s.name, c: '#ffffff', s: '#1a1f5c', px: 170 }];
    if (s.sub) lines.push({ t: s.sub, c: s.subColor, s: '#1a1f5c', px: 90 });
    textPlane(lines, 30, 1024, new V3(0, DH + 11, s.zS - 0.2), new V3(0, DH + 11, s.zS - 10));
}
// Landing at the end of a stage: "+N Wins / Return!" pad left, "x2 Wins!" pad right,
// white chevrons on the floor pointing on to the next stage
function landing(i, s, finish) {
    const w = Math.max(s.w, 30), y = s.landY || 0;
    studBox(w, 2, CFG.endZone, 0, y - 1, s.cE + CFG.endZone / 2, 0x6c6a8a);
    const pz = s.cE + CFG.endZone / 2;
    const pad = (x, color, lines, enter) => {
        const m = new T.Mesh(UNIT, mat(color, { neon: true }));
        m.scale.set(9, 0.3, 5); m.position.set(x, y + 0.15, pz); m.rotation.y = x > 0 ? 0.35 : -0.35; scene.add(m);
        billboard(lines, 8, 512, new V3(x, y + 4.5, pz));
        const tr = aabb(x, y + 2.5, pz, 9, 5, 6);
        tr.enter = enter;
        triggers.push(tr);
    };
    // Facing down the course, +x is on the left: Return on the left, x2 on the right
    pad(w / 2 - 7, 0xff8a1e, [{ t: '+' + s.wins + ' Wins', c: '#ffd028', s: '#16121f', px: 80 }, { t: finish ? 'FINISH!' : 'Return!', c: '#ffffff', s: '#16121f', px: 50 }], () => actions.pad(i));
    pad(-w / 2 + 7, 0xff2ad8, [{ t: 'x2 Wins!', c: '#ff7ae0', s: '#16121f', px: 80 }, { t: 'Only ' + buxText(PASSES.DoubleWins.price), c: '#ffffff', s: '#16121f', px: 46 }], () => actions.buy('pass', 'DoubleWins'));
    if (!finish) for (let k = 0; k < 3; k++) chevron(0, y + 0.08, s.cE + 8 + k * 7, 0xffffff);
}
// White ">" arrow painted on the floor, pointing down the course (+z)
function chevron(x, y, z, color) {
    for (const s of [-1, 1]) {
        const m = new T.Mesh(UNIT, mat(color));
        m.scale.set(6, 0.08, 1.4); m.position.set(x + s * 2.1, y, z); m.rotation.y = s * 0.6;
        scene.add(m);
    }
}
// Flat board whose canvas can be redrawn (hut sign, leaderboards)
function canvasPlane(w, h, pxW, pxH, pos, face) {
    const cv = document.createElement('canvas'); cv.width = pxW; cv.height = pxH;
    const tex = texFrom(cv);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    m.position.copy(pos); m.rotation.y = Math.atan2(face.x, face.z);
    scene.add(m);
    return { cv, tex, m };
}
// Floating title: white text on a coloured bar that fades out at both ends
function gradientBanner(text, colors, w, pos, face, sub) {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = sub ? 300 : 200;
    const x = cv.getContext('2d');
    x.font = '700 120px Fredoka, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineJoin = 'round'; x.lineWidth = 16; x.strokeStyle = '#16121f'; x.strokeText(text, 512, 100);
    const g = x.createLinearGradient(0, 40, 0, 160);
    g.addColorStop(0, colors[0]); g.addColorStop(1, colors[1]);
    x.fillStyle = g; x.fillText(text, 512, 100);
    if (sub) {
        x.font = '700 62px Fredoka, sans-serif'; x.lineWidth = 12; x.strokeText(sub, 512, 232);
        x.fillStyle = '#ffd028'; x.fillText(sub, 512, 232);
    }
    const m = new T.Mesh(new T.PlaneGeometry(w, w * cv.height / 1024), new T.MeshBasicMaterial({ map: texFrom(cv), transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    m.position.copy(pos); m.rotation.y = Math.atan2(face.x, face.z);
    scene.add(m);
    return m;
}
// Round pad that opens a purchase when stepped on (+10K SPEED, +500 WINS ...)
function buyPad(x, z, color, lines, kind, key) {
    const pad = new T.Mesh(new T.CylinderGeometry(2.6, 2.6, 0.3, 28), mat(color, { neon: true }));
    pad.position.set(x, 0.15, z); scene.add(pad);
    billboard(lines, 7, 512, new V3(x, 4, z));
    const tr = aabb(x, 2, z, 5, 4, 5);
    tr.enter = () => actions.buy(kind, key);
    triggers.push(tr);
}

// =====================================================================================
// Lobby pieces
// =====================================================================================
// Fossil Chest: a wooden chest strapped with bones on a little sand mound
function fossilChest(pos) {
    const g = new T.Group(); g.position.copy(pos); g.rotation.y = Math.PI / 2 + 0.3; scene.add(g);
    const part = (sx, sy, sz, x, y, z, c, o) => { const m = new T.Mesh(UNIT, mat(c, o)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    part(11, 1, 9, 0, 0.5, 0, 0xe8c890);
    part(8, 5, 6, 0, 3.5, 0, 0x9a6a2a);
    for (const x of [-3.4, 0, 3.4]) part(0.6, 5.1, 6.1, x, 3.5, 0, 0xe8b830);
    const lid = part(8.2, 2.4, 6.2, 0, 6.8, -0.4, 0xa87430); lid.rotation.x = -0.25;
    part(1.4, 1.4, 0.4, 0, 4.9, 3.1, 0xffd23a, { neon: true });
    // Crossed bones over the lid and a skull on the front
    for (const r of [-0.6, 0.6]) { const b = part(9, 0.6, 0.6, 0, 8.2, 0.3, 0xfff4dc); b.rotation.y = r; }
    part(1.8, 1.6, 1.4, 2.6, 3.4, 3.1, 0xfff4dc);
    part(0.4, 0.4, 0.1, 2.2, 3.6, 3.85, 0x141418); part(0.4, 0.4, 0.1, 3, 3.6, 3.85, 0x141418);
    solids.push(aabb(pos.x, 4, pos.z, 10, 8, 10));
    const tr = aabb(pos.x, 3, pos.z, 14, 6, 14);
    tr.enter = () => actions.chest();
    triggers.push(tr);
}
// Nest with the Baby T-Rex egg (free after playing a while); the egg wobbles when it's ready
function eggNest(pos) {
    const pad = new T.Mesh(new T.CylinderGeometry(6, 6, 0.4, 6), mat(0xff3cc8, { neon: true }));
    pad.position.set(pos.x, 0.2, pos.z); scene.add(pad);
    for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2;
        const st = new T.Mesh(UNIT, mat(i % 2 ? 0xc89a50 : 0xa87a3a)); st.scale.set(3, 0.7, 0.8); st.position.set(pos.x + Math.cos(a) * 3.2, 0.8, pos.z + Math.sin(a) * 3.2); st.rotation.y = -a; scene.add(st);
    }
    const egg = new T.Group(); egg.position.set(pos.x, 0.6, pos.z); scene.add(egg);
    const e1 = new T.Mesh(UNIT, mat(0xfff4dc)); e1.scale.set(2.6, 3.2, 2.6); e1.position.y = 1.8; egg.add(e1);
    const e2 = new T.Mesh(UNIT, mat(0xfff4dc)); e2.scale.set(1.8, 1, 1.8); e2.position.y = 3.8; egg.add(e2);
    for (let i = 0; i < 6; i++) { const sp = new T.Mesh(UNIT, mat(0x46c83c)); sp.scale.set(0.6, 0.6, 0.1); sp.position.set(((i * 7) % 5 - 2) * 0.4, 1 + (i % 3) * 0.8, 1.31); egg.add(sp); }
    const baby = buildDino(dinoById.BabyRex); baby.position.set(pos.x, 0.4, pos.z); baby.rotation.y = 2.3; baby.visible = false; scene.add(baby);
    tickers.push((dt, t) => {
        const owned = !!S.owned.BabyRex;
        egg.visible = !owned; baby.visible = owned;
        if (owned) { walkDino(baby, dt, false); return; }
        const ready = (net.now() - S.joinedAt) / 60000 >= EGG_MINUTES;
        egg.rotation.z = ready ? Math.sin(t * 12) * 0.12 * (Math.sin(t * 1.3) > 0 ? 1 : 0) : 0;
    });
    signs.egg = billboard(eggLines(), 11, 512, new V3(pos.x, 10.5, pos.z));
    const tr = aabb(pos.x, 3, pos.z, 10, 6, 10);
    tr.enter = () => actions.egg();
    triggers.push(tr);
}
function eggLines() {
    const left = EGG_MINUTES * 60 - (net.now() - S.joinedAt) / 1000;
    const status = S.owned.BabyRex ? { t: 'OWNED', c: '#6fe0ff' } : left > 0 ? { t: 'Hatches In: ' + clock(left), c: '#7dff6b' } : { t: 'HATCH!', c: '#7dff6b' };
    return [{ t: 'Baby T-Rex +' + dinoById.BabyRex.bonus + '/Speed', c: '#6fe0ff', s: '#16121f', px: 64 }, { ...status, s: '#16121f', px: 56 }];
}
// "Keep playing for ... Free SPEED BOOST" hut
function boostHut(pos) {
    const wood = 0x9a6a4a, leaf = LC.leaf;
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) box(1.2, 9, 1.2, pos.x + sx * 3, 4.5, pos.z + sz * 5, wood, { decor: true });
    box(7, 8, 0.6, pos.x, 4.5, pos.z + 5.2, 0xc8a88a, { studs: true });
    box(0.6, 8, 10, pos.x - 3.4, 4.5, pos.z, 0xc8a88a, { studs: true });
    const roof = box(9, 0.8, 13, pos.x, 9.4, pos.z, leaf, { decor: true });
    roof.rotation.z = -0.12; roof.updateMatrix();
    signs.hut = canvasPlane(5.6, 4, 256, 184, new V3(pos.x - 3.05, 5, pos.z), new V3(1, 0, 0));
    drawHut();
    const tr = aabb(pos.x, 3, pos.z, 7, 6, 9);
    tr.enter = () => actions.freeBoost();
    triggers.push(tr);
}
function hutText() {
    const left = FREE_BOOST_MINUTES * 60 - (net.now() - S.joinedAt) / 1000;
    if (S.freeBoost) return 'Enjoy your boost!';
    return left > 0 ? Math.floor(left / 60) + ' min ' + Math.floor(left % 60) + ' sec' : 'Step in to claim!';
}
function drawHut() {
    const h = signs.hut, x = h.cv.getContext('2d');
    x.fillStyle = '#e8dcc8'; x.fillRect(0, 0, 256, 184);
    x.strokeStyle = '#6a4a30'; x.lineWidth = 8; x.strokeRect(4, 4, 248, 176);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#2a2a3a'; x.font = '700 26px Fredoka, sans-serif'; x.fillText('Keep playing for:', 128, 44);
    x.font = '700 30px Fredoka, sans-serif'; x.fillText(hutText(), 128, 92);
    x.fillStyle = '#28a83c'; x.font = '700 26px Fredoka, sans-serif'; x.fillText('Free SPEED BOOST', 128, 142);
    h.tex.needsUpdate = true;
    h.last = hutText();
}
// Timers on the egg and hut signs; cheap to call often, redraws only when the text changes
export function updateLobbySigns() {
    if (signs.hut && hutText() !== signs.hut.last) drawHut();
    if (signs.egg) {
        const lines = eggLines(), key = lines.map((l) => l.t).join('|');
        if (key !== signs.egg.key) { signs.egg.key = key; signs.egg.userData.set(lines); }
    }
}

// TOP WINS / TOP SPEED: dark screen in a gold frame with a big icon on top, like the reference
function leaderboard(pos, title, icon, face) {
    const g = new T.Group(); g.position.copy(pos); g.rotation.y = Math.atan2(face.x, face.z); scene.add(g);
    const part = (sx, sy, sz, x, y, z, c, o) => { const m = new T.Mesh(UNIT, mat(c, o)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    part(17, 2, 4, 0, 1, 0, LC.sandDark);
    part(16, 24, 1.6, 0, 14, 0, 0x2a2a44);
    for (const sx of [-1, 1]) part(1.2, 26, 2, sx * 8.4, 14, 0, LC.gold);
    part(18, 1.2, 2, 0, 27, 0, LC.gold); part(18, 1.2, 2, 0, 1.6, 0, LC.gold);
    solids.push(aabb(pos.x, 14, pos.z, 12, 28, 12));
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 720;
    const tex = texFrom(cv);
    const scr = new T.Mesh(new T.PlaneGeometry(15, 21), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
    scr.position.set(0, 14.5, 0.85); g.add(scr);
    const head = textPlane([{ t: icon + ' ' + title, c: '#ffd028', s: '#16121f', px: 96 }], 18, 1024, new V3(), new V3(0, 0, 1));
    scene.remove(head); head.position.set(0, 30.5, 0.3); g.add(head);
    return { cv, tex };
}
function drawBoard(b, rows, kind) {
    const x = b.cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, '#2c3a8a'); g.addColorStop(1, '#1a1f5c');
    x.fillStyle = g; x.fillRect(0, 0, 512, 720);
    x.font = '700 34px Fredoka, sans-serif'; x.textBaseline = 'middle';
    if (!rows.length) { x.textAlign = 'center'; x.fillStyle = '#ffffff'; x.fillText('Be the first!', 256, 360); }
    rows.forEach((r, i) => {
        const y = 40 + i * 68;
        if (i % 2 === 0) { x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(0, y - 34, 512, 68); }
        x.textAlign = 'left'; x.fillStyle = r.you ? '#7dff6b' : i < 3 ? ['#ffd028', '#e0e6f0', '#e8a060'][i] : '#ffffff';
        x.fillText('#' + (r.rank || i + 1), 14, y);
        x.fillText(r.n.slice(0, 13), 84, y);
        x.textAlign = 'right'; x.fillStyle = '#7dff6b';
        x.fillText(kind === 'speed' ? sci(r.v) : fmt(r.v), 500, y);
    });
    b.tex.needsUpdate = true;
}
// msg = { speed: [{n, v}], wins: [...] } from the server, top 10 each
export function renderBoards(msg) {
    if (!boards.speed || !msg) return;
    for (const kind of ['speed', 'wins']) {
        const rows = (msg[kind] || []).map((r, i) => ({ n: r.n, v: r.v, rank: i + 1, you: r.n === S.name }));
        drawBoard(boards[kind], rows, kind);
    }
}

// ----- DINO SHOP pedestals: a red pad you step on, the dino standing on it -----
function pedestalLines(d) {
    const lines = [{ t: '+' + fmt(d.bonus) + '/Speed', c: '#7dff6b', s: '#16121f', px: 72 }];
    if (S.equipped === d.id) lines.push({ t: 'RIDING', c: '#6fe0ff', s: '#16121f', px: 50 });
    else if (S.owned[d.id]) lines.push({ t: 'OWNED - Step to Ride', c: '#7dff6b', s: '#16121f', px: 44 });
    else if (d.pass) lines.push({ t: d.tagline + ' ONLY ' + buxText(PASSES[d.pass].price), c: '#ffd028', s: '#16121f', px: 46 });
    else lines.push({ t: 'Price: ' + fmt(d.req) + ' Wins', c: '#ffd028', s: '#16121f', px: 50 });
    lines.unshift({ t: d.name, c: '#ffffff', s: '#16121f', px: 46 });
    return lines;
}
function buildPedestal(d, pos, face) {
    const glow = d.glow || 0xff2a3a;
    box(7, 0.4, 7, pos.x, pos.y + 0.2, pos.z, d.glow ? glow : LC.red, { neon: !!d.glow, decor: true });
    box(7.6, 0.25, 7.6, pos.x, pos.y + 0.12, pos.z, 0x16121f, { decor: true });
    const dino = buildDino(d);
    dino.position.set(pos.x, pos.y + 0.4, pos.z);
    dino.rotation.y = face;
    scene.add(dino);
    const at = new V3(pos.x, pos.y + 1, pos.z);
    tickers.push((dt) => {
        if (camera.position.distanceToSquared(at) > 140 * 140) return;
        walkDino(dino, dt, false);
    });
    const top = (d.size || 1) * (d.shape === 'brachio' ? 12 : 8);
    const sp = billboard(pedestalLines(d), 12, 512, new V3(pos.x, pos.y + top + 4, pos.z));
    shopItems.push({ d, sp, sig: '' });
    const tr = aabb(pos.x, pos.y + 2, pos.z, 7, 4, 7);
    tr.enter = () => actions.shop(d);
    triggers.push(tr);
}

export function treadLocked(def) {
    if (def.pass) return !S.passes[def.pass];
    if (def.req) return S.wins < def.req;
    return false;
}
// Treadmill looks from the reference: x3 yellow, x9 icy cyan, x25 magenta
const TREAD_LOOK = {
    25: { frame: 0xc428ff, belt: 0x3a1a4a, label: '#ff6ef0', glow: 0xff3ce0 },
    9: { frame: 0x28d8ff, belt: 0x1a4a5a, label: '#6fe0ff', glow: 0x6ff6ff },
    3: { frame: 0xffc414, belt: 0x5a4210, label: '#ffd028', glow: 0xffd028 },
    1: { frame: 0x9a98aa, belt: 0x2d2d34, label: '#ffffff' },
};
function treadLines(def) {
    const lines = def.mult > 1 ? [{ t: def.mult + 'x Speed!' + (def.mult > 3 ? '!' : ''), c: TREAD_LOOK[def.mult].label, s: '#16121f', px: 72 }] : [];
    if (treadLocked(def)) lines.push({ t: def.pass ? '🔒 ' + buxText(PASSES[def.pass].price) : '🔒 ' + def.req + ' Wins', c: '#ffd028', s: '#16121f', px: 48 });
    return lines.length ? lines : [{ t: ' ', px: 10 }];
}
export function refreshShop() {
    for (const it of shopItems) {
        const sig = S.equipped + (S.owned[it.d.id] ? 1 : 0) + (it.d.pass ? PASSES[it.d.pass].price : '');
        if (sig !== it.sig) { it.sig = sig; it.sp.userData.set(pedestalLines(it.d)); }
    }
    for (const t of treadItems) {
        const sig = (treadLocked(t.def) ? 'l' : 'u') + (t.def.pass ? PASSES[t.def.pass].price : '');
        if (sig !== t.sig) { t.sig = sig; t.sp.userData.set(treadLines(t.def)); }
    }
}
// Treadmill: belt runs toward the red carpet (+x), console at the back (-x)
function buildTreadmill(def, cx, top, cz) {
    const L = TREAD_GEO.len, W = TREAD_GEO.width, look = TREAD_LOOK[def.mult];
    const belt = new T.Mesh(UNIT, new T.MeshLambertMaterial({ map: beltTex, color: look.belt }));
    belt.scale.set(L, 0.6, W); belt.position.set(cx, top + 0.3, cz); belt.receiveShadow = true; scene.add(belt);
    const c = aabb(cx, top + 0.3, cz, L, 0.6, W); c.belt = new V3(12, 0, 0); c.tread = def; solids.push(c);
    const neon = def.mult > 1;
    for (const s of [-1, 1]) {
        box(L, 1, 0.7, cx, top + 0.5, cz + s * (W / 2 + 0.35), look.frame, { neon });
        box(0.7, 5, 0.7, cx - L / 2 + 0.5, top + 2.5, cz + s * (W / 2), look.frame, { decor: true });
    }
    box(0.7, 0.7, W + 0.7, cx - L / 2 + 0.5, top + 4.3, cz, look.frame, { decor: true });
    box(1, 2.6, W - 0.6, cx - L / 2, top + 5.8, cz, look.frame, { decor: true });
    box(0.3, 1.8, W - 1.6, cx - L / 2 + 0.55, top + 5.8, cz, look.glow || 0x1e5ad8, { neon: true, decor: true });
    const sp = billboard(treadLines(def), 12, 512, new V3(cx, top + 10, cz));
    treadItems.push({ def, sp, sig: '' });
    if (def.mult > 1) {
        const at = new V3(cx, top + 0.7, cz);
        let acc = Math.random();
        tickers.push((dt) => { acc += dt * 14; while (acc > 1) { acc -= 1; emitTread(at, def.mult, L, W); } });
    }
}

// =====================================================================================
// Lobby: the jungle plaza from the reference video. Facing Stage 1 (north, +z):
// red carpet down the middle to the Stage 1 gate, DINO SHOP on the left (+x),
// TREADMILLS, leaderboards and freebies on the right (-x). Tan dotted walls all round
// with trees standing on top.
// =====================================================================================
function buildLobby() {
    const rng = rngFrom(7);
    // Floor: yellow studded paths everywhere, the red carpet down the middle
    box(HX * 2, 2, HZ * 2, 0, -1, 0, LC.path, { studs: true });
    box(22, 0.1, HZ + 64, 0, 0.04, (HZ - 64) / 2, LC.carpet, { studs: true, decor: true });
    for (const sx of [-1, 1]) box(0.8, 0.12, HZ + 64, sx * 11.4, 0.05, (HZ - 64) / 2, LC.carpetDark, { decor: true });

    // Walls round the lobby, with a gap for the Stage 1 gate
    const WH = LOBBY.wallHeight, half = STAGES[0].w / 2 + 3;
    sandWall(4, WH, HZ * 2 + 8, HX + 2, WH / 2, 0);
    sandWall(4, WH, HZ * 2 + 8, -HX - 2, WH / 2, 0);
    sandWall(HX * 2 + 8, WH, 4, 0, WH / 2, -HZ - 2);
    for (const sx of [-1, 1]) sandWall(HX - half + 2, WH, 4, sx * (half + (HX - half + 2) / 2), WH / 2, HZ + 2);
    treeLine(rng, HX + 10, -HZ, HX + 10, HZ, WH, 10);
    treeLine(rng, -HX - 10, -HZ, -HX - 10, HZ, WH, 10);
    treeLine(rng, -HX, -HZ - 10, HX, -HZ - 10, WH, 10);
    // Far-off hills of trees beyond the walls
    for (let i = 0; i < 40; i++) {
        const a = rng() * Math.PI * 2, r = 130 + rng() * 60;
        tree(Math.cos(a) * r, rng() * 10, Math.sin(a) * r * 0.8, 1.6 + rng() * 1.4, rng);
    }
    for (let i = 0; i < 16; i++) cloud((rng() * 2 - 1) * 220, 70 + rng() * 50, (rng() * 2 - 1) * 260 + 150, 1 + rng() * 1.5, rng);

    // Stage 1 gate: two big sandstone pillars and a lintel, gold doorway frame
    const GH = 46;
    for (const sx of [-1, 1]) {
        sandWall(10, GH, 10, sx * (half + 3), GH / 2, HZ + 2);
        box(11, 2, 11, sx * (half + 3), GH + 1, HZ + 2, LC.gold, { decor: true });
        tree(sx * (half + 3), GH + 2, HZ + 2, 1.3, rng);
    }
    texturedBox(half * 2 + 4, 10, 6, 0, GH - 5, HZ + 2, dottedWallMaterial(LC.sand, 9, 2));
    box(half * 2 + 2, 1.2, 6.4, 0, GH - 10.6, HZ + 2, LC.gold, { decor: true });

    // Spawn: a gold-rimmed pad on the carpet
    box(14, 0.3, 14, SPAWN.x, 0.15, SPAWN.z, 0x16121f, { decor: true });
    box(13, 0.36, 13, SPAWN.x, 0.18, SPAWN.z, LC.gold, { studs: true, decor: true });
    box(10, 0.42, 10, SPAWN.x, 0.21, SPAWN.z, LC.carpet, { studs: true, decor: true });

    // Flower beds and bushes along the carpet
    for (let z = -60; z < HZ - 6; z += 14) for (const sx of [-1, 1]) {
        if (rng() < 0.5) flowers(sx * (14 + rng() * 2), z + rng() * 6, rng);
        else bush(sx * (15 + rng() * 2), 0, z + rng() * 6, 0.8);
    }

    // DINO SHOP (left, +x): front row on the floor, back row raised on a sandstone ledge
    const FX = 30, BX = 52, TOPY = 5;
    sandWall(30, TOPY, 118, 70, TOPY / 2, -4, 0xd8aa76);
    box(30, 0.3, 118, 70, TOPY + 0.15, -4, LC.path, { studs: true });
    // Steps up to the back row at both ends (each under the auto-step height)
    for (const sz of [-58, 50]) for (let i = 0; i < 4; i++) {
        const h = (i + 1) * (TOPY / 4);
        box(3, h, 8, 44.5 + i * 3, h / 2, sz, LC.sandDark, { studs: true });
    }
    const front = DINOS.filter((d) => d.row === 1), back = DINOS.filter((d) => d.row === 2);
    front.forEach((d, i) => buildPedestal(d, new V3(FX, 0, -48 + i * 15), -Math.PI / 2 - 0.4));
    back.forEach((d, i) => buildPedestal(d, new V3(BX + 9, TOPY, -50 + i * 15.5), -Math.PI / 2 - 0.4));
    gradientBanner('DINO SHOP!', ['#ffffff', '#ffe36b'], 40, new V3(56, 34, 0), new V3(-1, 0, 0), 'Buy Dino For Speed Boosts!');

    // TREADMILLS (right, -x) on a low sandstone ledge
    const bc = document.createElement('canvas'); bc.width = 64; bc.height = 64;
    const bx = bc.getContext('2d');
    bx.fillStyle = '#ffffff'; bx.fillRect(0, 0, 64, 64);
    bx.fillStyle = '#b8b8c4'; for (let i = 0; i < 4; i++) bx.fillRect(i * 16, 0, 6, 64);
    beltTex = texFrom(bc); beltTex.wrapS = beltTex.wrapT = T.RepeatWrapping; beltTex.repeat.set(4, 1);
    const top = TREAD_GEO.top, tz0 = TREAD_GEO.z0 - 7, tz1 = TREAD_GEO.z0 + (TREADMILLS.length - 1) * TREAD_GEO.step + 7;
    box(22, top, tz1 - tz0, TREAD_GEO.cx - 2, top / 2, (tz0 + tz1) / 2, LC.sandDark, { studs: true });
    TREADMILLS.forEach((def, i) => buildTreadmill(def, TREAD_GEO.cx, top, TREAD_GEO.z0 + i * TREAD_GEO.step));
    gradientBanner('TREADMILLS', ['#ffffff', '#9ff0ff'], 36, new V3(TREAD_GEO.cx - 14, 26, (tz0 + tz1) / 2), new V3(1, 0, 0), 'Get Speed While Offline!');

    // Back right: leaderboards; front right: speed pads; south: hut, chest and egg
    boards.wins = leaderboard(new V3(-40, 0, 48), 'TOP WINS', '🏆', new V3(0.6, 0, -1).normalize());
    boards.speed = leaderboard(new V3(-64, 0, 42), 'TOP SPEED', '👟', new V3(1, 0, -0.5).normalize());
    buyPad(-24, 26, 0xff4a8a, [{ t: '+10K SPEED', c: '#ffffff', s: '#16121f', px: 60 }], 'product', 'Speed10K');
    buyPad(-24, 34, 0xff4a8a, [{ t: '+100K SPEED', c: '#ffffff', s: '#16121f', px: 60 }], 'product', 'Speed100K');
    buyPad(-24, 42, 0xc428ff, [{ t: '+1M SPEED', c: '#ff8af0', s: '#16121f', px: 60 }], 'product', 'Speed1M');
    buyPad(22, 60, 0xffd028, [{ t: '+500 WINS', c: '#ffd028', s: '#16121f', px: 60 }], 'product', 'Wins500');
    buyPad(30, 64, 0xffd028, [{ t: '+5K WINS', c: '#ffd028', s: '#16121f', px: 60 }], 'product', 'Wins5K');
    boostHut(new V3(-72, 0, -60));
    fossilChest(new V3(-48, 0, -60));
    billboard([{ t: 'Fossil Chest', c: '#ffd028', s: '#16121f', px: 80 }, { t: 'Like the game + claim daily!', c: '#ffe07a', s: '#16121f', px: 44 }], 14, 512, new V3(-48, 14, -60));
    eggNest(new V3(-24, 0, -58));
    // "Update!" poster by the shop
    signBoard(new V3(20, 9, 66), new V3(0, 0, -1), 16, 9, [{ t: 'UPDATE!', c: '#ff3c50', s: '#ffffff', px: 120 }, { t: 'Stage 6: DINO KING', c: '#1a1f5c', px: 80 }, { t: '+ Troll Menu!', c: '#8a1cff', px: 70 }], 0xfff4dc);
}

// =====================================================================================
// Course. Stages sit end to end along +z; each starts behind a "Stage N" gate and ends on a
// landing with the Wins pads. Stage 1-3 are modelled on the reference video.
// =====================================================================================
// ----- Stage 1: the red carpet run with spike traps on the server clock -----
export const spikes = [];
const SPIKE_GEO = new T.ConeGeometry(0.55, 2.2, 5);
function spikeTrap(x, z, w, d, phase) {
    const g = new T.Group(); g.position.set(x, -2.3, z); scene.add(g);
    const sm = mat(0xd8dce8);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const c = new T.Mesh(SPIKE_GEO, sm);
        c.position.set((i - 1.5) * (w / 4), 1.1, (j - 1) * (d / 3)); c.castShadow = true; g.add(c);
    }
    // The black thorn splat on the carpet (the reference's dark star marks), glowing red before it fires
    const mark = new T.MeshBasicMaterial({ color: 0x16121f });
    const star = new T.Group(); star.position.set(x, 0.07, z); scene.add(star);
    for (let k = 0; k < 4; k++) {
        const arm = new T.Mesh(UNIT, mark); arm.scale.set(w * 1.05, 0.04, 1.1); arm.rotation.y = k * Math.PI / 4; star.add(arm);
    }
    const hole = new T.Mesh(UNIT, mark); hole.scale.set(w * 0.75, 0.05, d * 0.75); star.add(hole);
    const k = aabb(x, 1, z, w * 0.9, 2, d * 0.9); k.active = false; kills.push(k);
    spikes.push({ g, mark, k, phase, z });
}
// Spikes for server time t (seconds): raise/lower them and arm their kill boxes
const WARN = new T.Color(0xff2a2a), DARK = new T.Color(0x16121f);
export function updateSpikes(t) {
    const F = CFG.spikes, cyc = F.hidden + F.warn + F.up;
    for (const s of spikes) {
        if (Math.abs(s.z - camera.position.z) > 220) continue;
        const k = ((t + s.phase) % cyc + cyc) % cyc;
        let y = -2.3, warn = 0;
        if (k < F.hidden) y = -2.3;
        else if (k < F.hidden + F.warn) { y = -1.7 + Math.sin(k * 70) * 0.15; warn = 0.5 + 0.5 * Math.sin(k * 30); }
        else { const u = (k - F.hidden - F.warn) / F.up; y = u < 0.08 ? -1.7 + (u / 0.08) * 1.7 : u > 0.88 ? -((u - 0.88) / 0.12) * 2.3 : 0; }
        s.g.position.y = y;
        s.mark.color.copy(DARK).lerp(WARN, warn);
        s.k.active = y > -1;
    }
}
function buildCarpet(i, s, rng) {
    const W = s.w, z1 = s.cE;
    sideWalls(s, rng, { h: 26 });
    studBox(W, 2, z1 - s.zS, 0, -1, (s.zS + z1) / 2, LC.path);
    box(24, 0.1, z1 - s.zS, 0, 0.04, (s.zS + z1) / 2, LC.carpet, { studs: true, decor: true });
    for (const sx of [-1, 1]) box(0.8, 0.12, z1 - s.zS, sx * 12.4, 0.05, (s.zS + z1) / 2, LC.carpetDark, { decor: true });
    // Rows of four traps across the whole width; neighbours fire half a cycle apart
    const cyc = CFG.spikes.hidden + CFG.spikes.warn + CFG.spikes.up;
    let row = 0;
    for (let z = s.zS + 34; z < z1 - 12; z += 26, row++) {
        for (let n = 0; n < 4; n++) spikeTrap(-15 + n * 10, z, 9.6, 7, row * 0.9 + (n % 2) * cyc / 2);
    }
    // Pillars with torches along the walls
    for (let z = s.zS + 20; z < z1; z += 30) for (const sx of [-1, 1]) {
        box(3, 14, 3, sx * (W / 2 - 1.5), 7, z, LC.sandDark, { studs: true });
        box(1.6, 1.6, 1.6, sx * (W / 2 - 1.5), 14.8, z, 0xff8a1e, { neon: true, decor: true });
    }
    for (let z = s.zS + 22; z < z1 - 10; z += 20) addPickup(i, (rng() < 0.5 ? -1 : 1) * (15 + rng() * 2), 0, z + rng() * 8, s.pickup);
}

// ----- Stage 2: green grass terraces stepping up and down, lavender checker walls -----
function terrace(W, len, y, z0) {
    const zc = z0 + len / 2, depth = 14;
    texturedBox(W, depth, len, 0, y - depth / 2 - 0.4, zc, studWallMaterial(LC.dirt, W / 4, depth / 4));
    texturedBox(W, 0.8, len, 0, y - 0.4, zc, studWallMaterial(LC.grass, W / 4, len / 4));
    solids.push(aabb(0, y - depth / 2, zc, W, depth, len));
}
function buildTerraces(i, s, rng) {
    const W = s.w;
    sideWalls(s, rng, { h: 30, bottom: -30, mat: checkerMaterial(LC.lavender, s.len / 8, 60 / 8) });
    // Far below: a misty green floor, so a fall reads as a long drop
    deco(W, 1, s.len, 0, -32, s.zS + s.len / 2, 0x2a8a3a);
    const segs = [];
    let z = s.zS, y = 0;
    segs.push({ len: 16, y: 0, gap: 0 });
    z += 16;
    const half = s.zS + (s.cE - s.zS) * 0.55;
    while (z < s.cE - 60) {
        const len = 10 + Math.floor(rng() * 9);
        const up = z < half;
        const r = rng();
        let dy = up ? (r < 0.5 ? 1.5 : r < 0.75 ? 3 : 0) : (r < 0.55 ? -1.5 : r < 0.8 ? -3 : 0);
        y = clamp(y + dy, 0, 13.5); dy = 0;
        const gap = rng() < 0.35 ? 3 + Math.floor(rng() * 3) : 0;
        segs.push({ len, y, gap });
        z += len + gap;
    }
    // Walk back down to ground level before the landing
    while (y > 0) { y = Math.max(0, y - 1.5); segs.push({ len: 5, y, gap: 0 }); }
    let zz = s.zS;
    segs.forEach((g, k) => {
        zz += g.gap;
        let len = g.len;
        if (k === segs.length - 1) len = s.cE - zz;
        terrace(W, len, g.y, zz);
        if (k % 2 === 1 && len > 8) addPickup(i, (rng() * 2 - 1) * (W / 2 - 6), g.y, zz + len / 2, s.pickup);
        if (len > 9) for (const sx of [-1, 1]) if (rng() < 0.7) bush(sx * (W / 2 - 3), g.y, zz + 2 + rng() * (len - 4), 0.7 + rng() * 0.4);
        if (len > 9 && rng() < 0.5) flowers((rng() * 2 - 1) * (W / 2 - 8), zz + len / 2, rng);
        zz += len;
    });
}

// ----- Stage 3: grey stone ramps over a chasm, with a giant T-Rex chasing you -----
function buildRamps(i, s, rng) {
    const W = s.w;
    sideWalls(s, rng, { h: 40, bottom: -40, color: 0xb89a7a });
    deco(W, 1, s.len, 0, -42, s.zS + s.len / 2, 0x4a4a5a);
    const path = []; // { z0, z1, y0, y1 } for the chaser's height lookup
    let z = s.zS, y = 0, x = 0;
    const PW = 18;
    const flat = (len) => {
        studBox(PW, y + 6, len, x, (y - 6) / 2, z + len / 2, LC.stone);
        for (const sx of [-1, 1]) box(1, 1.6, len, x + sx * (PW / 2 - 0.5), y + 0.8, z + len / 2, LC.stoneDark, { studs: true });
        path.push({ z0: z, z1: z + len, y0: y, y1: y });
        z += len;
    };
    // A ramp is a run of shallow steps (each under the auto-step height)
    const ramp = (n, dir) => {
        const z0 = z, y0 = y;
        for (let k = 0; k < n; k++) {
            y += dir * 1.2;
            studBox(PW, y + 6, 2.4, x, (y - 6) / 2, z + 1.2, LC.stone);
            z += 2.4;
        }
        for (const sx of [-1, 1]) {
            const rail = box(1, 1.6, n * 2.4 + 0.4, x + sx * (PW / 2 - 0.5), (y0 + y) / 2 + 0.8, z0 + n * 1.2, LC.stoneDark, { decor: true });
            rail.rotation.x = -Math.atan2(y - y0, n * 2.4); rail.updateMatrix();
        }
        path.push({ z0, z1: z, y0, y1: y });
    };
    flat(20);
    const plan = [['r', 6, 1], ['f', 16], ['x', 8], ['r', 5, 1], ['f', 14], ['x', -10], ['r', 6, -1], ['f', 18], ['r', 7, 1], ['f', 12], ['x', 9], ['r', 6, 1], ['f', 16], ['x', -7], ['r', 8, -1], ['f', 14]];
    for (const p of plan) {
        if (z > s.cE - 40) break;
        if (p[0] === 'f') flat(p[1]);
        else if (p[0] === 'r') ramp(p[1], p[2]);
        else x = clamp(x + p[1], -(W / 2 - PW / 2 - 1), W / 2 - PW / 2 - 1);
    }
    // Back down to ground level and on to the landing
    while (y > 0.01) ramp(1, -1);
    y = 0;
    if (z < s.cE) { const len = s.cE - z; studBox(Math.max(PW, Math.abs(x) * 2 + PW), 6, len, 0, -3, z + len / 2, LC.stone); path.push({ z0: z, z1: s.cE, y0: 0, y1: 0 }); }
    s.heightAt = (zq) => {
        for (const p of path) if (zq >= p.z0 && zq <= p.z1) return p.y0 + (p.y1 - p.y0) * ((zq - p.z0) / Math.max(0.01, p.z1 - p.z0));
        return 0;
    };
    for (let n = 0; n < path.length; n += 2) addPickup(i, x * 0.3, path[n].y1, (path[n].z0 + path[n].z1) / 2, s.pickup);
    buildChaser(s, CHASER_LOOK, 2.8);
}
// The chaser that hunts this player (local only; each player gets their own)
function buildChaser(s, look, size) {
    const m = buildDino({ ...look, size });
    m.visible = false; scene.add(m);
    const bb = new T.Box3().setFromObject(m);
    m.userData.nose = bb.max.z;
    m.userData.mouth = new V3(0, (bb.max.y - bb.min.y) * 0.72, bb.max.z - 1);
    const k = aabb(0, 20, s.zS - 6, s.w + 4, 80, 4); k.active = false; kills.push(k);
    s.chaseMesh = m; s.chaseKill = k;
}

// ----- Stage 4: basalt stepping stones over lava, meteors raining down -----
export const meteors = [];
function meteorSpot(x, y, z, period, phase) {
    const shadow = new T.Mesh(new T.CircleGeometry(4, 24), new T.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(x, y + 0.1, z); scene.add(shadow);
    const rock = new T.Group();
    const r1 = new T.Mesh(UNIT, mat(0x3a2a2a)); r1.scale.setScalar(3.2); rock.add(r1);
    const r2 = new T.Mesh(UNIT, mat(0xff6a14, { neon: true })); r2.scale.set(2.2, 3.4, 2.2); rock.add(r2);
    rock.visible = false; scene.add(rock);
    const k = aabb(x, y + 2, z, 7, 4, 7); k.active = false; kills.push(k);
    meteors.push({ x, y, z, period, phase, shadow, rock, k, landed: false });
}
export function updateMeteors(t, onLand) {
    const F = CFG.meteor;
    for (const m of meteors) {
        if (Math.abs(m.z - camera.position.z) > 200) { m.rock.visible = false; continue; }
        const k = ((t + m.phase) % m.period + m.period) % m.period;
        const warnEnd = F.warn, fallEnd = warnEnd + F.fall, burnEnd = fallEnd + F.burn;
        m.shadow.material.opacity = k < warnEnd ? 0.15 + (k / warnEnd) * 0.5 : k < burnEnd ? 0.7 : 0;
        m.shadow.scale.setScalar(k < warnEnd ? 0.5 + (k / warnEnd) * 0.5 : 1);
        if (k >= warnEnd - 0.6 && k < fallEnd) {
            const u = clamp((k - (warnEnd - 0.6)) / (0.6 + F.fall), 0, 1);
            m.rock.visible = true;
            m.rock.position.set(m.x + (1 - u) * 30, m.y + 2 + (1 - u * u) * 70, m.z - (1 - u) * 20);
            m.rock.rotation.set(t * 3, t * 2, 0);
            if (Math.random() < 0.6) flame(m.rock.position, 1.5, 2.2);
        } else if (k < burnEnd && k >= fallEnd) {
            m.rock.visible = true; m.rock.position.set(m.x, m.y + 1.6, m.z);
            if (Math.random() < 0.5) flame(new V3(m.x, m.y + 1, m.z), 5, 1.8);
        } else m.rock.visible = false;
        m.k.active = k >= fallEnd - 0.05 && k < burnEnd;
        const landed = k >= fallEnd && k < burnEnd;
        if (landed && !m.landed && onLand) onLand(m);
        m.landed = landed;
    }
}
function buildVolcano(i, s, rng) {
    const W = s.w, H = 30, z1 = s.cE;
    sideWalls(s, rng, { h: H, color: 0x6a4a42, trees: false });
    studBox(W, 2, 16, 0, -1, s.zS + 8, LC.basalt);
    lavaPit(W, s.zS + 16, z1);
    let z = s.zS + 16, x = 0, k = 0;
    const tops = [];
    while (z < z1 - 1) {
        const len = Math.min(12 + rng() * 8, z1 - z);
        const pw = 9 + rng() * 5;
        x = clamp(x + (rng() * 2 - 1) * 5, -(W / 2 - pw / 2 - 3), W / 2 - pw / 2 - 3);
        const y = [0, 1.5, 3, 1.5][k % 4];
        studBox(pw, y + 7, len, x, (y - 7) / 2, z + len / 2, k % 2 ? LC.basalt : 0x5a4848);
        tops.push({ x, y, z: z + len / 2, pw, len });
        for (const sd of [-1, 1]) if (rng() < 0.6) cone(x + sd * (pw / 2 + 3.5 + rng() * 3), -6, z + rng() * len, 1.1, 6 + rng() * 3, 0x3a2a2a);
        z += len + (k % 2 && z + len < z1 - 20 ? 2.5 + rng() * 2 : 0); k++;
    }
    for (let pz = s.zS + 30; pz < z1; pz += 40) for (const sd of [-1, 1]) lavaPillar(sd * (W / 2 - 2), pz + rng() * 12, H);
    tops.forEach((p, n) => {
        if (n % 2 === 1) meteorSpot(p.x, p.y, p.z, CFG.meteor.every * (1 + (n % 3) * 0.35), rng() * 5);
        else if (n > 0) addPickup(i, p.x, p.y, p.z, s.pickup);
    });
    // Two volcanoes smoking behind the walls
    for (const sx of [-1, 1]) {
        const vx = sx * 95, vz = s.zS + s.len * (sx > 0 ? 0.35 : 0.7);
        for (let l = 0; l < 6; l++) deco(60 - l * 9, 9, 60 - l * 9, vx, l * 9 + 4.5, vz, l % 2 ? 0x5a4040 : 0x4a3434);
        const crater = new T.Mesh(UNIT, mat(0xff6a14, { neon: true })); crater.scale.set(12, 1, 12); crater.position.set(vx, 54.6, vz); scene.add(crater);
        const top = new V3(vx, 56, vz);
        tickers.push(() => { if (Math.abs(vz - camera.position.z) < 260 && Math.random() < 0.5) flame(top, 8, 4); });
    }
}

// ----- Stage 5: a sky bridge with wild pterodactyls swooping across it -----
export const pteros = [];
const HAZARD_PTERO = { ...PTERO_LOOK, size: 1.5 };
function pteroLanes(s, rng) {
    const span = s.w / 2 + 14;
    let lane = 0;
    for (let z = s.zS + 30; z < s.cE - 8; z += s.laneGap, lane++) {
        const speed = s.bs * (0.8 + rng() * 0.45);
        const count = lane % 3 === 2 ? 2 : 1;
        const phase = rng();
        for (let n = 0; n < count; n++) {
            const f = buildDino(HAZARD_PTERO);
            scene.add(f);
            pteros.push({ f, z: z + (n ? 5 : 0), span, period: 4 * span / speed, phase: (phase + n * 0.5) % 1, x: 0, dir: 1, y: 0 });
        }
    }
}
// Positions every pterodactyl for server time t (seconds); main.js checks for hits.
// They dip down to rider height in the middle of the bridge and climb at the edges.
export function updatePteros(t, dt) {
    for (const k of pteros) {
        const u = ((t / k.period + k.phase) % 1 + 1) % 1;
        const out = u < 0.5;
        const f = out ? u * 2 : 2 - u * 2;
        k.x = -k.span + 2 * k.span * f;
        k.dir = out ? 1 : -1;
        k.y = 1 + Math.pow(Math.abs(k.x) / k.span, 2) * 9;
        // Model origin is at its feet; the body flies 2.2 model units (times its scale) above that
        k.f.position.set(k.x, k.y - 2.2 * k.f.userData.size, k.z);
        k.f.rotation.y = k.dir * Math.PI / 2;
        if (Math.abs(k.z - camera.position.z) < 180) walkDino(k.f, dt, true, 30);
    }
}
function buildPtero(i, s, rng) {
    pteroLanes(s, rng);
    const W = s.w, BW = 22;
    sideWalls(s, rng, { h: 8, bottom: -6, mat: dottedWallMaterial(0xe8d4b0, s.len / 6, 2), trees: false });
    // Wooden plank bridge with rope rails; clouds and floating islands all around
    for (let z = s.zS; z < s.cE; z += 3) {
        texturedBox(BW, 1, 2.8, 0, -0.5, z + 1.5, studWallMaterial((z / 3) % 2 ? LC.wood : LC.woodDark, BW / 4, 1));
    }
    solids.push(aabb(0, -0.5, (s.zS + s.cE) / 2, BW, 1, s.cE - s.zS));
    for (const sx of [-1, 1]) {
        for (let z = s.zS + 4; z < s.cE; z += 12) box(0.8, 3, 0.8, sx * (BW / 2 - 0.4), 1.5, z, LC.woodDark, { decor: true });
        box(0.3, 0.3, s.cE - s.zS, sx * (BW / 2 - 0.4), 2.6, (s.zS + s.cE) / 2, 0xe8d4a0, { decor: true });
    }
    // The space beside the bridge is a long drop
    deco(W, 1, s.len, 0, -60, s.zS + s.len / 2, 0x8ad0ff);
    for (let n = 0; n < 26; n++) cloud((rng() < 0.5 ? -1 : 1) * (14 + rng() * 40), -18 + rng() * 14, s.zS + rng() * s.len, 0.8 + rng(), rng);
    for (let n = 0; n < 6; n++) {
        const ix = (n % 2 ? -1 : 1) * (60 + rng() * 30), iz = s.zS + (n + 0.5) * s.len / 6, iy = -10 + rng() * 20;
        for (let l = 0; l < 3; l++) deco(18 - l * 5, 4, 18 - l * 5, ix, iy - l * 4, iz, l ? LC.dirt : LC.grass);
        tree(ix, iy + 2, iz, 1.4, rng);
    }
    for (let n = 0; n < 9; n++) addPickup(i, (rng() * 2 - 1) * 7, 0, s.zS + 20 + (s.cE - s.zS - 30) * n / 8, s.pickup);
}

// ----- Stage 6: the golden temple of the Dino King -----
function buildKing(i, s, rng) {
    const W = s.w, len = s.cE - s.zS;
    sideWalls(s, rng, { h: 36, color: 0xe0b878, trim: LC.gold });
    studBox(W, 2, len, 0, -1, s.zS + len / 2, 0xd8c090);
    box(12, 0.1, len, 0, 0.04, s.zS + len / 2, 0x8a1cff, { studs: true, decor: true });
    for (let z = s.zS + 30; z < s.cE - 12; z += 26) {
        const r = rng();
        if (r < 0.4) studBox(W - 8, 2.4, 2, (rng() < 0.5 ? -4 : 4), 1.2, z, LC.red);
        else if (r < 0.7) {
            // Lava channel across the hall: jump it
            texturedBox(W, 0.2, 3.2, 0, 0.02, z, lavaMaterial(W / 10, 1));
            const k = aabb(0, 0.6, z, W, 1.2, 2.6); k.active = true; kills.push(k);
        } else for (let n = 0; n < 2; n++) studBox(5, 18, 5, (rng() * 2 - 1) * 14, 9, z + n * 9, 0xc8a060);
    }
    // Torches burning along the walls
    for (let z = s.zS + 14; z < s.cE; z += 22) for (const sx of [-1, 1]) {
        box(1.2, 6, 1.2, sx * (W / 2 - 0.8), 3, z, LC.woodDark, { decor: true });
        const at = new V3(sx * (W / 2 - 0.8), 6.6, z);
        tickers.push(() => { if (Math.abs(at.z - camera.position.z) < 120 && Math.random() < 0.35) flame(at, 0.6, 1.1); });
    }
    for (let n = 0; n < 9; n++) addPickup(i, (rng() * 2 - 1) * 16, 0, s.zS + 20 + (len - 30) * n / 8, s.pickup);
    buildChaser(s, KING_LOOK, 3.3);
}

const BUILDERS = { Carpet: buildCarpet, Terraces: buildTerraces, Ramps: buildRamps, Volcano: buildVolcano, Ptero: buildPtero, King: buildKing };
// Surface of each stage's gate, matching the stage it leads into
const WALL_LOOK = {
    Terraces: () => checkerMaterial(LC.lavender, 12, 8),
    Ramps: () => dottedWallMaterial(0xb89a7a, 12, 9),
    Volcano: () => studWallMaterial(0x6a4a42, 20, 13),
    Ptero: () => dottedWallMaterial(0xe8d4b0, 12, 9),
    King: () => dottedWallMaterial(0xe0b878, 12, 9),
};

function buildCourse() {
    STAGES.forEach((s, idx) => {
        const rng = rngFrom(100 + idx * 17);
        BUILDERS[s.type](idx, s, rng);
        const finish = idx === STAGES.length - 1;
        landing(idx, s, finish);
        if (idx === 0) {
            // Stage 1's title floats in the lobby gate
            textPlane([{ t: s.name, c: '#ffffff', s: '#1a1f5c', px: 150 }, { t: s.sub, c: s.subColor, s: '#1a1f5c', px: 100 }], 30, 1024, new V3(0, 26, s.zS - 2), new V3(0, 26, s.zS - 12));
        } else stageWall(STAGES[idx - 1], s, WALL_LOOK[s.type]());
        const tr = aabb(0, 20, s.zS + 3, s.w, 60, 2);
        tr.enter = () => actions.enterStage(idx);
        triggers.push(tr);
        if (finish) {
            texturedBox(s.w + 6, 90, 2, 0, 2, s.zE + 1, dottedWallMaterial(0xe0b878, 9, 15));
            solids.push(aabb(0, 2, s.zE + 1, s.w + 6, 90, 2));
            textPlane([{ t: 'YOU ESCAPED!', c: '#ffd028', s: '#16121f', px: 150 }, { t: 'More stages coming soon', c: '#ffffff', s: '#16121f', px: 70 }], 34, 1024, new V3(0, 24, s.zE - 0.2), new V3(0, 24, s.zE - 20));
            // Giant golden trophy on the finish landing
            const tz = s.zE - 6;
            deco(6, 1.5, 6, 0, 0.75, tz, 0x7a5a20);
            deco(2, 4, 2, 0, 3.5, tz, LC.gold);
            deco(7, 5, 7, 0, 8, tz, LC.gold);
            deco(8, 1, 8, 0, 10.8, tz, 0xffe36b);
        }
    });
}

export function buildWorld() {
    buildLobby();
    buildCourse();
    flushDecor();
    refreshShop();
}
