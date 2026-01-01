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

// src/lib/othello.ts

export type Disc = 0 | 1 | 2
export type Player = 1 | 2

export type Move = { x: number; y: number }

const SIZE = 8
const DIRS: ReadonlyArray<readonly [number, number]> = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
] as const

export const idx = (x: number, y: number) => y * SIZE + x
export const inBounds = (x: number, y: number) => x >= 0 && x < SIZE && y >= 0 && y < SIZE
export const opponent = (p: Player): Player => (p === 1 ? 2 : 1)

export function createInitialBoard(): Disc[] {
    const b: Disc[] = Array(64).fill(0)
    // Standard Othello start:
    // (3,3)=W, (4,4)=W, (3,4)=B, (4,3)=B
    b[idx(3, 3)] = 2
    b[idx(4, 4)] = 2
    b[idx(3, 4)] = 1
    b[idx(4, 3)] = 1
    return b
}

export function countDiscs(board: Disc[]) {
    let black = 0
    let white = 0
    for (const d of board) {
        if (d === 1) black++
        else if (d === 2) white++
    }
    return { black, white }
}

export function getFlips(board: Disc[], x: number, y: number, player: Player): number[] {
    if (!inBounds(x, y)) return []
    const i = idx(x, y)
    if (board[i] !== 0) return []

    const opp = opponent(player)
    const flips: number[] = []

    for (const [dx, dy] of DIRS) {
        let cx = x + dx
        let cy = y + dy
        const line: number[] = []

        while (inBounds(cx, cy)) {
            const ci = idx(cx, cy)
            const v = board[ci]
            if (v === opp) {
                line.push(ci)
                cx += dx
                cy += dy
                continue
            }
            if (v === player) {
                if (line.length > 0) flips.push(...line)
                break
            }
            break
        }
    }

    return flips
}

export function isLegalMove(board: Disc[], x: number, y: number, player: Player): boolean {
    return getFlips(board, x, y, player).length > 0
}

export function getLegalMoves(board: Disc[], player: Player): Move[] {
    const moves: Move[] = []
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (isLegalMove(board, x, y, player)) moves.push({ x, y })
        }
    }
    return moves
}

export function hasAnyLegalMove(board: Disc[], player: Player): boolean {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (isLegalMove(board, x, y, player)) return true
        }
    }
    return false
}

export function applyMove(board: Disc[], x: number, y: number, player: Player): Disc[] {
    const flips = getFlips(board, x, y, player)
    if (flips.length === 0) return board

    const next = board.slice()
    next[idx(x, y)] = player
    for (const f of flips) next[f] = player
    return next
}

export function isBoardFull(board: Disc[]): boolean {
    for (const d of board) if (d === 0) return false
    return true
}

export function computeWinner(board: Disc[]) {
    const { black, white } = countDiscs(board)
    if (black > white) return 1 as const
    if (white > black) return 2 as const
    return 0 as const
}
