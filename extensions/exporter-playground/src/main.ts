// Exporter Playground — runs @drawtonomy/sdk exporters against the live
// canvas snapshot. Useful for SDK contributors to verify exporter changes
// against a real scene without copy-pasting fixtures by hand.

import { ExtensionClient, exporter, type DrawtonomySnapshot } from '@drawtonomy/sdk'

const client = new ExtensionClient('exporter-playground')

const dom = {
  status: document.getElementById('status') as HTMLDivElement,
  snapshotInfo: document.getElementById('snapshot-info') as HTMLDivElement,
  baseName: document.getElementById('base-name') as HTMLInputElement,
  btnXodr: document.getElementById('btn-xodr') as HTMLButtonElement,
  btnXosc: document.getElementById('btn-xosc') as HTMLButtonElement,
  btnEsmini: document.getElementById('btn-esmini') as HTMLButtonElement,
  btnRefresh: document.getElementById('btn-refresh') as HTMLButtonElement,
}

let snapshot: DrawtonomySnapshot | null = null

function setStatus(message: string, kind: 'info' | 'ok' | 'err' = 'info') {
  dom.status.textContent = message
  dom.status.classList.remove('ok', 'err')
  if (kind === 'ok') dom.status.classList.add('ok')
  if (kind === 'err') dom.status.classList.add('err')
}

function setExportButtonsEnabled(enabled: boolean) {
  dom.btnXodr.disabled = !enabled
  dom.btnXosc.disabled = !enabled
  dom.btnEsmini.disabled = !enabled
}

function summarizeSnapshot(s: DrawtonomySnapshot): string {
  const counts = new Map<string, number>()
  for (const shape of s.shapes) {
    counts.set(shape.type, (counts.get(shape.type) ?? 0) + 1)
  }
  if (counts.size === 0) return 'Snapshot is empty.'
  const parts = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, n]) => `${type}: ${n}`)
  return `${s.shapes.length} shapes (${parts.join(', ')})`
}

async function refreshSnapshot() {
  setStatus('Fetching snapshot…')
  try {
    snapshot = await client.requestSnapshot()
    dom.snapshotInfo.textContent = summarizeSnapshot(snapshot)
    setExportButtonsEnabled(snapshot.shapes.length > 0)
    setStatus(
      snapshot.shapes.length > 0 ? 'Ready.' : 'Snapshot is empty — draw something first.',
      snapshot.shapes.length > 0 ? 'ok' : 'info'
    )
  } catch (err) {
    snapshot = null
    setExportButtonsEnabled(false)
    dom.snapshotInfo.textContent = 'Failed to fetch snapshot.'
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Error: ${message}`, 'err')
    client.notify(`Exporter Playground: snapshot fetch failed (${message})`, 'error')
  }
}

function getBaseName(): string {
  const raw = dom.baseName.value.trim()
  return exporter.sanitizeFileBaseName(raw) ?? 'my-scene'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke on next tick to ensure the click handler has run.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function downloadString(content: string, filename: string, mime: string) {
  downloadBlob(new Blob([content], { type: mime }), filename)
}

async function exportXodr() {
  if (!snapshot) return
  try {
    const baseName = getBaseName()
    const xml = exporter.exportToOpenDrive(snapshot)
    downloadString(xml, `${baseName}.xodr`, 'application/xml')
    setStatus(`Downloaded ${baseName}.xodr`, 'ok')
    client.notify(`Exported ${baseName}.xodr`, 'success')
  } catch (err) {
    handleExportError('OpenDRIVE', err)
  }
}

async function exportXosc() {
  if (!snapshot) return
  try {
    const baseName = getBaseName()
    const xml = exporter.exportToOpenScenario(snapshot, {
      xodrFilename: `${baseName}.xodr`,
    })
    downloadString(xml, `${baseName}.xosc`, 'application/xml')
    setStatus(`Downloaded ${baseName}.xosc`, 'ok')
    client.notify(`Exported ${baseName}.xosc`, 'success')
  } catch (err) {
    handleExportError('OpenSCENARIO', err)
  }
}

async function exportEsminiZip() {
  if (!snapshot) return
  try {
    const requested = dom.baseName.value.trim()
    const result = exporter.buildEsminiZip(snapshot, {
      baseName: requested.length > 0 ? requested : undefined,
    })
    downloadBlob(result.blob, `${result.baseName}.zip`)
    setStatus(`Downloaded ${result.baseName}.zip`, 'ok')
    client.notify(`Exported ${result.baseName}.zip`, 'success')
  } catch (err) {
    handleExportError('esmini bundle', err)
  }
}

function handleExportError(label: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  setStatus(`${label} export failed: ${message}`, 'err')
  client.notify(`Exporter Playground: ${label} export failed (${message})`, 'error')
  console.error(err)
}

dom.btnXodr.addEventListener('click', exportXodr)
dom.btnXosc.addEventListener('click', exportXosc)
dom.btnEsmini.addEventListener('click', exportEsminiZip)
dom.btnRefresh.addEventListener('click', refreshSnapshot)

;(async () => {
  try {
    const init = await client.waitForInit()
    if (!init.grantedCapabilities.includes('snapshot:read')) {
      setStatus('Host did not grant snapshot:read capability.', 'err')
      dom.snapshotInfo.textContent = 'Cannot fetch snapshot without snapshot:read.'
      return
    }
    dom.btnRefresh.disabled = false
    await refreshSnapshot()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Init failed: ${message}`, 'err')
  }
})()
