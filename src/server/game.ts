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

// FILE: src/server/game.ts

import { redis } from "@/lib/redis"
import { realtime } from "@/lib/realtime"
import { Elysia, t } from "elysia"
import {
    applyMove,
    computeWinner,
    countDiscs,
    createInitialBoard,
    getLegalMoves,
    hasAnyLegalMove,
    isBoardFull,
    opponent,
    type Disc,
    type Player,
} from "@/lib/othello"
import { authMiddleware } from "./auth"
import { gameKey, metaKey, remainingTTLSeconds } from "./keys"

type GameStatus = "waiting" | "playing" | "finished"

type GameState = {
    roomId: string
    board: Disc[]
    status: GameStatus
    turn: Player | null
    passStreak: 0 | 1 | 2
    winner: 0 | Player | null
    blackToken: string | null
    whiteToken: string | null
    lastMove: { x: number; y: number; player: Player } | null
    updatedAt: number
}

function publicGameState(state: GameState) {
    const { black, white } = countDiscs(state.board)
    return {
        roomId: state.roomId,
        board: state.board,
        status: state.status,
        turn: state.turn,
        passStreak: state.passStreak,
        winner: state.winner,
        blackCount: black,
        whiteCount: white,
        lastMove: state.lastMove,
        updatedAt: state.updatedAt,
    }
}

function globalCrypto(): Crypto | undefined {
    const g = globalThis as unknown as { crypto?: Crypto }
    return g.crypto
}

function coinFlip(): boolean {
    const c = globalCrypto()
    if (c?.getRandomValues) {
        const a = new Uint32Array(1)
        c.getRandomValues(a)
        return (a[0] & 1) === 1
    }
    return Math.random() < 0.5
}

function assignSingleTokenRandom(state: GameState, token: string) {
    if (coinFlip()) state.blackToken = token
    else state.whiteToken = token
}

function fillSlotsFromConnected(state: GameState, connected: string[]) {
    const tokens = connected.slice(0, 2)

    for (const token of tokens) {
        if (token === state.blackToken || token === state.whiteToken) continue
        if (!state.blackToken) state.blackToken = token
        else if (!state.whiteToken) state.whiteToken = token
    }

    if (!state.blackToken && !state.whiteToken && tokens[0]) {
        assignSingleTokenRandom(state, tokens[0])
    }
}

async function ensureGame(roomId: string, connected: string[]) {
    const key = gameKey(roomId)
    let state = await redis.get<GameState>(key)

    let dirty = false
    let startedNow = false

    if (!state) {
        const now = Date.now()
        const board = createInitialBoard()

        if (connected.length >= 2) {
            const a = connected[0]!
            const b = connected[1]!
            const aIsBlack = coinFlip()

            state = {
                roomId,
                board,
                status: "playing",
                turn: 1,
                passStreak: 0,
                winner: null,
                blackToken: aIsBlack ? a : b,
                whiteToken: aIsBlack ? b : a,
                lastMove: null,
                updatedAt: now,
            }

            dirty = true
            startedNow = true
        } else {
            const only = connected[0] ?? null

            state = {
                roomId,
                board,
                status: "waiting",
                turn: null,
                passStreak: 0,
                winner: null,
                blackToken: null,
                whiteToken: null,
                lastMove: null,
                updatedAt: now,
            }

            if (only) assignSingleTokenRandom(state, only)
            dirty = true
        }
    } else {
        fillSlotsFromConnected(state, connected)

        if (connected.length >= 2 && state.status === "waiting") {
            state.status = "playing"
            state.turn = 1
            state.passStreak = 0
            state.winner = null
            state.updatedAt = Date.now()
            dirty = true
            startedNow = true
        }
    }

    if (dirty) {
        await redis.set(key, state)
        await redis.expire(key, await remainingTTLSeconds(roomId))
    }

    if (startedNow) {
        await realtime.channel(roomId).emit("game.state", publicGameState(state))
    }

    return state
}

