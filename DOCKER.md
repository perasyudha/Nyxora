# 🐳 Nyxora Docker Guide

This document provides a comprehensive guide to installing, configuring interactively, and running the Nyxora Agent fully containerized via Docker. This approach ensures Nyxora can run seamlessly across different environments (Linux, macOS, Windows) without requiring a local Node.js installation.

## 🛠 1. Get the Docker Image

You have two options to obtain the Nyxora Docker image:

### Option A: Pull Pre-built Image (Recommended & Fastest)
Nyxora officially publishes Docker images via GitHub Container Registry (GHCR) upon every release.
```bash
docker pull ghcr.io/perasyudha/nyxora:latest
```

### Option B: Build Locally
If you are developing or prefer to compile it yourself, run this in the root directory:
```bash
docker build -t ghcr.io/perasyudha/nyxora:latest .
```
> **Note:** The initial build takes time as it compiles C++/Rust system modules (`isolated-vm`, `libsecret`).

---

## ⚙️ 2. Interactive Setup (Secure & Isolated)
Nyxora requires an initial configuration (API Keys, Web3 Wallet, etc.). Run the command below to launch the **Interactive Setup Wizard** securely inside Docker. 

This command mounts a volume and saves your configurations safely to a `.nyxora_docker` folder in your computer's Home directory, ensuring your existing local Nyxora installation remains untouched.
```bash
docker run -it --rm -v ~/.nyxora_docker:/root/.nyxora ghcr.io/perasyudha/nyxora:latest npx ts-node -T packages/core/src/gateway/setup-cli.ts
```
*Complete the setup by answering the prompts in your terminal. Once you see "Setup Successful!", this temporary container will automatically delete itself.*

---

## 🚀 3. Start Nyxora (Background Daemon)
Now that the setup is complete, it's time to start the main architecture (Core API, Policy Engine, and Signer Vault) as a non-stop background daemon:
```bash
docker run -d --name nyxora-daemon -p 40000:40000 -p 50000:50000 -v ~/.nyxora_docker:/root/.nyxora ghcr.io/perasyudha/nyxora:latest
```
*(This command will output a long container ID indicating that the daemon is successfully running).*

---

## 🔑 4. Retrieve the Auth Token
For security reasons, the Web Dashboard is locked behind a randomly generated runtime token upon every boot. Retrieve this token from the Docker logs:
```bash
docker logs nyxora-daemon
```
Look for a line that says: `[Launcher] Generated Internal Auth Token: <LONG_TOKEN_CODE>`. Please copy that token code.

---

## 💻 5. Access the Web Dashboard
Open your preferred web browser, and access the following URL (replace `<LONG_TOKEN_CODE>` with the token you copied in Step 4):
```text
http://localhost:40000/?token=<LONG_TOKEN_CODE>
```
Congratulations! Your Nyxora Agent is now fully operational.

---

## 🧰 Docker Management Reference
Here are some useful commands for managing your Nyxora daemon in the future:

*   **Stop Nyxora:** `docker stop nyxora-daemon`
*   **Start Nyxora again:** `docker start nyxora-daemon`
*   **Monitor real-time AI logs:** `docker logs -f nyxora-daemon` (Press `Ctrl+C` to exit the stream).
*   **Remove the container (e.g., to reset or upgrade):** `docker rm -f nyxora-daemon`
