// Game data shared by the client and the Colyseus server.
// Speed Dino Escape: ride your dino, every step is +1 Speed, escape the T-Rex.

export const CFG = {
    maxLevel: 40,
    rebirthLevel: 25,
    minWalk: 16,
    gainInterval: 0.5,
    staminaMax: 12,
    staminaDrain: 3,
    staminaRegen: 2,
    staminaDelay: 1,
    sprintMult: 1.35,
    courseWidth: 44,
    wallHeight: 46,
    voidY: -40,
    endZone: 36,
    pickupRespawn: 10,
    maxPickupsPerStage: 40,
    // Stage 1 spike traps: seconds hidden, warning, up
    spikes: { hidden: 2.2, warn: 0.6, up: 1.4 },
    // Stage 4 meteors: shadow warning, fall, burning on the ground
    meteor: { warn: 1.4, fall: 0.35, burn: 0.5, every: 2.6 },
    boostMult: 2,
    boostMinutes: 15,
    reviveTimeout: 10,
    shieldTime: 3,
    starterPackDuration: 15 * 60,
    offerRotate: 45,
    rebirthStep: 0.5,
    rebirthWalk: 10,
    // Friend Boost: +10% Speed per Bloxity friend in the same server, up to 5
    friendBoost: 0.1,
    friendMax: 5,
    // Treadmills keep paying while you're away: Speed for up to 8 hours, at a quarter rate
    offlineHours: 8,
    offlineRate: 0.25,
    // Troll Menu effects (seconds)
    trollSlow: 12,
    trollTiny: 20,
    maxPlayers: 24,
};

// Level 0 needs 15 XP, then 30 / 45 / 60 (as in the reference), then it climbs faster
export const xpFor = (L) => (L <= 3 ? 15 * (L + 1) : Math.floor(60 * Math.pow(1.22, L - 3)));
// "New walking speed: 16 -> 17": +1 walk speed per level, +10 per rebirth
export const maxSpeedFor = (L, R) => Math.max(CFG.minWalk, CFG.minWalk + (L || 0) + CFG.rebirthWalk * (R || 0));

export const LOBBY = { halfX: 85, halfZ: 70, wallHeight: 30, spawn: { x: 0, y: 0.5, z: -40 } };

// The course runs along +z from the lobby gate. Stages 1-3 follow the reference video
// (red carpet run, green grass steps, grey ramps with the chaser); 4-6 are our own, same style.
// w = stage width, door = opening in the "Stage N" wall at its start.
// Chase: the T-Rex runs at walk speed x max(base, 1 + (gap - near) x k): it races in when far
// behind and then creeps up, so you have to sprint to stay ahead.
export const STAGES = [
    { name: 'Stage 1', sub: 'DINO RUN', subColor: '#7dff6b', type: 'Carpet', len: 260, w: 40, door: 40, pickup: 1, wins: 1 },
    { name: 'Stage 2', sub: 'GRASS STEPS', subColor: '#46ec50', type: 'Terraces', len: 300, w: 44, door: 32, pickup: 1, wins: 2 },
    { name: 'Stage 3', sub: 'T-REX CHASE!', subColor: '#ff5a5a', type: 'Ramps', len: 360, w: 44, door: 30, chase: { base: 1.02, k: 0.03, near: 20 }, chaseWait: 2, pickup: 1, wins: 5 },
    { name: 'Stage 4', sub: 'VOLCANO', subColor: '#ff8a1e', type: 'Volcano', len: 320, w: 44, door: 28, pickup: 1, wins: 15 },
    { name: 'Stage 5', sub: 'PTERO SKIES', subColor: '#6fe0ff', type: 'Ptero', len: 330, w: 40, door: 26, laneGap: 22, bs: 30, pickup: 1, wins: 40 },
    { name: 'Stage 6', sub: 'DINO KING!', subColor: '#ffd028', type: 'King', len: 420, w: 44, door: 30, chase: { base: 1.04, k: 0.035, near: 18 }, chaseWait: 1.5, pickup: 1, wins: 100 },
];
{
    let z = 70;
    for (const s of STAGES) {
        s.zS = z;
        s.zE = z + s.len;
        s.cE = s.zE - CFG.endZone;
        z = s.zE;
    }
}
export function stageAt(z) {
    for (let i = 0; i < STAGES.length; i++) if (z >= STAGES[i].zS && z < STAGES[i].zE) return i;
    return -1;
}

