/** Inspect an xlsx zip for pasted/embedded pictures (xl/media), not cell URLs. */

export type EmbeddedDrawingReport = {
  mediaFiles: number;
  drawingFiles: number;
  mediaNames: string[];
};

const EOCD = 0x06054b50;
const CENTRAL_HEADER = 0x02014b50;

function listZipNames(data: ArrayBuffer): string[] {
  const view = new DataView(data);
  const names: string[] = [];
  const minEocd = Math.max(0, data.byteLength - 22 - 65535);
  let eocd = -1;
  for (let offset = data.byteLength - 22; offset >= minEocd; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return names;
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  let offset = cdOffset;
  const end = Math.min(data.byteLength, cdOffset + cdSize);
  while (offset + 46 <= end) {
    if (view.getUint32(offset, true) !== CENTRAL_HEADER) break;
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    if (nameStart + nameLen > data.byteLength) break;
    names.push(new TextDecoder("utf-8").decode(new Uint8Array(data, nameStart, nameLen)));
    offset = nameStart + nameLen + extraLen + commentLen;
  }
  return names;
}

export function inspectEmbeddedDrawings(data: ArrayBuffer): EmbeddedDrawingReport {
  const names = listZipNames(data);
  const mediaNames = names.filter((name) => /^xl\/media\//i.test(name) && !name.endsWith("/"));
  const drawingFiles = names.filter((name) => /^xl\/drawings\/drawing\d+\.xml$/i.test(name)).length;
  return { mediaFiles: mediaNames.length, drawingFiles, mediaNames };
}
