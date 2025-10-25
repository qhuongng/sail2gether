// worker.ts - Cloudflare Worker for R2 video uploads

interface Env {
	SAIL2GETHER_BUCKET: R2Bucket;
	SAIL2GETHER_R2_SECRET: string;
	SAIL2GETHER_PUBLIC_URL: string;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
const ALLOWED_SUBTITLE_TYPES = ['text/vtt', 'application/x-subrip', 'text/plain', 'text/srt'];
const MAX_SUBTITLE_SIZE = 10 * 1024 * 1024; // 10MB

// Simple SRT to VTT converter
function convertSrtToVtt(srtContent: string): string {
	// Add WEBVTT header
	let vtt = 'WEBVTT\n\n';

	// Replace SRT timestamp format (00:00:00,000) with VTT format (00:00:00.000)
	vtt += srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

	return vtt;
}

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
				const fileType = formData.get('type') as string | null; // 'video' or 'subtitle'

				if (!file || !(file instanceof File)) {
					return new Response(JSON.stringify({ error: 'No file provided' }), {
						status: 400,
						headers: {
							'Content-Type': 'application/json',
							...corsHeaders,
						},
					});
				}

				const isSubtitle = fileType === 'subtitle';
				const maxSize = isSubtitle ? MAX_SUBTITLE_SIZE : MAX_FILE_SIZE;
				const allowedTypes = isSubtitle ? ALLOWED_SUBTITLE_TYPES : ALLOWED_VIDEO_TYPES;
				const prefix = isSubtitle ? 'subtitles' : 'videos';

				// Validate file size
				if (file.size > maxSize) {
					return new Response(
						JSON.stringify({
							error: 'File too large',
							maxSize: maxSize,
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

				// Validate content type (more lenient for subtitles as they might be sent as text/plain)
				if (file.type && !allowedTypes.includes(file.type) && !isSubtitle) {
					return new Response(
						JSON.stringify({
							error: 'Invalid file type',
							allowedTypes: allowedTypes,
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
				const key = `${prefix}/${timestamp}-${randomStr}-${sanitizedName}`;

				// Upload to R2
				let fileData: ArrayBuffer | string = await file.arrayBuffer();
				let contentType = isSubtitle ? 'text/vtt' : file.type || 'video/mp4';

				// Convert SRT to VTT if needed
				if (isSubtitle && (file.name.toLowerCase().endsWith('.srt') || file.type.includes('subrip'))) {
					const textDecoder = new TextDecoder('utf-8');
					const srtContent = textDecoder.decode(fileData as ArrayBuffer);
					fileData = convertSrtToVtt(srtContent);
					contentType = 'text/vtt';
				}

				await env.SAIL2GETHER_BUCKET.put(key, fileData, {
					httpMetadata: {
						contentType: contentType,
					},
					customMetadata: {
						originalName: file.name,
						uploadedAt: new Date().toISOString(),
						fileSize: file.size.toString(),
						fileType: fileType || 'video',
					},
				});

				// Return R2 public URL
				const fileUrl = `${env.SAIL2GETHER_PUBLIC_URL}/${key}`;

				return new Response(
					JSON.stringify({
						success: true,
						url: fileUrl,
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
			if ((url.pathname.startsWith('/videos/') || url.pathname.startsWith('/subtitles/')) && request.method === 'GET') {
				const key = url.pathname.substring(1); // Remove leading '/' to get 'videos/...' or 'subtitles/...'

				const object = await env.SAIL2GETHER_BUCKET.get(key);

				if (!object) {
					return new Response(JSON.stringify({ error: 'File not found' }), {
						status: 404,
						headers: {
							'Content-Type': 'application/json',
							...corsHeaders,
						},
					});
				}

				const isSubtitle = key.startsWith('subtitles/');

				// Get range header for video seeking support
				const range = request.headers.get('Range');

				// Return the file with proper headers
				const headers = new Headers({
					...corsHeaders,
					'Content-Type': isSubtitle ? 'text/vtt' : object.httpMetadata?.contentType || 'video/mp4',
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

				if (!key || (!key.startsWith('videos/') && !key.startsWith('subtitles/'))) {
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

				const fileType = key.startsWith('videos/') ? 'Video' : 'Subtitle';

				return new Response(
					JSON.stringify({
						success: true,
						message: `${fileType} deleted`,
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
