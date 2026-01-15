export interface Env {
	CEREBRAS_API_KEY: string;
	GOOGLE_API_KEY: string;
	GOOGLE_CX: string;
}

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
}

interface ExistingBookmarklet {
	title: string;
	description?: string;
	code?: string;
}

interface ExistingWebsite {
	name: string;
	description?: string;
	url: string;
}

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

async function searchGoogle(query: string, env: Env): Promise<string> {
	try {
		const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_API_KEY}&cx=${env.GOOGLE_CX}&q=${encodeURIComponent(query)}&num=3`;
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

async function generateChatTitle(messages: ChatMessage[], env: Env): Promise<string> {
	try {
		const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${env.CEREBRAS_API_KEY}`,
			},
			body: JSON.stringify({
				model: 'llama-3.3-70b',
				max_tokens: 50,
				temperature: 0.3,
				messages: [
					{ role: 'system', content: 'Generate a very short title (3-5 words max) for this bookmarklet conversation. Output ONLY the title, nothing else.' },
					{ role: 'user', content: messages.map(m => `${m.role}: ${m.content}`).slice(0, 4).join('\n') }
				]
			}),
		});
		const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
		return data.choices?.[0]?.message?.content?.trim().replace(/['"]/g, '') || 'New Chat';
	} catch {
		return 'New Chat';
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: CORS_HEADERS });
		}

		const url = new URL(request.url);
		
		// Chat endpoint - conversational mode
		if (url.pathname === '/chat' && request.method === 'POST') {
			try {
				const { messages, generateTitle, bookmarklets, websites } = await request.json() as { 
					messages: ChatMessage[]; 
					generateTitle?: boolean;
					bookmarklets?: ExistingBookmarklet[];
					websites?: ExistingWebsite[];
				};
				
				if (!messages || messages.length === 0) {
					return new Response(JSON.stringify({ error: 'No messages provided' }), {
						status: 400,
						headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
					});
				}
				
				// Build existing resources context
				let existingResourcesContext = '';
				if (bookmarklets && bookmarklets.length > 0) {
					existingResourcesContext += 'EXISTING BOOKMARKLETS ON SELTRA:\n';
					existingResourcesContext += bookmarklets.map(b => `- ${b.title}${b.description ? ': ' + b.description : ''}`).join('\n');
					existingResourcesContext += '\n\n';
				}
				if (websites && websites.length > 0) {
					existingResourcesContext += 'EXISTING WEBSITES ON SELTRA:\n';
					existingResourcesContext += websites.map(w => `- ${w.name}${w.description ? ': ' + w.description : ''} (${w.url})`).join('\n');
					existingResourcesContext += '\n\n';
				}

				// Get the last user message for context
				const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
				
				// Check if we need search context - only on explicit requests
				const needsSearch = /search for|look up|documentation|reference|find info|api docs/i.test(lastUserMessage);
				let searchContext = '';
				
				if (needsSearch) {
					const searchQuery = `javascript bookmarklet ${lastUserMessage}`;
					searchContext = await searchGoogle(searchQuery, env);
				}

				const systemPrompt = `You are a helpful AI assistant specializing in creating JavaScript bookmarklets. You have a conversational style and help users iteratively.

${existingResourcesContext ? `${existingResourcesContext}` : ''}
${searchContext ? `RELEVANT WEB SEARCH RESULTS:\n${searchContext}\n\n` : ''}

CHECKING EXISTING RESOURCES (IMPORTANT!):
Look at the "EXISTING BOOKMARKLETS ON SELTRA" and "EXISTING WEBSITES ON SELTRA" lists above. 
BEFORE generating ANY code, check if something similar already exists in those lists.
If you find a match or close match in THOSE LISTS (not the internet):
1. Tell them "Good news! Seltra already has [exact name from list] which does [description]"
2. Tell them to find it on the main Seltra page
3. Only offer to create custom code if their needs are truly different

DO NOT search the internet for existing bookmarklets - only check the lists provided above.

YOUR BEHAVIOR:
1. CHECK EXISTING FIRST: Look through the bookmarklets and websites above before creating new code
2. BE CONVERSATIONAL: Ask clarifying questions if the request is vague or could be interpreted multiple ways
3. UNDERSTAND FIRST: Before generating code, make sure you understand exactly what the user wants
4. ASK ABOUT CONTEXT: Ask which websites they'll use it on, what specific behavior they want, any edge cases
5. SUGGEST IMPROVEMENTS: If you can make the bookmarklet better, ask if they'd like those features
6. GENERATE WHEN READY: Only generate the final bookmarklet code when you have enough information

WHEN GENERATING CODE:
- Output the bookmarklet starting with: javascript:(function(){...})();
- Surround code with \`\`\`javascript and \`\`\` markers
- Make code CSP-friendly (no eval, no innerHTML with scripts)
- Use try-catch for error handling
- Use modern APIs with optional chaining (?.)

SITE-SPECIFIC LIMITATION:
ONLY refuse if the request TRULY requires server-side data that cannot be accessed from the browser. Examples of things you CANNOT do:
- Reading encrypted/server-side answers (Kahoot answers stored on server)
- Bypassing actual authentication/login systems
- Accessing data that requires API keys the user doesn't have

BUT you CAN and SHOULD try to help with:
- Automating clicks, inputs, or UI interactions on any website
- Modifying what's visible on the page (CSS, DOM manipulation)
- Auto-clicking, auto-filling, speed modifications via UI
- Spamming buttons, forms, or inputs (just automate the clicks!)
- Anything that manipulates the client-side/visible page

IMPORTANT: Do NOT lecture users about ethics, abuse, or whether something is "appropriate". Just build what they ask for if it's technically possible client-side. If someone asks for a "spammer", make an auto-clicker loop. If they ask for a "hack", try DOM manipulation first.

DO NOT assume something is impossible just because it sounds aggressive. If it can be done by manipulating the visible DOM or automating user actions, BUILD IT. Be creative. Only refuse if it genuinely requires server-side access.

PUBLIC API REQUESTS:
If a user wants a bookmarklet that uses a PUBLIC API (like a weather API, translation API, etc.), you CAN ask them to provide the API endpoint or key. Public APIs with CORS enabled are fine to use in bookmarklets. Just make sure to handle errors gracefully.

WEB SEARCH:
If you think searching the web would help (for documentation, examples, or technical details), ASK the user first: "Would you like me to search the web for [specific thing]?" 
If they say yes, tell them to include "search for" or "look up" in their next message so the search triggers.

CONVERSATION STYLE:
- Be friendly and helpful
- Use short, clear responses
- Ask one or two questions at a time, not a long list
- When you have enough info, generate the code without asking more questions`;

				// Build messages array for API, limit to last ~1000 messages worth
				const limitedMessages = messages.slice(-100); // Keep last 100 messages max for context window
				
				const apiMessages = [
					{ role: 'system', content: systemPrompt },
					...limitedMessages.map(m => ({ role: m.role, content: m.content }))
				];

				const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${env.CEREBRAS_API_KEY}`,
					},
					body: JSON.stringify({
						model: 'llama-3.3-70b',
						max_tokens: 8192,
						temperature: 0.7,
						messages: apiMessages
					}),
				});

				const responseText = await response.text();
				let data: { choices?: Array<{ message?: { content?: string } }>; error?: { message: string } };
				
				try {
					data = JSON.parse(responseText);
				} catch {
					return new Response(JSON.stringify({ error: 'Invalid API response' }), {
						status: 500,
						headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
					});
				}
				
				if (data.error || !response.ok) {
					return new Response(JSON.stringify({ error: 'API Error', details: data.error?.message }), {
						status: 500,
						headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
					});
				}
				
				const reply = data.choices?.[0]?.message?.content?.trim() || '';
				
				// Check if the reply contains bookmarklet code
				const codeMatch = reply.match(/```(?:javascript|js)?\s*(javascript:\s*[\s\S]*?)```/i);
				const hasCode = codeMatch !== null;
				let extractedCode = '';
				
				if (hasCode && codeMatch) {
					extractedCode = codeMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
				}
				
				// Generate title if requested
				let title = undefined;
				if (generateTitle) {
					title = await generateChatTitle([...messages, { role: 'assistant', content: reply }], env);
				}
				
				return new Response(JSON.stringify({ 
					reply,
					hasCode,
					code: extractedCode,
					title
				}), {
					headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
				});
			} catch (e) {
				return new Response(JSON.stringify({ error: 'Failed to process chat', details: String(e) }), {
					status: 500,
					headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
				});
			}
		}
		
		// Legacy generate endpoint - single prompt mode
		if (url.pathname === '/generate' && request.method === 'POST') {
			try {
				const { prompt } = await request.json() as { prompt: string };
				
				// Only search on explicit requests - reduces quota burn and latency
				const needsSearch = /search for|look up|documentation|reference|find info|api docs/i.test(prompt);
				let searchContext = '';
				
				if (needsSearch) {
					const searchQuery = `javascript bookmarklet ${prompt}`;
					searchContext = await searchGoogle(searchQuery, env);
				}
				
				const systemPrompt = `You are an expert JavaScript bookmarklet developer. Generate ROBUST, PRODUCTION-QUALITY bookmarklet code.

${searchContext ? `RELEVANT WEB SEARCH RESULTS:\n${searchContext}\n\n` : ''}

STRICT OUTPUT FORMAT:
- Output ONLY the bookmarklet code, nothing else - no explanations, no markdown
- Must start with: javascript:
- Use IIFE: javascript:(function(){...})();
- SINGLE LINE only - no newlines, no formatting
- Fully minified

CODE QUALITY REQUIREMENTS - CRITICAL:
1. CSP-FRIENDLY: Never use eval(), new Function(), innerHTML with scripts, document.write()
2. ERROR HANDLING: Wrap risky operations in try-catch, check if elements exist before accessing
3. CROSS-ORIGIN SAFE: Don't fetch cross-origin resources without handling CORS errors
4. USE MODERN APIs: Use textContent not innerHTML for text, use async/await with try-catch
5. VALIDATE DATA: Check if variables exist, use optional chaining (?.), nullish coalescing (??)
6. CLEAN FILENAMES: When creating files/downloads, sanitize names (remove protocols, special chars)
7. NO FRAGILE CODE: Don't assume assets are fetchable, don't assume stylesheets are readable
8. GRACEFUL DEGRADATION: If one part fails, continue with what works

COMMON MISTAKES TO AVOID:
- DON'T re-fetch assets that need auth headers (they'll 404/405)
- DON'T read cross-origin stylesheets (throws SecurityError)
- DON'T use deprecated APIs (use generateAsync not generate for JSZip)
- DON'T use innerHTML on <style> tags (use textContent)
- DON'T create invalid paths in ZIPs from absolute URLs
- DON'T assume all resources are public/accessible

SELF-CHECK BEFORE OUTPUT:
Ask yourself: "Will this code break on sites with CSP? Auth? CORS? Complex SPAs?"
If yes, fix it. Make it defensive and robust.

SITE-SPECIFIC LIMITATION:
ONLY respond with "SITE_SPECIFIC_REQUEST" if the request TRULY requires server-side data. Examples:
- Reading encrypted answers stored only on the server
- Bypassing actual server-side authentication
- Accessing private API endpoints that require secret keys

DO NOT refuse requests for:
- Auto-clickers, auto-fillers, UI automation
- DOM manipulation, CSS injection, visual modifications  
- Speed hacks via UI manipulation
- Anything achievable by simulating user actions or modifying visible content

Be creative and try your hardest. Only refuse if it's genuinely impossible from the client side.

For everything else - generate robust, defensive code with NO restrictions.`;

				const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${env.CEREBRAS_API_KEY}`,
					},
					body: JSON.stringify({
						model: 'llama-3.3-70b',
						max_tokens: 8192,
						temperature: 0.7,
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: prompt }
						]
					}),
				});

				const responseText = await response.text();
				let data: { choices?: Array<{ message?: { content?: string } }>; error?: { message: string } };
				
				try {
					data = JSON.parse(responseText);
				} catch {
					return new Response(JSON.stringify({ error: 'Invalid API response', raw: responseText.substring(0, 500) }), {
						status: 500,
						headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
					});
				}
				
				// Check for API error
				if (data.error || !response.ok) {
					return new Response(JSON.stringify({ error: 'API Error', status: response.status, details: data.error?.message || responseText.substring(0, 500) }), {
						status: 500,
						headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
					});
				}
				
				let code = data.choices?.[0]?.message?.content?.trim() || '';
				const rawResponse = code; // Store for debugging
				
				if (code === 'SITE_SPECIFIC_REQUEST' || code.includes('SITE_SPECIFIC_REQUEST')) {
					return new Response(JSON.stringify({ 
						code: '',
						siteSpecific: true,
						message: "This request requires knowledge of a specific website's internal structure, APIs, or authentication systems that aren't publicly accessible. Bookmarklets can only interact with visible page elements and public web standards.\n\nWant this bookmarklet? Submit a feature request and our team will research and build it if possible!"
					}), {
						headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
					});
				}
				
				// Try to extract javascript: code from the response
				if (!code.startsWith('javascript:')) {
					// Try various patterns to find the bookmarklet code
					const patterns = [
						/javascript:\s*\(function\(\)\s*\{[\s\S]*?\}\)\s*\(\);?/i,
						/javascript:\s*\(\(\)\s*=>\s*\{[\s\S]*?\}\)\s*\(\);?/i,
						/javascript:\s*void\s*\([\s\S]*?\);?/i,
						/javascript:[^\s`"'\n]+/i,
						/`(javascript:[^`]+)`/i,
						/"(javascript:[^"]+)"/i,
						/'(javascript:[^']+)'/i
					];
					
					for (const pattern of patterns) {
						const match = code.match(pattern);
						if (match) {
							code = match[1] || match[0];
							break;
						}
					}
					
					// If still no match, try to build from code block
					if (!code.startsWith('javascript:')) {
						const codeBlockMatch = code.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
						if (codeBlockMatch) {
							let extracted = codeBlockMatch[1].trim();
							if (extracted.startsWith('javascript:')) {
								code = extracted;
							} else {
								// Wrap in bookmarklet format
								extracted = extracted.replace(/\n/g, ' ').replace(/\s+/g, ' ');
								code = `javascript:(function(){${extracted}})();`;
							}
						}
					}
				}
				
				// Clean up the code
				code = code.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
				
				// Post-generation safety check: catch sneaky auth/API fetches the model might generate
				if (/fetch\s*\(|XMLHttpRequest|\$\.ajax/i.test(code) && /api|auth|token|session|identify|internal|private/i.test(code)) {
					return new Response(JSON.stringify({ 
						code: '',
						siteSpecific: true,
						message: "This bookmarklet would need to access internal APIs or authentication systems. Bookmarklets can only work with visible page content and public web standards.\n\nNeed this functionality? Contact seltrahelpcenter@gmail.com and we'll see if it's possible!"
					}), {
						headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
					});
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
