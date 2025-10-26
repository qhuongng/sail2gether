// worker.ts - Cloudflare Worker using R2 Multipart Upload API (following official docs)

interface Env {
	SAIL2GETHER_BUCKET: R2Bucket;
	SAIL2GETHER_R2_SECRET: string;
	SAIL2GETHER_PUBLIC_URL: string;
	SAIL2GETHER_UPLOAD_METADATA: KVNamespace;
}

interface UploadMetadata {
	key: string;
	filename: string;
	fileSize: number;
	totalChunks: number;
	uploadId: string; // R2 multipart upload ID
	parts: R2UploadedPart[];
	createdAt: number;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
const ALLOWED_SUBTITLE_TYPES = ['text/vtt', 'application/x-subrip', 'text/plain', 'text/srt'];
const MAX_SUBTITLE_SIZE = 10 * 1024 * 1024; // 10MB
const UPLOAD_EXPIRY = 24 * 60 * 60; // 24 hours

function convertSrtToVtt(srtContent: string): string {
	let vtt = 'WEBVTT\n\n';
	vtt += srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
	return vtt;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			const url = new URL(request.url);

			// Initialize chunked upload using R2 multipart
			if (url.pathname === '/upload/init' && request.method === 'POST') {
				const auth = request.headers.get('Authorization');
				if (!auth || auth !== `Bearer ${env.SAIL2GETHER_R2_SECRET}`) {
					return new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const { filename, fileSize, totalChunks } = (await request.json()) as {
					filename: string;
					fileSize: number;
					totalChunks: number;
				};

				if (fileSize > MAX_FILE_SIZE) {
					return new Response(JSON.stringify({ error: 'File too large', maxSize: MAX_FILE_SIZE }), {
						status: 413,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const sessionId = crypto.randomUUID();
				const timestamp = Date.now();
				const randomStr = Math.random().toString(36).substring(2, 8);
				const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
				const key = `videos/${timestamp}-${randomStr}-${sanitizedName}`;

				// Create R2 multipart upload
				const multipartUpload = await env.SAIL2GETHER_BUCKET.createMultipartUpload(key, {
					httpMetadata: {
						contentType: 'video/mp4',
					},
					customMetadata: {
						originalName: filename,
						uploadedAt: new Date().toISOString(),
						fileSize: fileSize.toString(),
						fileType: 'video',
					},
				});

				const metadata: UploadMetadata = {
					key,
					filename,
					fileSize,
					totalChunks,
					uploadId: multipartUpload.uploadId,
					parts: [],
					createdAt: Date.now(),
				};

				await env.SAIL2GETHER_UPLOAD_METADATA.put(sessionId, JSON.stringify(metadata), {
					expirationTtl: UPLOAD_EXPIRY,
				});

				return new Response(
					JSON.stringify({
						uploadId: sessionId,
						key,
						r2UploadId: multipartUpload.uploadId,
					}),
					{ headers: { 'Content-Type': 'application/json', ...corsHeaders } }
				);
			}

			// Upload chunk using R2 multipart
			if (url.pathname === '/upload/chunk' && request.method === 'PUT') {
				const auth = request.headers.get('Authorization');
				if (!auth || auth !== `Bearer ${env.SAIL2GETHER_R2_SECRET}`) {
					return new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const uploadId = url.searchParams.get('uploadId');
				const partNumberString = url.searchParams.get('partNumber');

				if (!uploadId || !partNumberString) {
					return new Response(JSON.stringify({ error: 'Missing uploadId or partNumber' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				if (!request.body) {
					return new Response(JSON.stringify({ error: 'Missing request body' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const metadataJson = await env.SAIL2GETHER_UPLOAD_METADATA.get(uploadId);
				if (!metadataJson) {
					return new Response(JSON.stringify({ error: 'Upload not found or expired' }), {
						status: 404,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const metadata: UploadMetadata = JSON.parse(metadataJson);
				const partNumber = parseInt(partNumberString, 10);

				// Resume the multipart upload and upload the part
				const multipartUpload = env.SAIL2GETHER_BUCKET.resumeMultipartUpload(metadata.key, metadata.uploadId);

				try {
					const uploadedPart: R2UploadedPart = await multipartUpload.uploadPart(partNumber, request.body);

					// Store part info
					metadata.parts.push(uploadedPart);
					metadata.parts.sort((a, b) => a.partNumber - b.partNumber);

					await env.SAIL2GETHER_UPLOAD_METADATA.put(uploadId, JSON.stringify(metadata), {
						expirationTtl: UPLOAD_EXPIRY,
					});

					return new Response(
						JSON.stringify({
							success: true,
							partNumber: uploadedPart.partNumber,
							etag: uploadedPart.etag,
							uploadedChunks: metadata.parts.length,
							totalChunks: metadata.totalChunks,
						}),
						{ headers: { 'Content-Type': 'application/json', ...corsHeaders } }
					);
				} catch (error: any) {
					return new Response(JSON.stringify({ error: error.message || 'Failed to upload part' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}
			}

			// Complete chunked upload
			if (url.pathname === '/upload/complete' && request.method === 'POST') {
				const auth = request.headers.get('Authorization');
				if (!auth || auth !== `Bearer ${env.SAIL2GETHER_R2_SECRET}`) {
					return new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const { uploadId } = (await request.json()) as { uploadId: string };

				const metadataJson = await env.SAIL2GETHER_UPLOAD_METADATA.get(uploadId);
				if (!metadataJson) {
					return new Response(JSON.stringify({ error: 'Upload metadata not found' }), {
						status: 404,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const metadata: UploadMetadata = JSON.parse(metadataJson);

				// Verify all chunks uploaded
				if (metadata.parts.length !== metadata.totalChunks) {
					return new Response(
						JSON.stringify({
							error: 'Incomplete upload',
							uploaded: metadata.parts.length,
							total: metadata.totalChunks,
						}),
						{ status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
					);
				}

				// Resume and complete the multipart upload on R2
				const multipartUpload = env.SAIL2GETHER_BUCKET.resumeMultipartUpload(metadata.key, metadata.uploadId);

				try {
					const object = await multipartUpload.complete(metadata.parts);

					// Clean up metadata
					await env.SAIL2GETHER_UPLOAD_METADATA.delete(uploadId);

					const fileUrl = `${env.SAIL2GETHER_PUBLIC_URL}/${metadata.key}`;

					return new Response(
						JSON.stringify({
							success: true,
							url: fileUrl,
							key: metadata.key,
							size: metadata.fileSize,
							etag: object.httpEtag,
						}),
						{ headers: { 'Content-Type': 'application/json', ...corsHeaders } }
					);
				} catch (error: any) {
					return new Response(JSON.stringify({ error: error.message || 'Failed to complete upload' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}
			}

			// Abort multipart upload
			if (url.pathname === '/upload/abort' && request.method === 'DELETE') {
				const auth = request.headers.get('Authorization');
				if (!auth || auth !== `Bearer ${env.SAIL2GETHER_R2_SECRET}`) {
					return new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const uploadId = url.searchParams.get('uploadId');
				if (!uploadId) {
					return new Response(JSON.stringify({ error: 'Missing uploadId' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const metadataJson = await env.SAIL2GETHER_UPLOAD_METADATA.get(uploadId);
				if (!metadataJson) {
					return new Response(JSON.stringify({ error: 'Upload not found' }), {
						status: 404,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const metadata: UploadMetadata = JSON.parse(metadataJson);

				const multipartUpload = env.SAIL2GETHER_BUCKET.resumeMultipartUpload(metadata.key, metadata.uploadId);

				try {
					await multipartUpload.abort();
					await env.SAIL2GETHER_UPLOAD_METADATA.delete(uploadId);

					return new Response(null, {
						status: 204,
						headers: corsHeaders,
					});
				} catch (error: any) {
					return new Response(JSON.stringify({ error: error.message || 'Failed to abort upload' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}
			}

			// Original upload endpoint (for small files and subtitles)
			if (url.pathname === '/upload' && request.method === 'POST') {
				const auth = request.headers.get('Authorization');
				if (!auth || auth !== `Bearer ${env.SAIL2GETHER_R2_SECRET}`) {
					return new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const formData = await request.formData();
				const file = formData.get('file');
				const fileType = formData.get('type') as string | null;

				if (!file || !(file instanceof File)) {
					return new Response(JSON.stringify({ error: 'No file provided' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const isSubtitle = fileType === 'subtitle';
				const maxSize = isSubtitle ? MAX_SUBTITLE_SIZE : MAX_FILE_SIZE;
				const allowedTypes = isSubtitle ? ALLOWED_SUBTITLE_TYPES : ALLOWED_VIDEO_TYPES;
				const prefix = isSubtitle ? 'subtitles' : 'videos';

				if (file.size > maxSize) {
					return new Response(
						JSON.stringify({
							error: 'File too large',
							maxSize: maxSize,
							actualSize: file.size,
						}),
						{ status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
					);
				}

				if (file.type && !allowedTypes.includes(file.type) && !isSubtitle) {
					return new Response(
						JSON.stringify({
							error: 'Invalid file type',
							allowedTypes: allowedTypes,
							receivedType: file.type,
						}),
						{ status: 415, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
					);
				}

				const timestamp = Date.now();
				const randomStr = Math.random().toString(36).substring(2, 8);
				const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
				const key = `${prefix}/${timestamp}-${randomStr}-${sanitizedName}`;

				let fileData: ArrayBuffer | string = await file.arrayBuffer();
				let contentType = isSubtitle ? 'text/vtt' : file.type || 'video/mp4';

				if (isSubtitle && (file.name.toLowerCase().endsWith('.srt') || file.type.includes('subrip'))) {
					const textDecoder = new TextDecoder('utf-8');
					const srtContent = textDecoder.decode(fileData as ArrayBuffer);
					fileData = convertSrtToVtt(srtContent);
					contentType = 'text/vtt';
				}

				await env.SAIL2GETHER_BUCKET.put(key, fileData, {
					httpMetadata: { contentType: contentType },
					customMetadata: {
						originalName: file.name,
						uploadedAt: new Date().toISOString(),
						fileSize: file.size.toString(),
						fileType: fileType || 'video',
					},
				});

				const fileUrl = `${env.SAIL2GETHER_PUBLIC_URL}/${key}`;

				return new Response(
					JSON.stringify({
						success: true,
						url: fileUrl,
						key: key,
						size: file.size,
						type: file.type,
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
				);
			}

			// Direct video streaming endpoint
			if ((url.pathname.startsWith('/videos/') || url.pathname.startsWith('/subtitles/')) && request.method === 'GET') {
				const key = url.pathname.substring(1);
				const object = await env.SAIL2GETHER_BUCKET.get(key);

				if (!object) {
					return new Response(JSON.stringify({ error: 'File not found' }), {
						status: 404,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const isSubtitle = key.startsWith('subtitles/');
				const range = request.headers.get('Range');

				const headers = new Headers({
					...corsHeaders,
					'Content-Type': isSubtitle ? 'text/vtt' : object.httpMetadata?.contentType || 'video/mp4',
					'Cache-Control': 'public, max-age=31536000',
					'Accept-Ranges': 'bytes',
				});

				if (range) {
					const parts = range.replace(/bytes=/, '').split('-');
					const start = parseInt(parts[0], 10);
					const end = parts[1] ? parseInt(parts[1], 10) : object.size - 1;
					const chunkSize = end - start + 1;

					headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
					headers.set('Content-Length', chunkSize.toString());

					return new Response(object.body, { status: 206, headers });
				}

				headers.set('Content-Length', object.size.toString());
				return new Response(object.body, { status: 200, headers });
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
					{ headers: { 'Content-Type': 'application/json', ...corsHeaders } }
				);
			}

			// Delete video endpoint
			if (url.pathname === '/delete' && request.method === 'POST') {
				const auth = request.headers.get('Authorization');
				if (!auth || auth !== `Bearer ${env.SAIL2GETHER_R2_SECRET}`) {
					return new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const { key } = (await request.json()) as { key: string };

				if (!key || (!key.startsWith('videos/') && !key.startsWith('subtitles/'))) {
					return new Response(JSON.stringify({ error: 'Invalid key', received: key }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', ...corsHeaders },
					});
				}

				const objectToDelete = await env.SAIL2GETHER_BUCKET.get(key);
				if (!objectToDelete) {
					return new Response(
						JSON.stringify({
							success: false,
							error: 'Object not found',
							key: key,
						}),
						{ status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
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
					{ status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
				);
			}

			return new Response(JSON.stringify({ error: 'Not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json', ...corsHeaders },
			});
		} catch (error) {
			console.error('Worker error:', error);
			return new Response(
				JSON.stringify({
					error: 'Internal server error',
					message: error instanceof Error ? error.message : 'Unknown error',
				}),
				{ status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
			);
		}
	},
};
