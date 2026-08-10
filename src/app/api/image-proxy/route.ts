import { NextResponse } from "next/server";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function isAllowedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "drive.google.com"
    || host === "drive.usercontent.google.com"
    || host.endsWith(".googleusercontent.com")
    || host === "ibb.co"
    || host.endsWith(".ibb.co")
    || host === "imgbb.com"
    || host.endsWith(".imgbb.com");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function driveFileId(url: URL) {
  const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
  return pathMatch?.[1] || url.searchParams.get("id") || "";
}

async function fetchExternal(url: string, headers: HeadersInit = {}) {
  let current = new URL(url);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!isAllowedHost(current.hostname)) throw new Error("Sumber gambar tidak diizinkan.");
    const response = await fetch(current, {
      headers: { "user-agent": "KORA-image-loader/1.0", ...headers },
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    current = new URL(location, current);
  }
  throw new Error("Sumber gambar terlalu banyak mengalihkan alamat.");
}

async function resolveImageUrl(source: URL) {
  if (source.hostname.toLowerCase() === "drive.google.com") {
    const id = driveFileId(source);
    if (!id) throw new Error("ID file Google Drive tidak ditemukan.");
    return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
  }

  const sourceHost = source.hostname.toLowerCase();
  if (sourceHost === "ibb.co" || sourceHost === "www.ibb.co" || sourceHost === "imgbb.com" || sourceHost === "www.imgbb.com") {
    const page = await fetchExternal(source.toString(), { accept: "text/html" });
    const html = await page.text();
    const match = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    if (!match?.[1]) throw new Error("URL gambar IBB tidak ditemukan.");
    return decodeHtml(match[1]);
  }

  return source.toString();
}

export async function GET(request: Request) {
  const rawUrl = new URL(request.url).searchParams.get("url");
  if (!rawUrl) return NextResponse.json({ error: "URL gambar belum diberikan." }, { status: 400 });

  try {
    const source = new URL(rawUrl);
    if (!isAllowedHost(source.hostname)) return NextResponse.json({ error: "Sumber gambar tidak diizinkan." }, { status: 400 });
    const resolvedUrl = await resolveImageUrl(source);
    const response = await fetchExternal(resolvedUrl, { accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" });
    const contentType = response.headers.get("content-type")?.split(";")[0] || "";
    if (!contentType.startsWith("image/")) return NextResponse.json({ error: "Sumber tidak mengembalikan gambar." }, { status: 415 });
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Ukuran gambar terlalu besar." }, { status: 413 });
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Ukuran gambar terlalu besar." }, { status: 413 });
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gambar tidak dapat dimuat.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
