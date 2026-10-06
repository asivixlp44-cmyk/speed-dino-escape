import {
    T, V3, scene, mat, box, aabb, UNIT, solids, kills, triggers, tickers,
    texFrom, billboard, textPlane, camera, signBoard,
} from './engine.js';
import { S, actions, net } from './state.js';
import { studWallMaterial, dottedWallMaterial, checkerMaterial } from './textures.js';
import { emitTread } from './fx.js';
import { buildDino, walkDino } from './dino.js';
import {
    CFG, LOBBY, STAGES, TREADMILLS, TREAD_GEO, PASSES, DINOS, EGG_MINUTES, FREE_BOOST_MINUTES,
    dinoById, fmt, sci, clock, rngFrom, buxText, ballSchedule,
} from '../../shared/config.js';

const HX = LOBBY.halfX, HZ = LOBBY.halfZ;
// Colours read off the reference: red carpet, yellow studded paths, tan dotted sandstone walls,
// bright blocky trees, lavender checker panels, grey stone ramps
const LC = {
    carpet: 0xe0182a, carpetDark: 0xb8101e, path: 0xffd640, pathDark: 0xe8b820, sand: 0xc89a66, sandDark: 0xa87a4a,
    trunk: 0x8a5a32, leaf: 0x34d04a, leafDark: 0x22a83a, grass: 0x4cd23c, dirt: 0x8a5a36, stone: 0x9a98aa, stoneDark: 0x77768a,
    lavender: 0xbcb4f0, gold: 0xf2c230, red: 0xe8182c, brick: 0x8a5236, brickDark: 0x5a3220, clay: 0xc8705a, clayDark: 0xa85a48,
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
// Stage surroundings from the reference: lavender checker walls with dark-blue square windows,
// and beyond them reddish clay cliffs with grass on top and blocky trees
function sideWalls(s, rng) {
    const mid = s.zS + s.len / 2, bottom = s.y0 - 46, h = s.y1 + 26;
    const wm = checkerMaterial(LC.lavender, s.len / 8, (h - bottom) / 8);
    for (const sx of [-1, 1]) {
        const x = sx * (s.w / 2 + 1.5);
        texturedBox(3, h - bottom, s.len, x, (h + bottom) / 2, mid, wm);
        solids.push(aabb(x, (h + bottom) / 2, mid, 3, h - bottom, s.len));
        // Windows a little above the floor line as it climbs
        for (let z = s.zS + 10; z < s.zE - 6; z += 16) {
            const y = s.heightAt(z) + 12;
            deco(0.4, 6, 6, x - sx * 1.7, y, z, 0x2a3a8a);
            deco(0.5, 2.2, 2.2, x - sx * 1.8, y, z, 0x6a8ae8);
        }
        // Clay cliffs outside the walls, stepping up with the course
        for (let z = s.zS; z < s.zE; z += 18) {
            const top = s.heightAt(z + 9) + 14 + rng() * 14, cx = sx * (s.w / 2 + 14 + rng() * 10);
            deco(20 + rng() * 8, top - bottom, 19, cx, (top + bottom) / 2, z + 9, rng() < 0.5 ? LC.clay : LC.clayDark);
            deco(22, 1.6, 20, cx, top + 0.8, z + 9, LC.grass);
            if (rng() < 0.6) tree(cx + (rng() - 0.5) * 10, top + 1.6, z + 9, 1 + rng() * 0.6, rng);
        }
    }
}
// The "STAGE N" gate from the reference: two brown brick pillars with a see-through lavender
// checker portal between them and the big white title above; walls close off the sides
function stageGate(s, y, prevW) {
    const half = Math.max(prevW, s.w) / 2 + 3, D = s.door / 2, PH = 34, z = s.zS + 1;
    for (const sx of [-1, 1]) {
        sandWall(half - D, PH + 50, 2, sx * (half + D) / 2, y + PH / 2 - 25, z, LC.lavender);
        texturedBox(5, PH + 4, 5, sx * (D + 2.5), y + (PH + 4) / 2 - 2, z, dottedWallMaterial(LC.brick, 1, 6));
        solids.push(aabb(sx * (D + 2.5), y + PH / 2, z, 5, PH, 5));
        deco(6, 1.2, 6, sx * (D + 2.5), y + PH + 2.6, z, LC.brickDark);
    }
    texturedBox(D * 2 + 10, 6, 3, 0, y + PH + 3, z, dottedWallMaterial(LC.brick, 6, 1));
    // The portal: walk straight through it
    const portal = new T.Mesh(new T.PlaneGeometry(D * 2, PH), new T.MeshLambertMaterial({ map: checkerMaterial(LC.lavender, D / 4, PH / 8).map, color: 0xd8d0ff, transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide }));
    portal.position.set(0, y + PH / 2, z); scene.add(portal);
    textPlane([{ t: s.name, c: '#ffffff', s: '#1a1f5c', px: 190 }], 34, 1024, new V3(0, y + PH - 6, s.zS - 0.4), new V3(0, y + PH - 6, s.zS - 10));
}
// Landing at the top of a stage, as in the reference: a pink "+2N Wins" pad (x2 Wins pass) on the
// left, an orange "+N Wins" pad on the right (both send you back to the lobby), light-blue
// chevrons down the middle pointing on to the next stage
function landing(i, s, finish) {
    const w = s.w, y = s.y1;
    studBox(w, y - s.y0 + 8, CFG.endZone, 0, (y + s.y0 - 8) / 2, s.cE + CFG.endZone / 2, LC.grass);
    const pz = s.cE + CFG.endZone / 2;
    const pad = (x, color, lines, enter) => {
        const m = new T.Mesh(UNIT, mat(color, { neon: true }));
        m.scale.set(10, 0.4, 6); m.position.set(x, y + 0.2, pz); m.rotation.y = x > 0 ? 0.3 : -0.3; scene.add(m);
        const rim = new T.Mesh(UNIT, mat(0x16121f)); rim.scale.set(10.8, 0.3, 6.8); rim.position.set(x, y + 0.1, pz); rim.rotation.y = m.rotation.y; scene.add(rim);
        billboard(lines, 8, 512, new V3(x, y + 4.5, pz));
        const tr = aabb(x, y + 2.5, pz, 10, 5, 7);
        tr.enter = enter;
        triggers.push(tr);
    };
    // Facing up the course, +x is on screen-left
    const x2 = () => (S.passes.DoubleWins ? actions.pad(i) : actions.buy('pass', 'DoubleWins'));
    pad(w / 2 - 7, 0xff2ad8, [{ t: '+' + s.wins * 2 + ' Wins', c: '#ff7ae0', s: '#16121f', px: 80 }, { t: 'x2 Wins · ' + buxText(PASSES.DoubleWins.price), c: '#ffffff', s: '#16121f', px: 40 }], x2);
    pad(-w / 2 + 7, 0xff8a1e, [{ t: '+' + s.wins + ' Wins', c: '#ffd028', s: '#16121f', px: 80 }, { t: finish ? 'FINISH!' : 'Return!', c: '#ffffff', s: '#16121f', px: 46 }], () => actions.pad(i));
    if (!finish) for (let k = 0; k < 4; k++) chevron(0, y + 0.1, s.cE + 6 + k * 7, 0x9fe8ff);
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
// Black thorny crack splat flat on the floor
const SPLAT_MAT = new T.MeshBasicMaterial({ color: 0x16121f });
function splat(x, z, s, rng) {
    const g = new T.Group(); g.position.set(x, 0.08, z); g.rotation.y = rng() * Math.PI; scene.add(g);
    const core = new T.Mesh(UNIT, SPLAT_MAT); core.scale.set(2.4 * s, 0.04, 2.4 * s); core.rotation.y = 0.4; g.add(core);
    for (let k = 0; k < 7; k++) {
        const a = k / 7 * Math.PI * 2 + rng() * 0.4, len = (3 + rng() * 3) * s;
        const arm = new T.Mesh(UNIT, SPLAT_MAT);
        arm.scale.set(len, 0.04, 0.5 * s); arm.position.set(Math.cos(a) * len / 2, 0, Math.sin(a) * len / 2); arm.rotation.y = -a;
        g.add(arm);
    }
}
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
// Reference style: "Price: 1.00K Wins" over "75+/Speed"
function price2(v) {
    if (v < 1000) return String(v);
    const suf = ['K', 'M', 'B', 'T'];
    let i = -1;
    while (v >= 1000 && i < suf.length - 1) { v /= 1000; i++; }
    return v.toFixed(v >= 100 ? 1 : 2) + suf[i];
}
function pedestalLines(d) {
    let top;
    if (S.equipped === d.id) top = { t: 'RIDING', c: '#6fe0ff' };
    else if (S.owned[d.id]) top = { t: 'OWNED', c: '#7dff6b' };
    else if (d.pass) top = { t: d.tagline + ' ' + buxText(PASSES[d.pass].price), c: '#ffd028' };
    else top = { t: 'Price: ' + price2(d.req) + ' Wins', c: '#ffffff' };
    return [{ ...top, s: '#16121f', px: 52 }, { t: fmt(d.bonus) + '+/Speed', c: '#7dff6b', s: '#16121f', px: 64 }];
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
// Treadmill as in the reference: a glowing running strip set into the floor with a gem
// spinning above it; the belt still pushes toward the carpet (+x) so you can run in place
const GEM = new T.OctahedronGeometry(1.4, 0);
function buildTreadmill(def, cx, top, cz) {
    const L = TREAD_GEO.len, W = TREAD_GEO.width, look = TREAD_LOOK[def.mult];
    const glow = def.mult > 1;
    const beltMat = new T.MeshBasicMaterial({ map: beltTex, color: look.glow || look.belt });
    if (glow) beltMat.color.multiplyScalar(0.95);
    const belt = new T.Mesh(UNIT, glow ? beltMat : new T.MeshLambertMaterial({ map: beltTex, color: look.belt }));
    belt.scale.set(L, 0.6, W); belt.position.set(cx, top + 0.3, cz); belt.receiveShadow = !glow; scene.add(belt);
    const c = aabb(cx, top + 0.3, cz, L, 0.6, W); c.belt = new V3(12, 0, 0); c.tread = def; solids.push(c);
    for (const s of [-1, 1]) box(L + 1, 0.9, 0.6, cx, top + 0.45, cz + s * (W / 2 + 0.3), look.frame, { neon: glow });
    for (const s of [-1, 1]) box(0.6, 0.9, W + 1.2, cx + s * (L / 2 + 0.3), top + 0.45, cz, look.frame, { neon: glow });
    if (glow) {
        const gem = new T.Mesh(GEM, mat(look.glow, { neon: true }));
        gem.position.set(cx - 3, top + 7, cz); gem.scale.set(1, 1.4, 1); scene.add(gem);
        const ph = Math.random() * 6;
        tickers.push((dt, t) => { gem.rotation.y += dt * 1.6; gem.position.y = top + 7 + Math.sin(t * 2 + ph) * 0.5; });
    }
    const sp = billboard(treadLines(def), 12, 512, new V3(cx + 2, top + 10.5, cz));
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

    // Black splat marks on the carpet where troll balls crashed out of Stage 1 (the reference's thorn marks)
    for (const [x, z, s] of [[-4, 58, 1.2], [5, 44, 1], [-2, 22, 0.9], [3, -18, 0.8], [-5, 6, 0.7]]) splat(x, z, s, rng);

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
    signBoard(new V3(20, 9, 66), new V3(0, 0, -1), 16, 9, [{ t: 'UPDATE!', c: '#ff3c50', s: '#ffffff', px: 120 }, { t: 'Race Event + 6 Stages!', c: '#1a1f5c', px: 80 }, { t: '+ Troll Menu!', c: '#8a1cff', px: 70 }], 0xfff4dc);
}

// =====================================================================================
// Course, modelled on the reference video. Stages sit end to end along +z and keep climbing:
// each starts at the height the last one ended (s.y0) behind its "STAGE N" gate and ends on a
// landing at its top (s.y1). s.path holds the floor's centre line for heightAt / xAt, which the
// troll balls roll down.
// =====================================================================================
function pathLookup(s) {
    s.heightAt = (zq) => {
        if (zq <= s.zS) return s.y0;
        for (const p of s.path) if (zq >= p.z0 && zq <= p.z1) return p.y0 + (p.y1 - p.y0) * ((zq - p.z0) / Math.max(0.01, p.z1 - p.z0));
        return s.y1;
    };
    s.xAt = (zq) => {
        for (const p of s.path) if (zq >= p.z0 && zq <= p.z1) return p.x0 + (p.x1 - p.x0) * ((zq - p.z0) / Math.max(0.01, p.z1 - p.z0));
        return 0;
    };
}

// ----- Terraces (Stage 1 in the reference): wide green grass steps climbing to the top -----
function terrace(W, len, y, z0, bottom, top) {
    const zc = z0 + len / 2, depth = y - bottom;
    texturedBox(W, depth, len, 0, y - depth / 2 - 0.4, zc, studWallMaterial(LC.dirt, W / 4, depth / 4));
    texturedBox(W, 0.8, len, 0, y - 0.4, zc, studWallMaterial(top || LC.grass, W / 4, len / 4));
    solids.push(aabb(0, y - depth / 2, zc, W, depth, len));
}
function buildTerraces(i, s, rng) {
    const W = s.w, bottom = s.y0 - 20;
    s.path = [];
    let z = s.zS, y = s.y0;
    // Yellow studded apron inside the gate
    terrace(W, 18, y, z, bottom, LC.path);
    s.path.push({ z0: z, z1: z + 18, y0: y, y1: y, x0: 0, x1: 0 });
    z += 18;
    let n = 0;
    while (z < s.cE - 16) {
        const len = 10 + Math.floor(rng() * 6);
        const gap = rng() < s.gaps ? 3 + Math.floor(rng() * 2) : 0;
        const rise = gap ? 1.5 : s.rise > 1.5 && rng() < 0.35 ? s.rise : rng() < 0.15 ? 0 : 1.5;
        const z0 = z + gap, y0 = y;
        if (z0 + len > s.cE - 4) break;
        y += rise;
        terrace(W, len, y, z0, bottom, n % 5 === 4 ? LC.path : LC.grass);
        s.path.push({ z0: z, z1: z0 + 1.5, y0, y1: y, x0: 0, x1: 0 }, { z0: z0 + 1.5, z1: z0 + len, y0: y, y1: y, x0: 0, x1: 0 });
        if (n % 2 === 1) addPickup(i, (rng() * 2 - 1) * (W / 2 - 6), y, z0 + len / 2, s.pickup);
        for (const sx of [-1, 1]) if (rng() < 0.5) bush(sx * (W / 2 - 3), y, z0 + 2 + rng() * (len - 4), 0.7 + rng() * 0.4);
        if (rng() < 0.4) flowers((rng() * 2 - 1) * (W / 2 - 8), z0 + len / 2, rng);
        z = z0 + len; n++;
    }
    terrace(W, s.cE - z, y, z, bottom);
    s.path.push({ z0: z, z1: s.cE, y0: y, y1: y, x0: 0, x1: 0 });
    s.y1 = y;
}

// ----- Ramps (Stage 2 in the reference): grey stone ramps zig-zagging up between wide landings,
// low walls on both sides, light-blue chevrons pointing up -----
function buildRamps(i, s, rng) {
    const W = s.w, PW = 18, side = W / 2 - PW / 2 - 1, bottom = s.y0 - 20;
    s.path = [];
    let z = s.zS, y = s.y0, x = side;
    const slab = (w, len, cx, top) => {
        studBox(w, top - bottom, len, cx, (top + bottom) / 2, z + len / 2, LC.stone);
    };
    // Landing across the full width where the path turns
    const flat = (len, toX) => {
        slab(W, len, 0, y);
        for (const sx of [-1, 1]) if (rng() < 0.6) deco(1.2, 1.4, len - 2, sx * (W / 2 - 1), y + 0.7, z + len / 2, LC.stoneDark);
        s.path.push({ z0: z, z1: z + len, y0: y, y1: y, x0: x, x1: toX });
        z += len; x = toX;
    };
    // A ramp is a run of shallow steps (each under the auto-step height) on one side
    const ramp = (n) => {
        const z0 = z, y0 = y, rise = 0.9 * s.climb;
        for (let k = 0; k < n; k++) { y += rise; slab(PW, 2.4, x, y); z += 2.4; }
        for (const sx of [-1, 1]) {
            const wall = box(1.2, 1.8, n * 2.4 + 0.4, x + sx * (PW / 2 - 0.6), (y0 + y) / 2 + 0.9, z0 + n * 1.2, LC.stoneDark, { decor: true, studs: true });
            wall.rotation.x = -Math.atan2(y - y0, n * 2.4); wall.updateMatrix();
            solids.push(aabb(x + sx * (PW / 2 - 0.6), (y0 + y) / 2 + 0.9, z0 + n * 1.2, 1.2, y - y0 + 2.2, n * 2.4));
        }
        for (let k = 1; k < n; k += 4) chevron(x, y0 + (y - y0) * (k / n) + 0.15, z0 + k * 2.4, 0x7fe0ff);
        s.path.push({ z0, z1: z, y0, y1: y, x0: x, x1: x });
    };
    flat(16, side);
    let k = 0;
    while (z < s.cE - 50) {
        ramp(10 + Math.floor(rng() * 5));
        if (k % 2 === 0) addPickup(i, x, y, z - 6, s.pickup);
        flat(14, -x);
        k++;
    }
    flat(s.cE - z, 0);
    s.y1 = y;
}

// ----- Troll balls: huge dark balls with a grinning troll face and a fiery mouth -----
// The body rolls; the face shell stays upright and looks down the slope.
const ballFaceTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
    const x = cv.getContext('2d');
    // Front of a three.js sphere (-z) sits at u = 0.75, v = 0.5
    const cx = 768, cy = 250;
    x.lineJoin = 'round'; x.lineCap = 'round';
    // Mouth: a wide grin open into fire
    const g = x.createRadialGradient(cx, cy + 70, 10, cx, cy + 70, 120);
    g.addColorStop(0, '#fff3a0'); g.addColorStop(0.35, '#ffb51c'); g.addColorStop(0.7, '#ff4a14'); g.addColorStop(1, '#5a0a0a');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(cx - 110, cy + 30); x.quadraticCurveTo(cx, cy + 210, cx + 110, cy + 30); x.quadraticCurveTo(cx, cy + 80, cx - 110, cy + 30); x.fill();
    x.lineWidth = 9; x.strokeStyle = '#0c0a10'; x.stroke();
    // Teeth along the top lip
    x.fillStyle = '#fffbe8';
    for (let i = 0; i < 7; i++) { const tx = cx - 84 + i * 28; x.beginPath(); x.moveTo(tx - 11, cy + 52 + Math.abs(i - 3) * -4); x.lineTo(tx + 11, cy + 52 + Math.abs(i - 3) * -4); x.lineTo(tx, cy + 76); x.fill(); }
    // Eyes: white, squinting, small pupils looking down at you, heavy brows
    for (const s of [-1, 1]) {
        x.fillStyle = '#ffffff';
        x.beginPath(); x.ellipse(cx + s * 52, cy - 34, 36, 24, s * 0.15, 0, Math.PI * 2); x.fill();
        x.lineWidth = 6; x.strokeStyle = '#0c0a10'; x.stroke();
        x.fillStyle = '#0c0a10'; x.beginPath(); x.arc(cx + s * 46, cy - 28, 10, 0, Math.PI * 2); x.fill();
        x.lineWidth = 14; x.beginPath(); x.moveTo(cx + s * 18, cy - 54); x.lineTo(cx + s * 92, cy - 76); x.stroke();
    }
    // Cheek wrinkles of the grin
    x.lineWidth = 6;
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * 118, cy + 6); x.quadraticCurveTo(cx + s * 136, cy + 34, cx + s * 120, cy + 64); x.stroke(); }
    return texFrom(cv);
})();
const BALL_GEO = new T.SphereGeometry(1, 28, 20);
const ballBodyMat = new T.MeshLambertMaterial({ color: 0x24222e, map: studWallMaterial(0xffffff, 6, 3).map });
const ballFaceMat = new T.MeshBasicMaterial({ map: ballFaceTex, transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false });
export const balls = []; // one pool per stage: { s, idx, meshes: [...] }
function buildBalls(idx, s) {
    const b = s.balls, travel = (s.cE - s.zS + 30) / b.speed;
    const pool = { s, idx, meshes: [] };
    for (let n = 0; n < Math.ceil(travel / b.every) + 1; n++) {
        const g = new T.Group();
        const body = new T.Mesh(BALL_GEO, ballBodyMat); body.castShadow = true; g.add(body);
        const face = new T.Mesh(BALL_GEO, ballFaceMat); face.scale.setScalar(1.01); g.add(face);
        g.scale.setScalar(b.r);
        g.visible = false; scene.add(g);
        pool.meshes.push({ g, body, k: null, x: 0, y: 0, z: 0, r: b.r });
    }
    balls.push(pool);
}
// Positions every ball for server time t (seconds). Balls roll from the top of their stage down
// past its gate and crash; camZ skips stages far from the camera.
export function updateBalls(t, camZ, onCrash) {
    for (const pool of balls) {
        const s = pool.s, b = s.balls;
        const near = camZ > s.zS - 160 && camZ < s.zE + 120;
        const list = near ? ballSchedule(s, t) : [];
        pool.meshes.forEach((m, n) => {
            const e = list[n];
            if (!e) { m.g.visible = false; m.k = null; return; }
            const z = s.cE - e.age * b.speed;
            const lane = e.lane * Math.min(10, s.w / 2 - b.r - 2);
            // On the ramps the balls keep to the floor's centre line; on the terraces they use lanes
            const x = s.type === 'Ramps' ? s.xAt(z) : lane;
            const y = (z < s.zS ? (pool.idx === 0 ? 0 : STAGES[pool.idx - 1].y1) : s.heightAt(z)) + b.r;
            const crashed = z < s.zS - 24;
            if (crashed && m.k === e.k && !m.crashed && onCrash) onCrash(m);
            m.crashed = crashed;
            m.k = e.k; m.x = x; m.y = y; m.z = z;
            m.g.visible = !crashed;
            m.g.position.set(x, y, z);
            m.body.rotation.x = -(s.cE - z) / b.r;
        });
    }
}

