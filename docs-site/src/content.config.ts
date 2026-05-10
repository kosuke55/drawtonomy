import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Frontmatter extensions used for SEO:
// - keywords: extra terms surfaced as <meta name="keywords">
// - ogImage:  per-page social card override (defaults to /og.png)
// - jsonLd:   one or more JSON-LD objects injected as <script type="application/ld+json">
const seoSchema = z.object({
	keywords: z.array(z.string()).optional(),
	ogImage: z.string().optional(),
	jsonLd: z.any().optional(),
});

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({ extend: seoSchema }),
	}),
};
