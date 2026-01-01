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

// FILE: src/hooks/room/usePassInferenceToast.ts

"use client"

import type { Disc, Player } from "@/lib/othello"
import type { MutableRefObject } from "react"
import { useEffect, useRef } from "react"

function sameMove(
    a: { x: number; y: number; player: Player } | null,
    b: { x: number; y: number; player: Player } | null
) {
    if (a === b) return true
    if (!a || !b) return false
    return a.x === b.x && a.y === b.y && a.player === b.player
}

export function usePassInferenceToast(args: {
    stateUpdatedAt: number | null
    status: string | null
    turn: Player | null
    board: Disc[]
    lastMove: { x: number; y: number; player: Player } | null
    me: Player | null
    emitToast: (text: string) => void
    boardsEqual: (a: Disc[], b: Disc[]) => boolean
    recentLocalPassAtRef?: MutableRefObject<number>
}) {
    const { stateUpdatedAt, status, turn, board, lastMove, me, emitToast, boardsEqual, recentLocalPassAtRef } = args

    const prevRef = useRef<{
        status: string | null
        turn: Player | null
        board: Disc[]
        lastMove: { x: number; y: number; player: Player } | null
    } | null>(null)

    useEffect(() => {
        if (!stateUpdatedAt) return

        const prev = prevRef.current
        const next = { status, turn, board, lastMove }

        if (!prev) {
            prevRef.current = next
            return
        }

        if (prev.status === "playing" && next.status === "playing" && prev.turn && next.turn) {
            const boardSame = boardsEqual(prev.board, next.board)
            const turnChanged = prev.turn !== next.turn

            const moveMarkerUnchanged = sameMove(prev.lastMove, next.lastMove)

            if (boardSame && turnChanged && moveMarkerUnchanged) {
                const passer = prev.turn

                const recentLocalMs = recentLocalPassAtRef?.current ?? 0
                if (recentLocalMs > 0 && Date.now() - recentLocalMs < 1200 && me && passer === me) {
                    prevRef.current = next
                    return
                }

                queueMicrotask(() => {
                    if (me && passer === me) emitToast("PASS")
                    else emitToast("OPPONENT PASSED")
                })
            }
        }

        prevRef.current = next
    }, [board, boardsEqual, emitToast, lastMove, me, recentLocalPassAtRef, stateUpdatedAt, status, turn])
}
