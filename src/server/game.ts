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
import { authMiddleware, type RoomMeta } from "./auth"
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

function assignSingleToken(state: GameState, token: string, hostColor: "random" | "black" | "white") {
    if (hostColor === "black") state.blackToken = token
    else if (hostColor === "white") state.whiteToken = token
    else {
        if (coinFlip()) state.blackToken = token
        else state.whiteToken = token
    }
}

function sanitizeHandicap(meta: RoomMeta | null | undefined) {
    const b = Array.isArray(meta?.handicap?.black) ? meta!.handicap!.black! : []
    const w = Array.isArray(meta?.handicap?.white) ? meta!.handicap!.white! : []

    const black = new Set<number>()
    const white = new Set<number>()

    for (const v of b) {
        const n = typeof v === "number" ? v : Number(v)
        if (!Number.isFinite(n)) continue
        const i = Math.floor(n)
        if (i < 0 || i > 63) continue
        black.add(i)
    }

    for (const v of w) {
        const n = typeof v === "number" ? v : Number(v)
        if (!Number.isFinite(n)) continue
        const i = Math.floor(n)
        if (i < 0 || i > 63) continue
        if (black.has(i)) continue
        white.add(i)
    }

    return { black: [...black], white: [...white] }
}

function applyHandicap(board: Disc[], handicap: { black: number[]; white: number[] }) {
    const next = board.slice()
    for (const i of handicap.black) {
        if (i < 0 || i > 63) continue
        if (next[i] === 0) next[i] = 1
    }
    for (const i of handicap.white) {
        if (i < 0 || i > 63) continue
        if (next[i] === 0) next[i] = 2
    }
    return next
}

function fillSlotsFromPlayers(state: GameState, players: string[]) {
    const tokens = players.slice(0, 2)
    for (const token of tokens) {
        if (token === state.blackToken || token === state.whiteToken) continue
        if (!state.blackToken) state.blackToken = token
        else if (!state.whiteToken) state.whiteToken = token
    }
}

async function ensureGame(roomId: string, players: string[], meta: RoomMeta | null) {
    const key = gameKey(roomId)
    let state = await redis.get<GameState>(key)

    let dirty = false
    let startedNow = false

    if (!state) {
        const now = Date.now()
        const base = createInitialBoard()
        const handicap = sanitizeHandicap(meta)
        const board = applyHandicap(base, handicap)

        if (players.length >= 2) {
            const a = players[0]!
            const b = players[1]!
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
            const only = players[0] ?? null

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

            if (only) {
                const hostColor =
                    meta?.hostColor === "black" || meta?.hostColor === "white" || meta?.hostColor === "random"
                        ? meta.hostColor
                        : "random"
                assignSingleToken(state, only, hostColor)
            }

            dirty = true
        }
    } else {
        fillSlotsFromPlayers(state, players)

        if (players.length >= 2 && state.status === "waiting") {
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
        const rem = await remainingTTLSeconds(roomId)
        if (rem === null) await redis.persist(key)
        else await redis.expire(key, rem)
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

            const meta = auth.meta ?? (await redis.hgetall<RoomMeta>(metaKey(auth.roomId)))
            const state = await ensureGame(auth.roomId, auth.players, meta)
            const me = auth.role === "player" ? mePlayerFromState(state, auth.token) : null

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

            if (auth.role !== "player") throw new Error("Not a player")

            const meta = auth.meta ?? (await redis.hgetall<RoomMeta>(metaKey(auth.roomId)))
            const state = await ensureGame(auth.roomId, auth.players, meta)
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
            const rem = await remainingTTLSeconds(auth.roomId)
            if (rem === null) await redis.persist(gameKey(auth.roomId))
            else await redis.expire(gameKey(auth.roomId), rem)

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

            if (auth.role !== "player") throw new Error("Not a player")

            const meta = auth.meta ?? (await redis.hgetall<RoomMeta>(metaKey(auth.roomId)))
            const state = await ensureGame(auth.roomId, auth.players, meta)
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
            const rem = await remainingTTLSeconds(auth.roomId)
            if (rem === null) await redis.persist(gameKey(auth.roomId))
            else await redis.expire(gameKey(auth.roomId), rem)

            await realtime.channel(auth.roomId).emit("game.state", publicGameState(state))
            return { ok: true }
        },
        { query: t.Object({ roomId: t.String() }) }
    )
