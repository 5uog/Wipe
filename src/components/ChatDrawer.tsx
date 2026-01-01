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

// FILE: src/components/ChatDrawer.tsx

"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect } from "react"

const LOCK_CLASS = "sr-nav-locked"

type ChatDrawerProps = {
    open: boolean
    title?: string
    onClose: () => void
    children: ReactNode
}

export function ChatDrawer({ open, title = "CHAT", onClose, children }: ChatDrawerProps) {
    const lock = useCallback(() => {
        document.documentElement.classList.add(LOCK_CLASS)
        document.body.classList.add(LOCK_CLASS)
    }, [])

    const unlock = useCallback(() => {
        document.documentElement.classList.remove(LOCK_CLASS)
        document.body.classList.remove(LOCK_CLASS)
    }, [])

    useEffect(() => {
        if (open) lock()
        else unlock()
        return () => unlock()
    }, [lock, open, unlock])

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!open) return
            if (e.key === "Escape") onClose()
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [onClose, open])

    const backdropClassName = [
        "fixed inset-0 z-40 transition-opacity duration-200 bg-black/40",
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
    ].join(" ")

    const panelClassName = [
        "fixed z-50 inset-y-0 right-0",
        "w-11/12 max-w-[28rem]",
        "bg-zinc-950 border-l border-zinc-800",
        "transform transition-transform duration-250",
        open ? "translate-x-0" : "translate-x-full",
        "flex flex-col min-h-0",
    ].join(" ")

    return (
        <>
            <div
                className={backdropClassName}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) onClose()
                }}
                aria-hidden="true"
            />

            {open ? (
                <aside
                    className={panelClassName}
                    role="dialog"
                    aria-modal="true"
                    aria-hidden="false"
                    aria-label={title}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                        <div className="text-xs text-zinc-500 uppercase tracking-widest">{title}</div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded text-zinc-200 font-bold"
                            aria-label="Close chat"
                        >
                            CLOSE
                        </button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
                </aside>
            ) : (
                <aside
                    className={panelClassName}
                    role="dialog"
                    aria-modal="false"
                    aria-hidden="true"
                    aria-label={title}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                        <div className="text-xs text-zinc-500 uppercase tracking-widest">{title}</div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded text-zinc-200 font-bold"
                            aria-label="Close chat"
                        >
                            CLOSE
                        </button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
                </aside>
            )}
        </>
    )
}
