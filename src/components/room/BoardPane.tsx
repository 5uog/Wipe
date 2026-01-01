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

// FILE: src/components/room/BoardPane.tsx

"use client"

import type { GameStatePayload } from "@/lib/realtime"
import type { Disc, Player } from "@/lib/othello"
import styles from "./room.module.css"
import { discClass, playerLabel } from "@/lib/room/room-utils"

export function BoardPane(props: {
    statusText: string
    me: Player | null
    state: GameStatePayload | null
    mode: "invite" | "match" | null
    inviteCode: string | null
    renderBoard: Disc[]
    flipping: Set<number>
    legalSet: Set<string>
    moving: boolean
    passing: boolean
    canPass: boolean
    onPass: () => void
    onMove: (x: number, y: number) => void
    overlayText: string | null
    stickyOverlayActive: boolean
    onOpenChat: () => void
}) {
    const {
        statusText,
        me,
        state,
        mode,
        inviteCode,
        renderBoard,
        flipping,
        legalSet,
        moving,
        passing,
        canPass,
        onPass,
        onMove,
        overlayText,
        stickyOverlayActive,
        onOpenChat,
    } = props

    return (
        <section className="h-full min-h-0 flex flex-col bg-zinc-900/20">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/30">
                <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-widest">Othello</div>
                        <div className="text-sm font-bold text-zinc-200">{statusText}</div>
                        <div className="text-xs text-zinc-500">
                            YOU: <span className="text-zinc-200 font-bold">{playerLabel(me)}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="text-right space-y-1 mr-2">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest">Score</div>
                            <div className="text-sm font-bold text-zinc-200">
                                B {state?.blackCount ?? 0} / W {state?.whiteCount ?? 0}
                            </div>
                        </div>

                        <button
                            onClick={onOpenChat}
                            className={`${styles.mobileChatButtonOnly} text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded text-zinc-200 font-bold`}
                            aria-label="Open chat"
                        >
                            CHAT
                        </button>

                        <button
                            onClick={onPass}
                            disabled={!canPass || passing || moving}
                            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded text-zinc-300 font-bold disabled:opacity-50"
                        >
                            PASS
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 p-4 flex items-center justify-center overflow-hidden">
                <div className="w-full flex items-center justify-center">
                    <div className={styles.boardFrame}>
                        <div className="relative">
                            <div className="grid grid-cols-8 gap-1 bg-zinc-900 p-2 border border-zinc-800">
                                {Array.from({ length: 64 }).map((_, i) => {
                                    const x = i % 8
                                    const y = Math.floor(i / 8)

                                    const v = renderBoard[i]

                                    const hint = legalSet.has(`${x},${y}`)

                                    const clickable = hint && !moving && !passing

                                    const isFlipping = flipping.has(i)

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                if (!clickable) return
                                                onMove(x, y)
                                            }}
                                            className={[
                                                "aspect-square relative flex items-center justify-center",
                                                "bg-green-900/40 border border-green-900/50",
                                                clickable ? "hover:bg-green-900/70" : "",
                                            ].join(" ")}
                                            disabled={!clickable}
                                            aria-label={`cell-${x}-${y}`}
                                        >
                                            {v !== 0 && (
                                                <div className="w-4/5 h-4/5 disc-3d">
                                                    <div
                                                        className={[
                                                            "w-full h-full rounded-full disc-face",
                                                            discClass(v),
                                                            isFlipping ? "disc-flip" : "",
                                                        ].join(" ")}
                                                    />
                                                </div>
                                            )}

                                            {v === 0 && hint && <div className="w-2 h-2 rounded-full bg-green-400/80" />}
                                        </button>
                                    )
                                })}
                            </div>

                            {overlayText && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div
                                        className={[
                                            "px-6 py-4 border border-zinc-700/60",
                                            stickyOverlayActive ? "bg-black/70" : "bg-black/45",
                                            "backdrop-blur-sm shadow-lg",
                                        ].join(" ")}
                                    >
                                        <div className="text-center">
                                            <div className="text-3xl sm:text-4xl font-extrabold tracking-widest text-zinc-100">
                                                {overlayText}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {state?.status === "waiting" && mode === "invite" && inviteCode && (
                            <div className="mt-3 text-xs text-zinc-500">
                                Opponent not joined yet. Share this invite code:{" "}
                                <span className="text-blue-400 font-bold tracking-widest">{inviteCode}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    )
}
