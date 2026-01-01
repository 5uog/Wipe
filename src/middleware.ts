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

// src/middleware.ts

import { NextRequest, NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import { nanoid } from "nanoid"
import {
    ROOM_TTL_SECONDS,
    gameKey,
    inviteKey,
    metaKey,
    messagesKey,
    normalizeInviteCode,
} from "@/server/keys"

export async function middleware(req: NextRequest) {
    const pathname = req.nextUrl.pathname

    const roomMatch = pathname.match(/^\/room\/([^/]+)$/)
    if (!roomMatch) return NextResponse.redirect(new URL("/", req.url))

    const roomId = roomMatch[1]

    const meta = await redis.hgetall<{
        connected?: string[]
        createdAt?: number
        mode?: "invite" | "match"
        inviteCode?: string | null
    }>(metaKey(roomId))

    if (!meta) {
        return NextResponse.redirect(new URL("/?error=room-not-found", req.url))
    }

    const connected = Array.isArray(meta.connected) ? meta.connected : []
    const existingToken = req.cookies.get("x-auth-token")?.value
    const mode = meta.mode ?? "invite"
    const inviteCode = typeof meta.inviteCode === "string" ? meta.inviteCode : null

    if (existingToken && connected.includes(existingToken)) {
        return NextResponse.next()
    }

    if (connected.length >= 2) {
        return NextResponse.redirect(new URL("/?error=room-full", req.url))
    }

    if (mode === "invite" && connected.length >= 1) {
        const providedRaw = req.nextUrl.searchParams.get("code")
        const provided = typeof providedRaw === "string" ? normalizeInviteCode(providedRaw) : ""

        if (!inviteCode) {
            return NextResponse.redirect(new URL("/?error=code-invalid", req.url))
        }
        if (!provided) {
            return NextResponse.redirect(new URL("/?error=invite-code-required", req.url))
        }
        if (provided !== inviteCode) {
            return NextResponse.redirect(new URL("/?error=code-invalid", req.url))
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

    const wasSize = connected.length
    const nextConnected = [...connected, token]

    await redis.hset(metaKey(roomId), { connected: nextConnected })

    if (wasSize === 1 && nextConnected.length === 2) {
        await redis.expire(metaKey(roomId), ROOM_TTL_SECONDS)
        await redis.expire(gameKey(roomId), ROOM_TTL_SECONDS)
        await redis.expire(messagesKey(roomId), ROOM_TTL_SECONDS)

        if (inviteCode) {
            await redis.expire(inviteKey(inviteCode), ROOM_TTL_SECONDS)
        }
    }

    return response
}

export const config = {
    matcher: "/room/:path*",
}
