// FILE: next.config.ts

import type { NextConfig } from "next"

/*
This configuration disables the in-browser development indicator that Next.js may render in a corner of the viewport.
The change is purely a UI affordance for development ergonomics and does not remove build/runtime error reporting itself,
so it reduces visual noise without weakening feedback that is relevant to correctness or stability.
*/
const nextConfig: NextConfig = {
    reactCompiler: true,

    /*
    devIndicators is a first-party switch for the development-only route/context badge.
    Setting it to false hides the badge while preserving the underlying diagnostics pipeline.
    */
    devIndicators: false,
}

export default nextConfig
