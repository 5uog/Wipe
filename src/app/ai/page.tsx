// FILE: src/app/ai/page.tsx

"use client"

import { client } from "@/lib/client"
import { idx, type Disc } from "@/lib/othello"
import { useMutation } from "@tanstack/react-query"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

type AiLevel = "easy" | "normal" | "hard"
type HumanPlays = "random" | "black" | "white"

type AiCreateResponse = {
    roomId: string
}

const LOCKED: Record<number, Disc> = {
    [idx(3, 3)]: 2,
    [idx(4, 4)]: 2,
    [idx(3, 4)]: 1,
    [idx(4, 3)]: 1,
}

function isLocked(i: number) {
    return Object.prototype.hasOwnProperty.call(LOCKED, i)
}

function cellDisc(board: Disc[], i: number): Disc {
    if (isLocked(i)) return LOCKED[i]!
    return board[i] ?? 0
}

export default function AiPage() {
    const [aiLevel, setAiLevel] = useState<AiLevel>("normal")
    const [humanPlays, setHumanPlays] = useState<HumanPlays>("random")

    const [ttlEnabled, setTtlEnabled] = useState(true)
    const [ttlMinutes, setTtlMinutes] = useState(10)

    const [handicap, setHandicap] = useState<Disc[]>(() => Array(64).fill(0))

    const [copyRoomIdStatus, setCopyRoomIdStatus] = useState("COPY")
    const copyRoomTimerRef = useRef<number | null>(null)

    useEffect(() => {
        return () => {
            if (copyRoomTimerRef.current) window.clearTimeout(copyRoomTimerRef.current)
        }
    }, [])

    const handicapPayload = useMemo(() => {
        const black: number[] = []
        const white: number[] = []
        for (let i = 0; i < 64; i++) {
            if (isLocked(i)) continue
            const v = handicap[i] ?? 0
            if (v === 1) black.push(i)
            else if (v === 2) white.push(i)
        }
        return { black, white }
    }, [handicap])

    const { mutate: createAiRoom, isPending, data, reset } = useMutation({
        mutationFn: async () => {
            const ttlSeconds =
                ttlEnabled && Number.isFinite(ttlMinutes) && ttlMinutes > 0
                    ? Math.max(60, Math.min(24 * 60 * 60, Math.floor(ttlMinutes * 60)))
                    : null

            const res = await client.room.ai.post({
                ttlSeconds,
                handicap: handicapPayload,
                aiLevel,
                humanPlays,
            })

            return res.data as AiCreateResponse
        },
    })

    const result = (data ?? null) as AiCreateResponse | null

    const copyToClipboard = async (text: string) => {
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
            ta.style.position = "fixed"
            ta.style.top = "-9999px"
            ta.style.left = "-9999px"
            ta.style.width = "1px"
            ta.style.height = "1px"
            ta.style.opacity = "0"
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

    const flashStatus = (ok: boolean) => {
        if (copyRoomTimerRef.current) window.clearTimeout(copyRoomTimerRef.current)
        setCopyRoomIdStatus(ok ? "COPIED!" : "COPY FAILED")
        copyRoomTimerRef.current = window.setTimeout(() => {
            copyRoomTimerRef.current = null
            setCopyRoomIdStatus("COPY")
        }, 1600)
    }

    return (
        <main className="min-h-screen p-4 flex items-center justify-center">
            <div className="w-full max-w-2xl space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight text-amber-400">{">"}play_vs_ai</h1>
                    <p className="text-zinc-500 text-sm">Configure settings, then start a PVE room.</p>
                </div>

                {result ? (
                    <div className="border border-zinc-800 bg-zinc-900/50 p-6 space-y-6">
                        <div className="space-y-1">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest">Room</div>

                            <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-bold text-zinc-200 break-all">{result.roomId}</div>
                                <button
                                    onClick={async () => {
                                        setCopyRoomIdStatus("COPYING...")
                                        const ok = await copyToClipboard(result.roomId)
                                        flashStatus(ok)
                                    }}
                                    className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded text-zinc-200 font-bold shrink-0"
                                >
                                    {copyRoomIdStatus}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <button
                                onClick={() => {
                                    reset()
                                    setCopyRoomIdStatus("COPY")
                                    if (copyRoomTimerRef.current) window.clearTimeout(copyRoomTimerRef.current)
                                    copyRoomTimerRef.current = null
                                }}
                                className="text-xs bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded text-zinc-200 font-bold"
                            >
                                CREATE ANOTHER
                            </button>

                            <Link
                                href={`/room/${encodeURIComponent(result.roomId)}`}
                                className="text-xs bg-amber-400/90 hover:bg-amber-400 text-black px-4 py-2 rounded font-bold"
                            >
                                ENTER ROOM
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className="border border-zinc-800 bg-zinc-900/50 p-6 space-y-6">
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <div className="text-xs text-zinc-500 uppercase tracking-widest">Difficulty</div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {(["easy", "normal", "hard"] as const).map((v) => (
                                        <button
                                            key={v}
                                            onClick={() => setAiLevel(v)}
                                            className={[
                                                "px-4 py-3 border rounded text-xs font-bold uppercase tracking-widest",
                                                aiLevel === v
                                                    ? "border-amber-400 text-amber-300 bg-amber-950/20"
                                                    : "border-zinc-800 text-zinc-300 bg-zinc-950/40 hover:bg-zinc-900/60",
                                            ].join(" ")}
                                        >
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs text-zinc-500 uppercase tracking-widest">Host Color</div>
                                <p className="text-xs text-zinc-600">
                                    This setting determines your color. AI automatically takes the opposite color.
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {(["random", "black", "white"] as const).map((v) => (
                                        <button
                                            key={v}
                                            onClick={() => setHumanPlays(v)}
                                            className={[
                                                "px-4 py-3 border rounded text-xs font-bold uppercase tracking-widest",
                                                humanPlays === v
                                                    ? "border-green-500 text-green-400 bg-green-950/30"
                                                    : "border-zinc-800 text-zinc-300 bg-zinc-950/40 hover:bg-zinc-900/60",
                                            ].join(" ")}
                                        >
                                            {v === "random" ? "random" : `${v}`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs text-zinc-500 uppercase tracking-widest">Self-Destruct</div>

                                <label className="flex items-center gap-3 text-sm text-zinc-300">
                                    <input
                                        type="checkbox"
                                        checked={ttlEnabled}
                                        onChange={(e) => setTtlEnabled(e.target.checked)}
                                        className="accent-green-500"
                                    />
                                    Enable auto-destroy timer (starts when you enter)
                                </label>

                                <div className="flex items-center gap-3">
                                    <label htmlFor="ttlMinutes" className="sr-only">
                                        Self-Destruct minutes
                                    </label>
                                    <input
                                        id="ttlMinutes"
                                        type="number"
                                        min={1}
                                        max={1440}
                                        value={ttlMinutes}
                                        onChange={(e) => setTtlMinutes(Number(e.target.value))}
                                        disabled={!ttlEnabled}
                                        className="w-28 bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-2 px-3 text-sm disabled:opacity-50"
                                    />
                                    <span className="text-sm text-zinc-500">minutes</span>
                                </div>

                                <p className="text-xs text-zinc-600">
                                    You can always destroy via the in-room button, even if auto-destroy is disabled.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs text-zinc-500 uppercase tracking-widest">Handicap (Optional)</div>
                                <p className="text-xs text-zinc-600">
                                    Click squares to cycle: empty → black → white → empty. The 4 center start discs are locked.
                                </p>

                                <div className="inline-block bg-zinc-950 border border-zinc-800 p-2">
                                    <div className="grid grid-cols-8 gap-1">
                                        {Array.from({ length: 64 }).map((_, i) => {
                                            const v = cellDisc(handicap, i)
                                            const locked = isLocked(i)

                                            const cls =
                                                v === 1
                                                    ? "bg-black border-zinc-600"
                                                    : v === 2
                                                    ? "bg-zinc-200 border-zinc-500"
                                                    : "bg-green-900/40 border-green-900/50"

                                            return (
                                                <button
                                                    key={i}
                                                    disabled={locked}
                                                    onClick={() => {
                                                        if (locked) return
                                                        setHandicap((b) => {
                                                            const n = b.slice() as Disc[]
                                                            const cur = n[i] ?? 0
                                                            const next = cur === 0 ? 1 : cur === 1 ? 2 : 0
                                                            n[i] = next
                                                            return n
                                                        })
                                                    }}
                                                    className={[
                                                        "w-7 h-7 sm:w-8 sm:h-8 border",
                                                        cls,
                                                        locked ? "opacity-80 cursor-not-allowed" : "hover:bg-green-900/70",
                                                    ].join(" ")}
                                                    aria-label={`handicap-${i}`}
                                                />
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <Link
                                href="/"
                                className="text-xs bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded text-zinc-200 font-bold"
                            >
                                BACK
                            </Link>

                            <button
                                onClick={() => createAiRoom()}
                                disabled={isPending}
                                className="text-xs bg-amber-400/90 hover:bg-amber-400 text-black px-5 py-2 rounded font-bold disabled:opacity-50"
                            >
                                {isPending ? "CREATING..." : "START VS AI"}
                            </button>
                        </div>

                        <button
                            onClick={() => {
                                reset()
                                setAiLevel("normal")
                                setHumanPlays("random")
                                setTtlEnabled(true)
                                setTtlMinutes(10)
                                setHandicap(Array(64).fill(0))
                                setCopyRoomIdStatus("COPY")
                                if (copyRoomTimerRef.current) window.clearTimeout(copyRoomTimerRef.current)
                                copyRoomTimerRef.current = null
                            }}
                            className="text-xs text-zinc-500 hover:text-zinc-300 underline"
                        >
                            RESET FORM
                        </button>
                    </div>
                )}
            </div>
        </main>
    )
}
