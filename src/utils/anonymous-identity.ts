/* ======================================================= *
Copyright © 2025 suog, Konishi Kento.
All rights reserved.

This work is protected by applicable copyright laws. 

No permission is granted to copy, reproduce, modify, distribute, publish, transmit, sublicense, 
or otherwise exploit this work, in whole or in part, in any form or by any means, 
without the prior explicit written consent of the copyright holder.
Use of this work for training, fine-tuning, evaluating, benchmarking, or otherwise developing or 
improving machine learning systems, including generative or foundation models, is expressly prohibited.
This includes any incorporation of this work or any derivative thereof into datasets or pipelines 
used for automated learning or model development. Any false attribution, misrepresentation of origin,
or removal or alteration of this notice is prohibited and constitutes an infringement of the author's moral rights. 

No license or other rights are granted by implication, estoppel, or otherwise.
All rights not expressly granted are reserved by the author.
 ======================================================= */

// src/utils/anonymous-identity.ts

import { nanoid } from "nanoid";

export type AnonymousIdentityProfileV2 = {
    version: 2;
    seed: string;
    username: string;
    tag: string;
    colorHex: string;
    avatarKey: string;
    createdAtMs: number;
};

const PROFILE_KEY_PREFIX = "chat_identity_v2";
const ALPHABET32 = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const ANON_IDENTITY_EVENT = "sr:anon-identity-change";

const ADJECTIVES = [
    "quiet",
    "lucid",
    "steady",
    "subtle",
    "calm",
    "brisk",
    "gentle",
    "bold",
    "clear",
    "sharp",
    "patient",
    "nimble",
    "humble",
    "bright",
    "mellow",
    "witty",
    "sincere",
    "stellar",
    "amber",
    "silver",
    "copper",
    "midnight",
    "velvet",
    "crisp",
    "elegant",
    "faint",
    "vivid",
    "lithe",
    "keen",
    "kind",
    "sable",
    "ivory",
    "sage",
    "vernal",
    "autumn",
    "winter",
    "summer",
    "atomic",
    "cosmic",
    "neon",
    "lunar",
    "solar",
    "aerial",
    "tidal",
    "rational",
    "tactile",
    "patient",
    "resolute",
    "modest",
    "frank",
    "radiant",
    "rare",
    "sturdy",
    "precise",
    "prudent",
    "honest",
    "crafty",
    "silent",
    "gentle",
    "daring",
    "balanced",
    "measured",
    "frozen",
    "warm",
    "cool",
    "dry",
    "stormy",
    "opal",
    "jade",
    "azure",
    "crimson",
    "golden",
    "obsidian",
    "granite",
    "paper",
    "carbon",
    "ceramic",
    "linear",
    "smooth",
    "sparse",
    "dense",
    "clean",
    "soft",
    "hard",
    "exact",
    "finite",
    "open",
    "sealed",
    "magnetic",
    "electric",
    "kinetic",
];

const NOUNS = [
    "lynx",
    "otter",
    "raven",
    "falcon",
    "whale",
    "tiger",
    "fox",
    "wolf",
    "bear",
    "shark",
    "orca",
    "owl",
    "panther",
    "dolphin",
    "sparrow",
    "heron",
    "ibis",
    "manta",
    "gecko",
    "viper",
    "puma",
    "badger",
    "bison",
    "yak",
    "koala",
    "lemur",
    "pigeon",
    "coyote",
    "wren",
    "swift",
    "comet",
    "nebula",
    "quasar",
    "photon",
    "matrix",
    "vector",
    "cipher",
    "signal",
    "kernel",
    "node",
    "atlas",
    "compass",
    "harbor",
    "orchard",
    "canyon",
    "delta",
    "fjord",
    "glacier",
    "meadow",
    "basil",
    "pepper",
    "ginger",
    "cedar",
    "maple",
    "willow",
    "granite",
    "marble",
    "cobalt",
    "helium",
    "argon",
    "neon",
    "saturn",
    "jupiter",
    "mercury",
    "venus",
    "pluto",
    "aurora",
    "ember",
    "shadow",
    "ripple",
    "echo",
    "tempo",
    "chord",
    "canvas",
    "ink",
    "paper",
    "lens",
    "prism",
    "relay",
    "anchor",
    "bridge",
    "gate",
    "vault",
    "thread",
    "weave",
    "forge",
];

const normalizeNamespace = (namespace?: string) => {
    const n = String(namespace ?? "").trim();
    return n.length ? n : "global";
};

const profileKey = (namespace?: string) => `${PROFILE_KEY_PREFIX}:${normalizeNamespace(namespace)}`;

