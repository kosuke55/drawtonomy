import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

// Site-wide keyword fallback. Per-page `keywords` frontmatter wins.
const SITE_KEYWORDS = [
	'driving scenario diagram',
	'autonomous driving whiteboard',
	'lane editor',
	'intersection diagram tool',
	'OpenSCENARIO editor',
	'OpenDRIVE editor',
	'Lanelet2 editor browser',
	'esmini scenario authoring',
	'ROS occupancy grid annotation',
	'road network sketching',
	'crosswalk diagram tool',
	'traffic scenario sketch',
	'free online driving diagram tool',
];

export const onRequest = defineRouteMiddleware((context) => {
	const { head, entry } = context.locals.starlightRoute;
	const data = entry.data as typeof entry.data & {
		keywords?: string[];
		ogImage?: string;
		jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
	};

	// keywords meta — page override or site-wide fallback.
	const keywords = (data.keywords && data.keywords.length > 0
		? data.keywords
		: SITE_KEYWORDS
	).join(', ');
	head.push({
		tag: 'meta',
		attrs: { name: 'keywords', content: keywords },
	});

	// per-page og:image override. Site-level og:image is already set in
	// astro.config.mjs (default /og.png).
	if (data.ogImage) {
		// Replace any existing og:image entry pushed by the site config.
		const idx = head.findIndex(
			(t) => t.tag === 'meta' && t.attrs?.property === 'og:image',
		);
		const tag = {
			tag: 'meta',
			attrs: { property: 'og:image', content: data.ogImage },
		} as const;
		if (idx >= 0) head[idx] = tag;
		else head.push(tag);
	}

	// JSON-LD structured data.
	if (data.jsonLd) {
		const blocks = Array.isArray(data.jsonLd) ? data.jsonLd : [data.jsonLd];
		for (const block of blocks) {
			head.push({
				tag: 'script',
				attrs: { type: 'application/ld+json' },
				content: JSON.stringify(block),
			});
		}
	} else {
		// Default TechArticle for ordinary docs pages — gives AI overviews
		// and rich-results something to anchor on without per-page boilerplate.
		// Skipped on the home (which sets its own SoftwareApplication block)
		// and on pages that opt out by setting jsonLd: false.
		const isSplash = (data as { template?: string }).template === 'splash';
		if (!isSplash && data.jsonLd !== false) {
			const url = new URL(context.url.pathname, 'https://docs.drawtonomy.com').toString();
			const tech: Record<string, unknown> = {
				'@context': 'https://schema.org',
				'@type': 'TechArticle',
				headline: data.title,
				description: data.description,
				url,
				inLanguage: 'en',
				isPartOf: {
					'@type': 'WebSite',
					name: 'drawtonomy docs',
					url: 'https://docs.drawtonomy.com',
				},
				about: {
					'@type': 'SoftwareApplication',
					name: 'drawtonomy',
					url: 'https://drawtonomy.com',
				},
			};
			head.push({
				tag: 'script',
				attrs: { type: 'application/ld+json' },
				content: JSON.stringify(tech),
			});
		}
	}
});
