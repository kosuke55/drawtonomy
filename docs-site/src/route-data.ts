import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

// Locale config — must mirror astro.config.mjs `locales`. The key is the URL
// segment (root → no prefix), the `lang` field is the BCP-47 tag we emit in
// hreflang, JSON-LD `inLanguage`, and og:locale.
const LOCALES = {
	root: { lang: 'en', urlPrefix: '' },
	ja: { lang: 'ja', urlPrefix: '/ja' },
	'zh-cn': { lang: 'zh-CN', urlPrefix: '/zh-cn' },
	'zh-tw': { lang: 'zh-TW', urlPrefix: '/zh-tw' },
	ko: { lang: 'ko', urlPrefix: '/ko' },
	de: { lang: 'de', urlPrefix: '/de' },
	fr: { lang: 'fr', urlPrefix: '/fr' },
	es: { lang: 'es', urlPrefix: '/es' },
	pt: { lang: 'pt', urlPrefix: '/pt' },
	it: { lang: 'it', urlPrefix: '/it' },
	nl: { lang: 'nl', urlPrefix: '/nl' },
	sv: { lang: 'sv', urlPrefix: '/sv' },
	pl: { lang: 'pl', urlPrefix: '/pl' },
	ru: { lang: 'ru', urlPrefix: '/ru' },
	tr: { lang: 'tr', urlPrefix: '/tr' },
	id: { lang: 'id', urlPrefix: '/id' },
	th: { lang: 'th', urlPrefix: '/th' },
	vi: { lang: 'vi', urlPrefix: '/vi' },
	hi: { lang: 'hi', urlPrefix: '/hi' },
	ar: { lang: 'ar', urlPrefix: '/ar' },
	he: { lang: 'he', urlPrefix: '/he' },
} as const;

const SITE_ORIGIN = 'https://docs.drawtonomy.com';