export const loadOrCreateAnonymousIdentityProfileV2 = (
    namespace?: string,
): AnonymousIdentityProfileV2 => {
    const key = profileKey(namespace);

    try {
        const raw = localStorage.getItem(key);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<AnonymousIdentityProfileV2>;
            if (
                parsed &&
                parsed.version === 2 &&
                typeof parsed.seed === "string" &&
                typeof parsed.username === "string" &&
                typeof parsed.tag === "string" &&
                typeof parsed.colorHex === "string" &&
                typeof parsed.avatarKey === "string" &&
                typeof parsed.createdAtMs === "number"
            ) {
                return parsed as AnonymousIdentityProfileV2;
            }
        }
    } catch {
        void 0;
    }

    const seed = generateSeed();
    const derived = deriveProfileFromSeed(seed, namespace);

    try {
        localStorage.setItem(key, JSON.stringify(derived));
        emitIdentityChange(namespace);
    } catch {
        void 0;
    }

    return derived;
};

export const resetAnonymousIdentityProfileV2 = (namespace?: string) => {
    try {
        localStorage.removeItem(profileKey(namespace));
        emitIdentityChange(namespace);
    } catch {
        void 0;
    }
};

const emitIdentityChange = (namespace?: string) => {
    try {
        if (typeof window === "undefined") return;
        const ns = normalizeNamespace(namespace);
        window.dispatchEvent(new CustomEvent(ANON_IDENTITY_EVENT, { detail: { namespace: ns } }));
    } catch {
        void 0;
    }
};

const generateSeed = () => {
    const g = globalThis as unknown as { crypto?: Crypto };
    const c = g.crypto;

    if (c && typeof c.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        c.getRandomValues(bytes);
        return toHex(bytes);
    }

    return nanoid(24);
};

const deriveProfileFromSeed = (seed: string, namespace?: string): AnonymousIdentityProfileV2 => {
    const ns = normalizeNamespace(namespace);
    const h0 = fnv1a32(`${seed}|${ns}|v2|0`);
    const h1 = fnv1a32(`${seed}|${ns}|v2|1`);
    const prng = makeXorShift32(h0 ^ rotl32(h1, 13) ^ 0x9e3779b9);

    const adj = ADJECTIVES[nextIndex(prng, ADJECTIVES.length)];
    const noun = NOUNS[nextIndex(prng, NOUNS.length)];

    const tag = encodeBase32_20bits(h1);
    const hue = nextIndex(prng, 360);
    const sat = 58 + nextIndex(prng, 18);
    const lit = 46 + nextIndex(prng, 14);
    const colorHex = hslToHex(hue, sat, lit);

    const username = `${adj}-${noun}-${tag}`.toLowerCase();
    const avatarKey = `${tag}-${hue.toString(10)}`;

    return {
        version: 2,
        seed,
        username,
        tag,
        colorHex,
        avatarKey,
        createdAtMs: Date.now(),
    };
};

const nextIndex = (prng: () => number, mod: number) => {
    const x = prng() >>> 0;
    return mod <= 1 ? 0 : x % mod;
};

const makeXorShift32 = (seed32: number) => {
    let x = (seed32 >>> 0) || 0x6d2b79f5;
    return () => {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        return x >>> 0;
    };
};

const fnv1a32 = (s: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
};

const rotl32 = (x: number, r: number) => ((x << r) | (x >>> (32 - r))) >>> 0;

const encodeBase32_20bits = (x: number) => {
    const v = x >>> 0;
    const a = (v >>> 0) & 31;
    const b = (v >>> 5) & 31;
    const c = (v >>> 10) & 31;
    const d = (v >>> 15) & 31;
    return `${ALPHABET32[d]}${ALPHABET32[c]}${ALPHABET32[b]}${ALPHABET32[a]}`;
};

const toHex = (bytes: Uint8Array) => {
    const hex: string[] = [];
    for (let i = 0; i < bytes.length; i++) hex.push(bytes[i]!.toString(16).padStart(2, "0"));
    return hex.join("");
};

const hslToHex = (h: number, s: number, l: number) => {
    const hh = ((h % 360) + 360) % 360;
    const ss = clamp01(s / 100);
    const ll = clamp01(l / 100);

    const c = (1 - Math.abs(2 * ll - 1)) * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = ll - c / 2;

    let r = 0;
    let g = 0;
    let b = 0;

    if (hh < 60) {
        r = c;
        g = x;
        b = 0;
    } else if (hh < 120) {
        r = x;
        g = c;
        b = 0;
    } else if (hh < 180) {
        r = 0;
        g = c;
        b = x;
    } else if (hh < 240) {
        r = 0;
        g = x;
        b = c;
    } else if (hh < 300) {
        r = x;
        g = 0;
        b = c;
    } else {
        r = c;
        g = 0;
        b = x;
    }

    const rr = toByte(r + m);
    const gg = toByte(g + m);
    const bb = toByte(b + m);

    return `#${rr.toString(16).padStart(2, "0")}${gg.toString(16).padStart(2, "0")}${bb
        .toString(16)
        .padStart(2, "0")}`;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const toByte = (v: number) => {
    const x = Math.round(clamp01(v) * 255);
    return x < 0 ? 0 : x > 255 ? 255 : x;
};
