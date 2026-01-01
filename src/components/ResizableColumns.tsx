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

// FILE: src/components/ResizableColumns.tsx

"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import styles from "./ResizableColumns.module.css"

type ResizableColumnsProps = {
    left: ReactNode
    right: ReactNode
    minLeftPx?: number
    minRightPx?: number
    separatorPx?: number
    initialLeftRatio?: number
    storageKey?: string
    className?: string
}

type DragState = {
    active: boolean
    startX: number
    startLeftPx: number
}

type BodyStyleSnapshot = {
    userSelect: string
    cursor: string
}

export function ResizableColumns({
    left,
    right,
    minLeftPx = 420,
    minRightPx = 360,
    separatorPx = 10,
    initialLeftRatio = 0.58,
    storageKey = "sr.split.leftPx",
    className = "",
}: ResizableColumnsProps) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const separatorRef = useRef<HTMLDivElement | null>(null)

    const dragRef = useRef<DragState>({ active: false, startX: 0, startLeftPx: 0 })

    const bodyStyleRef = useRef<BodyStyleSnapshot | null>(null)

    const styleElRef = useRef<HTMLStyleElement | null>(null)

    const [containerWidth, setContainerWidth] = useState(0)

    const [leftPx, setLeftPx] = useState<number | null>(() => {
        if (typeof window === "undefined") return null
        if (!storageKey) return null
        try {
            const raw = localStorage.getItem(storageKey)
            if (!raw) return null
            const parsed = Number(raw)
            if (!Number.isFinite(parsed)) return null
            if (parsed <= 0) return null
            return parsed
        } catch {
            return null
        }
    })

    const reactId = useId()
    const splitClass = useMemo(() => {
        const cleaned = String(reactId).replace(/[^a-zA-Z0-9_-]/g, "")
        return `srSplit_${cleaned || "x"}`
    }, [reactId])

    const bounds = useMemo(() => {
        const maxLeft = Math.max(minLeftPx, containerWidth - separatorPx - minRightPx)
        return { minLeft: minLeftPx, maxLeft }
    }, [containerWidth, minLeftPx, minRightPx, separatorPx])

    const clampLeft = useCallback(
        (v: number) => {
            if (v < bounds.minLeft) return bounds.minLeft
            if (v > bounds.maxLeft) return bounds.maxLeft
            return v
        },
        [bounds.maxLeft, bounds.minLeft]
    )

    const effectiveLeft = useMemo(() => {
        const base =
            leftPx != null
                ? leftPx
                : containerWidth > 0
                ? Math.floor(containerWidth * initialLeftRatio)
                : bounds.minLeft
        return clampLeft(base)
    }, [bounds.minLeft, clampLeft, containerWidth, initialLeftRatio, leftPx])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        let raf = 0

        const measureNow = () => {
            raf = 0
            const w = el.getBoundingClientRect().width
            setContainerWidth(Math.max(0, Math.floor(w)))
        }

        const scheduleMeasure = () => {
            if (raf) return
            raf = window.requestAnimationFrame(measureNow)
        }

        scheduleMeasure()

        let ro: ResizeObserver | null = null
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => scheduleMeasure())
            ro.observe(el)
        } else {
            window.addEventListener("resize", scheduleMeasure, { passive: true })
        }

        return () => {
            if (raf) window.cancelAnimationFrame(raf)
            if (ro) ro.disconnect()
            else window.removeEventListener("resize", scheduleMeasure)
        }
    }, [])

    useEffect(() => {
        if (typeof document === "undefined") return

        const s = document.createElement("style")
        s.setAttribute("data-sr-split", splitClass)
        document.head.appendChild(s)
        styleElRef.current = s

        return () => {
            if (styleElRef.current && styleElRef.current.parentNode) {
                styleElRef.current.parentNode.removeChild(styleElRef.current)
            }
            styleElRef.current = null
        }
    }, [splitClass])

    useEffect(() => {
        const s = styleElRef.current
        if (!s) return

        s.textContent = `.${splitClass}{--sr-left:${effectiveLeft}px;--sr-sep:${separatorPx}px;}`
    }, [effectiveLeft, separatorPx, splitClass])

    useEffect(() => {
        if (!storageKey) return
        if (typeof window === "undefined") return
        try {
            localStorage.setItem(storageKey, String(effectiveLeft))
        } catch {
            void 0
        }
    }, [effectiveLeft, storageKey])

    useEffect(() => {
        const el = separatorRef.current
        if (!el) return

        el.setAttribute("aria-valuemin", String(bounds.minLeft))
        el.setAttribute("aria-valuemax", String(bounds.maxLeft))
        el.setAttribute("aria-valuenow", String(effectiveLeft))
    }, [bounds.maxLeft, bounds.minLeft, effectiveLeft])

    const beginBodyInteractionMode = useCallback(() => {
        const b = document.body
        bodyStyleRef.current = { userSelect: b.style.userSelect, cursor: b.style.cursor }
        b.style.userSelect = "none"
        b.style.cursor = "col-resize"
    }, [])

    const endBodyInteractionMode = useCallback(() => {
        const snap = bodyStyleRef.current
        if (!snap) return
        const b = document.body
        b.style.userSelect = snap.userSelect
        b.style.cursor = snap.cursor
        bodyStyleRef.current = null
    }, [])

    const beginDrag = useCallback(
        (clientX: number) => {
            dragRef.current = { active: true, startX: clientX, startLeftPx: effectiveLeft }
            beginBodyInteractionMode()
        },
        [beginBodyInteractionMode, effectiveLeft]
    )

    const endDrag = useCallback(() => {
        dragRef.current.active = false
        endBodyInteractionMode()
    }, [endBodyInteractionMode])

    const onPointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            e.preventDefault()
            e.stopPropagation()
            e.currentTarget.setPointerCapture(e.pointerId)
            beginDrag(e.clientX)
        },
        [beginDrag]
    )

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            if (!dragRef.current.active) return
            const dx = e.clientX - dragRef.current.startX
            const next = clampLeft(dragRef.current.startLeftPx + dx)
            setLeftPx(next)
        }

        const onUp = () => {
            if (!dragRef.current.active) return
            endDrag()
        }

        window.addEventListener("pointermove", onMove, { passive: true })
        window.addEventListener("pointerup", onUp, { passive: true })
        window.addEventListener("pointercancel", onUp, { passive: true })

        return () => {
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("pointerup", onUp)
            window.removeEventListener("pointercancel", onUp)
        }
    }, [clampLeft, endDrag])

    const onKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            const step = e.shiftKey ? 48 : 24

            if (e.key === "ArrowLeft") {
                e.preventDefault()
                setLeftPx(clampLeft(effectiveLeft - step))
            } else if (e.key === "ArrowRight") {
                e.preventDefault()
                setLeftPx(clampLeft(effectiveLeft + step))
            } else if (e.key === "Home") {
                e.preventDefault()
                setLeftPx(bounds.minLeft)
            } else if (e.key === "End") {
                e.preventDefault()
                setLeftPx(bounds.maxLeft)
            }
        },
        [bounds.maxLeft, bounds.minLeft, clampLeft, effectiveLeft]
    )

    return (
        <div ref={containerRef} className={`${styles.container} ${splitClass} ${className}`}>
            <div className={styles.grid}>
                <div className={styles.pane}>{left}</div>

                <div
                    ref={separatorRef}
                    className={styles.separator}
                    onPointerDown={onPointerDown}
                    onKeyDown={onKeyDown}
                    tabIndex={0}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize panes"
                    title="Drag to resize"
                >
                    <div className={styles.separatorLine} />
                    <div className={styles.separatorGlow} />
                </div>

                <div className={styles.pane}>{right}</div>
            </div>
        </div>
    )
}
