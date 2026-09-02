# Ask Claude

A small local website where you type a question and Claude answers.

It runs on **your existing Claude subscription** — the server shells out to the
`claude` CLI you already have installed, so there is no API key and no extra billing.

## Run it

```bash
node server.js
```

Then open **http://127.0.0.1:5173**.

To use a different port: `PORT=8080 node server.js`

## What it does

- Streams answers token by token as Claude types.
- **Images** — click the paperclip, paste a screenshot with Cmd+V, or drag an
  image onto the page. Up to 6 at a time; Claude looks at them and answers.
- Remembers the conversation — follow-up questions have context, including
  images you sent earlier.
- **New chat** starts a fresh conversation.
- Model picker: Sonnet (default), Opus, Haiku.
- Renders markdown: headings, lists, code blocks, bold, links.

## Notes

- Listens on `127.0.0.1` only, so it is not reachable from other machines.
- All tools are disabled (`--tools ""`), so it can only talk — it cannot read or
  change files on your computer. It is a plain chatbot, not a coding agent.
- Runs with `--safe-mode`, so your plugins, MCP servers and CLAUDE.md files are
  ignored and it behaves like plain Claude.
- Images are resized in the browser to 1568px on the longest edge before being
  sent, which is the resolution Claude reads best. Nothing is written to disk.
- Supported image formats: PNG, JPEG, GIF, WebP.

## Files

| File | Purpose |
| --- | --- |
| `server.js` | Node server; bridges the web page to the `claude` CLI |
| `public/index.html` | The whole front-end (UI, markdown renderer, streaming) |
| `.claude/launch.json` | Lets Claude Code start the server for previews |
