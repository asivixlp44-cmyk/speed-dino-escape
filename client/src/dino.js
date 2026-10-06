import { T, UNIT, mat } from './engine.js';

// Blocky dinos built from boxes, facing +Z with the feet on y = 0.
// userData: seat / seatZ (where the rider sits), legs (pivot groups + phase), tail (chain of
// segment groups), head, jaw and wings, used by walkDino() to animate the walk cycle.

const EYE_W = 0xffffff, EYE_B = 0x141418, TOOTH = 0xfffff0, CLAW = 0xf4ecd8;
const CONE = new T.ConeGeometry(0.5, 1, 6);
const MOUNT_SCALE = 1.5;

function maker(root) {
    return (sx, sy, sz, x, y, z, c, parent, o) => {
        const m = new T.Mesh(UNIT, mat(c, o));
        m.scale.set(sx, sy, sz); m.position.set(x, y, z);
        m.castShadow = !(o && o.neon);
        (parent || root).add(m);
        return m;
    };
}
function group(parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    return g;
}
function cone(parent, r, h, x, y, z, c, rx, rz, o) {
    const m = new T.Mesh(CONE, mat(c, o));
    m.scale.set(r * 2, h, r * 2); m.position.set(x, y, z);
    m.rotation.set(rx || 0, 0, rz || 0);
    m.castShadow = true; parent.add(m);
    return m;
}
function eyes(part, head, w, y, z, size, o) {
    o = o || {};
    for (const s of [-1, 1]) {
        part(0.08, size, size * 1.1, s * (w / 2 + 0.02), y, z, o.white || EYE_W, head, o.glow ? { neon: true } : undefined);
        part(0.1, size * 0.6, size * 0.5, s * (w / 2 + 0.05), y - size * 0.05, z + size * 0.15, o.pupil || EYE_B, head, o.glow ? { neon: true } : undefined);
        if (o.angry) { const b = part(0.12, size * 0.22, size * 1.2, s * (w / 2 + 0.06), y + size * 0.6, z, EYE_B, head); b.rotation.x = 0.4; }
    }
}
function teeth(part, parent, w, y, z, n, h, down, len) {
    for (let i = 0; i < n; i++) {
        const zz = z - (i / Math.max(1, n - 1)) * (len || 0);
        for (const s of [-1, 1]) {
            const m = part(0.16, h, 0.16, s * (w / 2 - 0.08), y + (down ? -h / 2 : h / 2), zz, TOOTH, parent);
            m.rotation.z = 0.785;
        }
    }
}

// ----- heads -----
// A dino head on a group: skull, snout, a jaw that can open, eyes, teeth. Returns { head, jaw, top }.
function dinoHead(part, parent, d, o) {
    const W = o.w, H = o.h, L = o.l;
    const head = group(parent, 0, 0, 0);
    part(W, H, L * 0.55, 0, 0, L * 0.2, d.body, head);
    part(W * 0.78, H * 0.6, L * 0.6, 0, -H * 0.12, L * 0.68, d.body, head);
    part(W * 0.7, H * 0.14, L * 0.3, 0, H * 0.22, L * 0.8, d.accent, head);
    for (const s of [-1, 1]) part(0.1, 0.12, 0.2, s * W * 0.25, H * 0.1, L * 0.98, EYE_B, head);
    const jaw = group(head, 0, -H * 0.42, L * 0.05);
    part(W * 0.72, H * 0.24, L * 0.85, 0, 0, L * 0.45, d.belly, jaw);
    if (o.teeth) {
        teeth(part, head, W * 0.78, -H * 0.42, L * 0.9, o.teeth, H * 0.22, true, L * 0.5);
        teeth(part, jaw, W * 0.72, H * 0.12, L * 0.82, Math.max(2, o.teeth - 1), H * 0.18, false, L * 0.4);
    }
    if (o.mouth) part(W * 0.66, H * 0.3, L * 0.5, 0, -H * 0.3, L * 0.6, o.mouth, head, o.mouthGlow ? { neon: true } : undefined);
    eyes(part, head, W, H * 0.18, L * 0.32, Math.min(0.62, H * 0.32), { angry: o.angry, glow: o.eyeGlow, white: o.eyeWhite, pupil: o.pupil });
    return { head, jaw, top: H / 2 };
}

