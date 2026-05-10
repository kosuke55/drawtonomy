// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	site: 'https://docs.drawtonomy.com',
	integrations: [
		starlight({
			title: 'drawtonomy',
			description:
				'Documentation for drawtonomy — a free, install-free whiteboard for driving diagrams. Sketch lanes, intersections, vehicles, crosswalks, and traffic scenarios in the browser; export to OpenDRIVE, OpenSCENARIO, and Lanelet2.',
			customCss: ['./src/styles/custom.css'],
			routeMiddleware: ['./src/route-data.ts'],
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
				ja: { label: '日本語', lang: 'ja' },
				'zh-cn': { label: '简体中文', lang: 'zh-CN' },
				'zh-tw': { label: '繁體中文', lang: 'zh-TW' },
				ko: { label: '한국어', lang: 'ko' },
				de: { label: 'Deutsch', lang: 'de' },
				fr: { label: 'Français', lang: 'fr' },
				es: { label: 'Español', lang: 'es' },
				pt: { label: 'Português', lang: 'pt' },
				it: { label: 'Italiano', lang: 'it' },
				nl: { label: 'Nederlands', lang: 'nl' },
				sv: { label: 'Svenska', lang: 'sv' },
				pl: { label: 'Polski', lang: 'pl' },
				ru: { label: 'Русский', lang: 'ru' },
				tr: { label: 'Türkçe', lang: 'tr' },
				id: { label: 'Bahasa Indonesia', lang: 'id' },
				th: { label: 'ไทย', lang: 'th' },
				vi: { label: 'Tiếng Việt', lang: 'vi' },
				hi: { label: 'हिन्दी', lang: 'hi' },
				ar: { label: 'العربية', lang: 'ar', dir: 'rtl' },
				he: { label: 'עברית', lang: 'he', dir: 'rtl' },
			},
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
			components: {
				Header: './src/components/Header.astro',
				Hero: './src/components/Hero.astro',
			},
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
		sitemap({
			i18n: {
				defaultLocale: 'en',
				locales: {
					en: 'en',
					ja: 'ja',
					'zh-cn': 'zh-CN',
					'zh-tw': 'zh-TW',
					ko: 'ko',
					de: 'de',
					fr: 'fr',
					es: 'es',
					pt: 'pt',
					it: 'it',
					nl: 'nl',
					sv: 'sv',
					pl: 'pl',
					ru: 'ru',
					tr: 'tr',
					id: 'id',
					th: 'th',
					vi: 'vi',
					hi: 'hi',
					ar: 'ar',
					he: 'he',
				},
			},
		}),
	],
});