const BUILDERS = { Terraces: buildTerraces, Ramps: buildRamps };
function buildCourse() {
    let y = 0;
    STAGES.forEach((s, idx) => {
        const rng = rngFrom(100 + idx * 17);
        s.y0 = y;
        BUILDERS[s.type](idx, s, rng);
        pathLookup(s);
        sideWalls(s, rng);
        const finish = idx === STAGES.length - 1;
        landing(idx, s, finish);
        stageGate(s, s.y0, idx ? STAGES[idx - 1].w : s.w);
        buildBalls(idx, s);
        const tr = aabb(0, s.y0 + 20, s.zS + 3, s.w, 60, 2);
        tr.enter = () => actions.enterStage(idx);
        triggers.push(tr);
        if (finish) {
            texturedBox(s.w + 6, 90, 2, 0, s.y1 + 30, s.zE + 1, checkerMaterial(LC.lavender, 9, 15));
            solids.push(aabb(0, s.y1 + 30, s.zE + 1, s.w + 6, 90, 2));
            textPlane([{ t: 'YOU ESCAPED!', c: '#ffd028', s: '#16121f', px: 150 }, { t: 'More stages coming soon', c: '#ffffff', s: '#16121f', px: 70 }], 34, 1024, new V3(0, s.y1 + 22, s.zE - 0.2), new V3(0, s.y1 + 22, s.zE - 20));
            const tz = s.zE - 6, ty = s.y1;
            deco(6, 1.5, 6, 0, ty + 0.75, tz, 0x7a5a20);
            deco(2, 4, 2, 0, ty + 3.5, tz, LC.gold);
            deco(7, 5, 7, 0, ty + 8, tz, LC.gold);
            deco(8, 1, 8, 0, ty + 10.8, tz, 0xffe36b);
        }
        y = s.y1;
    });
}

export function buildWorld() {
    buildLobby();
    buildCourse();
    flushDecor();
    refreshShop();
}