// ----- bodies -----
// Two-legged dino (raptor, rex, spino...). o: L/H/W body, hip = leg length, neck, head, tail.
function biped(g, part, d, o) {
    const hip = o.hip, L = o.L, H = o.H, W = o.W;
    const by = hip + H * 0.42;
    part(W, H, L, 0, by, 0, d.body);
    part(W * 0.86, H * 0.32, L * 0.8, 0, by - H * 0.36, 0.15, d.belly);
    part(W * 0.92, H * 0.9, L * 0.32, 0, by + H * 0.12, L * 0.42, d.body);
    // Neck leaning forward with the head held level on top
    const neck = group(g, 0, by + H * 0.25, L * 0.5);
    neck.rotation.x = o.neckTilt ?? 0.55;
    part(W * 0.62, o.neck, W * 0.62, 0, o.neck / 2, 0, d.body, neck);
    part(W * 0.5, o.neck, 0.1, 0, o.neck / 2, W * 0.31, d.belly, neck);
    const hp = group(neck, 0, o.neck, 0);
    hp.rotation.x = -neck.rotation.x;
    const h = dinoHead(part, hp, d, o.head);
    // Legs: thigh, shin, foot with claws (pivot at the hip)
    const legs = [];
    for (const s of [-1, 1]) {
        const p = group(g, s * (W / 2 - 0.1), hip, -L * 0.1);
        part(W * 0.42, hip * 0.6, L * 0.32, 0, -hip * 0.26, 0.1, d.body, p);
        part(W * 0.26, hip * 0.5, W * 0.28, 0, -hip * 0.68, -0.15, d.body, p);
        part(W * 0.38, 0.32, W * 0.62, 0, -hip + 0.16, 0.25, d.accent, p);
        for (const t of [-1, 0, 1]) part(0.14, 0.18, 0.28, t * W * 0.12, -hip + 0.1, 0.25 + W * 0.33, CLAW, p);
        legs.push({ p, ph: s > 0 ? 0 : Math.PI });
    }
    // Little arms
    for (const s of [-1, 1]) {
        const a = group(g, s * (W / 2 + 0.05), by + H * 0.05, L * 0.42);
        a.rotation.x = 0.7;
        part(0.26, o.arm || 0.9, 0.26, 0, -(o.arm || 0.9) / 2, 0, d.body, a);
        part(0.12, 0.25, 0.12, 0, -(o.arm || 0.9), 0.08, CLAW, a);
    }
    const tail = tailChain(g, part, d, 0, by + H * 0.1, -L / 2, W * 0.9, H * 0.85, o.tailN || 5, o.tailL || 1.1, o.tailUp ?? 0.15);
    return { head: hp, jaw: h.jaw, legs, tail, seat: by + H / 2, seatZ: -L * 0.12, neck, body: { by, L, H, W } };
}
// Four-legged dino (trike, stego, ankylo, brachio)
function quad(g, part, d, o) {
    const hip = o.hip, L = o.L, H = o.H, W = o.W;
    const by = hip + H * 0.38;
    part(W, H, L, 0, by, 0, d.body);
    part(W * 0.9, H * 0.3, L * 0.86, 0, by - H * 0.38, 0, d.belly);
    const neck = group(g, 0, by + H * 0.1, L * 0.45);
    neck.rotation.x = o.neckTilt ?? 1.1;
    part(W * (o.neckW || 0.5), o.neck, W * (o.neckW || 0.5), 0, o.neck / 2, 0, d.body, neck);
    const hp = group(neck, 0, o.neck, 0);
    hp.rotation.x = -neck.rotation.x;
    const h = dinoHead(part, hp, d, o.head);
    const legs = [];
    for (const [sx, sz, ph] of [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]]) {
        const p = group(g, sx * (W / 2 - 0.25), hip, sz * L * 0.34);
        part(W * 0.3, hip * 0.6, W * 0.3, 0, -hip * 0.3, 0, d.body, p);
        part(W * 0.27, hip * 0.45, W * 0.27, 0, -hip * 0.75, 0, d.body, p);
        part(W * 0.33, 0.25, W * 0.4, 0, -hip + 0.12, 0.08, d.accent, p);
        legs.push({ p, ph });
    }
    const tail = tailChain(g, part, d, 0, by + H * 0.05, -L / 2, W * 0.7, H * 0.7, o.tailN || 4, o.tailL || 1.1, o.tailUp ?? 0.05);
    return { head: hp, jaw: h.jaw, legs, tail, seat: by + H / 2, seatZ: -L * 0.05, neck, body: { by, L, H, W } };
}
// Tapering tail: each segment hangs off the one before it so a sway ripples down the chain
function tailChain(g, part, d, x, y, z, w, h, n, segL, up) {
    const segs = [];
    let parent = group(g, x, y, z);
    parent.rotation.x = up;
    for (let i = 0; i < n; i++) {
        const k = 1 - (i / n) * 0.75;
        const s = group(parent, 0, 0, i === 0 ? 0 : -segL);
        if (i) s.rotation.x = -0.06;
        part(w * k, h * k, segL + 0.06, 0, 0, -segL / 2, i % 2 ? d.body : d.body, s);
        part(w * k * 0.5, 0.12, segL * 0.7, 0, h * k * 0.5 + 0.05, -segL / 2, d.accent, s);
        segs.push(s);
        parent = s;
    }
    return segs;
}
// Bat-like wing on a shoulder pivot; flaps around z
function wing(g, part, d, side, x, y, z, span, depth, color) {
    const p = group(g, side * x, y, z);
    const inner = part(span * 0.5, 0.12, depth, side * span * 0.25, 0, 0, color, p);
    const tip = group(p, side * span * 0.5, 0, 0);
    part(span * 0.5, 0.1, depth * 0.75, side * span * 0.25, 0, -depth * 0.1, color, tip);
    part(span * 1.0, 0.18, 0.18, side * span * 0.5, 0.05, depth * 0.5, d.accent, p);
    p.userData.side = side; p.userData.tip = tip;
    inner.castShadow = true;
    return p;
}

