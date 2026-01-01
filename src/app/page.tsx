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

// FILE: src/app/page.tsx

"use client"

import { useUsername } from "@/hooks/use-username"
import { client } from "@/lib/client"
import { useMutation } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"

const Page = () => {
    return (
        <Suspense>
            <Lobby />
        </Suspense>
    )
}

export default Page

function Lobby() {
    const { username } = useUsername()
    const router = useRouter()

    const searchParams = useSearchParams()
    const wasDestroyed = searchParams.get("destroyed") === "true"
    const error = searchParams.get("error")

    const [inviteCodeInput, setInviteCodeInput] = useState("")

    const normalizedInvite = useMemo(() => inviteCodeInput.trim().toUpperCase(), [inviteCodeInput])

    const { mutate: createRoom, isPending: creating } = useMutation({
        mutationFn: async () => {
            const res = await client.room.create.post()
            if (res.status === 200) router.push(`/room/${res.data?.roomId}`)
        },
    })

    const { mutate: matchRoom, isPending: matching } = useMutation({
        mutationFn: async () => {
            const res = await client.room.match.post()
            if (res.status === 200) router.push(`/room/${res.data?.roomId}`)
        },
    })

    const { mutate: joinByCode, isPending: joining } = useMutation({
        mutationFn: async () => {
            const res = await client.room.resolve.get({ query: { code: normalizedInvite } })

            const roomId = res.data && "roomId" in res.data ? (res.data.roomId as string) : null
            const err = res.data && "error" in res.data ? (res.data.error as string) : null

            if (!roomId) {
                if (err === "room-full") router.push("/?error=room-full")
                else router.push("/?error=code-invalid")
                return
            }

            router.push(`/room/${roomId}?code=${encodeURIComponent(normalizedInvite)}`)
        },
    })

    const joinDisabled = joining || matching || creating || normalizedInvite.length === 0

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8">
                {wasDestroyed && (
                    <div className="bg-red-950/50 border border-red-900 p-4 text-center">
                        <p className="text-red-500 text-sm font-bold">ROOM DESTROYED</p>
                        <p className="text-zinc-500 text-xs mt-1">All messages were permanently deleted.</p>
                    </div>
                )}

                {error === "room-not-found" && (
                    <div className="bg-red-950/50 border border-red-900 p-4 text-center">
                        <p className="text-red-500 text-sm font-bold">ROOM NOT FOUND</p>
                        <p className="text-zinc-500 text-xs mt-1">This room may have expired or never existed.</p>
                    </div>
                )}

                {error === "room-full" && (
                    <div className="bg-red-950/50 border border-red-900 p-4 text-center">
                        <p className="text-red-500 text-sm font-bold">ROOM FULL</p>
                        <p className="text-zinc-500 text-xs mt-1">This room is at maximum capacity.</p>
                    </div>
                )}

                {error === "invite-code-required" && (
                    <div className="bg-red-950/50 border border-red-900 p-4 text-center">
                        <p className="text-red-500 text-sm font-bold">INVITE CODE REQUIRED</p>
                        <p className="text-zinc-500 text-xs mt-1">
                            This invite room requires a valid code to join.
                        </p>
                    </div>
                )}

                {error === "code-invalid" && (
                    <div className="bg-red-950/50 border border-red-900 p-4 text-center">
                        <p className="text-red-500 text-sm font-bold">INVALID CODE</p>
                        <p className="text-zinc-500 text-xs mt-1">
                            The code may be incorrect, expired, or associated with a destroyed room.
                        </p>
                    </div>
                )}

                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight text-green-500">{">"}private_chat_othello</h1>
                    <p className="text-zinc-500 text-sm">Self-destructing chat + realtime Othello.</p>
                </div>

                <div className="border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-md">
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="flex items-center text-zinc-500">Your Identity</label>

                            <div className="flex items-center gap-3">
                                <div className="flex-1 bg-zinc-950 border border-zinc-800 p-3 text-sm text-zinc-400 font-mono">
                                    {username}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center text-zinc-500">Join with Invite Code</label>

                            <div className="flex flex-col sm:flex-row items-stretch gap-3">
                                <input
                                    value={inviteCodeInput}
                                    onChange={(e) => setInviteCodeInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && normalizedInvite.length > 0) joinByCode()
                                    }}
                                    placeholder="ABC123"
                                    className="w-full sm:flex-1 min-w-0 bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-3 px-4 text-sm font-mono uppercase tracking-widest"
                                />

                                <button
                                    onClick={() => joinByCode()}
                                    disabled={joinDisabled}
                                    className="w-full sm:w-auto shrink-0 bg-zinc-800 text-zinc-300 px-4 py-3 text-sm font-bold hover:text-zinc-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    JOIN
                                </button>
                            </div>

                            <p className="text-zinc-600 text-xs">Enter the 6-character code shared by the host.</p>
                        </div>

                        <button
                            onClick={() => matchRoom()}
                            disabled={matching || creating || joining}
                            className="w-full bg-green-500/90 text-black p-3 text-sm font-bold hover:bg-green-500 transition-colors mt-2 cursor-pointer disabled:opacity-50"
                        >
                            FIND RANDOM OPPONENT
                        </button>

                        <button
                            onClick={() => createRoom()}
                            disabled={matching || creating || joining}
                            className="w-full bg-zinc-100 text-black p-3 text-sm font-bold hover:bg-zinc-50 transition-colors mt-2 cursor-pointer disabled:opacity-50"
                        >
                            CREATE INVITE ROOM
                        </button>
                    </div>
                </div>
            </div>
        </main>
    )
}
