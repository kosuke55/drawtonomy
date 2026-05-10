// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://docs.drawtonomy.com',
	integrations: [
		starlight({
			title: 'drawtonomy docs',
			description:
				'Documentation for drawtonomy — a free, install-free whiteboard for driving diagrams. Sketch lanes, intersections, vehicles, crosswalks, and traffic scenarios in the browser; export to OpenDRIVE, OpenSCENARIO, and Lanelet2.',
			customCss: ['./src/styles/custom.css'],
			routeMiddleware: ['./src/route-data.ts'],
			logo: {
				src: './src/assets/logo.png',
				alt: 'drawtonomy',
			},
			favicon: '/favicon.png',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/kosuke55/drawtonomy',
				},
				{
					icon: 'external',
					label: 'App',
					href: 'https://drawtonomy.com',
				},
			],
			editLink: {
				baseUrl:
					'https://github.com/kosuke55/drawtonomy/edit/main/docs-site/',
			},
			lastUpdated: true,
			pagination: true,
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
			sidebar: [
				{
					label: 'Start here',
					items: [
						{ label: 'Introduction', slug: 'start/introduction' },
						{ label: 'Quickstart', slug: 'start/quickstart' },
					],
				},
				{
					label: 'Tutorials',
					collapsed: false,
					items: [{ autogenerate: { directory: 'tutorials' } }],
				},
				{
					label: 'How-to guides',
					collapsed: false,
					items: [{ autogenerate: { directory: 'guides' } }],
				},
				{
					label: 'Reference',
					collapsed: true,
					items: [{ autogenerate: { directory: 'reference' } }],
				},
				{
					label: 'Explanation',
					collapsed: true,
					items: [{ autogenerate: { directory: 'explanation' } }],
				},
				{
					label: 'Extending drawtonomy',
					collapsed: true,
					items: [{ autogenerate: { directory: 'extend' } }],
				},
				{ label: 'FAQ', slug: 'faq' },
				{ label: 'Contact', slug: 'contact' },
			],
			components: {},
			head: [
				{
					tag: 'meta',
					attrs: {
						property: 'og:image',
						content: 'https://docs.drawtonomy.com/og.png',
					},
				},
			],
		}),
	],
});
