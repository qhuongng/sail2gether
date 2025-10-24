// worker.ts - Cloudflare Worker for R2 video uploads

interface Env {
	SAIL2GETHER_BUCKET: R2Bucket;
	SAIL2GETHER_R2_SECRET: string;
	SAIL2GETHER_PUBLIC_URL: string;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// CORS headers
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		};

		// Handle preflight request
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			const url = new URL(request.url);

			// Upload endpoint
			if (url.pathname === '/upload' && request.method === 'POST') {
				// Check authentication
				const auth = request.headers.get('Authorization');
				if (!auth || auth !== `Bearer ${env.SAIL2GETHER_R2_SECRET}`) {
					return new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
						headers: {
							'Content-Type': 'application/json',
							...corsHeaders,
						},
					});
				}

				// Parse form data
				const formData = await request.formData();
				const file = formData.get('file');

				if (!file || !(file instanceof File)) {
					return new Response(JSON.stringify({ error: 'No file provided' }), {
						status: 400,
						headers: {
							'Content-Type': 'application/json',
							...corsHeaders,
						},
					});
				}

				// Validate file size
				if (file.size > MAX_FILE_SIZE) {
					return new Response(
						JSON.stringify({
							error: 'File too large',
							maxSize: MAX_FILE_SIZE,
							actualSize: file.size,
						}),
						{
							status: 413,
							headers: {
								'Content-Type': 'application/json',
								...corsHeaders,
							},
						}
					);
				}

				// Validate content type
				if (file.type && !ALLOWED_VIDEO_TYPES.includes(file.type)) {
					return new Response(
						JSON.stringify({
							error: 'Invalid file type',
							allowedTypes: ALLOWED_VIDEO_TYPES,
							receivedType: file.type,
						}),
						{
							status: 415,
							headers: {
								'Content-Type': 'application/json',
								...corsHeaders,
							},
						}
					);
				}

				// Generate unique filename
				const timestamp = Date.now();
				const randomStr = Math.random().toString(36).substring(2, 8);
				const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
				const key = `videos/${timestamp}-${randomStr}-${sanitizedName}`;

				// Upload to R2
				const arrayBuffer = await file.arrayBuffer();
				await env.SAIL2GETHER_BUCKET.put(key, arrayBuffer, {
					httpMetadata: {
						contentType: file.type || 'video/mp4',
					},
					customMetadata: {
						originalName: file.name,
						uploadedAt: new Date().toISOString(),
						fileSize: file.size.toString(),
					},
				});

				// Return R2 public URL
				const videoUrl = `${env.SAIL2GETHER_PUBLIC_URL}/${key}`;

				return new Response(
					JSON.stringify({
						success: true,
						url: videoUrl,
						key: key,
						size: file.size,
						type: file.type,
					}),
					{
						status: 200,
						headers: {
							'Content-Type': 'application/json',
							...corsHeaders,
						},
					}
				);
			}

			// Direct video streaming endpoint (handles /videos/... URLs)
			if (url.pathname.startsWith('/videos/') && request.method === 'GET') {
				const key = url.pathname.substring(1); // Remove leading '/' to get 'videos/...'

				const object = await env.SAIL2GETHER_BUCKET.get(key);

				if (!object) {
					return new Response(JSON.stringify({ error: 'Video not found' }), {
						status: 404,
						headers: {
							'Content-Type': 'application/json',
							...corsHeaders,
						},
					});
				}

				// Get range header for video seeking support
				const range = request.headers.get('Range');

				// Return the video with proper headers
				const headers = new Headers({
					...corsHeaders,
					'Content-Type': object.httpMetadata?.contentType || 'video/mp4',
					'Cache-Control': 'public, max-age=31536000',
					'Accept-Ranges': 'bytes',
				});

				if (range) {
					// Handle range requests for video seeking
					const parts = range.replace(/bytes=/, '').split('-');
					const start = parseInt(parts[0], 10);
					const end = parts[1] ? parseInt(parts[1], 10) : object.size - 1;
					const chunkSize = end - start + 1;

					headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
					headers.set('Content-Length', chunkSize.toString());

					return new Response(object.body, {
						status: 206,
						headers,
					});
				}

				headers.set('Content-Length', object.size.toString());

				return new Response(object.body, {
					status: 200,
					headers,
				});
			}

			// List videos endpoint
			if (url.pathname === '/list' && request.method === 'GET') {
				const limit = parseInt(url.searchParams.get('limit') || '100');
				const cursor = url.searchParams.get('cursor') || undefined;

				const listed = (await env.SAIL2GETHER_BUCKET.list({
					prefix: 'videos/',
					limit: limit,
					cursor: cursor,
				})) as R2Objects & { cursor?: string };

				const videos = listed.objects.map((obj) => ({
					key: obj.key,
					size: obj.size,
					uploaded: obj.uploaded,
					url: `${env.SAIL2GETHER_PUBLIC_URL}/${obj.key}`,
					etag: obj.etag,
				}));

				return new Response(
					JSON.stringify({
						videos,
						truncated: listed.truncated,
						cursor: listed.cursor,
					}),
					{
						headers: {
							'Content-Type': 'application/json',
							...corsHeaders,
						},
					}
				);
			}

			// Delete video endpoint (optional - for cleanup)
			if (url.pathname === '/delete' && request.method === 'POST') {
				// Check authentication
				const auth = request.headers.get('Authorization');
				if (!auth || auth !== `Bearer ${env.SAIL2GETHER_R2_SECRET}`) {
					console.error('Unauthorized delete attempt');
					return new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
						headers: {
							'Content-Type': 'application/json',
							...corsHeaders,
						},
					});
				}

				const { key } = (await request.json()) as { key: string };

				if (!key || !key.startsWith('videos/')) {
					console.error('Invalid key:', key);
					return new Response(JSON.stringify({ error: 'Invalid key', received: key }), {
						status: 400,
						headers: {
							'Content-Type': 'application/json',
							...corsHeaders,
						},
					});
				}

				// Verify object exists before deleting
				const objectToDelete = await env.SAIL2GETHER_BUCKET.get(key);
				if (!objectToDelete) {
					console.warn('Object not found:', key);
					return new Response(
						JSON.stringify({
							success: false,
							error: 'Object not found',
							key: key,
						}),
						{
							status: 404,
							headers: {
								'Content-Type': 'application/json',
								...corsHeaders,
							},
						}
					);
				}

				await env.SAIL2GETHER_BUCKET.delete(key);

				return new Response(
					JSON.stringify({
						success: true,
						message: 'Video deleted',
						key: key,
					}),
					{
						status: 200,
						headers: {
							'Content-Type': 'application/json',
							...corsHeaders,
						},
					}
				);
			}

			// Route not found
			return new Response(JSON.stringify({ error: 'Not found' }), {
				status: 404,
				headers: {
					'Content-Type': 'application/json',
					...corsHeaders,
				},
			});
		} catch (error) {
			console.error('Worker error:', error);
			return new Response(
				JSON.stringify({
					error: 'Internal server error',
					message: error instanceof Error ? error.message : 'Unknown error',
				}),
				{
					status: 500,
					headers: {
						'Content-Type': 'application/json',
						...corsHeaders,
					},
				}
			);
		}
	},
};
