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

// FILE: src/server/rooms.ts

import { redis } from "@/lib/redis"
import { realtime } from "@/lib/realtime"
import { Elysia, t } from "elysia"
import { customAlphabet, nanoid } from "nanoid"
import { authMiddleware, type RoomMeta } from "./auth"
import {
    INVITE_ALPHABET,
    INVITE_CODE_LENGTH,
    ROOM_TTL_SECONDS,
    SPECTATOR_CAPACITY,
    WAITING_ROOM_TTL_SECONDS,
    gameKey,
    inviteKey,
    isInviteCodeFormat,
    metaKey,
    messagesKey,
    normalizeInviteCode,
} from "./keys"

type RoomMode = "invite" | "match"
type HostColor = "random" | "black" | "white"

const makeInviteCode = customAlphabet(INVITE_ALPHABET, INVITE_CODE_LENGTH)

async function inviteExists(code: string) {
    const a = await redis.exists(inviteKey("player", code))
    if (a) return true
    const b = await redis.exists(inviteKey("spectator", code))
    return !!b
}

async function generateUniqueInviteCode() {
    for (let i = 0; i < 6; i++) {
        const code = makeInviteCode()
        const exists = await inviteExists(code)
        if (!exists) return code
    }
    return makeInviteCode()
}

function sanitizeIndices(list: unknown): number[] {
    if (!Array.isArray(list)) return []
    const out: number[] = []
    const seen = new Set<number>()
    for (const v of list) {
        const n = typeof v === "number" ? v : Number(v)
        if (!Number.isFinite(n)) continue
        const i = Math.floor(n)
        if (i < 0 || i > 63) continue
        if (seen.has(i)) continue
        seen.add(i)
        out.push(i)
    }
    return out
}

function normalizeHostColor(v: unknown): HostColor {
    if (v === "black" || v === "white" || v === "random") return v
    return "random"
}

function normalizeTtlSeconds(v: unknown): number | null {
    if (v === null) return null
    const n = typeof v === "number" ? v : Number(v)
    if (!Number.isFinite(n)) return ROOM_TTL_SECONDS
    const s = Math.floor(n)
    if (s <= 0) return null
    return Math.max(60, Math.min(24 * 60 * 60, s))
}

