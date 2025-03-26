# Frontend

> Basically created using vibe coding

## Todo

Known Issue

- [ ] Task submission is a little bit slow (stuck at `Submitting...` for a long time if submit multiple tasks)
- [ ] Failed to capture server side error message properly (which will cause SSE disconnection)

---

Cursor Setup:

```txt
Use bun and Next.js to build a simple front-end UI that can interact with the back-end server
Main function is to test we can submit task and wait for task to complete
```

```bash
bunx create-next-app@latest app --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
# ✔ Would you like to use Turbopack for `next dev`? … No / [Yes]
```

> Server-Sent Events (SSE) for real-time task status updates. This will be more efficient than polling.
