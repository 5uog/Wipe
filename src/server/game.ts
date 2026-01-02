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
import { chooseAiMove } from "./ai"
import { authMiddleware, type RoomMeta } from "./auth"
import { AI_TOKEN, gameKey, metaKey, remainingTTLSeconds } from "./keys"

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

const AI_MOVE_DELAY_MS = 850
const aiTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleAi(roomId: string, delayMs = AI_MOVE_DELAY_MS) {
    const prev = aiTimers.get(roomId)
    if (prev) clearTimeout(prev)

    const t = setTimeout(() => {
        aiTimers.delete(roomId)
        void aiStepLoop(roomId)
    }, Math.max(0, Math.floor(delayMs)))

    aiTimers.set(roomId, t)
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

async function resolveHumanColor(roomId: string, meta: RoomMeta): Promise<"black" | "white"> {
    const resolved = meta.humanPlaysResolved
    if (resolved === "black" || resolved === "white") return resolved

    const pref = meta.humanPlays
    const color =
        pref === "black" ? "black" : pref === "white" ? "white" : coinFlip() ? "black" : "white"

    await redis.hset(metaKey(roomId), { humanPlaysResolved: color })
    return color
}

async function assignAiOpponent(roomId: string, state: GameState, humanToken: string, meta: RoomMeta | null) {
    const m = meta ?? {}
    const humanColor = await resolveHumanColor(roomId, m as RoomMeta)

    if (humanColor === "black") {
        state.blackToken = humanToken
        state.whiteToken = AI_TOKEN
    } else {
        state.blackToken = AI_TOKEN
        state.whiteToken = humanToken
    }
}

async function ensureGame(roomId: string, players: string[], meta: RoomMeta | null) {
    const key = gameKey(roomId)
    let state = await redis.get<GameState>(key)

    let dirty = false
    let startedNow = false

    const pve = !!meta?.pve

    if (!state) {
        const now = Date.now()
        const base = createInitialBoard()
        const handicap = sanitizeHandicap(meta)
        const board = applyHandicap(base, handicap)

        if (pve) {
            const only = players[0] ?? null
            state = {
                roomId,
                board,
                status: only ? "playing" : "waiting",
                turn: only ? 1 : null,
                passStreak: 0,
                winner: null,
                blackToken: null,
                whiteToken: null,
                lastMove: null,
                updatedAt: now,
            }

            if (only) {
                await assignAiOpponent(roomId, state, only, meta)
                dirty = true
                startedNow = true
            } else {
                dirty = true
            }
        } else {
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

                dirty = true
            }
        }
    } else {
        fillSlotsFromPlayers(state, players)

        if (pve) {
            const only = players[0] ?? null
            if (only && state.status === "waiting") {
                state.status = "playing"
                state.turn = 1
                state.passStreak = 0
                state.winner = null
                await assignAiOpponent(roomId, state, only, meta)
                state.updatedAt = Date.now()
                dirty = true
                startedNow = true
            }
        } else {
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

function isAiTurn(state: GameState, meta: RoomMeta | null) {
    if (!meta?.pve) return false
    if (state.status !== "playing" || !state.turn) return false
    if (state.turn === 1 && state.blackToken === AI_TOKEN) return true
    if (state.turn === 2 && state.whiteToken === AI_TOKEN) return true
    return false
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

async function persistState(roomId: string, state: GameState) {
    await redis.set(gameKey(roomId), state)
    const rem = await remainingTTLSeconds(roomId)
    if (rem === null) await redis.persist(gameKey(roomId))
    else await redis.expire(gameKey(roomId), rem)
}

function aiLevelToInt(level: unknown): 1 | 2 | 3 {
    return level === "easy" ? 1 : level === "hard" ? 3 : 2
}

async function aiStepLoop(roomId: string) {
    const meta = await redis.hgetall<RoomMeta>(metaKey(roomId))
    if (!meta?.pve) return

    const lockKey = `lock:ai:${roomId}`
    const lockOk = await redis.set(lockKey, "1", { nx: true, px: 2500 })
    if (!lockOk) return

    try {
        const state = await redis.get<GameState>(gameKey(roomId))
        if (!state) return

        const lv = aiLevelToInt(meta.aiLevel)

        for (let guard = 0; guard < 6; guard++) {
            if (!isAiTurn(state, meta)) break
            const aiPlayer = state.turn as Player

            const moves = getLegalMoves(state.board, aiPlayer)
            if (moves.length === 0) {
                state.turn = opponent(aiPlayer)
                state.passStreak = ((state.passStreak + 1) as 0 | 1 | 2)
                state.updatedAt = Date.now()

                if (state.passStreak >= 2) {
                    state.status = "finished"
                    state.turn = null
                    state.winner = computeWinner(state.board)
                } else {
                    finishIfNeeded(state)
                }

                await persistState(roomId, state)
                await realtime.channel(roomId).emit("game.state", publicGameState(state))
                continue
            }

            const chosen = chooseAiMove(state.board, aiPlayer, lv)
            if (!chosen) break

            state.board = applyMove(state.board, chosen.x, chosen.y, aiPlayer)
            state.lastMove = { x: chosen.x, y: chosen.y, player: aiPlayer }
            state.passStreak = 0

            state.turn = opponent(aiPlayer)
            state.updatedAt = Date.now()

            finishIfNeeded(state)

            await persistState(roomId, state)
            await realtime.channel(roomId).emit("game.state", publicGameState(state))
        }
    } finally {
        await redis.del(lockKey)
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

            if (meta?.pve) scheduleAi(auth.roomId, AI_MOVE_DELAY_MS)

            return { me, state: publicGameState(state) }
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

            await persistState(auth.roomId, state)
            await realtime.channel(auth.roomId).emit("game.state", publicGameState(state))

            if (meta?.pve) scheduleAi(auth.roomId, AI_MOVE_DELAY_MS)

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

            await persistState(auth.roomId, state)
            await realtime.channel(auth.roomId).emit("game.state", publicGameState(state))

            if (meta?.pve) scheduleAi(auth.roomId, AI_MOVE_DELAY_MS)

            return { ok: true }
        },
        { query: t.Object({ roomId: t.String() }) }
    )