export const rooms = new Elysia({ prefix: "/room" })
    .post(
        "/create",
        async ({ body }) => {
            const roomId = nanoid()
            const playerCode = await generateUniqueInviteCode()

            const allowSpectators = !!body.allowSpectators
            const spectatorCode = allowSpectators ? await generateUniqueInviteCode() : null

            const now = Date.now()

            const handicapBlack = sanitizeIndices(body.handicap?.black)
            const handicapWhite = sanitizeIndices(body.handicap?.white)

            const ttlSeconds = normalizeTtlSeconds(body.ttlSeconds)

            const spectatorCanViewChat = allowSpectators ? !!body.spectatorCanViewChat : false
            const spectatorCanSendChat = allowSpectators && spectatorCanViewChat ? !!body.spectatorCanSendChat : false

            const meta: RoomMeta = {
                players: [],
                spectators: [],
                createdAt: now,
                mode: "invite" satisfies RoomMode,
                inviteCode: playerCode,
                spectatorCode,
                allowSpectators,
                spectatorCanViewChat,
                spectatorCanSendChat,
                hostColor: normalizeHostColor(body.hostColor),
                ttlSeconds,
                handicap: { black: handicapBlack, white: handicapWhite },
            }

            await redis.hset(metaKey(roomId), meta)

            await redis.set(inviteKey("player", playerCode), roomId)
            if (spectatorCode) await redis.set(inviteKey("spectator", spectatorCode), roomId)

            await redis.expire(metaKey(roomId), WAITING_ROOM_TTL_SECONDS)
            await redis.expire(inviteKey("player", playerCode), WAITING_ROOM_TTL_SECONDS)
            if (spectatorCode) await redis.expire(inviteKey("spectator", spectatorCode), WAITING_ROOM_TTL_SECONDS)

            return { roomId, inviteCode: playerCode, spectatorCode }
        },
        {
            body: t.Object({
                allowSpectators: t.Boolean(),
                spectatorCanViewChat: t.Boolean(),
                spectatorCanSendChat: t.Boolean(),
                hostColor: t.Union([t.Literal("random"), t.Literal("black"), t.Literal("white")]),
                ttlSeconds: t.Union([t.Number(), t.Null()]),
                handicap: t.Object({
                    black: t.Array(t.Number()),
                    white: t.Array(t.Number()),
                }),
            }),
        }
    )
    .get(
        "/resolve",
        async ({ query, set }) => {
            const code = normalizeInviteCode(query.code)

            if (!isInviteCodeFormat(code)) {
                set.status = 400
                return { error: "invalid-format" as const }
            }

            const roomIdPlayer = await redis.get<string>(inviteKey("player", code))
            const roomIdSpectator = roomIdPlayer ? null : await redis.get<string>(inviteKey("spectator", code))

            const roomId = roomIdPlayer ?? roomIdSpectator
            const kind: "player" | "spectator" | null = roomIdPlayer ? "player" : roomIdSpectator ? "spectator" : null

            if (!roomId || !kind) {
                set.status = 404
                return { error: "code-not-found" as const }
            }

            const meta = await redis.hgetall<RoomMeta>(metaKey(roomId))
            if (!meta) {
                set.status = 404
                return { error: "room-not-found" as const }
            }

            const players = Array.isArray(meta.players) ? meta.players : []
            const spectators = Array.isArray(meta.spectators) ? meta.spectators : []
            const allowSpectators = !!meta.allowSpectators

            if (kind === "player") {
                if (players.length >= 2) {
                    set.status = 409
                    return { error: "room-full" as const }
                }
                return { roomId }
            }

            if (!allowSpectators) {
                set.status = 404
                return { error: "code-not-found" as const }
            }

            if (spectators.length >= SPECTATOR_CAPACITY) {
                set.status = 409
                return { error: "spectator-full" as const }
            }

            return { roomId }
        },
        { query: t.Object({ code: t.String({ minLength: 1, maxLength: 32 }) }) }
    )
    .post("/match", async () => {
        for (let i = 0; i < 8; i++) {
            const candidate = await redis.lpop<string>("queue:rooms")
            if (!candidate) break

            const meta = await redis.hgetall<RoomMeta>(metaKey(candidate))

            const players = meta && Array.isArray(meta.players) ? meta.players : null
            const mode = meta?.mode ?? "match"

            if (players && players.length < 2 && mode === "match") {
                return { roomId: candidate }
            }
        }

        const roomId = nanoid()
        const now = Date.now()

        const meta: RoomMeta = {
            players: [],
            spectators: [],
            createdAt: now,
            mode: "match" satisfies RoomMode,
            inviteCode: null,
            spectatorCode: null,
            allowSpectators: false,
            spectatorCanViewChat: false,
            spectatorCanSendChat: false,
            hostColor: "random",
            ttlSeconds: ROOM_TTL_SECONDS,
            handicap: { black: [], white: [] },
        }

        await redis.hset(metaKey(roomId), meta)
        await redis.expire(metaKey(roomId), WAITING_ROOM_TTL_SECONDS)
        await redis.rpush("queue:rooms", roomId)
        return { roomId }
    })
    .use(authMiddleware)
    .get(
        "/info",
        async ({ auth }) => {
            const meta = auth.meta ?? (await redis.hgetall<RoomMeta>(metaKey(auth.roomId)))
            if (!meta)
                return {
                    mode: null,
                    inviteCode: null,
                    spectatorCode: null,
                    allowSpectators: false,
                    spectatorCanViewChat: false,
                    spectatorCanSendChat: false,
                    ttlEnabled: false,
                    ttlSeconds: null,
                    role: auth.role,
                    spectatorsCount: 0,
                    spectatorCapacity: SPECTATOR_CAPACITY,
                    spectatorSlotsRemaining: SPECTATOR_CAPACITY,
                }

            const mode = (meta.mode ?? null) as RoomMode | null
            const inviteCode = typeof meta.inviteCode === "string" ? meta.inviteCode : null
            const spectatorCode = typeof meta.spectatorCode === "string" ? meta.spectatorCode : null

            const allowSpectators = !!meta.allowSpectators
            const spectatorCanViewChat = !!meta.spectatorCanViewChat
            const spectatorCanSendChat = !!meta.spectatorCanSendChat

            const ttlEnabled = meta.ttlSeconds !== null
            const ttlSeconds = typeof meta.ttlSeconds === "number" ? meta.ttlSeconds : null

            const spectators = Array.isArray(meta.spectators) ? meta.spectators : []
            const spectatorsCount = spectators.length
            const spectatorSlotsRemaining = Math.max(0, SPECTATOR_CAPACITY - spectatorsCount)

            return {
                mode,
                inviteCode,
                spectatorCode,
                allowSpectators,
                spectatorCanViewChat,
                spectatorCanSendChat,
                ttlEnabled,
                ttlSeconds,
                role: auth.role,
                spectatorsCount,
                spectatorCapacity: SPECTATOR_CAPACITY,
                spectatorSlotsRemaining,
            }
        },
        { query: t.Object({ roomId: t.String() }) }
    )
    .get(
        "/ttl",
        async ({ auth }) => {
            const meta = auth.meta ?? (await redis.hgetall<RoomMeta>(metaKey(auth.roomId)))
            const players = Array.isArray(meta?.players) ? meta!.players! : []

            if (players.length < 2) return { ttl: null as number | null }

            const ttl = await redis.ttl(metaKey(auth.roomId))
            if (ttl === -1) return { ttl: null as number | null }
            return { ttl: ttl > 0 ? ttl : 0 }
        },
        { query: t.Object({ roomId: t.String() }) }
    )
    .delete(
        "/",
        async ({ auth, set }) => {
            if (auth.role !== "player") {
                set.status = 403
                return { error: "forbidden" as const }
            }

            const meta = await redis.hgetall<RoomMeta>(metaKey(auth.roomId))
            const inviteCode = typeof meta?.inviteCode === "string" ? meta.inviteCode : null
            const spectatorCode = typeof meta?.spectatorCode === "string" ? meta.spectatorCode : null

            await realtime.channel(auth.roomId).emit("chat.destroy", { isDestroyed: true })

            await Promise.all([
                redis.del(metaKey(auth.roomId)),
                redis.del(messagesKey(auth.roomId)),
                redis.del(gameKey(auth.roomId)),
                inviteCode ? redis.del(inviteKey("player", inviteCode)) : Promise.resolve(0),
                spectatorCode ? redis.del(inviteKey("spectator", spectatorCode)) : Promise.resolve(0),
            ])

            return { ok: true }
        },
        { query: t.Object({ roomId: t.String() }) }
    )
