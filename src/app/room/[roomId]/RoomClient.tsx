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

type ChatMessage = {
    id: string
    sender: string
    text: string
    timestamp: number
    roomId: string
}
type MessagesResponse = { messages: ChatMessage[] }

type RoomInfoPayload = {
    mode: "invite" | "match" | null
    inviteCode: string | null
    spectatorCode: string | null
    allowSpectators: boolean
    spectatorCanViewChat: boolean
    spectatorCanSendChat: boolean
    ttlEnabled: boolean
    ttlSeconds: number | null
    role: "player" | "spectator"
    spectatorsCount: number
    spectatorCapacity: number
    spectatorSlotsRemaining: number
}

export default function RoomClient({ roomId }: { roomId: string }) {
    const router = useRouter()
    const { username } = useUsername()

    const [chatOpen, setChatOpen] = useState(false)
    const [input, setInput] = useState("")
    const inputRef = useRef<HTMLInputElement | null>(null)

    const { unlock, playPlace, playFlip } = useSfx()

    const [copyStatus, setCopyStatus] = useState("COPY LINK")
    const [copyCodeStatus, setCopyCodeStatus] = useState("COPY CODE")
    const [copySpecCodeStatus, setCopySpecCodeStatus] = useState("COPY SPEC CODE")

    const copyLinkTimerRef = useRef<number | null>(null)
    const copyCodeTimerRef = useRef<number | null>(null)
    const copySpecTimerRef = useRef<number | null>(null)

    useEffect(() => {
        return () => {
            if (copyLinkTimerRef.current) window.clearTimeout(copyLinkTimerRef.current)
            if (copyCodeTimerRef.current) window.clearTimeout(copyCodeTimerRef.current)
            if (copySpecTimerRef.current) window.clearTimeout(copySpecTimerRef.current)
        }
    }, [])

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

    const emitToastDeferred = useCallback(
        (text: string, ms: number = 1400) => {
            window.setTimeout(() => emitToast(text, ms), 0)
        },
        [emitToast]
    )

    const lastLocalPassAtRef = useRef<number>(0)

    const { data: roomInfoRaw, refetch: refetchRoomInfo } = useQuery({
        queryKey: ["roomInfo", roomId],
        queryFn: async () => {
            const res = await client.room.info.get({ query: { roomId } })
            if (res.status !== 200) return null
            return res.data as RoomInfoPayload
        },
    })

    const roomInfo = (roomInfoRaw ?? null) as RoomInfoPayload | null

    const mode = (roomInfo?.mode ?? null) as "invite" | "match" | null
    const inviteCode = (roomInfo?.inviteCode ?? null) as string | null
    const spectatorCode = (roomInfo?.spectatorCode ?? null) as string | null
    const role = (roomInfo?.role ?? "player") as "player" | "spectator"

    const allowSpectators = !!roomInfo?.allowSpectators
    const spectatorsCount = roomInfo?.spectatorsCount ?? 0
    const spectatorCapacity = roomInfo?.spectatorCapacity ?? 0
    const spectatorSlotsRemaining = roomInfo?.spectatorSlotsRemaining ?? 0

    const canViewChat = role === "player" ? true : !!roomInfo?.spectatorCanViewChat
    const canSendChat = role === "player" ? true : !!roomInfo?.spectatorCanSendChat

    const { data: ttlData, dataUpdatedAt: ttlUpdatedAt, refetch: refetchTtl } = useQuery({
        queryKey: ["ttl", roomId],
        queryFn: async () => {
            const res = await client.room.ttl.get({ query: { roomId } })
            if (res.status !== 200) return { ttl: null as number | null }
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

    const { data: messages, refetch: refetchMessages } = useQuery<MessagesResponse>({
        queryKey: ["messages", roomId, canViewChat],
        enabled: canViewChat,
        queryFn: async () => {
            const res = await client.messages.get({ query: { roomId } })
            if (res.status !== 200) return { messages: [] as ChatMessage[] }
            return res.data as MessagesResponse
        },
    })

    const { data: gameData, refetch: refetchGame } = useQuery({
        queryKey: ["game", roomId],
        queryFn: async () => {
            const res = await client.game.get({ query: { roomId } })
            if (res.status !== 200) return null
            return res.data
        },
    })

    const me = (gameData?.me ?? null) as Player | null
    const state = (gameData?.state ?? null) as GameStatePayload | null

    const stateStatus = (state?.status ?? null) as string | null
    const stateTurn = (state?.turn ?? null) as Player | null
    const stateWinner = (state?.winner ?? null) as 0 | 1 | 2 | null
    const stateUpdatedAt = (state?.updatedAt ?? null) as number | null
    const stateLastMove = (state?.lastMove ?? null) as { x: number; y: number; player: Player } | null

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
        if (stateStatus === "waiting" && mode === "match") return "SEARCHING..."
        if (stateStatus === "waiting" && mode === "invite") return "WAITING..."
        return null
    }, [canPass, me, mode, stateStatus, stateWinner])

    const toastText = useMemo(() => {
        if (!toast) return null
        if (toast.untilMs <= nowMs) return null
        return toast.text
    }, [nowMs, toast])

    const overlayText = toastText ?? stickyOverlayText
    const stickyOverlayActive = toastText == null && stickyOverlayText != null

    const { mutate: sendMessage, isPending: sendingMessage } = useMutation({
        mutationFn: async ({ text }: { text: string }) => {
            const res = await client.messages.post({ sender: username, text }, { query: { roomId } })
            if (res.status !== 200) {
                emitToast("CHAT BLOCKED")
                return
            }
            setInput("")
        },
    })

    const { mutate: destroyRoom, isPending: destroying } = useMutation({
        mutationFn: async () => {
            const res = await client.room.delete(null, { query: { roomId } })
            if (res.status !== 200) emitToast("DESTROY FAILED")
        },
    })

    const { mutate: moveDisc, isPending: moving } = useMutation({
        mutationFn: async ({ x, y }: { x: number; y: number }) => {
            const res = await client.game.move.post({ x, y }, { query: { roomId } })
            if (res.status !== 200) emitToast("MOVE FAILED")
        },
    })

    const { mutate: passTurn, isPending: passing } = useMutation({
        mutationFn: async () => {
            const res = await client.game.pass.post(null, { query: { roomId } })
            if (res.status !== 200) emitToast("PASS FAILED")
        },
    })

    useRealtime({
        channels: [roomId],
        events: ["chat.message", "chat.destroy", "game.state"],
        onData: ({ event }) => {
            if (event === "chat.message") {
                if (canViewChat) refetchMessages()
            }
            if (event === "game.state") {
                refetchGame()
                refetchTtl()
                refetchRoomInfo()
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

    const prevStatusRef = useRef<string | null>(null)
    useEffect(() => {
        if (!stateUpdatedAt) return
        const prev = prevStatusRef.current
        const next = stateStatus
        if (prev && prev === "waiting" && next === "playing") {
            emitToastDeferred("OPPONENT FOUND")
        }
        prevStatusRef.current = next
    }, [emitToastDeferred, stateStatus, stateUpdatedAt])

    const prevMeRef = useRef<Player | null>(null)
    useEffect(() => {
        if (!stateUpdatedAt) return
        if (role === "spectator") {
            if (prevMeRef.current !== null) prevMeRef.current = null
            return
        }
        const prev = prevMeRef.current
        const next = me
        if (next && prev !== next) {
            emitToastDeferred(next === 1 ? "YOU ARE BLACK (FIRST)" : "YOU ARE WHITE (SECOND)")
        }
        prevMeRef.current = next
    }, [emitToastDeferred, me, role, stateUpdatedAt])

    const prevRoleRef = useRef<"player" | "spectator" | null>(null)
    useEffect(() => {
        if (!roomInfo) return
        const prev = prevRoleRef.current
        const next = role
        if (prev && prev !== next) {
            emitToastDeferred(next === "spectator" ? "SPECTATOR MODE" : "PLAYER MODE")
        }
        if (!prev) {
            emitToastDeferred(next === "spectator" ? "SPECTATOR MODE" : "PLAYER MODE", 900)
        }
        prevRoleRef.current = next
    }, [emitToastDeferred, role, roomInfo])

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
        if (copyLinkTimerRef.current) window.clearTimeout(copyLinkTimerRef.current)
        setCopyStatus("COPYING...")
        const ok = await copyToClipboard(url)
        setCopyStatus(ok ? "COPIED!" : "COPY FAILED")
        copyLinkTimerRef.current = window.setTimeout(() => {
            copyLinkTimerRef.current = null
            setCopyStatus("COPY LINK")
        }, 2000)
    }

    const copyInviteCode = async () => {
        if (!inviteCode) return
        if (copyCodeTimerRef.current) window.clearTimeout(copyCodeTimerRef.current)
        setCopyCodeStatus("COPYING...")
        const ok = await copyToClipboard(inviteCode)
        setCopyCodeStatus(ok ? "COPIED!" : "COPY FAILED")
        copyCodeTimerRef.current = window.setTimeout(() => {
            copyCodeTimerRef.current = null
            setCopyCodeStatus("COPY CODE")
        }, 2000)
    }

    const copySpectatorCode = async () => {
        if (!spectatorCode) return
        if (copySpecTimerRef.current) window.clearTimeout(copySpecTimerRef.current)
        setCopySpecCodeStatus("COPYING...")
        const ok = await copyToClipboard(spectatorCode)
        setCopySpecCodeStatus(ok ? "COPIED!" : "COPY FAILED")
        copySpecTimerRef.current = window.setTimeout(() => {
            copySpecTimerRef.current = null
            setCopySpecCodeStatus("COPY SPEC CODE")
        }, 2000)
    }

    const statusText = useMemo(() => {
        if (!stateStatus) return "LOADING"
        if (stateStatus === "waiting") return mode === "match" ? "MATCHMAKING" : "WAITING FOR OPPONENT"
        if (stateStatus === "playing") return `TURN: ${playerLabel(stateTurn)}`
        if (stateStatus === "finished") {
            const w = stateWinner
            if (w === 0) return "RESULT: DRAW"
            if (w === 1) return "RESULT: BLACK WIN"
            if (w === 2) return "RESULT: WHITE WIN"
            return "RESULT: FINISHED"
        }
        return "UNKNOWN"
    }, [mode, stateStatus, stateTurn, stateWinner])

    const onSend = () => {
        if (!input.trim()) return
        if (!canSendChat) {
            emitToast("CHAT DISABLED")
            return
        }
        void unlock()
        sendMessage({ text: input })
        inputRef.current?.focus()
    }

    const onMove = (x: number, y: number) => {
        if (role === "spectator") return
        void unlock()
        moveDisc({ x, y })
    }

    const onPass = () => {
        if (role === "spectator") return
        void unlock()
        lastLocalPassAtRef.current = Date.now()
        passTurn()
        emitToast("PASS")
    }

    const onDestroy = () => {
        if (role !== "player") {
            emitToast("FORBIDDEN")
            return
        }
        void unlock()
        destroyRoom()
    }

    return (
        <main className="flex flex-col h-dvh min-h-0 overflow-hidden">
            <RoomHeader
                roomId={roomId}
                mode={mode}
                inviteCode={inviteCode}
                spectatorCode={spectatorCode}
                role={role}
                copyStatus={copyStatus}
                copyCodeStatus={copyCodeStatus}
                copySpecCodeStatus={copySpecCodeStatus}
                onCopyLink={copyLink}
                onCopyInviteCode={copyInviteCode}
                onCopySpectatorCode={copySpectatorCode}
                timeRemaining={timeRemaining}
                destroying={destroying}
                onDestroy={onDestroy}
                allowSpectators={allowSpectators}
                spectatorsCount={spectatorsCount}
                spectatorCapacity={spectatorCapacity}
                spectatorSlotsRemaining={spectatorSlotsRemaining}
            />

            <div className="flex-1 min-h-0 overflow-hidden">
                <div className={styles.desktopOnly}>
                    <ResizableColumns
                        left={
                            <BoardPane
                                role={role}
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
                                canView={canViewChat}
                                canSend={canSendChat}
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
                        role={role}
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
                            canView={canViewChat}
                            canSend={canSendChat}
                        />
                    </ChatDrawer>
                </div>
            </div>
        </main>
    )
}
