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

// FILE: src/middleware.ts

import { NextRequest, NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import { nanoid } from "nanoid"
import {
    ROOM_TTL_SECONDS,
    SPECTATOR_CAPACITY,
    WAITING_ROOM_TTL_SECONDS,
    gameKey,
    inviteKey,
    metaKey,
    messagesKey,
    normalizeInviteCode,
} from "@/server/keys"
import type { RoomMeta } from "@/server/auth"

function isInviteCodeMatch(meta: RoomMeta, provided: string) {
    const playerCode = typeof meta.inviteCode === "string" ? meta.inviteCode : ""
    const spectatorCode = typeof meta.spectatorCode === "string" ? meta.spectatorCode : ""
    return { isPlayer: provided === playerCode, isSpectator: provided === spectatorCode }
}

function getConfiguredTtlSeconds(meta: RoomMeta): number | null {
    if (meta.ttlSeconds === null) return null
    if (typeof meta.ttlSeconds === "number" && Number.isFinite(meta.ttlSeconds) && meta.ttlSeconds > 0) {
        return Math.floor(meta.ttlSeconds)
    }
    return ROOM_TTL_SECONDS
}

export async function middleware(req: NextRequest) {
    const pathname = req.nextUrl.pathname

    const roomMatch = pathname.match(/^\/room\/([^/]+)$/)
    if (!roomMatch) return NextResponse.redirect(new URL("/", req.url))

    const roomId = roomMatch[1]

    const meta = await redis.hgetall<RoomMeta>(metaKey(roomId))

    if (!meta) {
        return NextResponse.redirect(new URL("/?error=room-not-found", req.url))
    }

    const players = Array.isArray(meta.players) ? meta.players : []
    const spectators = Array.isArray(meta.spectators) ? meta.spectators : []

    const existingToken = req.cookies.get("x-auth-token")?.value
    const mode = meta.mode ?? "invite"
    const pve = !!meta.pve

    if (existingToken && (players.includes(existingToken) || spectators.includes(existingToken))) {
        return NextResponse.next()
    }

    let joinRole: "player" | "spectator" = "player"

    if (pve || mode === "ai") {
        if (players.length >= 1) {
            return NextResponse.redirect(new URL("/?error=room-full", req.url))
        }
        joinRole = "player"
    } else {
        const allowSpectators = !!meta.allowSpectators
        const isInvite = mode === "invite"

        if (!isInvite) {
            if (players.length >= 2) {
                return NextResponse.redirect(new URL("/?error=room-full", req.url))
            }
            joinRole = "player"
        } else {
            const providedRaw = req.nextUrl.searchParams.get("code")
            const provided = typeof providedRaw === "string" ? normalizeInviteCode(providedRaw) : ""

            if (!provided) {
                if (players.length === 0) {
                    joinRole = "player"
                } else {
                    return NextResponse.redirect(new URL("/?error=invite-code-required", req.url))
                }
            } else {
                const match = isInviteCodeMatch(meta, provided)

                if (match.isPlayer) {
                    joinRole = "player"
                } else if (match.isSpectator && allowSpectators) {
                    joinRole = "spectator"
                } else {
                    return NextResponse.redirect(new URL("/?error=code-invalid", req.url))
                }
            }
        }

        if (joinRole === "player" && players.length >= 2) {
            return NextResponse.redirect(new URL("/?error=room-full", req.url))
        }

        if (joinRole === "spectator" && spectators.length >= SPECTATOR_CAPACITY) {
            return NextResponse.redirect(new URL("/?error=spectator-full", req.url))
        }
    }

    const response = NextResponse.next()
    const token = nanoid()

    response.cookies.set("x-auth-token", token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    })

    const nextPlayers = joinRole === "player" ? [...players, token] : players
    const nextSpectators = joinRole === "spectator" ? [...spectators, token] : spectators

    await redis.hset(metaKey(roomId), { players: nextPlayers, spectators: nextSpectators })

    const becamePlayable = pve ? players.length === 0 && nextPlayers.length === 1 : players.length === 1 && nextPlayers.length === 2

    if (becamePlayable) {
        const ttlSeconds = getConfiguredTtlSeconds(meta)

        if (ttlSeconds === null) {
            await redis.persist(metaKey(roomId))
            await redis.persist(gameKey(roomId))
            await redis.persist(messagesKey(roomId))

            const playerCode = typeof meta.inviteCode === "string" ? meta.inviteCode : null
            const spectatorCode = typeof meta.spectatorCode === "string" ? meta.spectatorCode : null
            if (playerCode) await redis.persist(inviteKey("player", playerCode))
            if (spectatorCode) await redis.persist(inviteKey("spectator", spectatorCode))
        } else {
            await redis.expire(metaKey(roomId), ttlSeconds)
            await redis.expire(gameKey(roomId), ttlSeconds)
            await redis.expire(messagesKey(roomId), ttlSeconds)

            const playerCode = typeof meta.inviteCode === "string" ? meta.inviteCode : null
            const spectatorCode = typeof meta.spectatorCode === "string" ? meta.spectatorCode : null

            if (playerCode) await redis.expire(inviteKey("player", playerCode), ttlSeconds)
            if (spectatorCode) await redis.expire(inviteKey("spectator", spectatorCode), ttlSeconds)
        }
    } else {
        const ttl = await redis.ttl(metaKey(roomId))
        if (ttl <= 0) await redis.expire(metaKey(roomId), WAITING_ROOM_TTL_SECONDS)
    }

    return response
}

export const config = {
    matcher: "/room/:path*",
}
