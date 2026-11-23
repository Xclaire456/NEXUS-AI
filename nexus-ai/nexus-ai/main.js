"use strict";
// NEXUS AI overlay: jendela chat tanpa bingkai, selalu di atas, muncul/hilang lewat hotkey global.
// Jalankan dengan: npm run overlay  (setelah npm install --save-dev electron)
const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, screen, dialog, shell } = require("electron");
const path = require("path");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Port berbeda dari versi browser (3000) agar keduanya bisa jalan bersamaan.
  process.env.PORT = process.env.PORT || "3737";
  const server = require("./server"); // memuat .env dan menjalankan server lokal
  const PORT = process.env.PORT;
  const HOTKEY = process.env.NEXUS_HOTKEY || "CommandOrControl+Shift+Space";
  const HIDE_ON_BLUR = /^(1|true|yes)$/i.test(process.env.NEXUS_HIDE_ON_BLUR || "");
  const ORIGIN = "http://localhost:" + PORT;

  let win = null, tray = null, quitting = false, started = false;
  let appReady = false, serverUp = server.listening;

  function showWin() {
    if (!win) return;
    win.show();
    win.focus();
    win.webContents.executeJavaScript('(document.getElementById("input")||{focus(){}}).focus()').catch(() => {});
  }
  const toggle = () => { if (win && win.isVisible() && win.isFocused()) win.hide(); else showWin(); };

  function createWindow() {
    const { workArea } = screen.getPrimaryDisplay();
    const w = 480, h = Math.min(680, workArea.height - 40);
    win = new BrowserWindow({
      width: w, height: h,
      x: workArea.x + workArea.width - w - 20, y: workArea.y + 20,
      minWidth: 360, minHeight: 420,
      frame: false, show: false, skipTaskbar: true, alwaysOnTop: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadURL(ORIGIN + "/?overlay=1");
    win.once("ready-to-show", showWin);

    // Link di dalam chat dibuka di browser, bukan di jendela overlay.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(ORIGIN)) e.preventDefault(); });
    // Esc menyembunyikan jendela.
    win.webContents.on("before-input-event", (e, input) => {
      if (input.type === "keyDown" && input.key === "Escape") { e.preventDefault(); win.hide(); }
    });
    // Tombol tutup hanya menyembunyikan; keluar lewat menu tray.
    win.on("close", e => { if (!quitting) { e.preventDefault(); win.hide(); } });
    if (HIDE_ON_BLUR) win.on("blur", () => win.hide());
  }

  function createTray() {
    const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "icon.png")).resize({ width: 18, height: 18 });
    tray = new Tray(icon);
    tray.setToolTip("NEXUS AI");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Tampilkan / sembunyikan  (" + HOTKEY + ")", click: toggle },
      { label: "Selalu di atas", type: "checkbox", checked: true, click: i => win.setAlwaysOnTop(i.checked, "screen-saver") },
      { label: "Transparansi", submenu: [1, 0.9, 0.8, 0.7].map(v => ({ label: Math.round(v * 100) + "%", type: "radio", checked: v === 1, click: () => win.setOpacity(v) })) },
      { type: "separator" },
      { label: "Keluar", click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on("click", toggle);
  }

  function registerHotkey() {
    let ok = false;
    try { ok = globalShortcut.register(HOTKEY, toggle); } catch { ok = false; }
    if (!ok) dialog.showErrorBox("NEXUS AI", "Hotkey " + HOTKEY + " gagal didaftarkan (mungkin dipakai aplikasi lain atau formatnya salah). Ubah NEXUS_HOTKEY di .env. Aplikasi tetap bisa dibuka lewat ikon tray.");
  }

  function tryStart() {
    if (started || !appReady || !serverUp) return;
    started = true;
    createWindow(); createTray(); registerHotkey();
  }

  server.once("listening", () => { serverUp = true; tryStart(); });
  server.on("error", e => {
    app.whenReady().then(() => {
      dialog.showErrorBox("NEXUS AI", e.code === "EADDRINUSE" ? "Port " + PORT + " sudah dipakai. Tutup aplikasi yang memakainya atau set PORT di terminal." : String(e.message || e));
      quitting = true; app.quit();
    });
  });

  app.on("second-instance", showWin);
  app.on("before-quit", () => { quitting = true; });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => { /* tetap hidup di tray */ });
  app.whenReady().then(() => { if (app.dock) app.dock.hide(); appReady = true; tryStart(); });
}
