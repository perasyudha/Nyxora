# Troubleshooting Guide

Welcome to the Nyxora troubleshooting hub. If your agent encounters issues during boot-up or operation, you will likely find the solution here.

---

## 1. Telegram Integration Fails (ETIMEDOUT)

**Symptoms:**
When starting the agent, you see a red error log in the terminal stating:
`[Telegram] Connection failed (likely blocked by ISP or timeout): request to https://api.telegram.org/... failed`

**Cause:**
Your Internet Service Provider (ISP) or network firewall is blocking access to the Telegram API.

**Resolution:**
- **Option A:** Use a VPN or system-wide Proxy to bypass the ISP block.
- **Option B:** If you do not need Telegram remote control, you can safely ignore this warning. Nyxora's core runtime and Web Dashboard will continue to function normally.

---

## 2. OS Keyring / Vault Locked Errors

**Symptoms:**
The agent fails to start and throws an error related to `@napi-rs/keyring` or `Vault Unlock Failed`.

**Cause:**
Nyxora attempts to securely store your Web3 Private Keys in your Operating System's native credential manager. If you are running Nyxora on a headless Linux server without a GUI (like Ubuntu Server) or an environment without D-Bus/Secret Service, the native keyring will fail.

**Resolution:**
- Nyxora has a built-in **Hybrid Vault Fallback**. If the OS Keyring fails, it will automatically encrypt your keys and store them in a local `.nyxora/api_vault.key` file with strict `0600` permissions. 
- If it still fails, ensure your user has write permissions to the `~/.nyxora` directory.

---

## 🖥️ 3. Web Dashboard Not Updating (Stuck on Old Version)

**Symptoms:**
You updated Nyxora or modified the source code, but the changes do not appear on `http://localhost:40000`.

**Cause:**
Port 40000 serves the **production build** (`dist/` folder) of the dashboard. It does not auto-update when source files are changed.

**Resolution:**
- If you are a developer, access the live hot-reload server at `http://localhost:5173`.
- To update the production dashboard on port 40000, you must rebuild the frontend by running:
  ```bash
  npm run build --workspace=nyxora-dashboard
  ```

---

## 4. Web Search Rate Limits (Error 429)

**Symptoms:**
The agent states it cannot fetch web results, or you see `429 Too Many Requests` in the Gateway Logs.

**Cause:**
You have exhausted your free tier API limits on Tavily or Brave Search.

**Resolution:**
You do not need to do anything! Nyxora features an **L3 Auto-Failover Architecture**. If your primary search API fails, the agent will automatically fall back to decentralized **SearXNG** instances to ensure 100% search uptime.

---

## 5. Port 40000 Already in Use

**Symptoms:**
`Error: listen EADDRINUSE: address already in use :::40000`

**Cause:**
Another application (like another Node.js project or React app) is already running on port 40000.

**Resolution:**
Stop the other application, or start Nyxora on a different port by setting the environment variable:
```bash
PORT=8080 nyxora
```

---

## 6. Web3 Transactions Failing (Zombie Sockets)

**Symptoms:**
When you ask the AI to perform a Web3 action (e.g., Transfer, Swap, Bridge), the Gateway Logs output an IPC connection error or an `ECONNREFUSED` error pointing to `/tmp/nyxora-policy.sock`, and the transaction is never sent to your Dashboard for approval.

**Cause:**
Nyxora's internal Zero-Trust Policy Server natively runs on a Unix Domain Socket (`/tmp/nyxora-policy.sock`) for hyper-optimized IPC. If the server crashed unexpectedly or was killed forcefully, it might leave behind a "zombie" socket file blocking new instances from starting.

**Resolution:**
1. **Clear Stale Sockets:** Run the following command to clear any leftover IPC bindings from a previous crash:
   ```bash
   rm -f /tmp/nyxora-*.sock
   ```
2. **Restart Agent:** Start Nyxora again (`nyxora start`), and the system will automatically generate fresh, healthy Unix Sockets.

---

## 7. Global Installation Path Conflict

**Symptoms:**
You run `npm install -g nyxora@latest` and it shows that the installation was successful. However, when you check `nyxora -v`, the terminal still reports the old version, and new features or bug fixes do not take effect.

**Cause:**
If you use NVM (Node Version Manager) or have changed your Node.js configuration, your terminal might have multiple global binary paths. The new version is successfully installed in the NVM directory (e.g., `~/.nvm/versions/node/.../bin/nyxora`), but your terminal's `$PATH` is prioritizing an old, stale version of Nyxora stuck in another directory (like `~/.local/bin/nyxora`). This causes a "Split Personality" conflict.

**Resolution:**
You must manually delete the stale "ghost" binaries so your terminal defaults back to the correct NVM installation.

Run these commands in your terminal one by one:
```bash
# 1. Delete the stale shortcut
rm ~/.local/bin/nyxora

# 2. Delete the old original directory
rm -rf ~/.local/lib/node_modules/nyxora

# ⚖️ 3. Refresh your terminal's path cache
hash -r
```
After executing those commands, `nyxora -v` will point to the correct, newly installed version.

---

*Still facing issues? Feel free to open an issue on our [GitHub Repository](https://github.com/perasyudha/Nyxora/issues).*

