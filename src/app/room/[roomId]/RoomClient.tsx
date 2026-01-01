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

// FILE: src/app/room/[roomId]/RoomClient.tsx

"use client"

import { ChatDrawer } from "@/components/ChatDrawer"
import { ResizableColumns } from "@/components/ResizableColumns"
import { BoardPane } from "@/components/room/BoardPane"
import { ChatPane } from "@/components/room/ChatPane"
import { RoomHeader } from "@/components/room/RoomHeader"
import styles from "@/components/room/room.module.css"
import { useUsername } from "@/hooks/useUsername"
import { useAnimatedBoard } from "@/hooks/room/useAnimatedBoard"
import { usePassInferenceToast } from "@/hooks/room/usePassInferenceToast"
import { client } from "@/lib/client"
import type { GameStatePayload } from "@/lib/realtime"
import { useRealtime } from "@/lib/realtimeClient"
import { useSfx } from "@/lib/sfx"
import { getLegalMoves, type Disc, type Player } from "@/lib/othello"
import { boardsEqual, playerLabel, winnerOverlayText } from "@/lib/room/roomUtils"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type Toast = { text: string; untilMs: number }

export default function RoomClient({ roomId }: { roomId: string }) {
    const router = useRouter()
    const { username } = useUsername()

    const [chatOpen, setChatOpen] = useState(false)
    const [input, setInput] = useState("")
    const inputRef = useRef<HTMLInputElement | null>(null)

    const { unlock, playPlace, playFlip } = useSfx()

    const [copyStatus, setCopyStatus] = useState("COPY LINK")
    const [copyCodeStatus, setCopyCodeStatus] = useState("COPY CODE")

    const [nowMs, setNowMs] = useState(() => Date.now())
    useEffect(() => {
        const id = window.setInterval(() => setNowMs(Date.now()), 1000)
        return () => window.clearInterval(id)
    }, [])

    const [toast, setToast] = useState<Toast | null>(null)
    const toastRef = useRef<Toast | null>(null)
    useEffect(() => {
        toastRef.current = toast
    }, [toast])

    const pendingToastRef = useRef<{ text: string; ms: number } | null>(null)
    const pendingTimerRef = useRef<number | null>(null)
    useEffect(() => {
        return () => {
            if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current)
        }
    }, [])

    const emitToast = useCallback((text: string, ms: number = 1400) => {
        const now = Date.now()
        const cur = toastRef.current

        if (cur && cur.untilMs > now) {
            pendingToastRef.current = { text, ms }
            if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current)

            const delay = Math.max(0, cur.untilMs - now + 30)
            pendingTimerRef.current = window.setTimeout(() => {
                const p = pendingToastRef.current
                pendingToastRef.current = null
                if (!p) return
                setToast({ text: p.text, untilMs: Date.now() + p.ms })
            }, delay)

            return
        }

        pendingToastRef.current = null
        if (pendingTimerRef.current) {
            window.clearTimeout(pendingTimerRef.current)
            pendingTimerRef.current = null
        }

        setToast({ text, untilMs: now + ms })
    }, [])

    const lastLocalPassAtRef = useRef<number>(0)

    const {
        data: ttlData,
        dataUpdatedAt: ttlUpdatedAt,
        refetch: refetchTtl,
    } = useQuery({
        queryKey: ["ttl", roomId],
        queryFn: async () => {
            const res = await client.room.ttl.get({ query: { roomId } })
            return res.data as { ttl: number | null }
        },
    })

    const ttlSeconds = ttlData?.ttl ?? null
    const ttlSnapshotAtMs = ttlData ? ttlUpdatedAt : null

    const timeRemaining = useMemo(() => {
        if (ttlSeconds === null) return null
        if (ttlSnapshotAtMs === null) return null
        if (ttlSnapshotAtMs <= 0) return null
        const expiryAt = ttlSnapshotAtMs + ttlSeconds * 1000
        const remain = Math.ceil((expiryAt - nowMs) / 1000)
        return Math.max(0, remain)
    }, [nowMs, ttlSeconds, ttlSnapshotAtMs])

    useEffect(() => {
        if (timeRemaining === null) return
        if (timeRemaining <= 0) router.push("/?destroyed=true")
    }, [router, timeRemaining])

    const { data: roomInfo } = useQuery({
        queryKey: ["roomInfo", roomId],
        queryFn: async () => {
            const res = await client.room.info.get({ query: { roomId } })
            return res.data
        },
    })

    const mode = (roomInfo?.mode ?? null) as "invite" | "match" | null
    const inviteCode = (roomInfo?.inviteCode ?? null) as string | null

    const { data: messages, refetch: refetchMessages } = useQuery({
        queryKey: ["messages", roomId],
        queryFn: async () => {
            const res = await client.messages.get({ query: { roomId } })
            return res.data
        },
    })

    const { data: gameData, refetch: refetchGame } = useQuery({
        queryKey: ["game", roomId],
        queryFn: async () => {
            const res = await client.game.get({ query: { roomId } })
            return res.data
        },
    })

    const me = (gameData?.me ?? null) as Player | null
    const state = (gameData?.state ?? null) as GameStatePayload | null

    const stateStatus = (state?.status ?? null) as string | null
    const stateTurn = (state?.turn ?? null) as Player | null
    const stateWinner = (state?.winner ?? null) as 0 | 1 | 2 | null
    const stateUpdatedAt = (state?.updatedAt ?? null) as number | null
    const stateLastMove =
        (state?.lastMove ?? null) as { x: number; y: number; player: Player } | null

    const canonicalBoard = (state?.board ?? Array(64).fill(0)) as Disc[]

    const legalMoves = useMemo(() => {
        if (!me || !stateTurn || me !== stateTurn) return []
        if (stateStatus !== "playing") return []
        return getLegalMoves(canonicalBoard, me)
    }, [canonicalBoard, me, stateStatus, stateTurn])

    const legalSet = useMemo(() => {
        const s = new Set<string>()
        for (const m of legalMoves) s.add(`${m.x},${m.y}`)
        return s
    }, [legalMoves])

    const canPass = useMemo(() => {
        if (!me || !stateTurn || me !== stateTurn) return false
        if (stateStatus !== "playing") return false
        return legalMoves.length === 0
    }, [legalMoves.length, me, stateStatus, stateTurn])

    const stickyOverlayText = useMemo(() => {
        if (stateStatus === "finished") return winnerOverlayText(stateWinner, me)
        if (stateStatus === "playing" && canPass) return "PASS"
        return null
    }, [canPass, me, stateStatus, stateWinner])

    const toastText = useMemo(() => {
        if (!toast) return null
        if (toast.untilMs <= nowMs) return null
        return toast.text
    }, [nowMs, toast])

    const overlayText = toastText ?? stickyOverlayText
    const stickyOverlayActive = toastText == null && stickyOverlayText != null

    const { mutate: sendMessage, isPending: sendingMessage } = useMutation({
        mutationFn: async ({ text }: { text: string }) => {
            await client.messages.post({ sender: username, text }, { query: { roomId } })
            setInput("")
        },
    })

    const { mutate: destroyRoom, isPending: destroying } = useMutation({
        mutationFn: async () => {
            await client.room.delete(null, { query: { roomId } })
        },
    })

    const { mutate: moveDisc, isPending: moving } = useMutation({
        mutationFn: async ({ x, y }: { x: number; y: number }) => {
            await client.game.move.post({ x, y }, { query: { roomId } })
        },
    })

    const { mutate: passTurn, isPending: passing } = useMutation({
        mutationFn: async () => {
            await client.game.pass.post(null, { query: { roomId } })
        },
    })

    useRealtime({
        channels: [roomId],
        events: ["chat.message", "chat.destroy", "game.state"],
        onData: ({ event }) => {
            if (event === "chat.message") refetchMessages()
            if (event === "game.state") {
                refetchGame()
                refetchTtl()
            }
            if (event === "chat.destroy") router.push("/?destroyed=true")
        },
    })

    usePassInferenceToast({
        stateUpdatedAt,
        status: stateStatus,
        turn: stateTurn,
        board: canonicalBoard,
        lastMove: stateLastMove,
        me,
        emitToast,
        boardsEqual,
        recentLocalPassAtRef: lastLocalPassAtRef,
    })

    const { renderBoard, flipping } = useAnimatedBoard({
        canonicalBoard,
        lastMove: stateLastMove,
        stateUpdatedAt,
        me,
        playPlace,
        playFlip,
    })

    async function copyToClipboard(text: string): Promise<boolean> {
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                await navigator.clipboard.writeText(text)
                return true
            }
        } catch {}

        try {
            const ta = document.createElement("textarea")
            ta.value = text
            ta.setAttribute("readonly", "true")
            ta.className = styles.clipboardTa
            document.body.appendChild(ta)
            ta.focus()
            ta.select()
            const ok = document.execCommand("copy")
            document.body.removeChild(ta)
            return ok
        } catch {
            return false
        }
    }

    const copyLink = async () => {
        const url = window.location.href
        const ok = await copyToClipboard(url)
        setCopyStatus(ok ? "COPIED!" : "COPY FAILED")
        window.setTimeout(() => setCopyStatus("COPY LINK"), 2000)
    }

    const copyInviteCode = async () => {
        if (!inviteCode) return
        const ok = await copyToClipboard(inviteCode)
        setCopyCodeStatus(ok ? "COPIED!" : "COPY FAILED")
        window.setTimeout(() => setCopyCodeStatus("COPY CODE"), 2000)
    }

    const statusText = useMemo(() => {
        if (!stateStatus) return "LOADING"
        if (stateStatus === "waiting") return "WAITING FOR OPPONENT"
        if (stateStatus === "playing") return `TURN: ${playerLabel(stateTurn)}`
        if (stateStatus === "finished") {
            const w = stateWinner
            if (w === 0) return "RESULT: DRAW"
            if (w === 1) return "RESULT: BLACK WIN"
            if (w === 2) return "RESULT: WHITE WIN"
            return "RESULT: FINISHED"
        }
        return "UNKNOWN"
    }, [stateStatus, stateTurn, stateWinner])

    const onSend = () => {
        if (!input.trim()) return
        void unlock()
        sendMessage({ text: input })
        inputRef.current?.focus()
    }

    const onMove = (x: number, y: number) => {
        void unlock()
        moveDisc({ x, y })
    }

    const onPass = () => {
        void unlock()
        lastLocalPassAtRef.current = Date.now()
        passTurn()
        emitToast("PASS")
    }

    const onDestroy = () => {
        void unlock()
        destroyRoom()
    }

    return (
        <main className="flex flex-col h-dvh min-h-0 overflow-hidden">
            <RoomHeader
                roomId={roomId}
                mode={mode}
                inviteCode={inviteCode}
                copyStatus={copyStatus}
                copyCodeStatus={copyCodeStatus}
                onCopyLink={copyLink}
                onCopyInviteCode={copyInviteCode}
                timeRemaining={timeRemaining}
                destroying={destroying}
                onDestroy={onDestroy}
            />

            <div className="flex-1 min-h-0 overflow-hidden">
                <div className={styles.desktopOnly}>
                    <ResizableColumns
                        left={
                            <BoardPane
                                statusText={statusText}
                                me={me}
                                state={state}
                                mode={mode}
                                inviteCode={inviteCode}
                                renderBoard={renderBoard}
                                flipping={flipping}
                                legalSet={legalSet}
                                moving={moving}
                                passing={passing}
                                canPass={canPass}
                                onPass={onPass}
                                onMove={onMove}
                                overlayText={overlayText}
                                stickyOverlayActive={stickyOverlayActive}
                                onOpenChat={() => setChatOpen(true)}
                            />
                        }
                        right={
                            <ChatPane
                                roomId={roomId}
                                username={username}
                                messages={messages}
                                input={input}
                                setInput={setInput}
                                inputRef={inputRef}
                                onSend={onSend}
                                sendingMessage={sendingMessage}
                            />
                        }
                        minLeftPx={460}
                        minRightPx={380}
                        separatorPx={10}
                        initialLeftRatio={0.6}
                        storageKey={`sr.room.${roomId}.split.leftPx`}
                        className="h-full"
                    />
                </div>

                <div className={styles.mobileOnly}>
                    <BoardPane
                        statusText={statusText}
                        me={me}
                        state={state}
                        mode={mode}
                        inviteCode={inviteCode}
                        renderBoard={renderBoard}
                        flipping={flipping}
                        legalSet={legalSet}
                        moving={moving}
                        passing={passing}
                        canPass={canPass}
                        onPass={onPass}
                        onMove={onMove}
                        overlayText={overlayText}
                        stickyOverlayActive={stickyOverlayActive}
                        onOpenChat={() => setChatOpen(true)}
                    />

                    <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} title="CHAT">
                        <ChatPane
                            roomId={roomId}
                            username={username}
                            messages={messages}
                            input={input}
                            setInput={setInput}
                            inputRef={inputRef}
                            onSend={onSend}
                            sendingMessage={sendingMessage}
                        />
                    </ChatDrawer>
                </div>
            </div>
        </main>
    )
}
