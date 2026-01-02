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

// FILE: src/server/auth.ts

import Elysia from "elysia"
import { redis } from "@/lib/redis"
import { metaKey } from "./keys"

type RoomMode = "invite" | "match" | "ai"
type HostColor = "random" | "black" | "white"
type AiLevel = "easy" | "normal" | "hard"
type HumanPlays = "black" | "white" | "random"
type ResolvedColor = "black" | "white"

export type RoomMeta = {
    players?: string[]
    spectators?: string[]
    createdAt?: number
    mode?: RoomMode
    inviteCode?: string | null
    spectatorCode?: string | null
    allowSpectators?: boolean
    spectatorCanViewChat?: boolean
    spectatorCanSendChat?: boolean
    hostColor?: HostColor
    ttlSeconds?: number | null
    handicap?: { black: number[]; white: number[] }

    pve?: boolean
    aiLevel?: AiLevel
    humanPlays?: HumanPlays
    humanPlaysResolved?: ResolvedColor | null
}

class AuthError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "AuthError"
    }
}

function roomIdFromQuery(query: unknown): string | undefined {
    if (typeof query !== "object" || query === null) return undefined
    const q = query as Record<string, unknown>
    const roomId = q["roomId"]
    return typeof roomId === "string" && roomId.length > 0 ? roomId : undefined
}

export const authMiddleware = new Elysia({ name: "auth" })
    .error({ AuthError })
    .onError(({ code, set }) => {
        if (code === "AuthError") {
            set.status = 401
            return { error: "Unauthorized" }
        }
    })
    .derive({ as: "scoped" }, async ({ query, cookie }) => {
        const roomId = roomIdFromQuery(query)
        const token = cookie["x-auth-token"]?.value as string | undefined

        if (!roomId || !token) {
            throw new AuthError("Missing roomId or token.")
        }

        const meta = await redis.hgetall<RoomMeta>(metaKey(roomId))
        if (!meta) {
            throw new AuthError("Room not found or meta missing.")
        }

        const players = Array.isArray(meta.players) ? meta.players : []
        const spectators = Array.isArray(meta.spectators) ? meta.spectators : []

        const isPlayer = players.includes(token)
        const isSpectator = spectators.includes(token)

        if (!isPlayer && !isSpectator) {
            throw new AuthError("Invalid token")
        }

        const role = isPlayer ? ("player" as const) : ("spectator" as const)

        return { auth: { roomId, token, role, players, spectators, meta } }
    })