const SHAPES = {
    raptor(g, part, d) {
        const b = biped(g, part, d, { L: 3, H: 1.5, W: 1.4, hip: 2, neck: 1.2, head: { w: 1.1, h: 1, l: 2, teeth: 3 }, tailN: 5, tailL: 0.9 });
        for (let i = 0; i < 4; i++) part(1.42, 0.25, 0.3, 0, b.body.by + 0.5, 1.1 - i * 0.7, d.accent);
        return b;
    },
    dilo(g, part, d) {
        const b = SHAPES.raptor(g, part, d);
        // Pink neck frill and the double crest
        for (const s of [-1, 1]) {
            const f = part(0.1, 1.6, 1.3, s * 0.65, 0.2, -0.1, d.accent, b.head); f.rotation.z = s * 0.5;
            const c = part(0.1, 0.5, 1.2, s * 0.22, 0.75, 0.5, d.accent, b.head); c.rotation.x = -0.2;
        }
        return b;
    },
    pachy(g, part, d) {
        const b = biped(g, part, d, { L: 2.8, H: 1.5, W: 1.5, hip: 1.8, neck: 1, head: { w: 1.2, h: 1.1, l: 1.6 }, tailN: 4, tailL: 0.9 });
        // Thick bone dome with knobs
        part(1.4, 0.9, 1.3, 0, 0.75, 0.3, d.belly, b.head);
        part(1.1, 0.35, 1.0, 0, 1.3, 0.3, d.belly, b.head);
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) cone(b.head, 0.12, 0.35, s * 0.72, 0.5, -0.1 + i * 0.35, d.accent, 0, s * -1.2);
        return b;
    },
    stego(g, part, d) {
        const b = quad(g, part, d, { L: 3.6, H: 1.8, W: 1.6, hip: 1.4, neck: 0.9, neckTilt: 1.5, head: { w: 0.8, h: 0.8, l: 1.2 }, tailN: 4, tailL: 1 });
        // Two rows of back plates; the rider sits between them
        for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
            if (i === 2) continue;
            const pl = part(0.18, 1.1 - Math.abs(i - 2) * 0.15, 0.9, s * 0.4, b.seat + 0.45, 1.3 - i * 0.65, d.accent);
            pl.rotation.z = s * 0.2;
        }
        const end = b.tail[b.tail.length - 1];
        for (const s of [-1, 1]) for (const z of [-0.4, -0.9]) cone(end, 0.12, 0.9, s * 0.3, 0.2, z, CLAW, 0, s * -1);
        return b;
    },
    trike(g, part, d) {
        const b = quad(g, part, d, { L: 3.4, H: 1.8, W: 1.8, hip: 1.3, neck: 0.6, neckTilt: 1.4, head: { w: 1.4, h: 1.2, l: 1.8 }, tailN: 3, tailL: 1 });
        // Frill, three horns and a beak
        const fr = part(2.6, 2, 0.25, 0, 0.6, -0.15, d.accent, b.head); fr.rotation.x = -0.35;
        for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.4; cone(b.head, 0.13, 0.4, Math.sin(a) * 1.3, 0.6 + Math.cos(a) * 1.05, -0.45, d.body, -0.4, -a); }
        for (const s of [-1, 1]) cone(b.head, 0.13, 1.3, s * 0.4, 0.75, 0.8, CLAW, 1.1, 0);
        cone(b.head, 0.12, 0.6, 0, 0.1, 1.7, CLAW, 1.2, 0);
        part(0.5, 0.4, 0.4, 0, -0.35, 1.8, 0x3a3a3a, b.head);
        return b;
    },
    ankylo(g, part, d) {
        const b = quad(g, part, d, { L: 3.8, H: 1.4, W: 2.4, hip: 1, neck: 0.5, neckTilt: 1.5, head: { w: 1.3, h: 0.9, l: 1.2 }, tailN: 4, tailL: 1.1, tailUp: 0.1 });
        // Armour bumps on the back and a big tail club
        for (let i = 0; i < 4; i++) for (let j = -1; j <= 1; j++) {
            if (j === 0 && (i === 1 || i === 2)) continue;
            part(0.5, 0.3, 0.5, j * 0.75, b.seat + 0.1, 1.2 - i * 0.8, d.accent);
        }
        for (const s of [-1, 1]) for (let i = 0; i < 4; i++) cone(g, 0.15, 0.5, s * 1.3, b.body.by, 1.2 - i * 0.8, CLAW, 0, s * -1.57);
        const end = b.tail[b.tail.length - 1];
        part(1.2, 0.7, 0.9, 0, 0, -1.2, d.accent, end);
        return b;
    },
    spino(g, part, d) {
        const b = biped(g, part, d, { L: 3.6, H: 1.6, W: 1.5, hip: 2.1, neck: 1.2, head: { w: 1, h: 0.9, l: 2.6, teeth: 4 }, tailN: 6, tailL: 1 });
        // Sail along the back, behind the rider
        for (let i = 0; i < 6; i++) {
            const h = 1.2 + Math.sin(i / 5 * Math.PI) * 1.4;
            part(0.14, h, 0.62, 0, b.seat + h / 2 - 0.1, -0.5 - i * 0.5 + 1.6, i % 2 ? d.accent : 0xffa070);
        }
        return b;
    },
    parasaur(g, part, d) {
        const b = biped(g, part, d, { L: 3.4, H: 1.7, W: 1.5, hip: 2, neck: 1.4, neckTilt: 0.35, head: { w: 1, h: 0.9, l: 1.8 }, tailN: 5, tailL: 1, arm: 1.3 });
        const crest = part(0.4, 0.45, 2.2, 0, 0.75, -0.6, d.accent, b.head); crest.rotation.x = -0.6;
        for (let i = 0; i < 4; i++) part(1.52, 0.2, 0.25, 0, b.body.by + 0.6, 1.2 - i * 0.7, d.accent);
        return b;
    },
    brachio(g, part, d) {
        const b = quad(g, part, d, { L: 3.8, H: 2, W: 2, hip: 2.4, neck: 4.6, neckTilt: 0.35, neckW: 0.45, head: { w: 0.9, h: 0.8, l: 1.3 }, tailN: 5, tailL: 1.1 });
        for (let i = 0; i < 4; i++) part(0.92, 0.12, 0.3, 0, 1 + i * 1, 0.48, d.belly, b.neck);
        part(0.6, 0.5, 0.6, 0, 0.55, 0.2, d.accent, b.head);
        return b;
    },
    ptero(g, part, d) {
        // Rides a little above the ground: body, folded legs, huge wings, long beak and crest
        const by = 2.2;
        part(1.4, 1.1, 2.6, 0, by, 0, d.body);
        part(1.2, 0.35, 2.2, 0, by - 0.45, 0.1, d.belly);
        const neck = group(g, 0, by + 0.3, 1.2); neck.rotation.x = 0.9;
        part(0.6, 1, 0.6, 0, 0.5, 0, d.body, neck);
        const hp = group(neck, 0, 1, 0); hp.rotation.x = -0.9;
        part(0.9, 0.85, 1.1, 0, 0, 0.2, d.body, hp);
        const beak = part(0.45, 0.35, 2.2, 0, -0.15, 1.6, d.accent, hp);
        const jaw = group(hp, 0, -0.35, 0.6);
        part(0.4, 0.15, 1.8, 0, 0, 0.9, d.belly, jaw);
        const crest = part(0.18, 0.5, 1.8, 0, 0.45, -0.9, d.accent, hp); crest.rotation.x = -0.35;
        eyes(part, hp, 0.9, 0.15, 0.35, 0.38, { angry: true });
        beak.castShadow = true;
        const wings = [-1, 1].map((s) => wing(g, part, d, s, 0.6, by + 0.35, 0.3, 6, 2.2, d.body));
        const legs = [];
        for (const s of [-1, 1]) {
            const p = group(g, s * 0.4, by - 0.5, -0.6);
            part(0.25, 0.9, 0.25, 0, -0.45, 0, d.body, p);
            part(0.4, 0.15, 0.5, 0, -0.9, 0.1, d.accent, p);
            p.rotation.x = -0.9;
            legs.push({ p, ph: s > 0 ? 0 : Math.PI, fixed: true });
        }
        const tail = tailChain(g, part, d, 0, by, -1.3, 0.4, 0.4, 3, 0.6, 0);
        return { head: hp, jaw, legs, tail, wings, seat: by + 0.55, seatZ: -0.2, fly: true };
    },
    rex(g, part, d, o) {
        o = o || {};
        const b = biped(g, part, d, { L: 3.4, H: 2, W: 1.9, hip: 2.4, neck: 0.9, neckTilt: 0.8, head: { w: 1.6, h: 1.5, l: 2.6, teeth: 4, angry: true, ...(o.head || {}) }, tailN: 6, tailL: 1.1, arm: 0.6 });
        for (let i = 0; i < 5; i++) part(1.92, 0.22, 0.35, 0, b.body.by + 0.2, 1.2 - i * 0.6, d.accent);
        return b;
    },
    baby(g, part, d) {
        const b = SHAPES.rex(g, part, d, { head: { teeth: 2, angry: false } });
        // Eggshell still stuck on its head
        part(1.2, 0.35, 1.2, 0, 0.85, 0.3, 0xfff8e8, b.head);
        for (let i = 0; i < 4; i++) cone(b.head, 0.15, 0.4, (i - 1.5) * 0.3, 1.1, 0.3 + (i % 2) * 0.2, 0xfff8e8);
        return b;
    },
    indom(g, part, d) {
        const b = SHAPES.rex(g, part, d, { head: { eyeGlow: true, pupil: d.glow, eyeWhite: 0xffd028 } });
        for (let i = 0; i < 6; i++) cone(g, 0.18, 0.8, 0, b.seat + 0.35, 1.3 - i * 0.55 - (i > 1 ? 0.9 : 0), d.accent);
        for (const s of [-1, 1]) cone(b.head, 0.12, 0.5, s * 0.6, 0.85, 0.2, d.accent, -0.3, s * -0.4);
        return b;
    },
    galaxy(g, part, d) {
        const b = SHAPES.rex(g, part, d, { head: { eyeGlow: true, pupil: d.glow, eyeWhite: 0xffffff, mouth: d.glow, mouthGlow: true } });
        // Glowing back spikes and stars all over the body
        for (let i = 0; i < 6; i++) cone(g, 0.2, 0.9, 0, b.seat + 0.4, 1.3 - i * 0.55 - (i > 1 ? 0.9 : 0), d.glow, 0, 0, { neon: true });
        for (let i = 0; i < 14; i++) {
            const s = i % 2 ? 1 : -1;
            part(0.1, 0.15, 0.15, s * 0.97, b.body.by - 0.6 + ((i * 37) % 10) / 8, 1.4 - ((i * 53) % 28) / 10, 0xffffff, null, { neon: true });
        }
        return b;
    },
    dragon(g, part, d) {
        const b = SHAPES.rex(g, part, d, { head: { eyeGlow: true, pupil: d.glow, eyeWhite: 0xffd028 } });
        b.wings = [-1, 1].map((s) => wing(g, part, d, s, 0.9, b.seat + 0.2, 0.5, 5, 2.4, d.belly));
        for (const s of [-1, 1]) cone(b.head, 0.16, 1, s * 0.55, 1.1, -0.2, d.accent, -0.6, s * -0.2);
        return b;
    },
};

