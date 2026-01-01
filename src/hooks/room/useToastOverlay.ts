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

// FILE: src/hooks/useToastOverlay.ts

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export function useToastOverlay() {
    const [toastText, setToastText] = useState<string | null>(null)
    const timerRef = useRef<number | null>(null)

    const clear = useCallback(() => {
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = null
        setToastText(null)
    }, [])

    const emitToast = useCallback(
        (text: string, ms: number = 1400) => {
            if (timerRef.current) window.clearTimeout(timerRef.current)
            setToastText(text)
            timerRef.current = window.setTimeout(() => {
                timerRef.current = null
                setToastText(null)
            }, ms)
        },
        []
    )

    useEffect(() => {
        return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current)
        }
    }, [])

    return { toastText, emitToast, clearToast: clear }
}
