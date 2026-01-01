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

// FILE: src/hooks/useUsername.ts

"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
    ANON_IDENTITY_EVENT,
    loadOrCreateAnonymousIdentityProfileV2,
    type AnonymousIdentityProfileV2,
} from "../utils/anonymousIdentity";

const PROFILE_KEY_PREFIX = "chat_identity_v2";
const FALLBACK_USERNAME = "anonymous";
const FALLBACK_COLOR = "#a1a1aa";

const normalizeNamespace = (namespace?: string) => {
    const n = String(namespace ?? "").trim();
    return n.length ? n : "global";
};

const profileKey = (namespace?: string) => `${PROFILE_KEY_PREFIX}:${normalizeNamespace(namespace)}`;

const safeParseProfile = (raw: string | null): AnonymousIdentityProfileV2 | null => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<AnonymousIdentityProfileV2>;
        if (
            parsed &&
            parsed.version === 2 &&
            typeof parsed.seed === "string" &&
            typeof parsed.username === "string" &&
            typeof parsed.tag === "string" &&
            typeof parsed.colorHex === "string" &&
            typeof parsed.avatarKey === "string" &&
            typeof parsed.createdAtMs === "number"
        ) {
            return parsed as AnonymousIdentityProfileV2;
        }
        return null;
    } catch {
        return null;
    }
};

export const useUsername = (namespace?: string) => {
    const ns = normalizeNamespace(namespace);
    const key = profileKey(ns);

    const subscribe = (onStoreChange: () => void) => {
        const onStorage = (e: StorageEvent) => {
            if (e.storageArea !== localStorage) return;
            if (e.key !== key) return;
            onStoreChange();
        };

        const onCustom = (e: Event) => {
            const ce = e as CustomEvent<{ namespace?: string }>;
            const changedNs = String(ce.detail?.namespace ?? "").trim();
            if (!changedNs) {
                onStoreChange();
                return;
            }
            if (changedNs === ns) onStoreChange();
        };

        window.addEventListener("storage", onStorage);
        window.addEventListener(ANON_IDENTITY_EVENT, onCustom as EventListener);

        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener(ANON_IDENTITY_EVENT, onCustom as EventListener);
        };
    };

    const getSnapshot = () => {
        try {
            return localStorage.getItem(key) ?? "";
        } catch {
            return "";
        }
    };

    const getServerSnapshot = () => {
        return "";
    };

    const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const profile = useMemo(() => safeParseProfile(raw), [raw]);

    useEffect(() => {
        void loadOrCreateAnonymousIdentityProfileV2(ns);
    }, [ns]);

    return {
        username: profile?.username ?? FALLBACK_USERNAME,
        tag: profile?.tag ?? "",
        colorHex: profile?.colorHex ?? FALLBACK_COLOR,
        avatarKey: profile?.avatarKey ?? "",
        seed: profile?.seed ?? "",
        profile,
        isReady: profile !== null,
    };
};
