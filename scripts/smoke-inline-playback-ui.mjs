import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { connectCdp } from './lib/reliability-cdp.mjs'
const arg = key => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3)
const exe = arg('exe'), matrix = arg('matrix'), original = arg('original')
assert.ok(exe && matrix && original)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agentplay-inline-ui-'))
const suppliedFfmpeg = arg('ffmpeg-dir')
if (suppliedFfmpeg) {
  const pinned = (await import('../electron/ytdlp-pack-manifest.js')).default.assets.find(asset => asset.kind === 'zip')
  for (const file of pinned.files) {
    const input = path.join(suppliedFfmpeg, 'bin', path.basename(file.path))
    assert.equal(fs.statSync(input).size, file.size)
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'), file.sha256)
  }
  fs.mkdirSync(path.join(profile, 'yt-dlp'), { recursive: true })
  fs.symlinkSync(path.resolve(suppliedFfmpeg), path.join(profile, 'yt-dlp', 'ffmpeg-8.0.1-essentials_build'), 'junction')
}
const evidence = fs.mkdtempSync(path.join(path.resolve('release'), 'inline-ui-'))
const port = 19441
const inAppOpen = process.argv.includes('--in-app-open')
let mainInspector
// A real visible UI is essential: Chromium pauses occluded silent videos.
const launch = file => spawn(exe, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, ...(inAppOpen ? ['--inspect=19442'] : []), '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion', file], { windowsHide: false, stdio: 'ignore' })
const child = launch(original)
const sleep = ms => new Promise(r => setTimeout(r, ms))
let ws, id = 0
const pending = new Map(), receipts = []
function command(method, params = {}) {
  return new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })) })
}
async function evaluate(expression, awaitPromise = false) {
  const r = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result?.value
}
async function state() {
  return evaluate(`(async () => {
    const media = document.querySelector('[data-ai-player-video], [data-ai-player-audio]');
    const persisted = JSON.parse(localStorage.getItem('ai-player-store') || '{}').state;
    return { present: !!media, src: media?.currentSrc, currentTime: media?.currentTime, duration: media?.duration,
      readyState: media?.readyState, paused: media?.paused, error: media?.error?.message || null,
      visibility: document.visibilityState, recovery: document.querySelector('[data-playback-recovery]')?.innerText,
      width: media?.videoWidth, height: media?.videoHeight, fit: media && getComputedStyle(media).objectFit,
      frames: media?.getVideoPlaybackQuality?.().totalVideoFrames, audioBytes: media?.webkitAudioDecodedByteCount, history: persisted?.recentMedia?.[0], full: await window.aiPlayer.windowControls.isFullscreen(), eventFullscreen: window.__testFullscreen || false, theater: !!document.querySelector('.workspace-theater'),
      playTitle: document.querySelector('.player-video-controls button[title]')?.title };
  })()`, true)
}
async function waitFor(test, label, timeout = 120000) {
  const end = Date.now() + timeout
  let s
  while (Date.now() < end) { s = await state(); if (test(s)) return s; await sleep(100) }
  throw new Error(`${label}: ${JSON.stringify(s)}`)
}
async function toggle() { await evaluate(`window.dispatchEvent(new CustomEvent('ai-player-action', { detail:'play-toggle' }))`) }
try {
  let page
  for (let i = 0; i < 240; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p => p.type === 'page' && p.url.startsWith('file:')); if (page?.webSocketDebuggerUrl) break } catch {}
    await sleep(250)
  }
  assert.ok(page?.webSocketDebuggerUrl)
  ws = new WebSocket(page.webSocketDebuggerUrl)
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) } })
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  await command('Runtime.enable')
  await command('Page.bringToFront')
  // Keep the test page active while the user works in another foreground app.
  // This changes CDP test focus only, never the production playback policy.
  await command('Emulation.setFocusEmulationEnabled', { enabled: true })
  let bridgeReady = false
  for (let attempt = 0; attempt < 300; attempt++) {
    try { bridgeReady = await evaluate('Boolean(window.aiPlayer?.windowControls)'); if (bridgeReady) break } catch { /* navigation can replace the initial execution context */ }
    await sleep(100)
  }
  assert.ok(bridgeReady, 'desktop preload must be ready before attaching test listeners')
  await evaluate(`window.aiPlayer.windowControls.onFullscreenChanged(v => window.__testFullscreen = v)`)
  const sources = [original, ...['mpeg4.mp4', 'mpeg4.avi', 'wmv.wmv', 'mpeg2.ts', 'ffv1.mkv', 'prores.mov', 'h264.mp4', 'h264-ac3.mkv', 'audio.wma', 'audio.aiff', 'audio.ac3', 'audio.flac', 'audio.opus'].map(n => path.join(matrix, n))]
  if (inAppOpen) {
    mainInspector = await connectCdp(19442, 'node')
    await mainInspector.evaluate(`(() => {const e=process.getBuiltinModule('module').createRequire(process.execPath)('electron');e.dialog.showOpenDialog=async()=>({canceled:false,filePaths:${JSON.stringify(sources)}});return true})()`)
    const selected = await evaluate('window.aiPlayer.chat.openAny()', true)
    assert.equal(selected.media.length, sources.length, 'native file selection authorizes exactly the matrix')
  }
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index]
    if (index) {
      if (inAppOpen) await evaluate(`window.aiPlayer.player.loadFile(${JSON.stringify(source)})`, true)
      else {
      const forwarded = launch(source)
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { forwarded.kill(); reject(new Error('Forwarded instance did not exit')) }, 15000)
        forwarded.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Forwarded instance exit ${code}`)) })
      })
      }
      await sleep(100)
    }
    const loaded = await waitFor(s => s.present && s.readyState >= 2 && s.duration > 0 && !s.error && s.history?.src === source, `load ${source}`)
    assert.equal(loaded.visibility, 'visible', 'Playback test window must be visible')
    const target = Math.min(6, loaded.duration / 3)
    // A two-second fixture may legitimately end during cold-start/CDP latency.
    // Normalize through the real controls before testing seek and resume.
    await evaluate(`(() => {
      const media = document.querySelector('[data-ai-player-video], [data-ai-player-audio]');
      media.loop = true;
      const play = document.querySelector('.player-video-controls button[title]');
      if (play.title.startsWith('暂停')) play.click();
    })()`)
    await waitFor(s => s.paused && s.playTitle?.startsWith('播放'), 'normalize short fixture pause', 5000)
    await evaluate(`document.querySelector('[data-ai-player-video], [data-ai-player-audio]').currentTime = ${target}`)
    await toggle()
    await waitFor(s => !s.paused && s.readyState >= 2, 'start normalized fixture', 5000)
    if (loaded.duration > 10) await waitFor(s => s.currentTime >= target + 2 && !s.paused, 'advance original')
    else { await sleep(400); assert.equal((await state()).paused, false, `not playing ${source}`) }
    await toggle()
    await waitFor(s => s.paused, 'pause', 5000)
    await toggle()
    await waitFor(s => !s.paused, 'resume', 5000)
    const result = await state()
    assert.equal(result.error, null)
    if (!path.basename(source).startsWith('audio.')) { assert.ok(result.width > 0 && result.height > 0 && result.frames > 0, `video must decode real frames: ${source}`); assert.equal(result.fit, 'contain') }
    if (index) assert.ok(result.audioBytes > 0, `audio track must decode real samples: ${source}`)
    assert.equal(result.history.src, source, 'History must retain the original, never the cache')
    if (!index) {
      await evaluate(`window.__mediaBeforeFullscreen = document.querySelector('[data-ai-player-video]'); true`)
      await evaluate(`document.querySelector('[data-ai-player-video]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`)
      await waitFor(s => s.full, 'enter fullscreen', 5000)
      assert.equal(await evaluate(`document.querySelector('[data-ai-player-video]') === window.__mediaBeforeFullscreen`), true, 'fullscreen must preserve the playing media element')
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await waitFor(s => !s.full && !s.theater, 'escape fullscreen', 5000)
      assert.equal(await evaluate(`document.querySelector('[data-ai-player-video]') === window.__mediaBeforeFullscreen`), true, 'ESC must preserve the playing media element')
      await waitFor(s => s.readyState >= 2 && !s.recovery && s.currentTime >= target + 2.5, 'continue after fullscreen', 10000)
      const shot = await command('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(evidence, 'original-in-player.png'), Buffer.from(shot.data, 'base64'))
    }
    receipts.push({ source, ...result, controlsPassed: true })
    console.log(`PASS UI ${path.basename(source)} (${result.width ? 'video' : 'audio'})`)
  }
  const rapid = await evaluate(`Promise.all(['a','b','c'].map(id => window.aiPlayer.inlinePlayback.prepare({ requestId:'rapid-'+id, sourcePath:${JSON.stringify(original)}, kind:'video' })))`, true)
  assert.equal(rapid[0].cancelled, true)
  assert.equal(rapid[1].cancelled, true)
  assert.equal(rapid[2].success, true, JSON.stringify(rapid))
  const mpvWindows = spawnSync('powershell.exe', ['-NoProfile', '-Command', "Get-Process mpv -ErrorAction SilentlyContinue | Select-Object Id,Path,MainWindowHandle | ConvertTo-Json -Compress"], { windowsHide: true, encoding: 'utf8' })
  const processes = mpvWindows.stdout.trim() ? [JSON.parse(mpvWindows.stdout)].flat() : []
  const own = processes.filter(p => p.Path?.toLowerCase() === path.join(path.dirname(exe), 'resources/bin/win/mpv.exe').toLowerCase())
  assert.ok(own.every(p => p.MainWindowHandle === 0), 'No separate mpv window may exist')
  fs.writeFileSync(path.join(evidence, 'receipt.json'), JSON.stringify({ executable: exe, profile, openMode: inAppOpen ? 'native-selection-and-in-app-open' : 'external-second-instance', componentMode: suppliedFfmpeg ? 'preinstalled-hash-verified-ffmpeg' : 'fresh-profile-auto-download', passed: receipts.length, noExternalMpvWindows: true, rapidCancellationPassed: true, receipts }, null, 2))
  console.log(JSON.stringify({ passed: receipts.length, evidence }))
} catch (error) {
  fs.writeFileSync(path.join(evidence, 'failed-receipt.json'), JSON.stringify({executable:exe,profile,openMode:inAppOpen?'native-selection-and-in-app-open':'external-second-instance',passed:receipts.length,failure:error.message,receipts},null,2))
  throw error
} finally {
  mainInspector?.close()
  ws?.close()
  if (child.exitCode === null) {
    child.kill()
    await new Promise(resolve => { const timer = setTimeout(resolve, 5000); child.once('exit', () => { clearTimeout(timer); resolve() }) })
  }
}
