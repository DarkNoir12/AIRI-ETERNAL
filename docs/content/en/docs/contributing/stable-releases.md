# Stable Release & Build Guide

This document captures the lessons learned and the specific technical steps required to successfully build and release stable versions of the AIRI Electron application, particularly focusing on overcoming environment-related build failures.

## 1. Release Workflow

### Step 1: Version Stamping
Update the `version` in `apps/stage-tamagotchi/package.json`. Follow the format: `[major].[minor].[patch]-stable.[YYYYMMDD]`.

### Step 2: Local Tagging
Create a git tag matching the version (with a `v` prefix) and push it to your fork or upstream:
```bash
git tag v0.9.0-stable.20260321
git push origin v0.9.0-stable.20260321
```

### Step 3: Build Windows Executable
Execute the build command from the `stage-tamagotchi` workspace:
```bash
pnpm -F @proj-airi/stage-tamagotchi run build:win
```
This runs `electron-builder --win` after performing necessary typechecks and production builds for main/renderer/preload.

### Step 4: Publish to GitHub Releases
Use the `gh` CLI to create the release and upload the asset.

**Daily / Development Release (Target your fork):**
For daily releases or testing, you should target your own fork to avoid permission issues with the upstream repository.
```bash
gh release create v0.9.0-stable.20260322 apps/stage-tamagotchi/dist/AIRI-0.9.0-stable.20260322-windows-x64-setup.exe --repo dasilva333/airi --title "AIRI v0.9.0-stable (March 22, 2026)" --notes "Daily release focusing on Vision support MVP and Live2D state synchronization fixes."
```

**Stable Release (Target upstream):**
Only target the upstream repository if you have write access and are performing an official release.
```bash
gh release create [tag] [artifact_path] --repo moeru-ai/airi --title "[Title]" --notes "[Notes]"
```

> [!IMPORTANT]
> **Authentication Scope**: Ensure your `gh` CLI session has the `workflow` scope. This is required for creating releases. If you see a "Failed to create release" error despite having permissions, run:
> `gh auth refresh -h github.com -s workflow`

---

## 2. Lessons Learned: Environment Conflicts

### The `node:crypto` Renderer Error
Electron renderer processes are browser environments. Many modern dependencies (like `@noble/hashes` or `better-auth`) accidentally pull in Node.js-specific bundles in production builds.

**Symptoms:**
- `Uncaught Error: Module "node:crypto" has been externalized for browser compatibility.`
- `Cannot access "node:crypto.webcrypto" in client code.`

**Solution:**
1. **Force Browser Aliases**: Map Node-specific packages to their browser equivalents in `electron.vite.config.ts`.
2. **Custom Shimming**: Implement a virtual `node:crypto` shim (e.g., `apps/stage-tamagotchi/src/renderer/shims/node-crypto.ts`) that maps `node:crypto.webcrypto` to `window.crypto`.

### DuckDB Environment Leakage
`@proj-airi/duckdb-wasm` (and its dependencies) may attempt to load Node.js-specific WASM loaders or bundles even in the renderer.

**Solution:**
Use a custom Vite plugin (e.g., `force-node-crypto-shim` in our config) to intercept `resolveId` and redirected any path like `bundles/default-node` to `bundles/default-browser`.

### Global Module Shimming
To prevent "leakage" of Node.js modules like `process`, `module`, and `path` into the renderer bundle:
1. Use the custom Vite plugin to catch imports starting with `node:` or common Node-only module names.
2. Redirect them to a virtual empty module or a safe constant-only shim.

---

## 3. Resilient Builds

To avoid build failures due to transient network issues (e.g., downloading VRM models or fonts):
- Use the `resilient` wrapper (found in `packages/stage-shared/src/ts/resilient.ts`) in build-time download plugins or scripts.
- This provides automatic retries and ensures the build can continue if at least one critical asset is present.

---

## 4. Troubleshooting

- **Alias Conflicts**: If an alias doesn't work, it might be due to relative path resolution within `node_modules`. Use **regex aliases** in Vite configuration to catch all variations.
- **Typecheck Failures**: If adding an alias breaks typechecks, ensure the shim file exports types compatible with the original module, or use `// @ts-ignore` sparingly in the shim itself.
