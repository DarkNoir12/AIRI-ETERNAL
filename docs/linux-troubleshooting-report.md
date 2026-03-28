# Comprehensive Report: Linux Installation & Troubleshooting

**Tested Environment:** Linux (Ubuntu/Debian-based), migrating from Flatpak to Source/Git development.

---

## 1. Node.js Version Incompatibility (Critical)
- **The Issue:** Project fails to build or results in "Illegal Instruction/Segmentation Faults" on Node v25+. Native Rust/Cargo bindings and Electron are unstable on experimental versions.
- **The Fix:** Use `nvm` to downgrade to **Node v22 (LTS)**.
- **Recommendation:** Enforce `engines` in `package.json` for Node 20 or 22.

## 2. Dependency Isolation & Hoisting (TresJS/Three.js)
- **The Issue:** Monorepo structure prevents `apps/stage-tamagotchi` from resolving `three` (a peer dependency of `@tresjs/core`), crashing Vite/esbuild.
- **The Fix:** Create a root `.npmrc` with `public-hoist-pattern[]=*three*` or `shamefully-hoist=true`.
- **Recommendation:** Include a default root `.npmrc` in the repository.

## 3. Brittle Post-Install Scripts (MediaPipe WASM)
- **The Issue:** `prepare-tasks.ts` uses hardcoded relative paths to `node_modules`, which are broken by `pnpm` symlinks.
- **The Fix:** Manually symlink `@mediapipe/tasks-vision/wasm` into the package's local `node_modules`.
- **Recommendation:** Use `require.resolve()` in post-install scripts to find assets dynamically.

## 4. SUID Sandbox Permissions (Electron on Linux)
- **The Issue:** Electron's `chrome-sandbox` requires root ownership/4755 permissions. On Linux/pnpm, it is owned by the user, causing launch failure.
- **The Fix:** Launch with `ELECTRON_DISABLE_SANDBOX=1`.
- **Recommendation:** Add a `start:linux` script that includes this flag.

## 5. Broken Build Sequence (Race Conditions)
- **The Issue:** Starting the app before internal packages are built results in `ERR_CONNECTION_REFUSED`.
- **The Fix:** Run `pnpm install --ignore-scripts` followed by a manual `pnpm run build:packages`.
- **Recommendation:** Use `turbo` or a strict pre-dev build script.

## 6. System Dependency Gaps (Missing Headers)
- **The Issue:** Missing headers for Rust/Electron components.
- **The Fix:** `sudo apt install libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev`.
- **Recommendation:** Document these requirements in the README.

---

## 🆕 Usage & Runtime Issues (Field Reports)

### 7. OOBE (Onboarding) Sticky State
- **The Issue:** Linux users report getting stuck in the "Out of Box Experience" (Onboarding) even after a full restart.
- **Observation:** This suggests `localStorage` is either not being persisted to disk or is failing to set the "Onboarding Complete" flag.
- **Debug Tip:** If the port increments (e.g., from 5173 to 5174), a new session is created, forcing a fresh onboarding.

### 8. Voice/Model API Endpoint Mapping
- **The Issue:** STT/Voice backends aren't exposing voices properly.
- **Clarification:** AIRI uses a non-standard `/voices` endpoint for OpenAI-compatible providers (to inherit logic from other providers like ElevenLabs).
- **Fix:** Proxies or backends must map to `/voices` to be detected by AIRI's internal polling logic.

### 9. Silent LLM Signal Loss (LCPP)
- **The Issue:** When using LCPP (llama.cpp) backends, transcriptions appear to send (according to the console) but "never arrive" at the endpoint.
- **Debug Strategy:** Double-tap **F12** to open the developer tools and inspect the **Network Tab**. Verify the HTTP request payload and destination URL.

### 10. Process Management & Port Collision
- **The Issue:** "Checking if it shits the bed" on restart often leaves dangling PIDs.
- **Effect:** If the old process isn't killed, the new instance silently ups the port (5173 -> 5174), which triggers the "Fresh Onboarding" bug mentioned in #7.
- **Fix:** Ensure the process is truly killed (`kill -9` or checking `ps aux`) before restarting.