// Builds a new dino group for a catalogue entry (dinoById[...])
export function buildDino(d) {
    const g = new T.Group();
    const inner = new T.Group(); g.add(inner);
    const part = maker(inner);
    const shape = SHAPES[d.shape] || SHAPES.raptor;
    const b = shape(inner, part, d);
    if (d.glow) {
        // A soft glowing stripe under OP dinos so they stand out in the shop
        const r = new T.Mesh(new T.RingGeometry(1.6, 2.1, 32), mat(d.glow, { neon: true }));
        r.rotation.x = -Math.PI / 2; r.position.y = 0.05; inner.add(r);
    }
    const size = (d.size || 1) * MOUNT_SCALE;
    inner.scale.setScalar(size);
    Object.assign(g.userData, {
        inner, legs: b.legs || [], tail: b.tail || [], head: b.head, jaw: b.jaw, wings: b.wings || null,
        seat: b.seat * size, seatZ: (b.seatZ || 0) * size, fly: !!b.fly, phase: Math.random() * 6, size,
    });
    return g;
}

// Walk cycle: legs swing, body bobs, tail sways, head nods, wings flap. speed scales the stride.
export function walkDino(g, dt, moving, speed) {
    const u = g.userData;
    const rate = moving ? Math.min(16, 6 + (speed || 16) * 0.12) : 2.2;
    u.phase += dt * rate;
    const ph = u.phase;
    const amp = moving ? 0.75 : 0;
    for (const l of u.legs) {
        if (l.fixed) continue;
        l.p.rotation.x = Math.sin(ph + l.ph) * amp;
    }
    const bob = moving ? Math.abs(Math.sin(ph)) * 0.18 : Math.sin(ph * 0.5) * 0.04;
    u.inner.position.y = (u.fly ? 0.6 + Math.sin(ph * 0.35) * 0.35 : 0) + bob * u.size * 0.6;
    u.inner.rotation.z = moving ? Math.sin(ph) * 0.03 : 0;
    u.tail.forEach((t, i) => { t.rotation.y = Math.sin(ph * (moving ? 0.5 : 0.6) - i * 0.6) * (moving ? 0.16 : 0.1); });
    if (u.head) u.head.rotation.x = -u.head.parent.rotation.x + (moving ? Math.sin(ph * 2) * 0.06 : Math.sin(ph * 0.4) * 0.05);
    if (u.jaw) u.jaw.rotation.x = 0.06 + Math.max(0, Math.sin(ph * 0.23)) * 0.18;
    if (u.wings) {
        const flap = u.fly ? Math.sin(ph * 0.9) * 0.55 : moving ? Math.sin(ph * 0.5) * 0.25 : 0.3;
        for (const w of u.wings) {
            w.rotation.z = w.userData.side * (flap - (u.fly ? 0 : 0.6));
            w.userData.tip.rotation.z = w.userData.side * flap * 0.6;
        }
    }
}

