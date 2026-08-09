import { BrowserWindow as e, app as t, dialog as n, ipcMain as r, nativeImage as i, session as a, shell as o } from "electron";
import s from "node:path";
import { fileURLToPath as c } from "node:url";
import { spawn as l } from "node:child_process";
import u from "node:os";
import d from "node:fs";
t.name = "Nyxora", t.setAppUserModelId("Nyxora"), process.platform === "linux" && t.setDesktopName("Nyxora.desktop");
var f = s.dirname(c(import.meta.url));
t.commandLine.appendSwitch("no-sandbox"), t.commandLine.appendSwitch("disable-setuid-sandbox"), process.env.APP_ROOT = s.join(f, "..");
var p = process.env.VITE_DEV_SERVER_URL, m = s.join(process.env.APP_ROOT, "dist-electron"), h = s.join(process.env.APP_ROOT, "build");
process.env.VITE_PUBLIC = p ? s.join(process.env.APP_ROOT, "public") : h;
var g, _ = null;
function v() {
	_ = l("node", ["./bin/nyxora.mjs", "start"], {
		cwd: s.join(process.env.APP_ROOT, "../.."),
		stdio: "ignore",
		detached: !0,
		env: {
			...process.env,
			PORT: process.env.PORT || "40000"
		}
	}), _.unref(), _.on("error", (e) => {
		console.error("[Nyxora Daemon Error]:", e);
	});
}
function y() {
	process.platform, process.platform, g = new e({
		title: "Nyxora",
		icon: i.createFromPath(s.join(process.env.VITE_PUBLIC, "nyxora-icon.png")),
		width: 1200,
		height: 800,
		titleBarStyle: "hidden",
		frame: !1,
		backgroundColor: "#1c1c1e",
		webPreferences: {
			preload: s.join(f, "preload.mjs"),
			contextIsolation: !0,
			nodeIntegration: !1,
			sandbox: !1
		}
	}), a.defaultSession.setPermissionCheckHandler((e, t) => !0), a.defaultSession.setPermissionRequestHandler((e, t, n) => {
		if (t === "media") return n(!0);
		n(!0);
	}), g.webContents.setWindowOpenHandler((e) => e.url.startsWith("http://") || e.url.startsWith("https://") ? (o.openExternal(e.url), { action: "deny" }) : { action: "allow" }), g.webContents.on("will-navigate", (e, t) => {
		p && t.startsWith(p) || t.startsWith("file://") || (t.startsWith("http://") || t.startsWith("https://")) && (e.preventDefault(), o.openExternal(t));
	});
	let t = "";
	try {
		let e = s.join(u.homedir(), ".nyxora", "auth", "auth.token");
		if (d.existsSync(e) && (t = d.readFileSync(e, "utf8").trim(), t.startsWith("{"))) try {
			t = JSON.parse(t).token;
		} catch {}
	} catch {}
	if (p) {
		let e = new URL(p);
		t && e.searchParams.set("token", t), g.loadURL(e.toString());
	} else g.loadFile(s.join(h, "index.html"), t ? { query: { token: t } } : {});
}
r.on("window-minimize", (t) => {
	let n = e.fromWebContents(t.sender) || e.getFocusedWindow() || g;
	n && n.minimize();
}), r.on("window-maximize", (t) => {
	let n = e.fromWebContents(t.sender) || e.getFocusedWindow() || g;
	n && (n.isMaximized() ? n.unmaximize() : n.maximize());
}), r.on("window-close", (t) => {
	let n = e.fromWebContents(t.sender) || e.getFocusedWindow() || g;
	n && n.close();
}), r.handle("open-directory", async (t) => {
	let r = e.fromWebContents(t.sender);
	if (!r) return null;
	let i = await n.showOpenDialog(r, { properties: ["openDirectory", "createDirectory"] });
	return !i.canceled && i.filePaths.length > 0 ? i.filePaths[0] : null;
}), t.on("window-all-closed", () => {
	process.platform !== "darwin" && (t.quit(), g = null);
}), t.on("before-quit", () => {}), t.on("activate", () => {
	e.getAllWindows().length === 0 && y();
}), t.whenReady().then(() => {
	v(), y();
});
//#endregion
export { m as MAIN_DIST, h as RENDERER_DIST, p as VITE_DEV_SERVER_URL };
