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

// FILE: src/server/ai.ts

import {
    applyMove,
    countDiscs,
    getLegalMoves,
    hasAnyLegalMove,
    opponent,
    type Disc,
    type Move,
    type Player,
} from "@/lib/othello"

type ScoredMove = { move: Move; score: number }

const CORNERS = new Set<number>([0, 7, 56, 63])
const X_SQUARES = new Set<number>([9, 14, 49, 54])
const C_SQUARES = new Set<number>([1, 6, 8, 15, 48, 55, 57, 62])

function evalBoard(board: Disc[], me: Player): number {
    const opp = opponent(me)
    const { black, white } = countDiscs(board)

    const discDiff = me === 1 ? black - white : white - black

    const myMoves = getLegalMoves(board, me).length
    const oppMoves = getLegalMoves(board, opp).length
    const mobility = myMoves - oppMoves

    let cornerScore = 0
    for (const i of CORNERS) {
        if (board[i] === me) cornerScore += 1
        else if (board[i] === opp) cornerScore -= 1
    }

    let danger = 0
    for (const i of X_SQUARES) {
        if (board[i] === me) danger -= 1
        else if (board[i] === opp) danger += 1
    }
    for (const i of C_SQUARES) {
        if (board[i] === me) danger -= 1
        else if (board[i] === opp) danger += 1
    }

    const phase = black + white
    const wDisc = phase < 44 ? 1 : 3
    const wMob = phase < 44 ? 8 : 3
    const wCorner = 60
    const wDanger = 12

    return wCorner * cornerScore + wMob * mobility + wDisc * discDiff + wDanger * danger
}

function minimax(
    board: Disc[],
    toMove: Player,
    me: Player,
    depth: number,
    alpha: number,
    beta: number
): number {
    const opp = opponent(toMove)

    const meHas = hasAnyLegalMove(board, me)
    const oppHas = hasAnyLegalMove(board, opponent(me))
    if (!meHas && !oppHas) return evalBoard(board, me)

    if (depth <= 0) return evalBoard(board, me)

    const moves = getLegalMoves(board, toMove)
    if (moves.length === 0) return minimax(board, opp, me, depth - 1, alpha, beta)

    const maximizing = toMove === me
    if (maximizing) {
        let best = -Infinity
        for (const m of moves) {
            const next = applyMove(board, m.x, m.y, toMove)
            const v = minimax(next, opp, me, depth - 1, alpha, beta)
            if (v > best) best = v
            if (v > alpha) alpha = v
            if (beta <= alpha) break
        }
        return best
    } else {
        let best = Infinity
        for (const m of moves) {
            const next = applyMove(board, m.x, m.y, toMove)
            const v = minimax(next, opp, me, depth - 1, alpha, beta)
            if (v < best) best = v
            if (v < beta) beta = v
            if (beta <= alpha) break
        }
        return best
    }
}

function pickRandom(moves: Move[]): Move {
    const g = globalThis as unknown as { crypto?: Crypto }
    const c = g.crypto
    if (c?.getRandomValues) {
        const a = new Uint32Array(1)
        c.getRandomValues(a)
        return moves[a[0] % moves.length]!
    }
    return moves[Math.floor(Math.random() * moves.length)]!
}

export function chooseAiMove(board: Disc[], ai: Player, level: number): Move | null {
    const moves = getLegalMoves(board, ai)
    if (moves.length === 0) return null

    const lv = Math.max(0, Math.min(3, Math.floor(level)))
    if (lv === 0) return pickRandom(moves)

    const depthByLevel = [0, 1, 3, 5] as const
    const depth = depthByLevel[lv]

    let best: ScoredMove | null = null
    for (const m of moves) {
        const next = applyMove(board, m.x, m.y, ai)
        const s = minimax(next, opponent(ai), ai, depth - 1, -Infinity, Infinity)
        if (!best || s > best.score) best = { move: m, score: s }
    }

    return best?.move ?? pickRandom(moves)
}
