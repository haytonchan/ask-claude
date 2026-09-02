# Ask Claude

A small website where you type a question and Claude answers.

There are **two versions** in this repo, and they work completely differently:

| | Hosted version (`docs/`) | Local version (`server.js`) |
| --- | --- | --- |
| Where it runs | GitHub Pages — always on | Your own computer |
| Needs | An Anthropic **API key** | Claude Code installed + signed in |
| Cost | Billed per token to your API account | Included in your Claude subscription |
| Setup | Open the page, paste your key | `npm start` |

**Live page:** https://haytonchan.github.io/ask-claude/

Pick the hosted version if you want it reachable from anywhere without leaving a
computer on. Pick the local version if you would rather use your subscription
than pay per token.

---

# Hosted version (GitHub Pages)

`docs/index.html` is a single static page. It calls the Claude API directly from
your browser using the official Anthropic SDK, so there is no server at all.

The first time you open it, it asks for an Anthropic API key
([get one here](https://console.anthropic.com/settings/keys)). The key is saved
in that browser's local storage and is sent only to `api.anthropic.com` — it is
never committed to this repo and never reaches any other server. Use the **Key**
button to change or remove it.

Anyone can open the page, but it does nothing until they supply their own key, so
publishing it does not expose your account.

Models: Opus 5 (default), Sonnet 5, Haiku 4.5. Each reply shows its token count
and roughly what it cost.

### Enabling Pages on a fork

Settings -> Pages -> Source: *Deploy from a branch* -> `main` / `/docs`.

---

# Local version (your Claude subscription)

The rest of this README covers `server.js`, which shells out to the `claude` CLI,
so there is no API key and no extra billing.

## Important: what this app actually is

This is only a **front-end**. It does not talk to Anthropic directly — it runs the
`claude` command on the computer hosting the server and streams the reply to your
browser. So that computer must have:

1. **Claude Code installed**, and
2. **`claude` signed in** (run `claude` once and log in).

If you clone this onto a second computer and run it there, that machine needs its
own Claude Code install and login. Copying the files across is not enough.

## Run it

```bash
npm start
```

Then open **http://127.0.0.1:5173**.

Different port: `PORT=8080 npm start`

## Always on (macOS)

To keep the server running in the background and start it automatically at login,
install a launch agent. Create `~/Library/LaunchAgents/com.<you>.ask-claude.plist`
pointing at `node server.js` with `RunAtLoad` and `KeepAlive` set to true, and these
environment variables:

| Variable | Value |
| --- | --- |
| `HOST` | `0.0.0.0` so other devices can reach it |
| `PORT` | `5173` |
| `ACCESS_CODE` | a number you choose; it gates network access |
| `CLAUDE_BIN` | output of `which claude` (launchd has a minimal PATH) |

Then:

```bash
launchctl load ~/Library/LaunchAgents/com.<you>.ask-claude.plist
```

It logs to `~/Library/Logs/ask-claude.log`, which prints the URL to open. To stop it:

```bash
launchctl unload ~/Library/LaunchAgents/com.<you>.ask-claude.plist
```

The Mac has to be awake to answer. Wrap the command in `caffeinate -s` so the
machine stays awake for as long as the server runs:

```
/usr/bin/caffeinate -s /usr/local/bin/node server.js
```

`-s` only holds the machine awake while it is on mains power, so a laptop on
battery still sleeps normally. The display can still sleep either way. This does
not survive a full shutdown — if the Mac is powered off, nothing is serving.

## Reaching it from outside your home

The access code only guards the local network — do not port-forward this to the
open internet. To use it from anywhere, put your devices on a private network with
[Tailscale](https://tailscale.com): install it on the Mac and on your phone, sign
both into the same account, then open `http://<mac's tailscale ip>:5173/?key=<your code>`.
The traffic stays private to your own devices and nothing is exposed publicly.

## Using it from another device (phone, tablet, second laptop)

You do **not** need Claude Code on the other device. Keep the server on the
computer that already has Claude Code, and let it serve your network:

```bash
npm run lan
```

It prints a link with an access code, like `http://192.168.1.157:5173/?key=482913`.
Open that on the other device — both must be on the same Wi-Fi.

The access code stops anyone else on the network from spending your Claude quota.
Set your own with `ACCESS_CODE=mycode npm run lan`. On Windows, use
`set HOST=0.0.0.0` first, then `npm start`.

> This is a convenience guard for a home network, not real security. Do not
> forward this port to the public internet.

## Troubleshooting

**"Could not find the `claude` command"** — Claude Code is not installed on the
machine running the server, or it is installed somewhere the server cannot see.

```bash
npm install -g @anthropic-ai/claude-code
claude          # log in once, then /exit
```

If it is already installed, find it and point the server at it:

```bash
which claude
CLAUDE_BIN=/full/path/to/claude npm start
```

The server prints which binary it found at startup, so check that line first.

**"OAuth session expired"** — run `claude` in a terminal, type `/login`, then
restart the server.

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

- Binds to `127.0.0.1` unless you opt into `npm run lan`.
- All tools are disabled (`--tools ""`), so it can only talk — it cannot read or
  change files on your computer. It is a plain chatbot, not a coding agent.
- Runs with `--safe-mode`, so your plugins, MCP servers and CLAUDE.md files are
  ignored and it behaves like plain Claude.
- Images are resized in the browser to 1568px on the longest edge before being
  sent, which is the resolution Claude reads best. Nothing is written to disk.
- Supported image formats: PNG, JPEG, GIF, WebP.
- No dependencies. Node 18 or newer.

## Files

| File | Purpose |
| --- | --- |
| `server.js` | Node server; bridges the web page to the `claude` CLI |
| `public/index.html` | The whole front-end (UI, markdown renderer, streaming) |
| `package.json` | `npm start` and `npm run lan` |
| `.claude/launch.json` | Lets Claude Code start the server for previews |