// TREADMILLS area on the right of the red carpet (-x), south to north: x1 x1 x1 X3 X9 X25
export const TREADMILLS = [
    { mult: 1 }, { mult: 1 }, { mult: 1 },
    { mult: 3 },
    { mult: 9, pass: 'RunArea9x' },
    { mult: 25, pass: 'RunArea25x', tag: '*SUPER OP*' },
];
// Belt geometry (also used by the server to know who is on a treadmill)
export const TREAD_GEO = { cx: -52, top: 1.5, len: 14, width: 7, z0: -40, step: 11 };
export function treadmillAt(x, y, z) {
    const g = TREAD_GEO;
    if (Math.abs(x - g.cx) > g.len / 2 + 1 || y > g.top + 3 || y < g.top - 0.5) return null;
    for (let i = 0; i < TREADMILLS.length; i++) {
        if (Math.abs(z - (g.z0 + i * g.step)) <= g.width / 2 + 0.5) return TREADMILLS[i];
    }
    return null;
}

// Lobby freebies: the Fossil Chest (once a day), the Baby T-Rex egg (after playing a while)
// and the "Keep playing" hut's free Speed Boost
export const GROUP_CHEST = { hours: 24, speed: 2500, wins: 2 };
export const EGG_MINUTES = 20;
export const FREE_BOOST_MINUTES = 15;

export const PRODUCTS = {
    Speed10K: { name: '+10K Speed', price: 29, speed: 10000 },
    Speed100K: { name: '+100K Speed', price: 79, speed: 100000 },
    Speed1M: { name: '+1M Speed', price: 149, speed: 1000000 },
    StarterPack: { name: 'OP Starter Pack', price: 19, speed: 50000, wins: 10 },
    Revive: { name: 'Revive', price: 9 },
    SpeedBoost: { name: 'x2 Speed Boost (15 min)', price: 49 },
    Wins500: { name: '+500 Wins', price: 99, wins: 500 },
    Wins5K: { name: '+5K Wins', price: 399, wins: 5000 },
    // Troll Menu: one-shot effects on everyone else in the server
    TrollFling: { name: 'Fling Everyone!', price: 25, troll: 'fling', ic: '🌪️', desc: 'Launch every other player into the sky' },
    TrollSlow: { name: 'Slow Everyone', price: 15, troll: 'slow', ic: '🐌', desc: 'Everyone else walks at half speed for ' + CFG.trollSlow + 's' },
    TrollTiny: { name: 'Shrink Everyone', price: 15, troll: 'tiny', ic: '🐜', desc: 'Everyone else turns tiny for ' + CFG.trollTiny + 's' },
    TrollLobby: { name: 'Send All to Lobby', price: 99, troll: 'lobby', ic: '🏠', desc: 'Every other player is sent back to the lobby' },
    TrollQuake: { name: 'Dino Stampede', price: 9, troll: 'quake', ic: '🦖', desc: 'Shake the whole server with a roar' },
};
export const TROLLS = ['TrollQuake', 'TrollSlow', 'TrollTiny', 'TrollFling', 'TrollLobby'];
export const PASSES = {
    DoubleSpeed: { name: '2X Speed', price: 9, ic: '⚡', desc: 'Double all Speed you earn' },
    DoubleWins: { name: 'x2 Wins', price: 139, ic: '🏆', desc: 'Double Wins from every stage' },
    RunArea9x: { name: '9x Treadmill', price: 279, ic: '🏃', desc: 'Unlocks the x9 treadmill' },
    RunArea25x: { name: '25x Treadmill', price: 399, ic: '🚀', desc: 'Unlocks the x25 treadmill' },
    CheapDino: { name: 'Cheap Dino: Dilophosaurus', price: 9, ic: '🦎', desc: '+30 Speed per step' },
    DinoDragon: { name: 'OP Dino Dragon', price: 199, ic: '🐉', desc: '+200 Speed per step' },
    RainbowAura: { name: 'Rainbow Aura', price: 99, ic: '🌈', desc: 'x5 Speed aura' },
};
// Bloxity Bux SKUs: create these in the game's IAP catalog on bloxity.io (prices live there)
export const SKUS = {
    product: {
        Speed10K: 'speed_10k', Speed100K: 'speed_100k', Speed1M: 'speed_1m',
        StarterPack: 'starter_pack', Revive: 'revive', SpeedBoost: 'speed_boost',
        Wins500: 'wins_500', Wins5K: 'wins_5k',
        TrollFling: 'troll_fling', TrollSlow: 'troll_slow', TrollTiny: 'troll_tiny', TrollLobby: 'troll_lobby', TrollQuake: 'troll_quake',
    },
    pass: {
        DoubleSpeed: 'pass_double_speed', DoubleWins: 'pass_double_wins',
        RunArea9x: 'pass_run_area_9x', RunArea25x: 'pass_run_area_25x',
        CheapDino: 'pass_cheap_dino', DinoDragon: 'pass_dino_dragon', RainbowAura: 'pass_rainbow_aura',
    },
};
// Bux price label for 3D text (DOM uses the coin icon instead)
export const buxText = (n) => fmt(n) + ' Bux';
export function skuLookup(sku) {
    for (const kind of ['product', 'pass']) for (const [key, s] of Object.entries(SKUS[kind])) if (s === sku) return { kind, key };
    return null;
}

