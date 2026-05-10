#!/usr/bin/env node
// Render a 1200x630 og:image PNG from an inline SVG so social previews
// have a proper card. Run once and commit the result.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'og.png');
const LOGO = join(HERE, '..', 'src', 'assets', 'logo.png');

const logoB64 = (await readFile(LOGO)).toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#eef2ff"/>
			<stop offset="0.55" stop-color="#c4b5fd"/>
			<stop offset="1" stop-color="#a5b4fc"/>
		</linearGradient>
	</defs>
	<rect width="1200" height="630" fill="url(#bg)"/>
	<g transform="translate(96 168)">
		<image href="data:image/png;base64,${logoB64}" width="120" height="120"/>
	</g>
	<g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" fill="#1f1f3d">
		<text x="240" y="226" font-size="72" font-weight="700">drawtonomy</text>
		<text x="240" y="282" font-size="32" font-weight="500">A free, install-free whiteboard</text>
		<text x="240" y="324" font-size="32" font-weight="500">for driving diagrams.</text>
		<text x="240" y="424" font-size="26" fill="#3730a3" font-weight="500">Lanes · Intersections · Crosswalks · Vehicles · Pedestrians</text>
		<text x="240" y="468" font-size="26" fill="#3730a3" font-weight="500">OpenDRIVE / OpenSCENARIO / Lanelet2 export</text>
	</g>
	<text x="96" y="572" font-family="-apple-system, system-ui, sans-serif" font-size="22" fill="#312e81" font-weight="600">docs.drawtonomy.com</text>
</svg>`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
const page = await ctx.newPage();
await page.setContent(
	`<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`,
	{ waitUntil: 'load' },
);
const buf = await page.locator('svg').first().screenshot({ omitBackground: false });
await writeFile(OUT, buf);
await browser.close();
console.log(`✓ wrote ${OUT}`);
