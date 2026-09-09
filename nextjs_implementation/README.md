# Unified Checkout Next.js

Self-contained Next.js App Router implementation of the CyberSource Unified Checkout demo.

## Run locally

1. Copy `.env.example` to `.env.local` and fill in the server-only CyberSource values.
2. Run `pnpm install`.
3. Run `pnpm dev` and open `http://localhost:3000`.

The browser requests a capture context from `/api/checkout-session`; CyberSource credentials are used only by that server route. `targetOrigins` uses the current browser origin, so the deployed origin must be registered with CyberSource.

Payment results are currently decoded and returned by `/api/verify-payment` for compatibility with the original demo. Decode-only handling does not cryptographically verify payment authenticity.
