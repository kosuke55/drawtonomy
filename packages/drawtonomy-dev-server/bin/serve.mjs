#!/usr/bin/env node
import { createServer } from 'http'
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs'
import { join, extname, dirname } from 'path'
import { tmpdir, homedir } from 'os'
import https from 'https'

const HOST_URL = process.env.DRAWTONOMY_HOST || 'https://www.drawtonomy.com'
const PORT = parseInt(process.env.PORT || '3000', 10)
const CACHE_DIR = join(homedir(), '.drawtonomy-dev-server', 'cache')
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

function getMimeType(filePath) {
  return MIME_TYPES[extname(filePath)] || 'application/octet-stream'
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'drawtonomy-dev-server' } }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function extractAssetPaths(html) {
  const paths = new Set()
  // <script src="...">
  const scriptRe = /src=["']([^"']+)["']/g
  let m
  while ((m = scriptRe.exec(html)) !== null) {
    if (m[1].startsWith('/')) paths.add(m[1])
  }
  // <link href="...">
  const linkRe = /href=["']([^"']+)["']/g
  while ((m = linkRe.exec(html)) !== null) {
    if (m[1].startsWith('/')) paths.add(m[1])
  }
  return [...paths]
}

function extractSecondaryAssets(jsContent, cssContent) {
  const paths = new Set()
  // JS内のアセット参照: "/assets/xxx" or "/fonts/xxx" or "/templates/xxx"
  const re = /"(\/(?:assets|fonts|templates|icons)[^"]+)"/g
  let m
  const content = jsContent + cssContent
  while ((m = re.exec(content)) !== null) {
    paths.add(m[1])
  }
  // CSS内のurl()
  const urlRe = /url\(["']?(\/[^"')]+)["']?\)/g
  while ((m = urlRe.exec(cssContent)) !== null) {
    paths.add(m[1])
  }
  return [...paths]
}

function isCacheValid() {
  const metaPath = join(CACHE_DIR, '.meta.json')
  if (!existsSync(metaPath)) return false
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    return Date.now() - meta.timestamp < CACHE_TTL_MS
  } catch {
    return false
  }
}

function writeCacheMeta() {
  const metaPath = join(CACHE_DIR, '.meta.json')
  writeFileSync(metaPath, JSON.stringify({ timestamp: Date.now(), host: HOST_URL }))
}

function saveToCacheSync(urlPath, buffer) {
  const filePath = join(CACHE_DIR, urlPath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, buffer)
}

async function downloadSite() {
  console.log(`  Downloading from ${HOST_URL} ...`)

  // 1. index.html
  const indexHtml = await fetchUrl(HOST_URL)
  const htmlStr = indexHtml.toString('utf-8')
  saveToCacheSync('/index.html', indexHtml)

  // 2. Primary assets (from HTML)
  const primaryPaths = extractAssetPaths(htmlStr)
  console.log(`  Found ${primaryPaths.length} primary assets`)

  let jsContent = ''
  let cssContent = ''

  for (const p of primaryPaths) {
    try {
      const buf = await fetchUrl(HOST_URL + p)
      saveToCacheSync(p, buf)
      if (p.endsWith('.js')) jsContent += buf.toString('utf-8')
      if (p.endsWith('.css')) cssContent += buf.toString('utf-8')
    } catch (err) {
      console.warn(`  Warning: Failed to download ${p}: ${err.message}`)
    }
  }

  // 3. Secondary assets (from JS/CSS)
  const secondaryPaths = extractSecondaryAssets(jsContent, cssContent)
  if (secondaryPaths.length > 0) {
    console.log(`  Found ${secondaryPaths.length} secondary assets (fonts, templates, etc.)`)
    for (const p of secondaryPaths) {
      if (existsSync(join(CACHE_DIR, p))) continue
      try {
        const buf = await fetchUrl(HOST_URL + p)
        saveToCacheSync(p, buf)
      } catch {
        // Non-critical: fonts/templates may not all be needed
      }
    }
  }

  // 4. Common static files
  const staticFiles = ['/favicon.png', '/robots.txt', '/sitemap.xml']
  for (const p of staticFiles) {
    try {
      const buf = await fetchUrl(HOST_URL + p)
      saveToCacheSync(p, buf)
    } catch {
      // Optional files
    }
  }

  writeCacheMeta()
  console.log(`  Cached to ${CACHE_DIR}`)
}

async function ensureCache() {
  if (isCacheValid()) {
    console.log(`  Using cached files (< 1 hour old)`)
    return
  }
  await downloadSite()
}

// --- Main ---

async function main() {
  console.log()
  console.log('  drawtonomy Dev Server')
  console.log()

  try {
    await ensureCache()
  } catch (err) {
    if (existsSync(join(CACHE_DIR, 'index.html'))) {
      console.warn(`  Warning: Could not update cache (${err.message}), using stale cache`)
    } else {
      console.error(`  Error: Could not download from ${HOST_URL}: ${err.message}`)
      console.error(`  Make sure ${HOST_URL} is accessible.`)
      process.exit(1)
    }
  }

  const server = createServer((req, res) => {
    let urlPath = req.url.split('?')[0]
    if (urlPath === '/') urlPath = '/index.html'

    const filePath = join(CACHE_DIR, urlPath)

    // Prevent directory traversal
    if (!filePath.startsWith(CACHE_DIR)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const content = readFileSync(filePath)
      res.writeHead(200, {
        'Content-Type': getMimeType(filePath),
        'Cache-Control': 'no-cache',
      })
      res.end(content)
    } else {
      // SPA fallback
      const indexPath = join(CACHE_DIR, 'index.html')
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath)
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        })
        res.end(content)
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    }
  })

  server.listen(PORT, () => {
    console.log()
    console.log(`  Local:  http://localhost:${PORT}/`)
    console.log()
    console.log('  Load an extension:')
    console.log(`  http://localhost:${PORT}/?ext=http://localhost:3001/manifest.json`)
    console.log()
    console.log('  Cache expires in 1 hour. Run with --fresh to force re-download.')
    console.log()
  })
}

// --fresh flag
if (process.argv.includes('--fresh')) {
  const metaPath = join(CACHE_DIR, '.meta.json')
  if (existsSync(metaPath)) {
    writeFileSync(metaPath, JSON.stringify({ timestamp: 0 }))
  }
}

main()
