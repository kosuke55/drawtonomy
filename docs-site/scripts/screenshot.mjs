#!/usr/bin/env node
// Capture annotated screenshots of drawtonomy.com for the docs site.
//
// Usage:
//   node scripts/screenshot.mjs            # run all shots
//   node scripts/screenshot.mjs <name>     # run a single shot
//   DT_APP_URL=http://localhost:3000 node scripts/screenshot.mjs
//
// Each shot returns { regions } where regions are { selector|box, label,
// kind? }. The script:
//   1. takes a viewport screenshot
//   2. resolves bounding boxes for any selector-based regions
//   3. emits an annotated SVG (PNG embedded + indigo callout boxes)
//      and the raw PNG side-by-side under public/img/.

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'img');
const APP = process.env.DT_APP_URL ?? 'https://drawtonomy.com';
const VIEWPORT = { width: 1440, height: 900 };

const PALETTE = {
	primary: '#6366f1', // indigo-500
	primaryFill: 'rgba(99, 102, 241, 0.18)',
};

// ---------- annotation ----------

function svgFor(pngBase64, width, height, regions) {
	// Decide a label placement that does not overlap the highlight box of
	// any *other* region. We try below → above → right → left, in that
	// order. `placement` may be set per-region to force a side.
	const others = regions.map((r) => ({
		x: r.x - 4,
		y: r.y - 4,
		w: r.w + 8,
		h: r.h + 8,
	}));
	const intersects = (a, b) =>
		!(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);

	// Reserve label boxes incrementally so a later label can avoid an
	// earlier label too.
	const placedLabels = [];

	const overlays = regions
		.map((r, i) => {
			const label = r.label ?? String(i + 1);
			const pad = 4;
			const box = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
			const labelW = 18 + label.length * 7;
			const labelH = 22;
			const gap = 8;

			let pick;
			let drawLeader = false;

			if (r.anchor) {
				// Caller-provided anchor — pin label there and draw a leader.
				pick = { x: r.anchor.x, y: r.anchor.y };
				drawLeader = true;
			} else {
				const placements = (() => {
					const list = [
						{ x: box.x + box.w / 2 - labelW / 2, y: box.y + box.h + gap },
						{ x: box.x + box.w / 2 - labelW / 2, y: box.y - labelH - gap },
						{ x: box.x + box.w + gap, y: box.y + box.h / 2 - labelH / 2 },
						{ x: box.x - labelW - gap, y: box.y + box.h / 2 - labelH / 2 },
					];
					if (r.placement === 'below') return list;
					if (r.placement === 'above') return [list[1], list[0], list[2], list[3]];
					if (r.placement === 'right') return [list[2], list[3], list[0], list[1]];
					if (r.placement === 'left') return [list[3], list[2], list[0], list[1]];
					return list;
				})();

				pick = placements[placements.length - 1];
				for (const p of placements) {
					const inViewport =
						p.x >= 0 && p.y >= 0 && p.x + labelW <= width && p.y + labelH <= height;
					if (!inViewport) continue;
					const lb = { x: p.x, y: p.y, w: labelW, h: labelH };
					const collidesBox = others.some((o, j) => j !== i && intersects(lb, o));
					const collidesLabel = placedLabels.some((o) => intersects(lb, o));
					if (!collidesBox && !collidesLabel) {
						pick = p;
						break;
					}
				}
			}

			placedLabels.push({ x: pick.x, y: pick.y, w: labelW, h: labelH });

			const leader = drawLeader
				? `<line x1="${pick.x + labelW / 2}" y1="${pick.y + labelH}"
					x2="${box.x + box.w / 2}" y2="${box.y + box.h / 2}"
					stroke="${PALETTE.primary}" stroke-width="2"/>`
				: '';

			return `
		<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="6"
			fill="${PALETTE.primaryFill}" stroke="${PALETTE.primary}"
			stroke-width="3"/>
		${leader}
		<g transform="translate(${pick.x} ${pick.y})">
			<rect width="${labelW}" height="${labelH}" rx="11"
				fill="${PALETTE.primary}"/>
			<text x="${labelW / 2}" y="${labelH / 2 + 4}"
				text-anchor="middle"
				font-family="-apple-system, system-ui, sans-serif"
				font-size="13" font-weight="600" fill="white">${label}</text>
		</g>`;
		})
		.join('');

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
	<image href="data:image/png;base64,${pngBase64}" width="${width}" height="${height}"/>
	${overlays}
</svg>
`;
}

// ---------- helpers ----------

async function dismissOverlays(page) {
	for (const sel of [
		'button:has-text("Got it")',
		'button:has-text("OK")',
		'button:has-text("Accept")',
		'[aria-label="Close"]',
	]) {
		const btn = page.locator(sel).first();
		if (await btn.count()) await btn.click({ timeout: 500 }).catch(() => {});
	}
}

async function box(page, selector) {
	const b = await page.locator(selector).first().boundingBox();
	if (!b) throw new Error(`No box for ${selector}`);
	return { x: b.x, y: b.y, w: b.width, h: b.height };
}

async function unionBox(page, selectors) {
	const boxes = await Promise.all(selectors.map((s) => box(page, s)));
	const x = Math.min(...boxes.map((b) => b.x));
	const y = Math.min(...boxes.map((b) => b.y));
	const right = Math.max(...boxes.map((b) => b.x + b.w));
	const bottom = Math.max(...boxes.map((b) => b.y + b.h));
	return { x, y, w: right - x, h: bottom - y };
}

// ---------- shots ----------

const SHOTS = {
	// Toolbar with each key tool labelled by its keyboard shortcut.
	async toolbar(page) {
		await page.goto(APP, { waitUntil: 'networkidle' });
		await dismissOverlays(page);
		await page.waitForTimeout(800);
		const regions = [
			{ ...(await box(page, '[data-testid="tools.select"]')), label: 'V' },
			{ ...(await box(page, '[data-testid="tools.linestring"]')), label: 'L' },
			{ ...(await box(page, '[data-testid="tools.lane"]')), label: 'N' },
			{ ...(await box(page, '[data-testid="tools.vehicle"]')), label: 'P' },
			{ ...(await box(page, '[data-testid="tools.path"]')), label: 'H' },
			{ ...(await box(page, '[data-testid="tools.polygon"]')), label: 'G' },
			{ ...(await box(page, '[data-testid="tools.crosswalk"]')), label: 'X' },
			{ ...(await box(page, '[data-testid="tools.intersection"]')), label: 'I' },
		];
		return { regions };
	},

	// Crop just the bottom toolbar region with Lane / Vehicle labelled.
	async toolbarStrip(page) {
		await page.goto(APP, { waitUntil: 'networkidle' });
		await dismissOverlays(page);
		await page.waitForTimeout(800);
		const tb = await box(page, '.mobile-toolbar');
		const lane = await box(page, '[data-testid="tools.lane"]');
		const vehicle = await box(page, '[data-testid="tools.vehicle"]');
		const regions = [
			{ ...lane, label: 'Lane (N)', anchor: { x: lane.x - 60, y: lane.y - 32 } },
			{
				...vehicle,
				label: 'Vehicle (P)',
				anchor: { x: vehicle.x + vehicle.w + 30, y: vehicle.y - 32 },
			},
		];
		return {
			regions,
			crop: { x: tb.x - 80, y: tb.y - 56, w: tb.w + 160, h: tb.h + 72 },
		};
	},

	// Just the menu (top-left).
	async menu(page) {
		await page.goto(APP, { waitUntil: 'networkidle' });
		await dismissOverlays(page);
		await page.waitForTimeout(800);
		const regions = [
			{ ...(await box(page, '[aria-label="Menu"]')), label: 'Menu' },
		];
		return { regions };
	},

	// Lane tool highlighted on the toolbar.
	async laneTool(page) {
		await page.goto(APP, { waitUntil: 'networkidle' });
		await dismissOverlays(page);
		await page.waitForTimeout(800);
		const regions = [
			{ ...(await box(page, '[data-testid="tools.lane"]')), label: 'Lane (N)' },
		];
		return { regions };
	},

	// Menu opened, the standalone "Export" row highlighted.
	async menuExport(page) {
		await page.goto(APP, { waitUntil: 'networkidle' });
		await dismissOverlays(page);
		await page.waitForTimeout(800);
		await page.locator('[aria-label="Menu"]').click();
		await page.waitForTimeout(500);
		// Pick the menu row whose entire visible text is exactly Export.
		const target = await page.evaluate(() => {
			const rows = [...document.querySelectorAll('button, [role="menuitem"], div')];
			for (const el of rows) {
				const txt = el.textContent?.trim();
				if (txt !== 'Export') continue;
				const r = el.getBoundingClientRect();
				if (r.width < 40 || r.height < 16) continue; // skip the tiny label inside Import
				if (r.x > 220) continue; // menu is anchored top-left
				return { x: r.x, y: r.y, w: r.width, h: r.height };
			}
			return null;
		});
		const regions = target
			? [
					{
						x: target.x - 4,
						y: target.y - 4,
						w: target.w + 8,
						h: target.h + 8,
						label: 'Export',
					},
				]
			: [];
		return { regions };
	},

	// Place a vehicle, select it, then highlight Template + Colour rows
	// in the Attribute Panel.
	async vehicleAttributePanel(page) {
		await page.goto(APP, { waitUntil: 'networkidle' });
		await dismissOverlays(page);
		await page.waitForTimeout(800);

		await page.locator('[data-testid="tools.vehicle"]').click();
		await page.waitForTimeout(200);
		await page.mouse.click(700, 450);
		await page.waitForTimeout(300);

		await page.locator('[data-testid="tools.select"]').click();
		await page.waitForTimeout(200);
		await page.mouse.click(700, 450);
		await page.waitForTimeout(600);

		// Use the section labels TEMPLATE and COLOR in the right panel as
		// anchors. Their next sibling is the row of buttons we want.
		const sections = await page.evaluate(() => {
			// Walk every element, take its trimmed text, keep ones whose
			// own text exactly equals TEMPLATE or COLOR — this avoids
			// matching descendants of larger sections.
			const out = [];
			for (const el of document.querySelectorAll('*')) {
				const t = el.textContent?.trim() ?? '';
				const own = [...el.childNodes]
					.filter((n) => n.nodeType === Node.TEXT_NODE)
					.map((n) => n.textContent.trim())
					.join('');
				if (!/^(TEMPLATE|COLOR)$/i.test(own)) continue;
				const r = el.getBoundingClientRect();
				if (r.x < 1100) continue;
				const sib = el.nextElementSibling?.getBoundingClientRect();
				if (!sib) continue;
				out.push({
					label: own.slice(0, 1) + own.slice(1).toLowerCase(),
					row: { x: sib.x, y: sib.y, w: sib.width, h: sib.height },
				});
			}
			return out;
		});

		// Pin labels to the left of the right-side panel with a leader.
		// Pin labels off to the left of the panel with a leader.
		const regions = sections.map((s) => ({
			...s.row,
			label: s.label,
			anchor: { x: s.row.x - 160, y: s.row.y + s.row.h / 2 - 11 },
		}));
		return { regions };
	},

	// Bottom-left zoom + rotation panels with labels.
	async bottomLeft(page) {
		await page.goto(APP, { waitUntil: 'networkidle' });
		await dismissOverlays(page);
		await page.waitForTimeout(800);
		const zoom = await box(page, '[data-testid="zoom-panel"]');
		const rot = await box(page, '[data-testid="rotation-panel"]');
		const regions = [
			{ ...zoom, label: 'Zoom', anchor: { x: zoom.x, y: zoom.y - 32 } },
			{ ...rot, label: 'Rotation', anchor: { x: rot.x + rot.w + 8, y: rot.y - 32 } },
		];
		const pad = 24;
		const left = Math.min(zoom.x, rot.x) - pad;
		const top = Math.min(zoom.y, rot.y) - 60;
		const right = Math.max(zoom.x + zoom.w, rot.x + rot.w) + pad + 60;
		const bottom = Math.max(zoom.y + zoom.h, rot.y + rot.h) + pad;
		return {
			regions,
			crop: { x: left, y: top, w: right - left, h: bottom - top },
		};
	},

	// Menu opened, Map row (Off / Road / Satellite) highlighted.
	async mapBackground(page) {
		await page.goto(APP, { waitUntil: 'networkidle' });
		await dismissOverlays(page);
		await page.waitForTimeout(800);
		await page.locator('[aria-label="Menu"]').click();
		await page.waitForTimeout(500);
		const target = await page.evaluate(() => {
			// Find the row whose first text node says "Map"; the row holds
			// Off/Road/Satellite buttons next to it.
			for (const el of document.querySelectorAll('div, span, label')) {
				const own = [...el.childNodes]
					.filter((n) => n.nodeType === Node.TEXT_NODE)
					.map((n) => n.textContent.trim())
					.join('');
				if (own !== 'Map') continue;
				// Walk up to the parent row (contains the Off/Road/Satellite buttons too).
				const row = el.parentElement;
				if (!row) continue;
				const r = row.getBoundingClientRect();
				if (r.x > 250) continue;
				return { x: r.x, y: r.y, w: r.width, h: r.height };
			}
			return null;
		});
		const regions = target
			? [
					{
						x: target.x - 6,
						y: target.y - 4,
						w: target.w + 12,
						h: target.h + 8,
						label: 'Map',
					},
				]
			: [];
		return { regions };
	},

	// Extensions button (bottom-right).
	async extensions(page) {
		await page.goto(APP, { waitUntil: 'networkidle' });
		await dismissOverlays(page);
		await page.waitForTimeout(800);
		const regions = [
			{
				...(await box(page, '[data-testid="extension-panel-collapsed"]')),
				label: 'Extensions',
			},
		];
		return { regions };
	},

	// Whole UI with the menu, toolbar block, and extensions panel
	// labelled as 1, 2, 3 — useful for the introduction page.
	async overview(page) {
		await page.goto(APP, { waitUntil: 'networkidle' });
		await dismissOverlays(page);
		await page.waitForTimeout(800);
		const regions = [
			{ ...(await box(page, '[aria-label="Menu"]')), label: '1' },
			{ ...(await box(page, '.mobile-toolbar')), label: '2' },
			{
				...(await box(page, '[data-testid="extension-panel-collapsed"]')),
				label: '3',
			},
		];
		return { regions };
	},
};

// ---------- runner ----------

async function run() {
	if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

	const only = process.argv[2];
	if (only && !SHOTS[only]) {
		console.error(`Unknown shot: ${only}`);
		console.error(`Available: ${Object.keys(SHOTS).join(', ')}`);
		process.exit(1);
	}
	const shots = only ? { [only]: SHOTS[only] } : SHOTS;

	const browser = await chromium.launch();
	const context = await browser.newContext({ viewport: VIEWPORT });
	const page = await context.newPage();

	const renderPage = await context.newPage();

	for (const [name, fn] of Object.entries(shots)) {
		process.stdout.write(`→ ${name}…`);
		const { regions, crop } = await fn(page);
		const buf = await page.screenshot({
			fullPage: false,
			clip: crop
				? { x: crop.x, y: crop.y, width: crop.w, height: crop.h }
				: undefined,
		});
		// When a crop is applied the regions are still in viewport coords;
		// shift them (and any anchor) into the cropped frame.
		const finalRegions = (regions ?? []).map((r) => {
			if (!crop) return r;
			const shifted = { ...r, x: r.x - crop.x, y: r.y - crop.y };
			if (r.anchor) {
				shifted.anchor = {
					x: r.anchor.x - crop.x,
					y: r.anchor.y - crop.y,
				};
			}
			return shifted;
		});
		const W = crop ? crop.w : VIEWPORT.width;
		const H = crop ? crop.h : VIEWPORT.height;
		const svg = svgFor(buf.toString('base64'), W, H, finalRegions);
		await writeFile(join(OUT, `${name}.svg`), svg);

		// Render the annotated SVG back to PNG so docs can embed a single
		// raster (universal browser support) and so we can eyeball it.
		await renderPage.setContent(
			`<!doctype html><html><head><style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style></head><body>${svg}</body></html>`,
			{ waitUntil: 'load' },
		);
		const flat = await renderPage
			.locator('svg')
			.first()
			.screenshot({ omitBackground: false });
		await writeFile(join(OUT, `${name}.png`), flat);
		console.log(` ✓  ${finalRegions.length} region(s)`);
	}

	await browser.close();
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
