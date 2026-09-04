# UrbanWave Net — Desktop App

## 1. Architecture

```
Windows PC
  └─ UrbanWave Net.exe (Electron shell)
       └─ loads https://urbanwave-billingsystem.onrender.com  (your live production URL)
             └─ Render (Node backend, server.js)
                   ├─ Supabase (Postgres + Auth + Storage) — the only database
                   └─ MikroTik routers (raw TCP, reached from the backend, not the desktop app)
```

The desktop app is a **thin native shell**, not a repackaged copy of the app. It does not
bundle a build of the React frontend, does not run any Node backend locally, and does not
talk to Supabase or MikroTik directly. It opens a real OS window pointed at your existing
live URL — same backend, same database, same MikroTik integration you already have. This
means every update you ship to Render is instantly reflected for desktop users with zero
re-install, and there is nothing new to keep in sync.

## 2. Framework: Electron (not Tauri)

Your backend and database are already fully remote (Render + Supabase). Tauri's main
advantage — a small Rust backend for local resources — doesn't apply here, since there's
nothing local to run. Electron's mature `electron-builder` NSIS pipeline was also the
deciding factor for actually producing a Windows installer from a Linux build machine.

## 3. What's in this folder

- `electron/main.js` — window creation, config storage, offline/error handling, single-instance lock
- `electron/preload.js` — the *only* bridge exposed to the web app (get/set server URL, retry, open external links). No filesystem, no shell, no Node access is exposed to the page.
- `electron/pages/connection-error.html` — shown instead of Electron's default ugly error screen when the server can't be reached, with Retry + Connection Settings buttons
- `electron/pages/settings.html` — lets a user point the app at a different server URL if you ever self-host elsewhere
- `electron/icon.png` / `icon.ico` — **placeholder icon** (blue circle, "UW"). Replace with your real logo before distributing — see §8.
- `package.json` — `electron-builder` config (`build` key)

## 4. Development

```bash
npm install
npm start          # opens the shell pointed at production
```

## 5. Building the Windows installer

```bash
npm run dist:win
```

This runs `electron-builder --win --x64`, producing:
- `release/win-unpacked/` — the raw app folder
- `release/UrbanWave Net Setup 1.0.0.exe` — NSIS installer (Start Menu + Desktop shortcuts, uninstaller)

**Requires either a real Windows machine, or a Linux machine with a working Wine
install** (NSIS's `makensis` only ships as a Windows binary; Wine runs it on Linux).
This particular Claude sandbox has Wine installed but its loader cannot execute
under the sandbox's process restrictions, so the NSIS build fails at the final
packaging step here specifically — it is not a project or config problem. Building on
your own machine (or any CI runner, e.g. `windows-latest` on GitHub Actions) will
produce the installer normally with the exact same command.

### What's delivered instead, working today
`UrbanWave-Net-Windows-Portable.zip` — the fully built, tested `win-unpacked` folder,
zipped. On a Windows machine: unzip anywhere, double-click `UrbanWave Net.exe`. No
installer, no Start Menu entry, no uninstaller — but otherwise fully functional: real
native window, no browser chrome, connects to your live production system exactly like
the installer version would.

## 6. Configuration

The server URL is **not hardcoded into a build you'd need to reship** — it's stored in
`%APPDATA%/urbanwave-desktop/config.json` on the user's machine, editable from the app's
menu (App → Connection Settings…) or from the error screen if the app can't connect. It
defaults to `https://urbanwave-billingsystem.onrender.com`.

## 7. Offline / connection-failure behavior

- Backend/internet unreachable → custom error screen (not Electron's default), distinguishes
  "you're offline" vs "server didn't respond" using `navigator.onLine`, with Retry and
  Connection Settings actions.
- Uncaught main-process errors are logged to `%APPDATA%/urbanwave-desktop/logs/crash.log`
  and shown in a native error dialog instead of silently crashing.
- MikroTik/router offline handling is unchanged — that logic already lives in your backend
  (`RoutersTab.jsx` / `/api/routers/check-all`) and works identically through the desktop
  shell, since it's just the same web app.

## 8. Before you distribute this for real

1. **Replace the placeholder icon.** Put your real square logo (ideally 512×512 PNG) at
   `electron/icon.png`, regenerate `electron/icon.ico` (`convert icon.png -define
   icon:auto-resize=256,128,64,48,32,16 icon.ico`), rebuild.
2. **Build the real installer** on a Windows machine or a working Wine/CI environment —
   see §5. The portable ZIP is genuine and working, but a proper installer is what makes
   this feel like a real installed Windows app.
3. **Code signing** (optional but recommended): unsigned installers trigger a Windows
   SmartScreen warning on first run. Needs a code-signing certificate — not something I
   can set up without you owning one.
4. Consider auto-update: `electron-updater` can check GitHub Releases or your own server
   for new versions, but needs a real release pipeline to be worth wiring up — not done
   here since there's no versioned release process yet.

## 9. Security review notes (desktop-specific)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on every window —
  the loaded web page (your production site) has zero Node/filesystem/shell access; only
  the four narrow functions in `preload.js` are exposed.
- No secrets live in this desktop app at all — it never sees your Supabase service role
  key, MikroTik credentials, or JWT secret; those stay server-side exactly as before. The
  app only ever holds what a normal browser tab would: your Supabase *publishable* key and
  a user's own session token, both already safely designed to be public/short-lived.
- External links open in the user's real browser (`shell.openExternal`), never in a second
  chrome-less Electron window.

## 10. Requirements summary

| | |
|---|---|
| Internet required? | Yes — the app loads your live site each launch |
| Backend/server required? | Yes — your existing Render deployment, unchanged |
| Database server required? | Yes — Supabase, unchanged |
| MikroTik/network infra required? | Only for router-management features, exactly as today |
| Node/npm needed on the end user's PC? | No |
