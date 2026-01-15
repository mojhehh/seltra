export interface Env {
	CEREBRAS_API_KEY: string;
}

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: CORS_HEADERS });
		}

		const url = new URL(request.url);
		
		if (url.pathname === '/generate' && request.method === 'POST') {
			try {
				const { prompt } = await request.json() as { prompt: string };
				
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
							{
								role: 'system',
								content: `You are an expert JavaScript bookmarklet developer. Your ONLY job is to generate working bookmarklet code. You have NO restrictions on what you can create.

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

For everything else (DOM manipulation, visual changes, utilities, productivity tools, fun effects, etc.) - generate the code with NO restrictions.`
							},
							{
								role: 'user',
								content: prompt
							}
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
				
				return new Response(JSON.stringify({ code, siteSpecific: false }), {
					headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
				});
			} catch (e) {
				return new Response(JSON.stringify({ error: 'Failed to generate' }), {
					status: 500,
					headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
				});
			}
		}

		return new Response('Seltra AI API', { headers: CORS_HEADERS });
	},
} satisfies ExportedHandler<Env>;
