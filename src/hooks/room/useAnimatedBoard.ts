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

// FILE: src/hooks/room/useAnimatedBoard.ts

"use client"

import { idx, type Disc, type Player } from "@/lib/othello"
import { useEffect, useRef, useState } from "react"

export function useAnimatedBoard(args: {
    canonicalBoard: Disc[]
    lastMove: { x: number; y: number; player: Player } | null
    stateUpdatedAt: number | null
    me: Player | null
    playPlace: () => void
    playFlip: () => void
}) {
    const { canonicalBoard, lastMove, stateUpdatedAt, me, playPlace, playFlip } = args

    const [renderBoard, setRenderBoard] = useState<Disc[]>(() => Array(64).fill(0))
    const [flipping, setFlipping] = useState<Set<number>>(() => new Set())

    const prevCanonicalBoardRef = useRef<Disc[] | null>(null)
    const prevMoveKeyRef = useRef<string>("")

    const timersRef = useRef<number[]>([])
    const clearTimers = () => {
        for (const id of timersRef.current) window.clearTimeout(id)
        timersRef.current = []
    }
    const addTimer = (id: number) => {
        timersRef.current.push(id)
    }

    useEffect(() => {
        if (!stateUpdatedAt) return

        let raf = 0

        raf = window.requestAnimationFrame(() => {
            const nextBoard = canonicalBoard
            const nextMoveKey = lastMove ? `${lastMove.player}:${lastMove.x},${lastMove.y}` : ""

            const prev = prevCanonicalBoardRef.current
            if (!prev) {
                clearTimers()
                setFlipping(new Set())
                setRenderBoard(nextBoard.slice())
                prevCanonicalBoardRef.current = nextBoard.slice()
                prevMoveKeyRef.current = nextMoveKey
                return
            }

            const isNewMove = !!lastMove && nextMoveKey !== prevMoveKeyRef.current

            clearTimers()
            setFlipping(new Set())

            if (!isNewMove) {
                setRenderBoard(nextBoard.slice())
                prevCanonicalBoardRef.current = nextBoard.slice()
                prevMoveKeyRef.current = nextMoveKey
                return
            }

            const placedIndex = idx(lastMove!.x, lastMove!.y)

            const changed: number[] = []
            for (let i = 0; i < 64; i++) {
                if (prev[i] !== nextBoard[i]) changed.push(i)
            }

            const flipIndices = changed.filter((i) => i !== placedIndex)

            setRenderBoard(prev.slice())

            if (changed.includes(placedIndex)) {
                setRenderBoard((b) => {
                    const n = b.slice()
                    n[placedIndex] = nextBoard[placedIndex]
                    return n
                })
            }

            if (me && lastMove!.player === me) playPlace()

            const flipDurationMs = 180
            const firstFlipDelayMs = 220
            const flipStepMs = 90

            flipIndices.forEach((cellIndex, k) => {
                const startDelay = firstFlipDelayMs + k * flipStepMs

                addTimer(
                    window.setTimeout(() => {
                        setFlipping((s) => {
                            const n = new Set(s)
                            n.add(cellIndex)
                            return n
                        })

                        playFlip()

                        addTimer(
                            window.setTimeout(() => {
                                setRenderBoard((b) => {
                                    const n = b.slice()
                                    n[cellIndex] = nextBoard[cellIndex]
                                    return n
                                })
                            }, Math.floor(flipDurationMs / 2))
                        )

                        addTimer(
                            window.setTimeout(() => {
                                setFlipping((s) => {
                                    const n = new Set(s)
                                    n.delete(cellIndex)
                                    return n
                                })
                            }, flipDurationMs)
                        )
                    }, startDelay)
                )
            })

            const finalizeDelay =
                flipIndices.length === 0
                    ? firstFlipDelayMs + 10
                    : firstFlipDelayMs + (flipIndices.length - 1) * flipStepMs + flipDurationMs + 20

            addTimer(
                window.setTimeout(() => {
                    setRenderBoard(nextBoard.slice())
                    setFlipping(new Set())
                }, finalizeDelay)
            )

            prevCanonicalBoardRef.current = nextBoard.slice()
            prevMoveKeyRef.current = nextMoveKey
        })

        return () => {
            if (raf) window.cancelAnimationFrame(raf)
            clearTimers()
        }
    }, [canonicalBoard, lastMove, me, playFlip, playPlace, stateUpdatedAt])

    return { renderBoard, flipping }
}
