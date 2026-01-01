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

// FILE: src/components/room/RoomHeader.tsx

"use client"

import { formatTimeRemaining } from "@/lib/room/roomUtils"

export function RoomHeader(props: {
    roomId: string
    mode: "invite" | "match" | null
    inviteCode: string | null
    copyStatus: string
    copyCodeStatus: string
    onCopyLink: () => void
    onCopyInviteCode: () => void
    timeRemaining: number | null
    destroying: boolean
    onDestroy: () => void
}) {
    const {
        roomId,
        mode,
        inviteCode,
        copyStatus,
        copyCodeStatus,
        onCopyLink,
        onCopyInviteCode,
        timeRemaining,
        destroying,
        onDestroy,
    } = props

    const shortId = roomId.length > 10 ? roomId.slice(0, 10) + "..." : roomId

    const urgent = timeRemaining !== null && timeRemaining < 60

    return (
        <header className="border-b border-zinc-800 p-4 flex items-center justify-between bg-zinc-900/30">
            <div className="flex items-center gap-4 min-w-0">
                <div className="flex flex-col min-w-0">
                    <span className="text-xs text-zinc-500 uppercase tracking-widest">Room ID</span>
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-green-500 truncate">{shortId}</span>

                        <button
                            onClick={onCopyLink}
                            className="text-[10px] bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors whitespace-nowrap"
                        >
                            {copyStatus}
                        </button>
                    </div>
                </div>

                {mode === "invite" && inviteCode && (
                    <>
                        <div className="h-8 w-px bg-zinc-800 hidden sm:block" />
                        <div className="hidden sm:flex flex-col">
                            <span className="text-xs text-zinc-500 uppercase tracking-widest">Invite Code</span>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-blue-400 tracking-widest">{inviteCode}</span>
                                <button
                                    onClick={onCopyInviteCode}
                                    className="text-[10px] bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                                >
                                    {copyCodeStatus}
                                </button>
                            </div>
                        </div>
                    </>
                )}

                <div className="h-8 w-px bg-zinc-800 hidden sm:block" />

                <div className="flex flex-col">
                    <span className="text-xs text-zinc-500 uppercase tracking-widest">Self-Destruct</span>

                    <span
                        className={`text-sm font-bold flex items-center gap-2 ${
                            urgent ? "text-red-500" : "text-amber-500"
                        }`}
                    >
                        {timeRemaining !== null ? formatTimeRemaining(timeRemaining) : "--:--"}
                    </span>
                </div>
            </div>

            <button
                onClick={onDestroy}
                disabled={destroying}
                className="text-xs bg-zinc-800 hover:bg-red-600 px-3 py-1.5 rounded text-zinc-400 hover:text-white font-bold transition-all group flex items-center gap-2 disabled:opacity-50"
            >
                <span className="group-hover:animate-pulse">💣</span>
                DESTROY NOW
            </button>
        </header>
    )
}
