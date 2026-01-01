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

// src/lib/realtime.ts

import { redis } from "@/lib/redis"
import { InferRealtimeEvents, Realtime } from "@upstash/realtime"
import z from "zod"

const disc = z.union([z.literal(0), z.literal(1), z.literal(2)])

const message = z.object({
    id: z.string(),
    sender: z.string(),
    text: z.string(),
    timestamp: z.number(),
    roomId: z.string(),
    token: z.string().optional(),
})

const gameState = z.object({
    roomId: z.string(),
    board: z.array(disc).length(64),
    status: z.enum(["waiting", "playing", "finished"]),
    turn: z.union([z.literal(1), z.literal(2)]).nullable(),
    passStreak: z.number().int().min(0).max(2),
    winner: z.union([z.literal(0), z.literal(1), z.literal(2)]).nullable(),
    blackCount: z.number().int().min(0).max(64),
    whiteCount: z.number().int().min(0).max(64),
    lastMove: z
        .object({
            x: z.number().int().min(0).max(7),
            y: z.number().int().min(0).max(7),
            player: z.union([z.literal(1), z.literal(2)]),
        })
        .nullable(),
    updatedAt: z.number(),
})

const schema = {
    chat: {
        message,
        destroy: z.object({
            isDestroyed: z.literal(true),
        }),
    },
    game: {
        state: gameState,
    },
}

export const realtime = new Realtime({ schema, redis })
export type RealtimeEvents = InferRealtimeEvents<typeof realtime>
export type Message = z.infer<typeof message>
export type GameStatePayload = z.infer<typeof gameState>
