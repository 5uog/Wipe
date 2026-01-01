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
import { authMiddleware } from "./auth"
import {
    INVITE_ALPHABET,
    INVITE_CODE_LENGTH,
    WAITING_ROOM_TTL_SECONDS,
    gameKey,
    inviteKey,
    isInviteCodeFormat,
    metaKey,
    messagesKey,
    normalizeInviteCode,
} from "./keys"

type RoomMode = "invite" | "match"

const makeInviteCode = customAlphabet(INVITE_ALPHABET, INVITE_CODE_LENGTH)

async function generateUniqueInviteCode() {
    for (let i = 0; i < 6; i++) {
        const code = makeInviteCode()
        const exists = await redis.exists(inviteKey(code))
        if (!exists) return code
    }
    return makeInviteCode()
}

export const rooms = new Elysia({ prefix: "/room" })
    .post("/create", async () => {
        const roomId = nanoid()
        const inviteCode = await generateUniqueInviteCode()
        const now = Date.now()

        await redis.hset(metaKey(roomId), {
            connected: [],
            createdAt: now,
            mode: "invite" satisfies RoomMode,
            inviteCode,
        })

        await redis.set(inviteKey(inviteCode), roomId)

        await redis.expire(metaKey(roomId), WAITING_ROOM_TTL_SECONDS)
        await redis.expire(inviteKey(inviteCode), WAITING_ROOM_TTL_SECONDS)

        return { roomId, inviteCode }
    })
    .get(
        "/resolve",
        async ({ query, set }) => {
            const code = normalizeInviteCode(query.code)

            if (!isInviteCodeFormat(code)) {
                set.status = 400
                return { error: "invalid-format" as const }
            }

            const roomId = await redis.get<string>(inviteKey(code))
            if (!roomId) {
                set.status = 404
                return { error: "code-not-found" as const }
            }

            const meta = await redis.hgetall<{
                connected?: string[]
                mode?: RoomMode
                inviteCode?: string
            }>(metaKey(roomId))

            if (!meta) {
                set.status = 404
                return { error: "room-not-found" as const }
            }

            const connected = Array.isArray(meta.connected) ? meta.connected : []
            if (connected.length >= 2) {
                set.status = 409
                return { error: "room-full" as const }
            }

            return { roomId }
        },
        { query: t.Object({ code: t.String({ minLength: 1, maxLength: 32 }) }) }
    )
    .post("/match", async () => {
        for (let i = 0; i < 8; i++) {
            const candidate = await redis.lpop<string>("queue:rooms")
            if (!candidate) break

            const meta = await redis.hgetall<{
                connected?: string[]
                mode?: RoomMode
            }>(metaKey(candidate))

            const connected = meta && Array.isArray(meta.connected) ? meta.connected : null
            const mode = meta?.mode ?? "match"

            if (connected && connected.length < 2 && mode === "match") {
                return { roomId: candidate }
            }
        }

        const roomId = nanoid()
        await redis.hset(metaKey(roomId), {
            connected: [],
            createdAt: Date.now(),
            mode: "match" satisfies RoomMode,
            inviteCode: null,
        })
        await redis.expire(metaKey(roomId), WAITING_ROOM_TTL_SECONDS)
        await redis.rpush("queue:rooms", roomId)
        return { roomId }
    })
    .use(authMiddleware)
    .get(
        "/info",
        async ({ auth }) => {
            const meta = await redis.hgetall<{
                mode?: RoomMode
                inviteCode?: string | null
            }>(metaKey(auth.roomId))

            const mode = (meta?.mode ?? null) as RoomMode | null
            const inviteCode = (typeof meta?.inviteCode === "string" ? meta?.inviteCode : null) as
                | string
                | null

            return { mode, inviteCode }
        },
        { query: t.Object({ roomId: t.String() }) }
    )
    .get(
        "/ttl",
        async ({ auth }) => {
            if (auth.connected.length < 2) return { ttl: null as number | null }

            const ttl = await redis.ttl(metaKey(auth.roomId))
            return { ttl: ttl > 0 ? ttl : 0 }
        },
        { query: t.Object({ roomId: t.String() }) }
    )
    .delete(
        "/",
        async ({ auth }) => {
            const meta = await redis.hgetall<{ inviteCode?: string | null }>(metaKey(auth.roomId))
            const inviteCode = typeof meta?.inviteCode === "string" ? meta?.inviteCode : null

            await realtime.channel(auth.roomId).emit("chat.destroy", { isDestroyed: true })

            await Promise.all([
                redis.del(metaKey(auth.roomId)),
                redis.del(messagesKey(auth.roomId)),
                redis.del(gameKey(auth.roomId)),
                inviteCode ? redis.del(inviteKey(inviteCode)) : Promise.resolve(0),
            ])
        },
        { query: t.Object({ roomId: t.String() }) }
    )