// Site-wide keyword fallback per locale, surfaced as
// <meta name="keywords"> when a page does not provide its own.
// Each list is written in the locale's native vocabulary rather than
// translated word-for-word.
const SITE_KEYWORDS: Record<string, string[]> = {
	en: [
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
	],
	ja: [
		'自動運転 シナリオ 作図',
		'自動運転 ホワイトボード',
		'運転シナリオ 図',
		'レーン エディタ',
		'交差点 図 作成ツール',
		'OpenSCENARIO エディタ',
		'OpenDRIVE エディタ',
		'Lanelet2 ブラウザ エディタ',
		'esmini シナリオ 作成',
		'ROS 占有格子 アノテーション',
		'道路ネットワーク スケッチ',
		'横断歩道 図',
		'論文 自動運転 図',
		'スライド 自動運転 図',
		'無料 オンライン 運転 作図ツール',
	],
	'zh-CN': [
		'自动驾驶场景图',
		'自动驾驶白板',
		'驾驶场景图绘制',
		'车道编辑器',
		'路口示意图工具',
		'OpenSCENARIO 编辑器',
		'OpenDRIVE 编辑器',
		'Lanelet2 浏览器编辑器',
		'esmini 场景创作',
		'ROS 占据栅格标注',
		'道路网络绘图',
		'人行横道图',
		'自动驾驶论文配图',
		'自动驾驶幻灯片配图',
		'免费在线自动驾驶绘图工具',
	],
	'zh-TW': [
		'自動駕駛場景圖',
		'自動駕駛白板',
		'駕駛場景圖繪製',
		'車道編輯器',
		'路口示意圖工具',
		'OpenSCENARIO 編輯器',
		'OpenDRIVE 編輯器',
		'Lanelet2 瀏覽器編輯器',
		'esmini 場景製作',
		'ROS 佔據網格標註',
		'道路網路繪圖',
		'行人穿越道圖',
		'自駕論文配圖',
		'自駕簡報配圖',
		'免費線上自駕繪圖工具',
	],
	ko: [
		'자율주행 시나리오 다이어그램',
		'자율주행 화이트보드',
		'운전 시나리오 그리기',
		'차선 에디터',
		'교차로 다이어그램 도구',
		'OpenSCENARIO 에디터',
		'OpenDRIVE 에디터',
		'Lanelet2 브라우저 에디터',
		'esmini 시나리오 작성',
		'ROS 점유 격자 어노테이션',
		'도로망 스케치',
		'횡단보도 다이어그램',
		'자율주행 논문 그림',
		'무료 온라인 운전 다이어그램 도구',
	],
	de: [
		'Fahrszenario-Diagramm',
		'Whiteboard für autonomes Fahren',
		'Spureditor',
		'Kreuzungsdiagramm-Tool',
		'OpenSCENARIO Editor',
		'OpenDRIVE Editor',
		'Lanelet2 Browser-Editor',
		'esmini Szenario-Authoring',
		'ROS Belegungsgitter-Annotation',
		'Straßennetz-Skizze',
		'Verkehrsszenario zeichnen',
		'kostenloses Online-Fahrdiagramm-Tool',
	],
	fr: [
		'diagramme de scénario de conduite',
		'tableau blanc conduite autonome',
		'éditeur de voies',
		"outil de diagramme d'intersection",
		'éditeur OpenSCENARIO',
		'éditeur OpenDRIVE',
		'éditeur Lanelet2 navigateur',
		'création de scénarios esmini',
		"annotation grille d'occupation ROS",
		'croquis réseau routier',
		'outil gratuit en ligne diagramme conduite',
	],
	es: [
		'diagrama de escenario de conducción',
		'pizarra para conducción autónoma',
		'editor de carriles',
		'herramienta diagrama de intersección',
		'editor OpenSCENARIO',
		'editor OpenDRIVE',
		'editor Lanelet2 navegador',
		'creación de escenarios esmini',
		'anotación de cuadrícula de ocupación ROS',
		'boceto de red vial',
		'herramienta gratuita en línea diagrama conducción',
	],
	pt: [
		'diagrama de cenário de condução',
		'quadro branco para condução autônoma',
		'editor de faixas',
		'ferramenta de diagrama de cruzamento',
		'editor OpenSCENARIO',
		'editor OpenDRIVE',
		'editor Lanelet2 navegador',
		'criação de cenários esmini',
		'anotação de grade de ocupação ROS',
		'esboço de rede viária',
		'ferramenta gratuita online diagrama de condução',
	],
	it: [
		'diagramma di scenario di guida',
		'lavagna per guida autonoma',
		'editor di corsie',
		'strumento diagramma di intersezione',
		'editor OpenSCENARIO',
		'editor OpenDRIVE',
		'editor Lanelet2 browser',
		'creazione di scenari esmini',
		'annotazione griglia di occupazione ROS',
		'schizzo della rete stradale',
		'strumento gratuito online diagramma di guida',
	],
	nl: [
		'rijscenario-diagram',
		'whiteboard voor autonoom rijden',
		'rijstrook-editor',
		'kruispunt-diagramtool',
		'OpenSCENARIO editor',
		'OpenDRIVE editor',
		'Lanelet2 browser-editor',
		'esmini scenario-creatie',
		'ROS occupancy grid annotatie',
		'wegennet-schets',
		'gratis online rijdiagramtool',
	],
	sv: [
		'körscenariodiagram',
		'whiteboard för självkörande',
		'körfältsredigerare',
		'korsningsdiagramverktyg',
		'OpenSCENARIO-redigerare',
		'OpenDRIVE-redigerare',
		'Lanelet2 webbläsare-redigerare',
		'esmini scenarioskapande',
		'ROS occupancy grid-annotering',
		'vägnätsskiss',
		'gratis onlineverktyg för körscheman',
	],
	pl: [
		'diagram scenariusza jazdy',
		'tablica dla jazdy autonomicznej',
		'edytor pasów ruchu',
		'narzędzie diagramu skrzyżowania',
		'edytor OpenSCENARIO',
		'edytor OpenDRIVE',
		'edytor Lanelet2 przeglądarka',
		'tworzenie scenariuszy esmini',
		'adnotacja siatki zajętości ROS',
		'szkic sieci drogowej',
		'darmowe narzędzie online do diagramów jazdy',
	],
	ru: [
		'диаграмма сценария вождения',
		'доска для беспилотного вождения',
		'редактор полос',
		'инструмент диаграммы перекрёстка',
		'редактор OpenSCENARIO',
		'редактор OpenDRIVE',
		'редактор Lanelet2 в браузере',
		'создание сценариев esmini',
		'аннотация сетки занятости ROS',
		'эскиз дорожной сети',
		'бесплатный онлайн-инструмент для схем вождения',
	],
	tr: [
		'sürüş senaryosu diyagramı',
		'otonom sürüş için beyaz tahta',
		'şerit düzenleyici',
		'kavşak diyagramı aracı',
		'OpenSCENARIO düzenleyici',
		'OpenDRIVE düzenleyici',
		'Lanelet2 tarayıcı düzenleyici',
		'esmini senaryo oluşturma',
		'ROS doluluk ızgarası açıklaması',
		'yol ağı taslağı',
		'ücretsiz çevrimiçi sürüş diyagramı aracı',
	],
	id: [
		'diagram skenario mengemudi',
		'papan tulis untuk berkendara otonom',
		'editor jalur',
		'alat diagram persimpangan',
		'editor OpenSCENARIO',
		'editor OpenDRIVE',
		'editor Lanelet2 browser',
		'pembuatan skenario esmini',
		'anotasi grid hunian ROS',
		'sketsa jaringan jalan',
		'alat diagram mengemudi online gratis',
	],
	th: [
		'แผนภาพสถานการณ์ขับขี่',
		'ไวท์บอร์ดสำหรับรถยนต์ขับเคลื่อนอัตโนมัติ',
		'โปรแกรมแก้ไขเลน',
		'เครื่องมือแผนภาพทางแยก',
		'โปรแกรมแก้ไข OpenSCENARIO',
		'โปรแกรมแก้ไข OpenDRIVE',
		'โปรแกรมแก้ไข Lanelet2 บนเบราว์เซอร์',
		'การสร้างสถานการณ์ esmini',
		'การกำกับข้อมูลกริดความหนาแน่น ROS',
		'ภาพร่างเครือข่ายถนน',
		'เครื่องมือแผนภาพการขับขี่ออนไลน์ฟรี',
	],
	vi: [
		'sơ đồ kịch bản lái xe',
		'bảng trắng cho xe tự lái',
		'trình chỉnh sửa làn đường',
		'công cụ sơ đồ giao lộ',
		'trình chỉnh sửa OpenSCENARIO',
		'trình chỉnh sửa OpenDRIVE',
		'trình chỉnh sửa Lanelet2 trên trình duyệt',
		'tạo kịch bản esmini',
		'chú thích lưới chiếm dụng ROS',
		'phác thảo mạng lưới đường',
		'công cụ sơ đồ lái xe trực tuyến miễn phí',
	],
	hi: [
		'ड्राइविंग परिदृश्य आरेख',
		'स्वायत्त ड्राइविंग व्हाइटबोर्ड',
		'लेन संपादक',
		'चौराहा आरेख उपकरण',
		'OpenSCENARIO संपादक',
		'OpenDRIVE संपादक',
		'Lanelet2 ब्राउज़र संपादक',
		'esmini परिदृश्य निर्माण',
		'ROS occupancy grid एनोटेशन',
		'सड़क नेटवर्क स्केच',
		'मुफ्त ऑनलाइन ड्राइविंग आरेख उपकरण',
	],
	ar: [
		'مخطط سيناريو القيادة',
		'سبورة بيضاء للقيادة الذاتية',
		'محرر المسارات',
		'أداة مخطط التقاطعات',
		'محرر OpenSCENARIO',
		'محرر OpenDRIVE',
		'محرر Lanelet2 في المتصفح',
		'إنشاء سيناريوهات esmini',
		'شرح شبكة إشغال ROS',
		'رسم شبكة الطرق',
		'أداة مجانية على الإنترنت لمخططات القيادة',
	],
	he: [
		'דיאגרמת תרחיש נהיגה',
		'לוח לבן לנהיגה אוטונומית',
		'עורך נתיבים',
		'כלי דיאגרמת צמתים',
		'עורך OpenSCENARIO',
		'עורך OpenDRIVE',
		'עורך Lanelet2 בדפדפן',
		'יצירת תרחישי esmini',
		'הערות שבכת תפוסה ROS',
		'סקיצת רשת כבישים',
		'כלי חינמי מקוון לדיאגרמות נהיגה',
	],
};

