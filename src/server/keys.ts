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

// src/server/keys.ts

import { redis } from "@/lib/redis"

export const ROOM_TTL_SECONDS = 60 * 10
export const WAITING_ROOM_TTL_SECONDS = 60 * 60

export const INVITE_CODE_LENGTH = 6
export const INVITE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

export const gameKey = (roomId: string) => `game:${roomId}`
export const metaKey = (roomId: string) => `meta:${roomId}`
export const messagesKey = (roomId: string) => `messages:${roomId}`
export const inviteKey = (code: string) => `invite:${code}`

export function normalizeInviteCode(code: string) {
    return code.trim().toUpperCase()
}

export function isInviteCodeFormat(code: string) {
    return /^[0-9A-Z]{6}$/.test(code)
}

export async function remainingTTLSeconds(roomId: string) {
    const ttl = await redis.ttl(metaKey(roomId))
    return ttl > 0 ? ttl : ROOM_TTL_SECONDS
}
