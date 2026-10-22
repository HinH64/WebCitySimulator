// Renders the share preview and home screen icon in scripts/images/*.html to public/*.png with headless Chrome.
// Set CHROME to the browser's path if it is not in the default Windows location.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const images = [
  { html: 'og.html', png: 'og.png', size: '1200,630' },
  { html: 'icon.html', png: 'apple-touch-icon.png', size: '180,180' },
]

const profile = mkdtempSync(join(tmpdir(), 'images-'))
try {
  for (const { html, png, size } of images) {
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--user-data-dir=${profile}`,
      `--window-size=${size}`,
      `--screenshot=${resolve('public', png)}`,
      pathToFileURL(resolve('scripts/images', html)).href,
    ])
    console.log(`public/${png}`)
  }
} finally {
  rmSync(profile, { recursive: true, force: true })
}
