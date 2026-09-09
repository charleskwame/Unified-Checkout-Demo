# React Unified Checkout

Standalone React/Vite implementation of the CyberSource Unified Checkout flow.

## Run locally

```bash
pnpm install
pnpm dev
```

Set `VITE_CHECKOUT_API_URL` in `.env.local` when using a local backend, for example:

```env
VITE_CHECKOUT_API_URL=http://localhost:3000
VITE_CHECKOUT_TARGET_ORIGIN=http://localhost:5173
```

The browser creates a checkout session through `/checkout-session`, loads the CyberSource library returned in the capture context, mounts `VAS.UnifiedCheckout`, and sends the completion response to `/verify-payment`.