export const OFFERS = [
    { title: 'OP STARTER PACK', ic: '🎁', kind: 'product', key: 'StarterPack' },
    { title: 'Cheap Dino x30', ic: '🦎', kind: 'pass', key: 'CheapDino' },
    { title: '1M Speed', ic: '👟', kind: 'product', key: 'Speed1M' },
    { title: 'OP Dino Dragon', ic: '🐉', kind: 'pass', key: 'DinoDragon' },
    { title: '25x Treadmill', ic: '🚀', kind: 'pass', key: 'RunArea25x' },
];

// Dinos you ride. bonus = extra Speed per step, req = Wins to buy it.
// shape picks the model in client/src/dino.js. Row 1 is the front row of the DINO SHOP
// (south to north), row 2 the raised back row; the Baby T-Rex hatches after EGG_MINUTES.
const D_ = (id, name, bonus, req, row, shape, body, belly, accent, extra) =>
    Object.assign({ id, name, bonus, req, row, shape, body, belly, accent }, extra || {});
export const DINOS = [
    D_('Raptor', 'Green Raptor', 0, 0, 1, 'raptor', 0x3cd23c, 0xbff58a, 0x1f8f2a),
    D_('Pachy', 'Bonk Pachy', 2, 3, 1, 'pachy', 0x6fc8ff, 0xe8f6ff, 0x2a78c8),
    D_('Stego', 'Stegosaurus', 5, 20, 1, 'stego', 0xe8383a, 0xffc0a0, 0xffd028),
    D_('Trike', 'Triceratops', 25, 100, 1, 'trike', 0xff7ac8, 0xffe0f0, 0xfff4d8),
    D_('Ankylo', 'Ankylosaurus', 50, 500, 1, 'ankylo', 0x8a6a4a, 0xe0c8a0, 0x5a4030),
    D_('Dilo', 'Dilophosaurus', 30, 0, 1, 'dilo', 0x2ad8a0, 0xd8ffe8, 0xff4aa0, { pass: 'CheapDino', tagline: 'Cheap Dino!' }),
    D_('Dragon', 'OP Dino Dragon', 200, 0, 1, 'dragon', 0x8a2aff, 0xe8c8ff, 0xffd028, { pass: 'DinoDragon', tagline: 'OP DRAGON!', glow: 0xc46aff }),
    D_('Spino', 'Spinosaurus', 75, 1000, 2, 'spino', 0x1e2a5a, 0x8aa0d8, 0xff5a3c, { size: 1.1 }),
    D_('Parasaur', 'Parasaurolophus', 150, 5000, 2, 'parasaur', 0xffb51c, 0xfff0c0, 0xe8601c, { size: 1.1 }),
    D_('Brachio', 'Brachiosaurus', 300, 25000, 2, 'brachio', 0x5ab8a0, 0xd8f4e8, 0x2a7a6a, { size: 1.15 }),
    D_('Ptero', 'Pterodactyl', 600, 100000, 2, 'ptero', 0xd85a2a, 0xffd8b0, 0x8a2a14, { size: 1.15 }),
    D_('TRex', 'T-Rex', 1000, 500000, 2, 'rex', 0xb8501c, 0xf0c890, 0x5a2410, { size: 1.25 }),
    D_('Indom', 'Indominus Rex', 2500, 2500000, 2, 'indom', 0xeeeef4, 0xc8c8d8, 0x2a2a3a, { size: 1.35, glow: 0xff3c3c }),
    D_('GalaxyRex', 'Galaxy Rex', 6000, 15000000, 2, 'galaxy', 0x2a1458, 0x5a3cc8, 0x14082e, { size: 1.45, glow: 0x5af0ff }),
    D_('BabyRex', 'Baby T-Rex', 150, 0, 0, 'baby', 0x46e03c, 0xf0e890, 0x2aa028, { timed: true }),
];
export const dinoById = Object.fromEntries(DINOS.map((d) => [d.id, d]));
export const STARTER_DINO = 'Raptor';
// The giant chaser (Stage 3) and the Dino King (Stage 6): dark rex with a fiery mouth
export const CHASER_LOOK = { id: 'Chaser', shape: 'chaser', body: 0x1c1a24, belly: 0x2e2a3a, accent: 0x0e0c14, glow: 0xff6a14 };
export const KING_LOOK = { id: 'King', shape: 'chaser', body: 0x6a1420, belly: 0x2a0a10, accent: 0xffd028, glow: 0xffb51c, crown: true };
export const PTERO_LOOK = { id: 'WildPtero', shape: 'ptero', body: 0x7a3a8a, belly: 0xe0b8e8, accent: 0x3a1448 };

