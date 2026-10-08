import { T } from './engine.js';

// Static batching. The world is built from thousands of little boxes, each its own draw call,
// which is far too many for phones. Two passes, run once the world is built:
//  - mergeStatic: every static top-level mesh (matrixAutoUpdate off, opaque, not animated) is
//    merged with the others that share its look, one mesh per look per 160-stud slice of the
//    course (so off-screen slices are still culled). Texture repeats are baked into the UVs, so
//    boxes of any size share one material.
//  - bakeGroup: the untextured parts of a model (a shop dino, a chest, a pickup) are merged into
//    one vertex-coloured mesh (plus one for its glowing parts), so a 50-part model is 1-2 draws.

const SLICE = 160;
const imageIds = new WeakMap();
let nextImage = 1;
const imageId = (img) => {
    if (!img) return 0;
    if (!imageIds.has(img)) imageIds.set(img, nextImage++);
    return imageIds.get(img);
};
const tmpV = new T.Vector3(), tmpN = new T.Vector3(), normalMat = new T.Matrix3();

// Writes parts [{ geo, matrix, start, count, uvR?, uvO?, color? }] into one non-indexed geometry
function build(parts, withUv, withColor) {
    let n = 0;
    for (const p of parts) n += p.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    const uv = withUv ? new Float32Array(n * 2) : null, col = withColor ? new Float32Array(n * 3) : null;
    let v = 0;
    for (const p of parts) {
        const g = p.geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, I = g.index;
        normalMat.getNormalMatrix(p.matrix);
        for (let k = p.start; k < p.start + p.count; k++, v++) {
            const i = I ? I.getX(k) : k;
            tmpV.fromBufferAttribute(P, i).applyMatrix4(p.matrix);
            pos[v * 3] = tmpV.x; pos[v * 3 + 1] = tmpV.y; pos[v * 3 + 2] = tmpV.z;
            tmpN.fromBufferAttribute(N, i).applyMatrix3(normalMat).normalize();
            nor[v * 3] = tmpN.x; nor[v * 3 + 1] = tmpN.y; nor[v * 3 + 2] = tmpN.z;
            if (uv) { uv[v * 2] = U.getX(i) * p.uvR.x + p.uvO.x; uv[v * 2 + 1] = U.getY(i) * p.uvR.y + p.uvO.y; }
            if (col) { col[v * 3] = p.color.r; col[v * 3 + 1] = p.color.g; col[v * 3 + 2] = p.color.b; }
        }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
    if (uv) geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
}
// Each material slot of a mesh as { start, count, material }, in index (or vertex) units
function slots(o) {
    const g = o.geometry, total = g.index ? g.index.count : g.attributes.position.count;
    if (!Array.isArray(o.material)) return [{ start: 0, count: total, mat: o.material }];
    return (g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }]).map((gr) => ({ start: gr.start, count: gr.count, mat: o.material[gr.materialIndex] }));
}
const solid = (m) => m && !m.transparent && !m.vertexColors && !(m.userData && m.userData.animated) && (m.isMeshLambertMaterial || m.isMeshBasicMaterial);

export function mergeStatic(scene) {
    const groups = new Map();
    const done = [];
    const ONE = new T.Vector2(1, 1), ZERO = new T.Vector2(0, 0);
    for (const o of scene.children) {
        if (!o.isMesh || o.matrixAutoUpdate || !o.visible || o.children.length) continue;
        const g = o.geometry;
        if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv) continue;
        const ss = slots(o);
        if (!ss.every((s) => solid(s.mat))) continue;
        o.updateMatrixWorld(true);
        if (!g.boundingSphere) g.computeBoundingSphere();
        const slab = Math.floor(tmpV.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld).z / SLICE);
        for (const s of ss) {
            const m = s.mat;
            const look = [m.type, m.color.r.toFixed(4), m.color.g.toFixed(4), m.color.b.toFixed(4), imageId(m.map && m.map.image), m.side].join('|');
            const key = look + '|' + o.castShadow + '|' + o.receiveShadow + '|' + slab;
            let grp = groups.get(key);
            if (!grp) { grp = { look, mat: m, castShadow: o.castShadow, receiveShadow: o.receiveShadow, parts: [] }; groups.set(key, grp); }
            grp.parts.push({ geo: g, matrix: o.matrixWorld, start: s.start, count: s.count, uvR: m.map ? m.map.repeat : ONE, uvO: m.map ? m.map.offset : ZERO });
        }
        done.push(o);
    }
    const shared = new Map();
    for (const grp of groups.values()) {
        let mat = shared.get(grp.look);
        if (!mat) {
            mat = grp.mat.clone();
            if (grp.mat.map) {
                mat.map = grp.mat.map.clone();
                mat.map.repeat.set(1, 1); mat.map.offset.set(0, 0);
                mat.map.wrapS = mat.map.wrapT = T.RepeatWrapping;
                mat.map.needsUpdate = true;
            }
            shared.set(grp.look, mat);
        }
        const mesh = new T.Mesh(build(grp.parts, true, false), mat);
        mesh.castShadow = grp.castShadow; mesh.receiveShadow = grp.receiveShadow;
        mesh.matrixAutoUpdate = false;
        scene.add(mesh);
    }
    for (const o of done) scene.remove(o);
    return { merged: done.length, meshes: groups.size, materials: shared.size };
}

// One shared vertex-coloured material per kind, so every baked model shares them
const VC = {
    lit: new T.MeshLambertMaterial({ vertexColors: true }),
    glow: new T.MeshBasicMaterial({ vertexColors: true }),
};
// Merges a model's untextured parts into its own space; textured / transparent parts stay as they are.
// Returns the group for chaining. Only for models whose parts never move relative to each other.
export function bakeGroup(group) {
    group.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(group.matrixWorld).invert();
    const lists = { lit: [], glow: [] }, shadow = { lit: false, glow: false };
    const remove = [];
    group.traverse((o) => {
        if (!o.isMesh || o === group || !o.visible) return;
        const ss = slots(o);
        if (!ss.every((s) => solid(s.mat) && !s.mat.map)) return;
        const matrix = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        for (const s of ss) {
            const kind = s.mat.isMeshBasicMaterial ? 'glow' : 'lit';
            lists[kind].push({ geo: o.geometry, matrix, start: s.start, count: s.count, color: s.mat.color });
            shadow[kind] = shadow[kind] || o.castShadow;
        }
        remove.push(o);
    });
    for (const o of remove) o.parent.remove(o);
    for (const kind of ['lit', 'glow']) {
        if (!lists[kind].length) continue;
        const mesh = new T.Mesh(build(lists[kind], false, true), VC[kind]);
        mesh.castShadow = shadow[kind]; mesh.receiveShadow = kind === 'lit';
        group.add(mesh);
    }
    return group;
}
