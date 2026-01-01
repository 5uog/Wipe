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

// FILE: src/lib/sfx.ts

"use client"

import { useCallback, useRef } from "react"

type Buffers = {
    place?: AudioBuffer
    flip?: AudioBuffer
}

async function fetchBuffer(ctx: AudioContext, url: string) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`failed to load: ${url}`)
    const arr = await res.arrayBuffer()
    return await ctx.decodeAudioData(arr)
}

export function useSfx() {
    const ctxRef = useRef<AudioContext | null>(null)
    const buffersRef = useRef<Buffers>({})
    const loadingRef = useRef<Promise<void> | null>(null)

    const ensureCtx = useCallback(() => {
        if (!ctxRef.current) ctxRef.current = new AudioContext()
        return ctxRef.current
    }, [])

    const ensureLoaded = useCallback(async () => {
        if (buffersRef.current.place && buffersRef.current.flip) return
        if (loadingRef.current) return loadingRef.current

        const p = (async () => {
            const ctx = ensureCtx()
            const [place, flip] = await Promise.all([
                fetchBuffer(ctx, "/sfx/place.mp3"),
                fetchBuffer(ctx, "/sfx/flip.mp3"),
            ])
            buffersRef.current.place = place
            buffersRef.current.flip = flip
        })()

        loadingRef.current = p
        await p
        loadingRef.current = null
    }, [ensureCtx])

    const unlock = useCallback(async () => {
        const ctx = ensureCtx()
        if (ctx.state === "suspended") await ctx.resume()
        await ensureLoaded()
    }, [ensureCtx, ensureLoaded])

    const playAt = useCallback(
        (buf: AudioBuffer, delaySeconds: number) => {
            const ctx = ensureCtx()
            if (ctx.state !== "running") return
            const src = ctx.createBufferSource()
            src.buffer = buf
            src.connect(ctx.destination)
            src.start(ctx.currentTime + delaySeconds)
        },
        [ensureCtx]
    )

    const playPlace = useCallback(() => {
        const buf = buffersRef.current.place
        if (!buf) return
        playAt(buf, 0)
    }, [playAt])

    const playFlip = useCallback(() => {
        const buf = buffersRef.current.flip
        if (!buf) return
        playAt(buf, 0)
    }, [playAt])

    return { unlock, playPlace, playFlip }
}