export const AURAS = [
    { id: 'Leaf', name: 'Jungle Leaves', req: 10, mult: 1.1, color: 0x46ec50, ic: '🍃' },
    { id: 'Amber', name: 'Amber', req: 50, mult: 1.25, color: 0xffb51c, ic: '🟠' },
    { id: 'Lava', name: 'Volcano', req: 250, mult: 1.5, color: 0xff6e14, ic: '🌋' },
    { id: 'Lightning', name: 'Lightning', req: 1000, mult: 2, color: 0x5ae6ff, ic: '⚡' },
    { id: 'Meteor', name: 'Meteor', req: 5000, mult: 3, color: 0xaa46ff, ic: '☄️' },
    { id: 'Rainbow', name: 'Rainbow', pass: 'RainbowAura', mult: 5, color: 0xff50c8, ic: '🌈' },
];
export const auraById = Object.fromEntries(AURAS.map((a) => [a.id, a]));

// Session playtime rewards (minutes since joining)
export const FREE = [
    { min: 2, speed: 500 }, { min: 5, wins: 2 }, { min: 10, speed: 5000 },
    { min: 15, wins: 5 }, { min: 25, speed: 25000 }, { min: 40, wins: 15 },
];

// Daily Reward, seven days like the reference (+20, +100, +10K, +1K, +100K, +10K, 2 Rebirths).
// One claim per UTC day; missing a day resets the streak. Day 7 repeats past a week.
export const DAILY = [
    { speed: 20 }, { wins: 100 }, { speed: 10000 }, { wins: 1000 }, { speed: 100000 }, { wins: 10000 }, { rebirths: 2 },
];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
// Daily state at time now: can = claimable, streak = days claimed in a row, day = DAILY index of the next (or last) claim
export function dailyStatus(d, now) {
    d = d || {};
    const today = dayKey(now), yesterday = dayKey(now - 86400000);
    const can = d.last !== today;
    const streak = d.last === today || d.last === yesterday ? d.streak || 0 : 0;
    return { can, streak, day: Math.min(DAILY.length - 1, can ? streak : Math.max(0, streak - 1)) };
}
export const rewardText = (r) => [
    r.speed ? '+' + fmt(r.speed) + ' Speed' : '',
    r.wins ? '+' + fmt(r.wins) + ' Wins' : '',
    r.rebirths ? '+' + r.rebirths + ' Rebirths' : '',
].filter(Boolean).join(' & ');

// Rider outfits cycle by join order so players look different from each other
export const KITS = [
    { shirt: 0x14141e, shorts: 0x2a3a6a, socks: 0x14141e },
    { shirt: 0x2f7bff, shorts: 0x1e2a44, socks: 0x2f7bff },
    { shirt: 0xe82434, shorts: 0x14141e, socks: 0xe82434 },
    { shirt: 0x28c43c, shorts: 0x1e2a44, socks: 0x28c43c },
    { shirt: 0xffb51c, shorts: 0x1e3caa, socks: 0xffb51c },
    { shirt: 0x8a1cff, shorts: 0x1e2a44, socks: 0x8a1cff },
    { shirt: 0xff3fa0, shorts: 0x1e2a44, socks: 0xff3fa0 },
    { shirt: 0x1ec8b4, shorts: 0x14141e, socks: 0x1ec8b4 },
];
export const SKINS = [0xe1af87, 0xc88c5f, 0x8c5a3c, 0x5f3c28, 0xf0c8a0];

// Combined multiplier for earned Speed: rebirths, aura, 2x pass, timed boost, friends here
export function speedMult(p, now, friends) {
    let m = 1 + (p.rebirths || 0) * CFG.rebirthStep;
    const a = auraById[p.aura];
    if (a) m *= a.mult;
    if (p.passes && p.passes.DoubleSpeed) m *= 2;
    if ((now || Date.now()) < (p.boostUntil || 0)) m *= CFG.boostMult;
    m *= 1 + CFG.friendBoost * Math.min(CFG.friendMax, friends || 0);
    return m;
}

const SUF = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
// 2700 -> "2.7K", 1000000 -> "1M", 950 -> "950"
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    let i = -1, s = v;
    while (s >= 1000 && i < SUF.length - 1) { s /= 1000; i++; }
    const t = s >= 100 ? String(Math.floor(s)) : (Math.floor(s * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return t + SUF[i];
}
// Leaderboard style: 6700000 -> "6.7e+6"
export function sci(v) {
    v = Math.floor(v || 0);
    if (v < 100000) return fmt(v);
    const e = Math.floor(Math.log10(v));
    return (Math.floor(v / Math.pow(10, e) * 10) / 10).toFixed(1) + 'e+' + e;
}
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rngFrom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
