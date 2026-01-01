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

// src/server/messages.ts

import { redis } from "@/lib/redis"
import { Message, realtime } from "@/lib/realtime"
import { Elysia, t } from "elysia"
import { nanoid } from "nanoid"
import { authMiddleware } from "./auth"
import { messagesKey, metaKey, gameKey, remainingTTLSeconds } from "./keys"

export const messages = new Elysia({ prefix: "/messages" })
    .use(authMiddleware)
    .post(
        "/",
        async ({ body, auth }) => {
            const { sender, text } = body
            const { roomId } = auth

            const roomExists = await redis.exists(metaKey(roomId))
            if (!roomExists) throw new Error("Room does not exist")

            const message: Message = {
                id: nanoid(),
                sender,
                text,
                timestamp: Date.now(),
                roomId,
            }

            await redis.rpush(messagesKey(roomId), { ...message, token: auth.token })
            await realtime.channel(roomId).emit("chat.message", message)

            const remaining = await remainingTTLSeconds(roomId)
            await redis.expire(messagesKey(roomId), remaining)
            await redis.expire(gameKey(roomId), remaining)
        },
        {
            query: t.Object({ roomId: t.String() }),
            body: t.Object({
                sender: t.String({ maxLength: 100 }),
                text: t.String({ maxLength: 1000 }),
            }),
        }
    )
    .get(
        "/",
        async ({ auth }) => {
            const list = await redis.lrange<Message & { token?: string }>(
                messagesKey(auth.roomId),
                0,
                -1
            )

            return {
                messages: list.map((m) => ({
                    id: m.id,
                    sender: m.sender,
                    text: m.text,
                    timestamp: m.timestamp,
                    roomId: m.roomId,
                })),
            }
        },
        { query: t.Object({ roomId: t.String() }) }
    )