function detectLocale(pathname: string): {
	key: keyof typeof LOCALES;
	lang: string;
	urlPrefix: string;
} {
	const seg = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
	if (seg && seg in LOCALES) {
		const key = seg as keyof typeof LOCALES;
		return { key, ...LOCALES[key] };
	}
	return { key: 'root', ...LOCALES.root };
}

// Map a localised pathname to its equivalent in another locale by
// swapping (or inserting) the locale prefix. Used to emit hreflang siblings.
function localisedPath(
	pathname: string,
	currentPrefix: string,
	targetPrefix: string,
): string {
	const stripped = currentPrefix
		? pathname.replace(new RegExp(`^${currentPrefix}(?=/|$)`), '')
		: pathname;
	const cleaned = stripped.startsWith('/') ? stripped : `/${stripped}`;
	return targetPrefix + (cleaned === '/' ? '/' : cleaned);
}

export const onRequest = defineRouteMiddleware((context) => {
	const { head, entry } = context.locals.starlightRoute;
	const data = entry.data as typeof entry.data & {
		keywords?: string[];
		ogImage?: string;
		jsonLd?: Record<string, unknown> | Array<Record<string, unknown>> | false;
	};

	const { lang, urlPrefix } = detectLocale(context.url.pathname);

	// keywords meta — page override or locale-specific site-wide fallback.
	const fallback = SITE_KEYWORDS[lang] ?? SITE_KEYWORDS.en;
	const keywords = (data.keywords && data.keywords.length > 0
		? data.keywords
		: fallback
	).join(', ');
	head.push({
		tag: 'meta',
		attrs: { name: 'keywords', content: keywords },
	});

	// per-page og:image override. Site-level og:image is already set in
	// astro.config.mjs (default /og.png).
	if (data.ogImage) {
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

	// og:locale — advertises the language of the page to social embeds.
	head.push({
		tag: 'meta',
		attrs: { property: 'og:locale', content: lang.replace('-', '_') },
	});

	// hreflang alternates — one per locale plus x-default. Annotations are
	// self-referential and symmetric across pages.
	for (const info of Object.values(LOCALES)) {
		const alt = localisedPath(context.url.pathname, urlPrefix, info.urlPrefix);
		head.push({
			tag: 'link',
			attrs: {
				rel: 'alternate',
				hreflang: info.lang,
				href: new URL(alt, SITE_ORIGIN).toString(),
			},
		});
	}
	head.push({
		tag: 'link',
		attrs: {
			rel: 'alternate',
			hreflang: 'x-default',
			href: new URL(
				localisedPath(context.url.pathname, urlPrefix, LOCALES.root.urlPrefix),
				SITE_ORIGIN,
			).toString(),
		},
	});

	// JSON-LD structured data.
	if (data.jsonLd) {
		const blocks = Array.isArray(data.jsonLd) ? data.jsonLd : [data.jsonLd];
		for (const block of blocks) {
			const enriched =
				typeof block === 'object' && block !== null && !('inLanguage' in block)
					? { ...block, inLanguage: lang }
					: block;
			head.push({
				tag: 'script',
				attrs: { type: 'application/ld+json' },
				content: JSON.stringify(enriched),
			});
		}
	} else {
		// Default TechArticle for ordinary docs pages — avoids per-page
		// boilerplate. Skipped on the home (which sets its own
		// SoftwareApplication block) and on pages that opt out by setting
		// jsonLd: false.
		const isSplash = (data as { template?: string }).template === 'splash';
		if (!isSplash && data.jsonLd !== false) {
			const url = new URL(context.url.pathname, SITE_ORIGIN).toString();
			const tech: Record<string, unknown> = {
				'@context': 'https://schema.org',
				'@type': 'TechArticle',
				headline: data.title,
				description: data.description,
				url,
				inLanguage: lang,
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