function mePlayerFromState(state: GameState, token: string): Player | null {
    if (state.blackToken && token === state.blackToken) return 1
    if (state.whiteToken && token === state.whiteToken) return 2
    return null
}

function finishIfNeeded(state: GameState) {
    const bHas = hasAnyLegalMove(state.board, 1)
    const wHas = hasAnyLegalMove(state.board, 2)

    if (!bHas && !wHas) {
        state.status = "finished"
        state.turn = null
        state.winner = computeWinner(state.board)
        return
    }

    if (isBoardFull(state.board)) {
        state.status = "finished"
        state.turn = null
        state.winner = computeWinner(state.board)
    }
}

export const game = new Elysia({ prefix: "/game" })
    .use(authMiddleware)
    .get(
        "/",
        async ({ auth }) => {
            const roomExists = await redis.exists(metaKey(auth.roomId))
            if (!roomExists) throw new Error("Room does not exist")

            const state = await ensureGame(auth.roomId, auth.connected)
            const me = mePlayerFromState(state, auth.token)

            return {
                me,
                state: publicGameState(state),
            }
        },
        { query: t.Object({ roomId: t.String() }) }
    )
    .post(
        "/move",
        async ({ auth, body }) => {
            const roomExists = await redis.exists(metaKey(auth.roomId))
            if (!roomExists) throw new Error("Room does not exist")

            const state = await ensureGame(auth.roomId, auth.connected)
            if (state.status !== "playing" || !state.turn) throw new Error("Game not started")

            const me = mePlayerFromState(state, auth.token)
            if (!me) throw new Error("Not a player")
            if (state.turn !== me) throw new Error("Not your turn")

            const { x, y } = body
            const legal = getLegalMoves(state.board, me)
            if (!legal.some((m) => m.x === x && m.y === y)) throw new Error("Illegal move")

            state.board = applyMove(state.board, x, y, me)
            state.lastMove = { x, y, player: me }
            state.passStreak = 0

            state.turn = opponent(me)
            state.updatedAt = Date.now()

            finishIfNeeded(state)

            await redis.set(gameKey(auth.roomId), state)
            await redis.expire(gameKey(auth.roomId), await remainingTTLSeconds(auth.roomId))

            await realtime.channel(auth.roomId).emit("game.state", publicGameState(state))
            return { ok: true }
        },
        {
            query: t.Object({ roomId: t.String() }),
            body: t.Object({
                x: t.Number({ minimum: 0, maximum: 7 }),
                y: t.Number({ minimum: 0, maximum: 7 }),
            }),
        }
    )
    .post(
        "/pass",
        async ({ auth }) => {
            const roomExists = await redis.exists(metaKey(auth.roomId))
            if (!roomExists) throw new Error("Room does not exist")

            const state = await ensureGame(auth.roomId, auth.connected)
            if (state.status !== "playing" || !state.turn) throw new Error("Game not started")

            const me = mePlayerFromState(state, auth.token)
            if (!me) throw new Error("Not a player")
            if (state.turn !== me) throw new Error("Not your turn")

            const moves = getLegalMoves(state.board, me)
            if (moves.length > 0) throw new Error("Pass not allowed")

            state.turn = opponent(me)
            state.passStreak = ((state.passStreak + 1) as 0 | 1 | 2)
            state.updatedAt = Date.now()

            if (state.passStreak >= 2) {
                state.status = "finished"
                state.turn = null
                state.winner = computeWinner(state.board)
            } else {
                finishIfNeeded(state)
            }

            await redis.set(gameKey(auth.roomId), state)
            await redis.expire(gameKey(auth.roomId), await remainingTTLSeconds(auth.roomId))

            await realtime.channel(auth.roomId).emit("game.state", publicGameState(state))
            return { ok: true }
        },
        { query: t.Object({ roomId: t.String() }) }
    )
