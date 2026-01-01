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

// FILE: src/components/room/ChatPane.tsx

"use client"

import { format } from "date-fns"
import type { RefObject } from "react"
import styles from "./room.module.css"

type MessagesPayload =
    | {
        messages: Array<{
            id: string
            sender: string
            text: string
            timestamp: number
            roomId: string
        }>
    }
    | null
    | undefined

export function ChatPane(props: {
    roomId: string
    username: string
    messages: MessagesPayload
    input: string
    setInput: (v: string) => void
    inputRef: RefObject<HTMLInputElement | null>
    onSend: () => void
    sendingMessage: boolean
}) {
    const { roomId, username, messages, input, setInput, inputRef, onSend, sendingMessage } = props
    const list = messages?.messages ?? []

    return (
        <section className="h-full min-h-0 flex flex-col bg-zinc-950">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/30">
                <div className="flex items-center justify-between">
                    <div className="text-xs text-zinc-500 uppercase tracking-widest">Chat</div>
                    <div className="text-[10px] text-zinc-600">{roomId}</div>
                </div>
            </div>

            <div className={`flex-1 min-h-0 overflow-y-auto p-4 space-y-4 ${styles.chatScroll}`}>
                {list.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-zinc-600 text-sm font-mono">No messages yet, start the conversation.</p>
                    </div>
                )}

                {list.map((msg) => (
                    <div key={msg.id} className="flex flex-col items-start">
                        <div className="max-w-[80%] group">
                            <div className="flex items-baseline gap-3 mb-1">
                                <span
                                    className={`text-xs font-bold ${
                                        msg.sender === username ? "text-green-500" : "text-blue-500"
                                    }`}
                                >
                                    {msg.sender === username ? "YOU" : msg.sender}
                                </span>

                                <span className="text-[10px] text-zinc-600">{format(msg.timestamp, "HH:mm")}</span>
                            </div>

                            <p className="text-sm text-zinc-300 leading-relaxed break-all">{msg.text}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
                <div className="flex gap-3">
                    <div className="flex-1 relative min-w-0">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500 animate-pulse">
                            {">"}
                        </span>

                        <input
                            ref={inputRef}
                            autoFocus={false}
                            type="text"
                            value={input}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && input.trim()) onSend()
                            }}
                            placeholder="Type message..."
                            onChange={(e) => setInput(e.target.value)}
                            className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-3 pl-8 pr-4 text-sm"
                        />
                    </div>

                    <button
                        onClick={onSend}
                        disabled={!input.trim() || sendingMessage}
                        className="bg-zinc-800 text-zinc-400 px-5 text-sm font-bold hover:text-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded shrink-0"
                    >
                        SEND
                    </button>
                </div>
            </div>
        </section>
    )
}
