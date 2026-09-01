const ALLOWED_ORIGINS = new Set([
  'https://archive.assured.love',
  'https://end-of-eden.github.io',
  'http://archive.assured.love'
]);

const IMAGE_ORIGIN = 'https://images.assured.love';

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://archive.assured.love',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Archive-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request) }
  });
}

function parseJson(value, fallback) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function rowToEntry(row) {
  return {
    id: row.id,
    image: row.image,
    thumbnail: row.thumbnail || row.image,
    cropX: row.crop_x,
    cropY: row.crop_y,
    type: row.type,
    number: row.number,
    params: row.params,
    artists: row.artists,
    category: row.category,
    prompt: row.prompt,
    negative: row.negative,
    characters: parseJson(row.characters, []),
    tags: parseJson(row.tags, []),
    date: row.date
  };
}

function cleanEntry(raw, id) {
  return {
    id,
    cropX: Number.isFinite(Number(raw.cropX)) ? Number(raw.cropX) : 50,
    cropY: Number.isFinite(Number(raw.cropY)) ? Number(raw.cropY) : 50,
    type: String(raw.type || 'style'),
    number: String(raw.number || ''),
    params: String(raw.params || ''),
    artists: String(raw.artists || ''),
    category: String(raw.category || ''),
    prompt: String(raw.prompt || ''),
    negative: String(raw.negative || ''),
    characters: Array.isArray(raw.characters) ? raw.characters : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    date: String(raw.date || new Date().toISOString().slice(0, 10))
  };
}

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
}

function objectKeyFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== IMAGE_ORIGIN) return null;
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch { return null; }
}

function authorized(request, env) {
  return Boolean(env.ARCHIVE_KEY) && request.headers.get('X-Archive-Key') === env.ARCHIVE_KEY;
}

async function getEntry(env, id) {
  return env.DB.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first();
}

async function saveFiles(env, id, form) {
  const stamp = Date.now();
  const original = form.get('original');
  const thumbnail = form.get('thumbnail');
  const result = {};

  if (original instanceof File && original.size) {
    const key = `originals/${id}-${stamp}.webp`;
    await env.BUCKET.put(key, original.stream(), { httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' } });
    result.image = `${IMAGE_ORIGIN}/${key}`;
  }
  if (thumbnail instanceof File && thumbnail.size) {
    const key = `thumbs/${id}-${stamp}.webp`;
    await env.BUCKET.put(key, thumbnail.stream(), { httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' } });
    result.thumbnail = `${IMAGE_ORIGIN}/${key}`;
  }
  return result;
}

async function removeFiles(env, row) {
  const keys = [objectKeyFromUrl(row.image), objectKeyFromUrl(row.thumbnail)].filter(Boolean);
  if (keys.length) await env.BUCKET.delete([...new Set(keys)]);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/entries') {
        const { results } = await env.DB.prepare('SELECT * FROM entries ORDER BY CAST(number AS INTEGER) ASC, created_at ASC').all();
        return json(request, results.map(rowToEntry));
      }

      if (!authorized(request, env)) {
        return json(request, { error: env.ARCHIVE_KEY ? 'Wrong password.' : 'Archive secret is not configured.' }, env.ARCHIVE_KEY ? 401 : 503);
      }

      if (request.method === 'POST' && url.pathname === '/entries') {
        const form = await request.formData();
        const raw = JSON.parse(String(form.get('metadata') || '{}'));
        const id = safeId(raw.id);
        if (!id) return json(request, { error: 'Missing entry id.' }, 400);
        if (await getEntry(env, id)) return json(request, { error: 'Entry already exists.' }, 409);
        const entry = cleanEntry(raw, id);
        const files = await saveFiles(env, id, form);
        if (!files.image) return json(request, { error: 'Choose an image first.' }, 400);
        const image = files.image;
        const thumbnail = files.thumbnail || image;
        await env.DB.prepare(`INSERT INTO entries
          (id,image,thumbnail,crop_x,crop_y,type,number,params,artists,category,prompt,negative,characters,tags,date)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id,image,thumbnail,entry.cropX,entry.cropY,entry.type,entry.number,entry.params,entry.artists,entry.category,entry.prompt,entry.negative,JSON.stringify(entry.characters),JSON.stringify(entry.tags),entry.date).run();
        return json(request, rowToEntry(await getEntry(env, id)), 201);
      }

      const match = url.pathname.match(/^\/entries\/([a-zA-Z0-9_-]+)$/);
      if (match && request.method === 'PUT') {
        const id = safeId(match[1]);
        const old = await getEntry(env, id);
        if (!old) return json(request, { error: 'Entry not found.' }, 404);
        const form = await request.formData();
        const entry = cleanEntry(JSON.parse(String(form.get('metadata') || '{}')), id);
        const files = await saveFiles(env, id, form);
        const image = files.image || old.image;
        const thumbnail = files.thumbnail || (files.image ? image : old.thumbnail || image);
        await env.DB.prepare(`UPDATE entries SET
          image=?,thumbnail=?,crop_x=?,crop_y=?,type=?,number=?,params=?,artists=?,category=?,prompt=?,negative=?,characters=?,tags=?,date=?,updated_at=CURRENT_TIMESTAMP
          WHERE id=?`)
          .bind(image,thumbnail,entry.cropX,entry.cropY,entry.type,entry.number,entry.params,entry.artists,entry.category,entry.prompt,entry.negative,JSON.stringify(entry.characters),JSON.stringify(entry.tags),entry.date,id).run();
        if (files.image || files.thumbnail) await removeFiles(env, old);
        return json(request, rowToEntry(await getEntry(env, id)));
      }

      if (match && request.method === 'DELETE') {
        const id = safeId(match[1]);
        const old = await getEntry(env, id);
        if (!old) return json(request, { error: 'Entry not found.' }, 404);
        await env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(id).run();
        await removeFiles(env, old);
        return json(request, { ok: true });
      }

      return json(request, { error: 'Not found.' }, 404);
    } catch (error) {
      return json(request, { error: error instanceof Error ? error.message : 'Request failed.' }, 500);
    }
  }
};
