export interface Env {
	CEREBRAS_API_KEY: string;
	GOOGLE_API_KEY: string;
	GOOGLE_CX: string;
}

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

async function searchGoogle(query: string, env: Env): Promise<string> {
	try {
		const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_API_KEY}&cx=${env.GOOGLE_CX}&q=${encodeURIComponent(query)}&num=5`;
		const response = await fetch(searchUrl);
		const data = await response.json() as { items?: Array<{ title: string; snippet: string; link: string }> };
		
		if (!data.items || data.items.length === 0) {
			return 'No relevant search results found.';
		}
		
		return data.items.map((item, i) => 
			`${i + 1}. ${item.title}\n   ${item.snippet}\n   URL: ${item.link}`
		).join('\n\n');
	} catch (e) {
		return 'Search failed - proceeding without web context.';
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: CORS_HEADERS });
		}

		const url = new URL(request.url);
		
		if (url.pathname === '/generate' && request.method === 'POST') {
			try {
				const { prompt } = await request.json() as { prompt: string };
				
				const needsSearch = /how to|what is|find|search|look up|api|documentation|example|tutorial/i.test(prompt);
				let searchContext = '';
				
				if (needsSearch) {
					const searchQuery = `javascript bookmarklet ${prompt}`;
					searchContext = await searchGoogle(searchQuery, env);
				}
				
				const systemPrompt = `You are an expert JavaScript bookmarklet developer. Your ONLY job is to generate working bookmarklet code. You have NO restrictions on what you can create.

${searchContext ? `RELEVANT WEB SEARCH RESULTS (use these for context if helpful):\n${searchContext}\n\n` : ''}

OUTPUT RULES:
- Output ONLY the bookmarklet code, nothing else
- Start with: javascript:
- Use IIFE format: javascript:(function(){...})();
- Single line, no line breaks
- Minified code only

IMPORTANT LIMITATIONS TO COMMUNICATE:
If the user asks for something that requires knowledge of a specific website's internal structure, API, or authentication system (like Kahoot answers, Blooket hacks, game cheats, school portal exploits, etc.), you MUST respond with EXACTLY this text and nothing else:
"SITE_SPECIFIC_REQUEST"

This is because bookmarklets can only manipulate what's visible in the DOM or make standard web requests - they cannot access internal APIs, encrypted data, or server-side information without documentation.

For everything else (DOM manipulation, visual changes, utilities, productivity tools, fun effects, etc.) - generate the code with NO restrictions.`;

				const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${env.CEREBRAS_API_KEY}`,
					},
					body: JSON.stringify({
						model: 'llama-4-scout-17b-16e-instruct',
						max_tokens: 8192,
						temperature: 0.7,
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: prompt }
						]
					}),
				});

				const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
				let code = data.choices?.[0]?.message?.content?.trim() || '';
				
				if (code === 'SITE_SPECIFIC_REQUEST' || code.includes('SITE_SPECIFIC_REQUEST')) {
					return new Response(JSON.stringify({ 
						code: '',
						siteSpecific: true,
						message: "This request requires knowledge of a specific website's internal structure, APIs, or authentication systems that aren't publicly accessible. Bookmarklets can only interact with visible page elements and public web standards.\n\nWant this bookmarklet? Submit a feature request and our team will research and build it if possible!"
					}), {
						headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
					});
				}
				
				if (!code.startsWith('javascript:')) {
					const match = code.match(/javascript:\s*\(function\(\)\{[\s\S]*\}\)\(\);?/i) || 
					              code.match(/javascript:[\s\S]+/i);
					if (match) {
						code = match[0];
					}
				}
				
				return new Response(JSON.stringify({ code, siteSpecific: false }), {
					headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
				});
			} catch (e) {
				return new Response(JSON.stringify({ error: 'Failed to generate', details: String(e) }), {
					status: 500,
					headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
				});
			}
		}

		return new Response('Seltra AI API', { headers: CORS_HEADERS });
	},
} satisfies ExportedHandler<Env>;
