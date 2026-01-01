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

// FILE: src/lib/room/roomUtils.ts

import type { Disc, Player } from "@/lib/othello"

export function formatTimeRemaining(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function discClass(v: Disc) {
    if (v === 1) return "bg-black border border-zinc-700"
    if (v === 2) return "bg-zinc-200 border border-zinc-700"
    return ""
}

export function playerLabel(p: Player | null) {
    if (p === 1) return "BLACK"
    if (p === 2) return "WHITE"
    return "--"
}

export function boardsEqual(a: Disc[], b: Disc[]) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
}

export function winnerOverlayText(winner: 0 | 1 | 2 | null, me: Player | null) {
    if (winner === 0) return "DRAW"
    if (winner === 1) return me ? (me === 1 ? "YOU WIN" : "YOU LOSE") : "BLACK WIN"
    if (winner === 2) return me ? (me === 2 ? "YOU WIN" : "YOU LOSE") : "WHITE WIN"
    return "FINISHED"
}
