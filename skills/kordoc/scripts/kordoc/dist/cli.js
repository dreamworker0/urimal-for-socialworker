var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/detect.ts
var detect_exports = {};
__export(detect_exports, {
  detectFormat: () => detectFormat,
  detectZipFormat: () => detectZipFormat,
  isHwpmlFile: () => isHwpmlFile,
  isHwpxFile: () => isHwpxFile,
  isOldHwpFile: () => isOldHwpFile,
  isPdfFile: () => isPdfFile,
  isZipFile: () => isZipFile
});
import JSZip from "jszip";
function magicBytes(buffer) {
  return new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
}
function isZipFile(buffer) {
  const b = magicBytes(buffer);
  return b[0] === 80 && b[1] === 75 && b[2] === 3 && b[3] === 4;
}
function isHwpxFile(buffer) {
  return isZipFile(buffer);
}
function isOldHwpFile(buffer) {
  const b = magicBytes(buffer);
  return b[0] === 208 && b[1] === 207 && b[2] === 17 && b[3] === 224;
}
function isPdfFile(buffer) {
  const b = magicBytes(buffer);
  return b[0] === 37 && b[1] === 80 && b[2] === 68 && b[3] === 70;
}
function isHwpmlFile(buffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(512, buffer.byteLength));
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
  return head.trimStart().startsWith("<?xml") && head.includes("<HWPML");
}
function detectFormat(buffer) {
  if (buffer.byteLength < 4) return "unknown";
  if (isZipFile(buffer)) return "hwpx";
  if (isOldHwpFile(buffer)) return "hwp";
  if (isPdfFile(buffer)) return "pdf";
  if (isHwpmlFile(buffer)) return "hwpml";
  return "unknown";
}
async function detectZipFormat(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    if (zip.file("xl/workbook.xml")) return "xlsx";
    if (zip.file("word/document.xml")) return "docx";
    if (zip.file("Contents/content.hpf") || zip.file("mimetype")) return "hwpx";
    const hasSection = Object.keys(zip.files).some((f) => f.startsWith("Contents/"));
    if (hasSection) return "hwpx";
    return "unknown";
  } catch {
    return "unknown";
  }
}
var init_detect = __esm({
  "src/detect.ts"() {
    "use strict";
  }
});

// src/utils.ts
function toArrayBuffer(buf) {
  if (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength) {
    return buf.buffer;
  }
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
function sanitizeError(err) {
  if (err instanceof KordocError) return err.message;
  return "\uBB38\uC11C \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4";
}
function isPathTraversal(name) {
  if (name.includes("\0")) return true;
  const normalized = name.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments.some((s) => s === "..") || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized);
}
function precheckZipSize(buffer, maxUncompressedSize = 100 * 1024 * 1024, maxEntries = 500) {
  try {
    const data = new DataView(buffer);
    const len = buffer.byteLength;
    let eocdOffset = -1;
    for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
      if (data.getUint32(i, true) === 101010256) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset < 0) return { totalUncompressed: 0, entryCount: 0 };
    const entryCount = data.getUint16(eocdOffset + 10, true);
    if (entryCount > maxEntries) {
      throw new KordocError(`ZIP \uC5D4\uD2B8\uB9AC \uC218 \uCD08\uACFC: ${entryCount} (\uCD5C\uB300 ${maxEntries})`);
    }
    const cdSize = data.getUint32(eocdOffset + 12, true);
    const cdOffset = data.getUint32(eocdOffset + 16, true);
    if (cdOffset + cdSize > len) return { totalUncompressed: 0, entryCount };
    let totalUncompressed = 0;
    let pos = cdOffset;
    for (let i = 0; i < entryCount && pos + 46 <= cdOffset + cdSize; i++) {
      if (data.getUint32(pos, true) !== 33639248) break;
      totalUncompressed += data.getUint32(pos + 24, true);
      const nameLen = data.getUint16(pos + 28, true);
      const extraLen = data.getUint16(pos + 30, true);
      const commentLen = data.getUint16(pos + 32, true);
      pos += 46 + nameLen + extraLen + commentLen;
    }
    if (totalUncompressed > maxUncompressedSize) {
      throw new KordocError(`ZIP \uBE44\uC555\uCD95 \uD06C\uAE30 \uCD08\uACFC: ${(totalUncompressed / 1024 / 1024).toFixed(1)}MB (\uCD5C\uB300 ${maxUncompressedSize / 1024 / 1024}MB)`);
    }
    return { totalUncompressed, entryCount };
  } catch (err) {
    if (err instanceof KordocError) throw err;
    return { totalUncompressed: 0, entryCount: 0 };
  }
}
function stripDtd(xml) {
  return xml.replace(/<!DOCTYPE\s[^[>]*(\[[\s\S]*?\])?\s*>/gi, "");
}
function sanitizeHref(href) {
  const trimmed = href.trim();
  if (!trimmed || !SAFE_HREF_RE.test(trimmed)) return null;
  return trimmed;
}
function safeMin(arr) {
  let min = Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] < min) min = arr[i];
  return min;
}
function safeMax(arr) {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  return max;
}
function classifyError(err) {
  if (!(err instanceof Error)) return "PARSE_ERROR";
  const msg = err.message;
  if (msg.includes("\uC554\uD638\uD654")) return "ENCRYPTED";
  if (msg.includes("DRM")) return "DRM_PROTECTED";
  if (msg.includes("ZIP bomb") || msg.includes("ZIP \uBE44\uC555\uCD95 \uD06C\uAE30 \uCD08\uACFC") || msg.includes("ZIP \uC5D4\uD2B8\uB9AC \uC218 \uCD08\uACFC")) return "ZIP_BOMB";
  if (msg.includes("bomb") || msg.includes("\uD06C\uAE30 \uCD08\uACFC") || msg.includes("\uC555\uCD95 \uD574\uC81C")) return "DECOMPRESSION_BOMB";
  if (msg.includes("\uC774\uBBF8\uC9C0 \uAE30\uBC18")) return "IMAGE_BASED_PDF";
  if (msg.includes("\uC139\uC158") && (msg.includes("\uCC3E\uC744 \uC218 \uC5C6") || msg.includes("\uC5C6\uC74C"))) return "NO_SECTIONS";
  if (msg.includes("\uC2DC\uADF8\uB2C8\uCC98") || msg.includes("\uBCF5\uAD6C\uD560 \uC218 \uC5C6")) return "CORRUPTED";
  return "PARSE_ERROR";
}
var VERSION, KordocError, SAFE_HREF_RE;
var init_utils = __esm({
  "src/utils.ts"() {
    "use strict";
    VERSION = true ? "2.6.2" : "0.0.0-dev";
    KordocError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "KordocError";
      }
    };
    SAFE_HREF_RE = /^(?:https?:|mailto:|tel:|#)/i;
  }
});

// src/table/builder.ts
function buildTable(rows) {
  if (rows.length > MAX_ROWS) rows = rows.slice(0, MAX_ROWS);
  const numRows = rows.length;
  const hasAddr = rows.some((row) => row.some((c2) => c2.colAddr !== void 0 && c2.rowAddr !== void 0));
  if (hasAddr) return buildTableDirect(rows, numRows);
  let maxCols = 0;
  const tempOccupied = Array.from({ length: numRows }, () => []);
  for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
    let colIdx = 0;
    for (const cell of rows[rowIdx]) {
      while (colIdx < MAX_COLS && tempOccupied[rowIdx][colIdx]) colIdx++;
      if (colIdx >= MAX_COLS) break;
      for (let r = rowIdx; r < Math.min(rowIdx + cell.rowSpan, numRows); r++) {
        for (let c2 = colIdx; c2 < Math.min(colIdx + cell.colSpan, MAX_COLS); c2++) {
          tempOccupied[r][c2] = true;
        }
      }
      colIdx += cell.colSpan;
      if (colIdx > maxCols) maxCols = colIdx;
    }
  }
  if (maxCols === 0) return { rows: 0, cols: 0, cells: [], hasHeader: false };
  const grid = Array.from(
    { length: numRows },
    () => Array.from({ length: maxCols }, () => ({ text: "", colSpan: 1, rowSpan: 1 }))
  );
  const occupied = Array.from({ length: numRows }, () => Array(maxCols).fill(false));
  for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
    let colIdx = 0;
    let cellIdx = 0;
    while (colIdx < maxCols && cellIdx < rows[rowIdx].length) {
      while (colIdx < maxCols && occupied[rowIdx][colIdx]) colIdx++;
      if (colIdx >= maxCols) break;
      const cell = rows[rowIdx][cellIdx];
      grid[rowIdx][colIdx] = {
        text: cell.text.trim(),
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan
      };
      for (let r = rowIdx; r < Math.min(rowIdx + cell.rowSpan, numRows); r++) {
        for (let c2 = colIdx; c2 < Math.min(colIdx + cell.colSpan, maxCols); c2++) {
          occupied[r][c2] = true;
        }
      }
      colIdx += cell.colSpan;
      cellIdx++;
    }
  }
  return trimAndReturn(grid, numRows, maxCols);
}
function buildTableDirect(rows, numRows) {
  let maxCols = 0;
  for (const row of rows) {
    for (const cell of row) {
      const end = (cell.colAddr ?? 0) + cell.colSpan;
      if (end > maxCols) maxCols = end;
    }
  }
  if (maxCols > MAX_COLS) maxCols = MAX_COLS;
  if (maxCols === 0) return { rows: 0, cols: 0, cells: [], hasHeader: false };
  const grid = Array.from(
    { length: numRows },
    () => Array.from({ length: maxCols }, () => ({ text: "", colSpan: 1, rowSpan: 1 }))
  );
  for (const row of rows) {
    for (const cell of row) {
      const r = cell.rowAddr ?? 0;
      const c2 = cell.colAddr ?? 0;
      if (r >= numRows || c2 >= maxCols || r < 0 || c2 < 0) continue;
      grid[r][c2] = { text: cell.text.trim(), colSpan: cell.colSpan, rowSpan: cell.rowSpan };
      for (let dr = 0; dr < cell.rowSpan; dr++) {
        for (let dc = 0; dc < cell.colSpan; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (r + dr < numRows && c2 + dc < maxCols) {
            grid[r + dr][c2 + dc] = { text: "", colSpan: 1, rowSpan: 1 };
          }
        }
      }
    }
  }
  return trimAndReturn(grid, numRows, maxCols);
}
function trimAndReturn(grid, numRows, maxCols) {
  let effectiveCols = maxCols;
  while (effectiveCols > 0) {
    const colEmpty = grid.every((row) => !row[effectiveCols - 1]?.text?.trim());
    if (!colEmpty) break;
    effectiveCols--;
  }
  if (effectiveCols < maxCols && effectiveCols > 0) {
    const trimmed = grid.map((row) => row.slice(0, effectiveCols));
    return { rows: numRows, cols: effectiveCols, cells: trimmed, hasHeader: numRows > 1 };
  }
  return { rows: numRows, cols: maxCols, cells: grid, hasHeader: numRows > 1 };
}
function convertTableToText(rows) {
  return rows.map(
    (row) => row.map((c2) => c2.text.trim().replace(/\n/g, " ").replace(/\|/g, "\\|")).filter(Boolean).join(" / ")
  ).filter(Boolean).join("\n");
}
function escapeGfm(text) {
  return text.replace(/~/g, "\\~");
}
function sanitizeText(text) {
  let result = text.replace(/[\u{F0000}-\u{FFFFD}]/gu, "").replace(HWP_SHAPE_ALT_TEXT_RE, "").replace(/  +/g, " ").trim();
  if (result.length <= 30 && result.includes(" ")) {
    const tokens = result.split(" ");
    const koreanSingleCharCount = tokens.filter((t) => t.length === 1 && /[\uAC00-\uD7AF\u3131-\u318E]/.test(t)).length;
    if (tokens.length >= 3 && koreanSingleCharCount / tokens.length >= 0.7) {
      result = tokens.join("");
    }
  }
  return result;
}
function flattenLayoutTables(blocks) {
  const result = [];
  for (const block of blocks) {
    if (block.type !== "table" || !block.table) {
      result.push(block);
      continue;
    }
    const { rows: numRows, cols: numCols, cells } = block.table;
    if (numRows === 1 && numCols === 1) {
      result.push(block);
      continue;
    }
    if (numRows <= 3) {
      let totalNewlines = 0;
      let totalTextLen = 0;
      for (let r = 0; r < numRows; r++) {
        for (let c2 = 0; c2 < numCols; c2++) {
          const t = cells[r]?.[c2]?.text || "";
          totalNewlines += (t.match(/\n/g) || []).length;
          totalTextLen += t.length;
        }
      }
      if (totalNewlines > 5 || numRows <= 2 && totalTextLen > 300) {
        for (let r = 0; r < numRows; r++) {
          for (let c2 = 0; c2 < numCols; c2++) {
            const cellText = cells[r]?.[c2]?.text?.trim();
            if (!cellText) continue;
            for (const line of cellText.split("\n")) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              result.push({ type: "paragraph", text: trimmed, pageNumber: block.pageNumber });
            }
          }
        }
        continue;
      }
    }
    result.push(block);
  }
  return result;
}
function blocksToMarkdown(blocks) {
  const lines = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === "heading" && block.text) {
      const prefix = "#".repeat(Math.min(block.level || 2, 6));
      const headingText = sanitizeText(block.text);
      if (headingText) lines.push("", `${prefix} ${headingText}`, "");
      continue;
    }
    if (block.type === "image" && block.text) {
      lines.push("", `![image](${block.text})`, "");
      continue;
    }
    if (block.type === "separator") {
      lines.push("", "---", "");
      continue;
    }
    if (block.type === "list" && block.text) {
      const listText = sanitizeText(block.text);
      if (!listText) continue;
      const alreadyNumbered = block.listType === "ordered" && /^\d+\.\s/.test(listText);
      const prefix = alreadyNumbered ? "" : block.listType === "ordered" ? "1. " : "- ";
      lines.push(`${prefix}${listText}`);
      if (block.children) {
        for (const child of block.children) {
          const childPrefix = child.listType === "ordered" ? "1." : "-";
          lines.push(`  ${childPrefix} ${child.text || ""}`);
        }
      }
      continue;
    }
    if (block.type === "paragraph" && block.text) {
      let text = sanitizeText(block.text);
      if (!text) continue;
      if (/^\[별표\s*\d+/.test(text)) {
        const nextBlock = blocks[i + 1];
        if (nextBlock?.type === "paragraph" && nextBlock.text && /관련\)?$/.test(nextBlock.text)) {
          lines.push("", `## ${text} ${nextBlock.text}`, "");
          i++;
        } else {
          lines.push("", `## ${text}`, "");
        }
        continue;
      }
      if (/^\([^)]*조[^)]*관련\)$/.test(text)) {
        lines.push(`*${text}*`, "");
        continue;
      }
      if (block.href) {
        const href = sanitizeHref(block.href);
        if (href) text = `[${text}](${href})`;
      }
      if (block.footnoteText) {
        text += ` (\uC8FC: ${block.footnoteText})`;
      }
      lines.push(escapeGfm(text), "");
    } else if (block.type === "table" && block.table) {
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
      const tableMd = tableToMarkdown(block.table);
      if (tableMd) {
        lines.push(tableMd);
        lines.push("");
      }
    }
  }
  return lines.join("\n").trim();
}
function hasMergedCells(table) {
  for (const row of table.cells) {
    for (const cell of row) {
      if (cell.colSpan > 1 || cell.rowSpan > 1) return true;
    }
  }
  return false;
}
function containsInlineMath(text) {
  return /(^|[^\\])\$(?=\S)(?:\\.|[^$\n])+?\S\$/.test(text);
}
function tableContainsInlineMath(table) {
  for (const row of table.cells) {
    for (const cell of row) {
      if (containsInlineMath(cell.text)) return true;
    }
  }
  return false;
}
function tableToHtml(table) {
  const { cells, rows: numRows, cols: numCols } = table;
  const skip = /* @__PURE__ */ new Set();
  const lines = ["<table>"];
  for (let r = 0; r < numRows; r++) {
    const tag = r === 0 ? "th" : "td";
    const rowHtml = [];
    for (let c2 = 0; c2 < numCols; c2++) {
      if (skip.has(`${r},${c2}`)) continue;
      const cell = cells[r]?.[c2];
      if (!cell) continue;
      for (let dr = 0; dr < cell.rowSpan; dr++) {
        for (let dc = 0; dc < cell.colSpan; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (r + dr < numRows && c2 + dc < numCols) skip.add(`${r + dr},${c2 + dc}`);
        }
      }
      const text = sanitizeText(cell.text).replace(/\n/g, "<br>");
      const attrs = [];
      if (cell.colSpan > 1) attrs.push(`colspan="${cell.colSpan}"`);
      if (cell.rowSpan > 1) attrs.push(`rowspan="${cell.rowSpan}"`);
      const attrStr = attrs.length ? " " + attrs.join(" ") : "";
      rowHtml.push(`<${tag}${attrStr}>${text}</${tag}>`);
    }
    if (rowHtml.length) lines.push(`<tr>${rowHtml.join("")}</tr>`);
  }
  lines.push("</table>");
  return lines.join("\n");
}
function tableToMarkdown(table) {
  if (table.rows === 0 || table.cols === 0) return "";
  const { cells, rows: numRows, cols: numCols } = table;
  if (hasMergedCells(table) && !tableContainsInlineMath(table)) return tableToHtml(table);
  if (numRows === 1 && numCols === 1) {
    const content = sanitizeText(cells[0][0].text);
    if (!content) return "";
    return content.split(/\n/).map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (/^\d+\.\s/.test(trimmed)) return `**${escapeGfm(trimmed)}**`;
      if (/^[가-힣]\.\s/.test(trimmed)) return `  ${escapeGfm(trimmed)}`;
      return escapeGfm(trimmed);
    }).filter(Boolean).join("\n");
  }
  if (numCols === 1 && numRows >= 2) {
    return cells.map((row) => escapeGfm(sanitizeText(row[0].text)).replace(/\n/g, " ")).filter(Boolean).join("\n");
  }
  const display = Array.from({ length: numRows }, () => Array(numCols).fill(""));
  const skip = /* @__PURE__ */ new Set();
  for (let r = 0; r < numRows; r++) {
    for (let c2 = 0; c2 < numCols; c2++) {
      if (skip.has(`${r},${c2}`)) continue;
      const cell = cells[r]?.[c2];
      if (!cell) continue;
      display[r][c2] = escapeGfm(sanitizeText(cell.text)).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
      for (let dr = 0; dr < cell.rowSpan; dr++) {
        for (let dc = 0; dc < cell.colSpan; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (r + dr < numRows && c2 + dc < numCols) {
            skip.add(`${r + dr},${c2 + dc}`);
          }
        }
      }
      c2 += cell.colSpan - 1;
    }
  }
  const uniqueRows = [];
  let pendingFirstCol = "";
  for (let r = 0; r < display.length; r++) {
    const row = display[r];
    const isEmptyPlaceholder = row.every((cell) => cell === "");
    if (isEmptyPlaceholder) continue;
    const nonEmptyCols = row.filter((cell) => cell !== "");
    const hasSkipInRow = row.some((_, c2) => skip.has(`${r},${c2}`));
    if (!hasSkipInRow && nonEmptyCols.length === 1 && row[0] !== "" && row.slice(1).every((c2) => c2 === "")) {
      pendingFirstCol = row[0];
      continue;
    }
    if (pendingFirstCol && row[0] === "") {
      row[0] = pendingFirstCol;
      pendingFirstCol = "";
    } else {
      pendingFirstCol = "";
    }
    uniqueRows.push(row);
  }
  if (uniqueRows.length === 0) return "";
  const md = [];
  md.push("| " + uniqueRows[0].join(" | ") + " |");
  md.push("| " + uniqueRows[0].map(() => "---").join(" | ") + " |");
  for (let i = 1; i < uniqueRows.length; i++) {
    md.push("| " + uniqueRows[i].join(" | ") + " |");
  }
  return md.join("\n");
}
var MAX_COLS, MAX_ROWS, HWP_SHAPE_ALT_TEXT_RE;
var init_builder = __esm({
  "src/table/builder.ts"() {
    "use strict";
    init_utils();
    MAX_COLS = 200;
    MAX_ROWS = 1e4;
    HWP_SHAPE_ALT_TEXT_RE = /(?:모서리가 둥근 |둥근 )?(?:사각형|직사각형|정사각형|원|타원|삼각형|이등변 삼각형|직각 삼각형|선|직선|곡선|화살표|굵은 화살표|이중 화살표|오각형|육각형|팔각형|별|[4-8]점별|십자|십자형|구름|구름형|마름모|도넛|평행사변형|사다리꼴|부채꼴|호|반원|물결|번개|하트|빗금|블록 화살표|수식|표|그림|개체|그리기\s?개체|묶음\s?개체|글상자|수식\s?개체|OLE\s?개체)\s?입니다\.?/g;
  }
});

// src/types.ts
var HEADING_RATIO_H1, HEADING_RATIO_H2, HEADING_RATIO_H3;
var init_types = __esm({
  "src/types.ts"() {
    "use strict";
    HEADING_RATIO_H1 = 1.5;
    HEADING_RATIO_H2 = 1.3;
    HEADING_RATIO_H3 = 1.15;
  }
});

// src/page-range.ts
var page_range_exports = {};
__export(page_range_exports, {
  parsePageRange: () => parsePageRange
});
function parsePageRange(spec, maxPages) {
  const result = /* @__PURE__ */ new Set();
  if (maxPages <= 0) return result;
  if (Array.isArray(spec)) {
    for (const n of spec) {
      const page = Math.round(n);
      if (page >= 1 && page <= maxPages) result.add(page);
    }
    return result;
  }
  if (typeof spec !== "string" || spec.trim() === "") return result;
  const parts = spec.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10));
      const end = Math.min(maxPages, parseInt(rangeMatch[2], 10));
      for (let i = start; i <= end; i++) result.add(i);
    } else {
      const page = parseInt(trimmed, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPages) result.add(page);
    }
  }
  return result;
}
var init_page_range = __esm({
  "src/page-range.ts"() {
    "use strict";
  }
});

// src/hwpx/com-fallback.ts
import { execFileSync } from "child_process";
import { platform } from "os";
function isComFallbackAvailable() {
  return platform() === "win32";
}
function isEncryptedHwpx(manifestXml) {
  return manifestXml.includes("encryption-data");
}
function extractTextViaCom(filePath) {
  if (!isComFallbackAvailable()) {
    throw new Error("COM fallback\uC740 Windows\uC5D0\uC11C\uB9CC \uC0AC\uC6A9 \uAC00\uB2A5\uD569\uB2C8\uB2E4");
  }
  const escaped = filePath.replace(/'/g, "''");
  const ps1 = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$src = '${escaped}'
$tmpDir = Join-Path $env:TEMP ('hwp-com-' + [guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $tmpDir -Force)
$tmpFile = Join-Path $tmpDir (Split-Path $src -Leaf)
Copy-Item -LiteralPath $src -Destination $tmpFile -Force

try {
  $hwp = New-Object -ComObject HWPFrame.HwpObject
  $hwp.RegisterModule('FilePathCheckerModule', 'FilePathCheckerModuleExample') | Out-Null
  $hwp.Open($tmpFile, '', '') | Out-Null
  $pc = $hwp.PageCount
  $result = @{ pageCount = $pc; pages = @() }
  for ($p = 1; $p -le $pc; $p++) {
    $t = $hwp.GetPageText($p, 0)
    $result.pages += @($t)
  }
  $hwp.Clear(1) | Out-Null
  try { $hwp.Quit() | Out-Null } catch { }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($hwp) | Out-Null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
  $result | ConvertTo-Json -Depth 3 -Compress
} catch {
  @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
} finally {
  # \uC784\uC2DC \uD30C\uC77C \uC815\uB9AC + \uC880\uBE44 Hwp.exe \uBC29\uC9C0\uC6A9 garbage collect
  try { Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue } catch { }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;
  const stdout2 = execFileSync("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    ps1
  ], {
    encoding: "utf-8",
    timeout: 12e4,
    // 2분 타임아웃
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024
    // 50MB
  });
  const trimmed = stdout2.trim();
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart < 0) throw new Error(`COM \uCD9C\uB825\uC5D0 JSON\uC774 \uC5C6\uC2B5\uB2C8\uB2E4: ${trimmed.slice(0, 200)}`);
  const json = JSON.parse(trimmed.slice(jsonStart));
  if (json.error) {
    throw new Error(`COM \uD14D\uC2A4\uD2B8 \uCD94\uCD9C \uC2E4\uD328: ${json.error}`);
  }
  const warnings = [];
  const pages = Array.isArray(json.pages) ? json.pages : [];
  const pageCount = json.pageCount ?? pages.length;
  if (pages.length === 0) {
    warnings.push({ message: "COM\uC73C\uB85C \uD14D\uC2A4\uD2B8\uB97C \uCD94\uCD9C\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4", code: "COM_EMPTY" });
  }
  return { pages, pageCount, warnings };
}
function comResultToParseResult(pages, pageCount, warnings) {
  const blocks = [];
  const lines = [];
  for (let i = 0; i < pages.length; i++) {
    const text = (pages[i] ?? "").trim();
    if (!text) continue;
    const paragraphs = text.split(/\n/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      blocks.push({ type: "paragraph", text: trimmed, pageNumber: i + 1 });
      lines.push(trimmed);
    }
  }
  const markdown = lines.join("\n\n");
  const metadata = { pageCount };
  warnings.push({
    message: "DRM \uBB38\uC11C: \uD55C\uCEF4 COM API\uB85C \uD14D\uC2A4\uD2B8 \uCD94\uCD9C (\uC11C\uC2DD/\uD45C \uC815\uBCF4 \uC81C\uD55C\uC801)",
    code: "DRM_COM_FALLBACK"
  });
  return {
    markdown,
    blocks,
    metadata,
    warnings: warnings.length > 0 ? warnings : void 0
  };
}
var init_com_fallback = __esm({
  "src/hwpx/com-fallback.ts"() {
    "use strict";
  }
});

// src/hwpx/equation.ts
function findBrackets(eqString, startIdx, direction) {
  if (direction === 1) {
    const startCur = eqString.indexOf("{", startIdx);
    if (startCur === -1) throw new Error("cannot find bracket");
    let bracketCount = 1;
    for (let i = startCur + 1; i < eqString.length; i++) {
      const ch = eqString[i];
      if (ch === "{") bracketCount += 1;
      else if (ch === "}") bracketCount -= 1;
      if (bracketCount === 0) return [startCur, i + 1];
    }
    throw new Error("cannot find bracket");
  }
  const reversed = Array.from(eqString).reverse();
  for (let i = 0; i < reversed.length; i++) {
    if (reversed[i] === "{") reversed[i] = "}";
    else if (reversed[i] === "}") reversed[i] = "{";
  }
  const flipped = reversed.join("");
  const newStartIdx = flipped.length - (startIdx + 1);
  const [s, e] = findBrackets(flipped, newStartIdx, 1);
  return [flipped.length - e, flipped.length - s];
}
function findOutterBrackets(eqString, startIdx) {
  let idx = startIdx;
  while (true) {
    idx -= 1;
    if (idx < 0) throw new Error("cannot find bracket");
    if (eqString[idx] === "{") break;
  }
  return findBrackets(eqString, idx, 1);
}
function replaceFrac(eqString) {
  const hmlFrac = "over";
  while (true) {
    const cursor = eqString.indexOf(hmlFrac);
    if (cursor === -1) break;
    try {
      const [numStart, numEnd] = findBrackets(eqString, cursor, 0);
      const numerator = eqString.slice(numStart, numEnd);
      const beforeFrac = eqString.slice(0, numStart);
      const afterFrac = eqString.slice(cursor + hmlFrac.length);
      eqString = beforeFrac + "\\frac" + numerator + afterFrac;
    } catch {
      return eqString;
    }
  }
  return eqString;
}
function replaceRootOf(eqString) {
  while (true) {
    const rootCursor = eqString.indexOf("root");
    if (rootCursor === -1) break;
    try {
      const ofCursor = eqString.indexOf("of");
      if (ofCursor === -1) return eqString;
      const elem1 = findBrackets(eqString, rootCursor, 1);
      const elem2 = findBrackets(eqString, ofCursor, 1);
      const e1 = eqString.slice(elem1[0] + 1, elem1[1] - 1);
      const e2 = eqString.slice(elem2[0] + 1, elem2[1] - 1);
      eqString = eqString.slice(0, rootCursor) + "\\sqrt[" + e1 + "]{" + e2 + "}" + eqString.slice(elem2[1] + 1);
    } catch {
      return eqString;
    }
  }
  return eqString;
}
function replaceAllMatrix(eqString) {
  const replaceElements = (bracketStr) => {
    let inner = bracketStr.slice(1, -1);
    inner = inner.replace(/#/g, " \\\\ ");
    inner = inner.replace(/&amp;/g, "&");
    return inner;
  };
  const replaceMatrix = (input, matStr, matElem) => {
    while (true) {
      const cursor = input.indexOf(matStr);
      if (cursor === -1) break;
      try {
        const [eStart, eEnd] = findBrackets(input, cursor, 1);
        const elem = replaceElements(input.slice(eStart, eEnd));
        let beforeMat;
        let afterMat;
        if (matElem.removeOutterBrackets) {
          const [bStart, bEnd] = findOutterBrackets(input, cursor);
          beforeMat = input.slice(0, bStart);
          afterMat = input.slice(bEnd);
        } else {
          beforeMat = input.slice(0, cursor);
          afterMat = input.slice(eEnd);
        }
        input = beforeMat + matElem.begin + elem + matElem.end + afterMat;
      } catch {
        return input;
      }
    }
    return input;
  };
  for (const [matKey, matElem] of Object.entries(MATRIX_CONVERT_MAP)) {
    eqString = replaceMatrix(eqString, matKey, matElem);
  }
  return eqString;
}
function replaceAllBar(eqString) {
  const replaceBar = (input, barStr, barElem) => {
    while (true) {
      const cursor = input.indexOf(barStr);
      if (cursor === -1) break;
      try {
        const [eStart, eEnd] = findBrackets(input, cursor, 1);
        const [bStart, bEnd] = findOutterBrackets(input, cursor);
        const elem = input.slice(eStart, eEnd);
        const beforeBar = input.slice(0, bStart);
        const afterBar = input.slice(bEnd);
        input = beforeBar + barElem + elem + afterBar;
      } catch {
        return input;
      }
    }
    return input;
  };
  for (const [barKey, barElem] of Object.entries(BAR_CONVERT_MAP)) {
    eqString = replaceBar(eqString, barKey, barElem);
  }
  return eqString;
}
function replaceAllBrace(eqString) {
  const replaceBrace = (input, braceStr, braceElem) => {
    while (true) {
      const cursor = input.indexOf(braceStr);
      if (cursor === -1) break;
      try {
        const [eStart1, eEnd1] = findBrackets(input, cursor, 1);
        const [eStart2, eEnd2] = findBrackets(input, eEnd1, 1);
        const elem1 = input.slice(eStart1, eEnd1);
        const elem2 = input.slice(eStart2, eEnd2);
        const beforeBrace = input.slice(0, cursor);
        const afterBrace = input.slice(eEnd2);
        input = beforeBrace + braceElem + elem1 + "^" + elem2 + afterBrace;
      } catch {
        return input;
      }
    }
    return input;
  };
  for (const [braceKey, braceElem] of Object.entries(BRACE_CONVERT_MAP)) {
    eqString = replaceBrace(eqString, braceKey, braceElem);
  }
  return eqString;
}
function replaceBracket(strList) {
  for (let i = 0; i < strList.length; i++) {
    if (strList[i] === "{" && i > 0 && strList[i - 1] === "\\left") strList[i] = "\\{";
    if (strList[i] === "}" && i > 0 && strList[i - 1] === "\\right") strList[i] = "\\}";
  }
  return strList;
}
function hmlToLatex(hmlEqStr) {
  if (!hmlEqStr) return "";
  let s = hmlEqStr.replace(/`/g, " ");
  s = s.replace(/\{/g, " { ").replace(/\}/g, " } ").replace(/&/g, " & ");
  let tokens = s.split(" ");
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in CONVERT_MAP) tokens[i] = CONVERT_MAP[t];
    else if (t in MIDDLE_CONVERT_MAP) tokens[i] = MIDDLE_CONVERT_MAP[t];
  }
  tokens = tokens.filter((tok) => tok.length !== 0);
  tokens = replaceBracket(tokens);
  let out = tokens.join(" ");
  out = replaceFrac(out);
  out = replaceRootOf(out);
  out = replaceAllMatrix(out);
  out = replaceAllBar(out);
  out = replaceAllBrace(out);
  return out;
}
var CONVERT_MAP, MIDDLE_CONVERT_MAP, BAR_CONVERT_MAP, MATRIX_CONVERT_MAP, BRACE_CONVERT_MAP;
var init_equation = __esm({
  "src/hwpx/equation.ts"() {
    "use strict";
    CONVERT_MAP = {
      TIMES: "\\times",
      times: "\\times",
      LEFT: "\\left",
      RIGHT: "\\right",
      under: "\\underline",
      SMALLSUM: "\\sum",
      sum: "\\sum",
      SMALLPROD: "\\prod",
      prod: "\\prod",
      SMALLINTER: "\\cap",
      CUP: "\\cup",
      OPLUS: "\\oplus",
      OMINUS: "\\ominus",
      OTIMES: "\\otimes",
      ODIV: "\\oslash",
      ODOT: "\\odot",
      LOR: "\\lor",
      LAND: "\\land",
      SUBSET: "\\subset",
      SUPERSET: "\\supset",
      SUBSETEQ: "\\subseteq",
      SUPSETEQ: "\\supseteq",
      IN: "\\in",
      OWNS: "\\owns",
      NOTIN: "\\notin",
      LEQ: "\\leq",
      GEQ: "\\geq",
      "<<": "\\ll",
      ">>": "\\gg",
      "<<<": "\\lll",
      ">>>": "\\ggg",
      PREC: "\\prec",
      SUCC: "\\succ",
      UPLUS: "\\uplus",
      "\xB1": "\\pm",
      "-+": "\\mp",
      "\xF7": "\\div",
      CIRC: "\\circ",
      BULLET: "\\bullet",
      DEG: " ^\\circ",
      AST: "\\ast",
      STAR: "\\bigstar",
      BIGCIRC: "\\bigcirc",
      EMPTYSET: "\\emptyset",
      THEREFORE: "\\therefore",
      BECAUSE: "\\because",
      EXIST: "\\exists",
      "!=": "\\neq",
      SMCOPROD: "\\coprod",
      coprod: "\\coprod",
      SQCAP: "\\sqcap",
      SQCUP: "\\sqcup",
      SQSUBSET: "\\sqsubset",
      SQSUBSETEQ: "\\sqsubseteq",
      BIGSQCUP: "\\bigsqcup",
      BIGOPLUS: "\\bigoplus",
      BIGOTIMES: "\\bigotimes",
      BIGODOT: "\\bigodot",
      BIGUPLUS: "\\biguplus",
      inter: "\\bigcap",
      union: "\\bigcup",
      BIGOMINUS: "{\\Large\\ominus}",
      BIGODIV: "{\\Large\\oslash}",
      UNDEROVER: "",
      SIM: "\\sim",
      APPROX: "\\approx",
      SIMEQ: "\\simeq",
      CONG: "\\cong",
      "==": "\\equiv",
      DIAMOND: "\\diamond",
      FORALL: "\\forall",
      prime: "'",
      Partial: "\\partial",
      INF: "\\infty",
      PROPTO: "\\propto",
      lim: "\\lim",
      Lim: "\\lim",
      larrow: "\\leftarrow",
      "->": "\\rightarrow",
      uparrow: "\\uparrow",
      downarrow: "\\downarrow",
      LARROW: "\\Leftarrow",
      RARROW: "\\Rightarrow",
      UPARROW: "\\Uparrow",
      DOWNARROW: "\\Downarrow",
      udarrow: "\\updownarrow",
      "<->": "\\leftrightarrow",
      UDARROW: "\\Updownarrow",
      LRARROW: "\\Leftrightarrow",
      NWARROW: "\\nwarrow",
      SEARROW: "\\searrow",
      NEARROW: "\\nearrow",
      SWARROW: "\\swarrow",
      HOOKLEFT: "\\hookleftarrow",
      HOOKRIGHT: "\\hookrightarrow",
      PVER: "\\|",
      MAPSTO: "\\mapsto",
      CDOTS: "\\cdots",
      LDOTS: "\\ldots",
      VDOTS: "\\vdots",
      DDOTS: "\\ddots",
      DAGGER: "\\dagger",
      DDAGGER: "\\ddagger",
      DOTEQ: "\\doteq",
      image: "\\fallingdotseq",
      REIMAGE: "\\risingdotseq",
      ASYMP: "\\asymp",
      ISO: "\\Bumpeq",
      DSUM: "\\dotplus",
      XOR: "\\veebar",
      TRIANGLE: "\\triangle",
      NABLA: "\\nabla",
      ANGLE: "\\angle",
      MSANGLE: "\\measuredangle",
      SANGLE: "\\sphericalangle",
      VDASH: "\\vdash",
      DASHV: "\\dashv",
      BOT: "\\bot",
      TOP: "\\top",
      MODELS: "\\models",
      LAPLACE: "\\mathcal{L}",
      CENTIGRADE: "^{\\circ}C",
      FAHRENHEIT: "^{\\circ}F",
      LSLANT: "\\diagup",
      RSLANT: "\\diagdown",
      sqrt: "\\sqrt",
      int: "\\int",
      dint: "\\iint",
      tint: "\\iiint",
      oint: "\\oint",
      alpha: "\\alpha",
      beta: "\\beta",
      gamma: "\\gamma",
      delta: "\\delta",
      epsilon: "\\epsilon",
      zeta: "\\zeta",
      eta: "\\eta",
      theta: "\\theta",
      iota: "\\iota",
      kappa: "\\kappa",
      lambda: "\\lambda",
      mu: "\\mu",
      nu: "\\nu",
      xi: "\\xi",
      omicron: "\\omicron",
      pi: "\\pi",
      rho: "\\rho",
      sigma: "\\sigma",
      tau: "\\tau",
      upsilon: "\\upsilon",
      phi: "\\phi",
      chi: "\\chi",
      psi: "\\psi",
      omega: "\\omega",
      ALPHA: "A",
      BETA: "B",
      GAMMA: "\\Gamma",
      DELTA: "\\Delta",
      EPSILON: "E",
      ZETA: "Z",
      ETA: "H",
      THETA: "\\Theta",
      IOTA: "I",
      KAPPA: "K",
      LAMBDA: "\\Lambda",
      MU: "M",
      NU: "N",
      XI: "\\Xi",
      OMICRON: "O",
      PI: "\\Pi",
      RHO: "P",
      SIGMA: "\\Sigma",
      TAU: "T",
      UPSILON: "\\Upsilon",
      PHI: "\\Phi",
      CHI: "X",
      PSI: "\\Psi",
      OMEGA: "\\Omega",
      "\u2308": "\\lceil",
      "\u2309": "\\rceil",
      "\u230A": "\\lfloor",
      "\u230B": "\\rfloor",
      "\u2225": "\\|",
      "\u2290": "\\sqsupset",
      "\u2292": "\\sqsupseteq",
      odint: "\\mathop \u222F",
      otint: "\\mathop \u2230",
      BIGSQCAP: "\\mathop \u2A05",
      ATT: "\\mathop \u203B",
      HUND: "\\mathop \u2030",
      THOU: "\\mathop \u2031",
      IDENTICAL: "\\mathop \u2237",
      RTANGLE: "\\mathop \u22BE",
      BASE: "\\mathop \u2302",
      BENZENE: "\\mathop \u232C"
    };
    MIDDLE_CONVERT_MAP = {
      matrix: "HULKMATRIX",
      pmatrix: "HULKPMATRIX",
      bmatrix: "HULKBMATRIX",
      dmatrix: "HULKDMATRIX",
      eqalign: "HULKEQALIGN",
      cases: "HULKCASE",
      vec: "HULKVEC",
      dyad: "HULKDYAD",
      acute: "HULKACUTE",
      grave: "HULKGRAVE",
      dot: "HULKDOT",
      ddot: "HULKDDOT",
      bar: "HULKBAR",
      hat: "HULKHAT",
      check: "HULKCHECK",
      arch: "HULKARCH",
      tilde: "HULKTILDE",
      BOX: "HULKBOX",
      OVERBRACE: "HULKOVERBRACE",
      UNDERBRACE: "HULKUNDERBRACE"
    };
    BAR_CONVERT_MAP = {
      HULKVEC: "\\overrightarrow",
      HULKDYAD: "\\overleftrightarrow",
      HULKACUTE: "\\acute",
      HULKGRAVE: "\\grave",
      HULKDOT: "\\dot",
      HULKDDOT: "\\ddot",
      HULKBAR: "\\overline",
      HULKHAT: "\\widehat",
      HULKCHECK: "\\check",
      HULKARCH: "\\overset{\\frown}",
      HULKTILDE: "\\widetilde",
      HULKBOX: "\\boxed"
    };
    MATRIX_CONVERT_MAP = {
      HULKMATRIX: { begin: "\\begin{matrix}", end: "\\end{matrix}", removeOutterBrackets: true },
      HULKPMATRIX: { begin: "\\begin{pmatrix}", end: "\\end{pmatrix}", removeOutterBrackets: true },
      HULKBMATRIX: { begin: "\\begin{bmatrix}", end: "\\end{bmatrix}", removeOutterBrackets: true },
      HULKDMATRIX: { begin: "\\begin{vmatrix}", end: "\\end{vmatrix}", removeOutterBrackets: true },
      HULKCASE: { begin: "\\begin{cases}", end: "\\end{cases}", removeOutterBrackets: true },
      HULKEQALIGN: { begin: "\\eqalign{", end: "}", removeOutterBrackets: false }
    };
    BRACE_CONVERT_MAP = {
      HULKOVERBRACE: "\\overbrace",
      HULKUNDERBRACE: "\\underbrace"
    };
  }
});

// src/hwpx/parser.ts
import JSZip2 from "jszip";
import { inflateRawSync } from "zlib";
import { DOMParser } from "@xmldom/xmldom";
function clampSpan(val, max) {
  return Math.max(1, Math.min(val, max));
}
function createXmlParser(warnings) {
  return new DOMParser({
    onError(level, msg) {
      if (level === "fatalError") throw new KordocError(`XML \uD30C\uC2F1 \uC2E4\uD328: ${msg}`);
      warnings?.push({ code: "MALFORMED_XML", message: `XML ${level === "warn" ? "\uACBD\uACE0" : "\uC624\uB958"}: ${msg}` });
    }
  });
}
async function extractHwpxStyles(zip, decompressed) {
  const result = {
    charProperties: /* @__PURE__ */ new Map(),
    styles: /* @__PURE__ */ new Map()
  };
  const headerPaths = ["Contents/header.xml", "header.xml", "Contents/head.xml", "head.xml"];
  for (const hp of headerPaths) {
    const hpLower = hp.toLowerCase();
    const file = zip.file(hp) || Object.values(zip.files).find((f) => f.name.toLowerCase() === hpLower) || null;
    if (!file) continue;
    try {
      const xml = await file.async("text");
      if (decompressed) {
        decompressed.total += xml.length * 2;
        if (decompressed.total > MAX_DECOMPRESS_SIZE) throw new KordocError("ZIP \uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC (ZIP bomb \uC758\uC2EC)");
      }
      const parser = createXmlParser();
      const doc = parser.parseFromString(stripDtd(xml), "text/xml");
      if (!doc.documentElement) continue;
      parseCharProperties(doc, result.charProperties);
      parseStyleElements(doc, result.styles);
      break;
    } catch {
      continue;
    }
  }
  return result;
}
function parseCharProperties(doc, map) {
  const tagNames = ["hh:charPr", "charPr", "hp:charPr"];
  for (const tagName of tagNames) {
    const elements = doc.getElementsByTagName(tagName);
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const id = el.getAttribute("id") || el.getAttribute("IDRef") || "";
      if (!id) continue;
      const prop = {};
      const height = el.getAttribute("height");
      if (height) {
        const parsedHeight = parseInt(height, 10);
        if (!isNaN(parsedHeight) && parsedHeight > 0) {
          prop.fontSize = parsedHeight / 100;
        }
      }
      const bold = el.getAttribute("bold");
      if (bold === "true" || bold === "1") prop.bold = true;
      const italic = el.getAttribute("italic");
      if (italic === "true" || italic === "1") prop.italic = true;
      const fontFaces = el.getElementsByTagName("*");
      for (let j = 0; j < fontFaces.length; j++) {
        const ff = fontFaces[j];
        const localTag = (ff.tagName || "").replace(/^[^:]+:/, "");
        if (localTag === "fontface" || localTag === "fontRef") {
          const face = ff.getAttribute("face") || ff.getAttribute("FontFace");
          if (face) {
            prop.fontName = face;
            break;
          }
        }
      }
      map.set(id, prop);
    }
  }
}
function parseStyleElements(doc, map) {
  const tagNames = ["hh:style", "style", "hp:style"];
  for (const tagName of tagNames) {
    const elements = doc.getElementsByTagName(tagName);
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const id = el.getAttribute("id") || el.getAttribute("IDRef") || String(i);
      const name = el.getAttribute("name") || el.getAttribute("engName") || "";
      const charPrId = el.getAttribute("charPrIDRef") || void 0;
      const paraPrId = el.getAttribute("paraPrIDRef") || void 0;
      map.set(id, { name, charPrId, paraPrId });
    }
  }
}
async function parseHwpxDocument(buffer, options) {
  precheckZipSize(buffer, MAX_DECOMPRESS_SIZE, MAX_ZIP_ENTRIES);
  let zip;
  try {
    zip = await JSZip2.loadAsync(buffer);
  } catch {
    return extractFromBrokenZip(buffer);
  }
  const actualEntryCount = Object.keys(zip.files).length;
  if (actualEntryCount > MAX_ZIP_ENTRIES) {
    throw new KordocError("ZIP \uC5D4\uD2B8\uB9AC \uC218 \uCD08\uACFC (ZIP bomb \uC758\uC2EC)");
  }
  const manifestFile = zip.file("META-INF/manifest.xml");
  if (manifestFile) {
    const manifestXml = await manifestFile.async("text");
    if (isEncryptedHwpx(manifestXml)) {
      if (isComFallbackAvailable() && options?.filePath) {
        const { pages, pageCount, warnings: warnings2 } = extractTextViaCom(options.filePath);
        if (pages.some((p) => p && p.trim().length > 0)) {
          return comResultToParseResult(pages, pageCount, warnings2);
        }
      }
      throw new KordocError("DRM \uC554\uD638\uD654\uB41C HWPX \uD30C\uC77C\uC785\uB2C8\uB2E4. Windows + \uD55C\uCEF4 \uC624\uD53C\uC2A4 \uC124\uCE58 \uC2DC \uC790\uB3D9 \uCD94\uCD9C\uB429\uB2C8\uB2E4.");
    }
  }
  const decompressed = { total: 0 };
  const metadata = {};
  await extractHwpxMetadata(zip, metadata, decompressed);
  const styleMap = await extractHwpxStyles(zip, decompressed);
  const warnings = [];
  const sectionPaths = await resolveSectionPaths(zip);
  if (sectionPaths.length === 0) throw new KordocError("HWPX\uC5D0\uC11C \uC139\uC158 \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
  metadata.pageCount = sectionPaths.length;
  const pageFilter = options?.pages ? parsePageRange(options.pages, sectionPaths.length) : null;
  const totalTarget = pageFilter ? pageFilter.size : sectionPaths.length;
  const blocks = [];
  const nestedTableCounter = { count: 0 };
  let parsedSections = 0;
  for (let si = 0; si < sectionPaths.length; si++) {
    if (pageFilter && !pageFilter.has(si + 1)) continue;
    const file = zip.file(sectionPaths[si]);
    if (!file) continue;
    try {
      const xml = await file.async("text");
      decompressed.total += xml.length * 2;
      if (decompressed.total > MAX_DECOMPRESS_SIZE) throw new KordocError("ZIP \uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC (ZIP bomb \uC758\uC2EC)");
      blocks.push(...parseSectionXml(xml, styleMap, warnings, si + 1, nestedTableCounter));
      parsedSections++;
      options?.onProgress?.(parsedSections, totalTarget);
    } catch (secErr) {
      if (secErr instanceof KordocError) throw secErr;
      warnings.push({ page: si + 1, message: `\uC139\uC158 ${si + 1} \uD30C\uC2F1 \uC2E4\uD328: ${secErr instanceof Error ? secErr.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958"}`, code: "PARTIAL_PARSE" });
    }
  }
  const images = await extractImagesFromZip(zip, blocks, decompressed, warnings);
  detectHwpxHeadings(blocks, styleMap);
  const outline = blocks.filter((b) => b.type === "heading" && b.level && b.text).map((b) => ({ level: b.level, text: b.text, pageNumber: b.pageNumber }));
  const markdown = blocksToMarkdown(blocks);
  return { markdown, blocks, metadata, outline: outline.length > 0 ? outline : void 0, warnings: warnings.length > 0 ? warnings : void 0, images: images.length > 0 ? images : void 0 };
}
function imageExtToMime(ext) {
  switch (ext.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "wmf":
      return "image/wmf";
    case "emf":
      return "image/emf";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
function mimeToExt(mime) {
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("bmp")) return "bmp";
  if (mime.includes("tiff")) return "tif";
  if (mime.includes("wmf")) return "wmf";
  if (mime.includes("emf")) return "emf";
  if (mime.includes("svg")) return "svg";
  return "bin";
}
async function extractImagesFromZip(zip, blocks, decompressed, warnings) {
  const images = [];
  let imageIndex = 0;
  for (const block of blocks) {
    if (block.type !== "image" || !block.text) continue;
    const ref = block.text;
    const candidates = [
      `BinData/${ref}`,
      `Contents/BinData/${ref}`,
      ref
      // 절대 경로일 수도 있음
    ];
    let resolvedPath = null;
    if (!ref.includes(".")) {
      const prefixes = [`BinData/${ref}`, `Contents/BinData/${ref}`];
      for (const prefix of prefixes) {
        const match = zip.file(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.[a-zA-Z0-9]+$`));
        if (match.length > 0) {
          resolvedPath = match[0].name;
          break;
        }
      }
    }
    let found = false;
    const allCandidates = resolvedPath ? [resolvedPath, ...candidates] : candidates;
    for (const path of allCandidates) {
      if (isPathTraversal(path)) continue;
      const file = zip.file(path);
      if (!file) continue;
      try {
        const data = await file.async("uint8array");
        decompressed.total += data.length;
        if (decompressed.total > MAX_DECOMPRESS_SIZE) throw new KordocError("ZIP \uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC (ZIP bomb \uC758\uC2EC)");
        const actualPath = path;
        const ext = actualPath.includes(".") ? actualPath.split(".").pop() || "png" : "png";
        const mimeType = imageExtToMime(ext);
        imageIndex++;
        const filename = `image_${String(imageIndex).padStart(3, "0")}.${mimeToExt(mimeType)}`;
        images.push({ filename, data, mimeType });
        block.text = filename;
        block.imageData = { data, mimeType, filename: ref };
        found = true;
        break;
      } catch (err) {
        if (err instanceof KordocError) throw err;
      }
    }
    if (!found) {
      warnings?.push({ page: block.pageNumber, message: `\uC774\uBBF8\uC9C0 \uD30C\uC77C \uC5C6\uC74C: ${ref}`, code: "SKIPPED_IMAGE" });
      block.type = "paragraph";
      block.text = `[\uC774\uBBF8\uC9C0: ${ref}]`;
    }
  }
  return images;
}
async function extractHwpxMetadata(zip, metadata, decompressed) {
  try {
    const metaPaths = ["meta.xml", "META-INF/meta.xml", "docProps/core.xml"];
    for (const mp of metaPaths) {
      const file = zip.file(mp) || Object.values(zip.files).find((f) => f.name.toLowerCase() === mp.toLowerCase()) || null;
      if (!file) continue;
      const xml = await file.async("text");
      if (decompressed) {
        decompressed.total += xml.length * 2;
        if (decompressed.total > MAX_DECOMPRESS_SIZE) throw new KordocError("ZIP \uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC (ZIP bomb \uC758\uC2EC)");
      }
      parseDublinCoreMetadata(xml, metadata);
      if (metadata.title || metadata.author) return;
    }
  } catch {
  }
}
function parseDublinCoreMetadata(xml, metadata) {
  const parser = createXmlParser();
  const doc = parser.parseFromString(stripDtd(xml), "text/xml");
  if (!doc.documentElement) return;
  const getText = (tagNames) => {
    for (const tag of tagNames) {
      const els = doc.getElementsByTagName(tag);
      if (els.length > 0) {
        const text = els[0].textContent?.trim();
        if (text) return text;
      }
    }
    return void 0;
  };
  metadata.title = metadata.title || getText(["dc:title", "title"]);
  metadata.author = metadata.author || getText(["dc:creator", "creator", "cp:lastModifiedBy"]);
  metadata.description = metadata.description || getText(["dc:description", "description", "dc:subject", "subject"]);
  metadata.createdAt = metadata.createdAt || getText(["dcterms:created", "meta:creation-date"]);
  metadata.modifiedAt = metadata.modifiedAt || getText(["dcterms:modified", "meta:date"]);
  const keywords = getText(["dc:keyword", "cp:keywords", "meta:keyword"]);
  if (keywords && !metadata.keywords) {
    metadata.keywords = keywords.split(/[,;]/).map((k) => k.trim()).filter(Boolean);
  }
}
async function extractHwpxMetadataOnly(buffer) {
  let zip;
  try {
    zip = await JSZip2.loadAsync(buffer);
  } catch {
    throw new KordocError("HWPX ZIP\uC744 \uC5F4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
  }
  const metadata = {};
  await extractHwpxMetadata(zip, metadata);
  const sectionPaths = await resolveSectionPaths(zip);
  metadata.pageCount = sectionPaths.length;
  return metadata;
}
function extractFromBrokenZip(buffer) {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let pos = 0;
  const blocks = [];
  const warnings = [
    { code: "BROKEN_ZIP_RECOVERY", message: "\uC190\uC0C1\uB41C ZIP \uAD6C\uC870 \u2014 Local File Header \uAE30\uBC18 \uBCF5\uAD6C \uBAA8\uB4DC" }
  ];
  let totalDecompressed = 0;
  let entryCount = 0;
  let sectionNum = 0;
  const nestedTableCounter = { count: 0 };
  while (pos < data.length - 30) {
    if (data[pos] !== 80 || data[pos + 1] !== 75 || data[pos + 2] !== 3 || data[pos + 3] !== 4) {
      pos++;
      while (pos < data.length - 30) {
        if (data[pos] === 80 && data[pos + 1] === 75 && data[pos + 2] === 3 && data[pos + 3] === 4) break;
        pos++;
      }
      continue;
    }
    if (++entryCount > MAX_ZIP_ENTRIES) break;
    const method = view.getUint16(pos + 8, true);
    const compSize = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    if (nameLen > 1024 || extraLen > 65535) {
      pos += 30 + nameLen + extraLen;
      continue;
    }
    const fileStart = pos + 30 + nameLen + extraLen;
    if (fileStart + compSize > data.length) break;
    if (compSize === 0 && method !== 0) {
      pos = fileStart;
      continue;
    }
    const nameBytes = data.slice(pos + 30, pos + 30 + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    if (isPathTraversal(name)) {
      pos = fileStart + compSize;
      continue;
    }
    const fileData = data.slice(fileStart, fileStart + compSize);
    pos = fileStart + compSize;
    if (!name.toLowerCase().includes("section") || !name.endsWith(".xml")) continue;
    try {
      let content;
      if (method === 0) {
        content = new TextDecoder().decode(fileData);
      } else if (method === 8) {
        const decompressed = inflateRawSync(Buffer.from(fileData), { maxOutputLength: MAX_DECOMPRESS_SIZE });
        content = new TextDecoder().decode(decompressed);
      } else {
        continue;
      }
      totalDecompressed += content.length * 2;
      if (totalDecompressed > MAX_DECOMPRESS_SIZE) throw new KordocError("\uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC");
      sectionNum++;
      blocks.push(...parseSectionXml(content, void 0, warnings, sectionNum, nestedTableCounter));
    } catch {
      continue;
    }
  }
  if (blocks.length === 0) throw new KordocError("\uC190\uC0C1\uB41C HWPX\uC5D0\uC11C \uC139\uC158 \uB370\uC774\uD130\uB97C \uBCF5\uAD6C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
  const markdown = blocksToMarkdown(blocks);
  return { markdown, blocks, warnings: warnings.length > 0 ? warnings : void 0 };
}
async function resolveSectionPaths(zip) {
  const manifestPaths = ["Contents/content.hpf", "content.hpf"];
  for (const mp of manifestPaths) {
    const mpLower = mp.toLowerCase();
    const file = zip.file(mp) || Object.values(zip.files).find((f) => f.name.toLowerCase() === mpLower) || null;
    if (!file) continue;
    const xml = await file.async("text");
    const paths = parseSectionPathsFromManifest(xml);
    if (paths.length > 0) return paths;
  }
  const sectionFiles = zip.file(/[Ss]ection\d+\.xml$/);
  return sectionFiles.map((f) => f.name).sort();
}
function parseSectionPathsFromManifest(xml) {
  const parser = createXmlParser();
  const doc = parser.parseFromString(stripDtd(xml), "text/xml");
  const items = doc.getElementsByTagName("opf:item");
  const spine = doc.getElementsByTagName("opf:itemref");
  const isSectionId = (id) => /^s/i.test(id) || id.toLowerCase().includes("section");
  const idToHref = /* @__PURE__ */ new Map();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id = item.getAttribute("id") || "";
    let href = item.getAttribute("href") || "";
    const mediaType = item.getAttribute("media-type") || "";
    if (!isSectionId(id) && !mediaType.includes("xml")) continue;
    if (!href.startsWith("/") && !href.startsWith("Contents/") && isSectionId(id))
      href = "Contents/" + href;
    idToHref.set(id, href);
  }
  if (spine.length > 0) {
    const ordered = [];
    for (let i = 0; i < spine.length; i++) {
      const href = idToHref.get(spine[i].getAttribute("idref") || "");
      if (href) ordered.push(href);
    }
    if (ordered.length > 0) return ordered;
  }
  return Array.from(idToHref.entries()).filter(([id]) => isSectionId(id)).sort((a, b) => a[0].localeCompare(b[0])).map(([, href]) => href);
}
function detectHwpxHeadings(blocks, styleMap) {
  let baseFontSize = 0;
  const sizeFreq = /* @__PURE__ */ new Map();
  for (const b of blocks) {
    if (b.style?.fontSize) {
      sizeFreq.set(b.style.fontSize, (sizeFreq.get(b.style.fontSize) || 0) + 1);
    }
  }
  let maxCount = 0;
  for (const [size, count] of sizeFreq) {
    if (count > maxCount) {
      maxCount = count;
      baseFontSize = size;
    }
  }
  for (const block of blocks) {
    if (block.type !== "paragraph" || !block.text) continue;
    const text = block.text.trim();
    if (text.length === 0 || text.length > 200 || /^\d+$/.test(text)) continue;
    let level = 0;
    if (baseFontSize > 0 && block.style?.fontSize) {
      const ratio = block.style.fontSize / baseFontSize;
      if (ratio >= HEADING_RATIO_H1) level = 1;
      else if (ratio >= HEADING_RATIO_H2) level = 2;
      else if (ratio >= HEADING_RATIO_H3) level = 3;
    }
    const compactText = text.replace(/\s+/g, "");
    if (/^제\d+[조장절편]/.test(compactText) && text.length <= 50) {
      if (level === 0) level = 3;
    }
    if (level > 0) {
      block.type = "heading";
      block.level = level;
    }
  }
}
function makeNestedTableMarker(counter, rows) {
  counter.count++;
  const firstRow = rows[0] ?? [];
  const hint = firstRow.map((c2) => c2.text.trim().replace(/\n/g, " ")).filter(Boolean).join(" | ");
  const hintChars = [...hint];
  const truncated = hintChars.length > 60 ? hintChars.slice(0, 60).join("") + "\u2026" : hint;
  return truncated ? `[\uC911\uCCA9 \uD14C\uC774\uBE14 #${counter.count}: ${truncated}]` : `[\uC911\uCCA9 \uD14C\uC774\uBE14 #${counter.count}]`;
}
function handleNestedTable(newTable, tableStack, blocks, ctx) {
  const parentTable = tableStack.pop();
  let nestedCols = 0;
  for (const r of newTable.rows) if (r.length > nestedCols) nestedCols = r.length;
  if (newTable.rows.length >= 3 && nestedCols >= 2) {
    blocks.push({ type: "table", table: buildTable(newTable.rows), pageNumber: ctx.sectionNum });
    if (parentTable.cell) {
      const marker = ctx.counter ? makeNestedTableMarker(ctx.counter, newTable.rows) : "[\uC911\uCCA9 \uD14C\uC774\uBE14]";
      parentTable.cell.text += (parentTable.cell.text ? "\n" : "") + marker;
    }
  } else {
    const nestedText = convertTableToText(newTable.rows);
    if (parentTable.cell) {
      const marker = ctx.counter ? makeNestedTableMarker(ctx.counter, newTable.rows) : "[\uC911\uCCA9 \uD14C\uC774\uBE14]";
      parentTable.cell.text += (parentTable.cell.text ? "\n" : "") + marker + "\n" + nestedText;
    }
  }
  return parentTable;
}
function parseSectionXml(xml, styleMap, warnings, sectionNum, counter) {
  const parser = createXmlParser(warnings);
  const doc = parser.parseFromString(stripDtd(xml), "text/xml");
  if (!doc.documentElement) return [];
  const blocks = [];
  const ctx = { styleMap, warnings, sectionNum, counter };
  walkSection(doc.documentElement, blocks, null, [], ctx);
  return blocks;
}
function extractImageRef(el) {
  const children = el.childNodes;
  if (!children) return null;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== 1) continue;
    const tag = (child.tagName || child.localName || "").replace(/^[^:]+:/, "");
    if (tag === "imgRect" || tag === "img" || tag === "imgClip") {
      const ref = child.getAttribute("binaryItemIDRef") || child.getAttribute("href") || "";
      if (ref) return ref;
    }
    const nested = extractImageRef(child);
    if (nested) return nested;
  }
  const directRef = el.getAttribute("binaryItemIDRef") || "";
  if (directRef) return directRef;
  return null;
}
function walkSection(node, blocks, tableCtx, tableStack, ctx, depth = 0) {
  if (depth > MAX_XML_DEPTH) return;
  const children = node.childNodes;
  if (!children) return;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType !== 1) continue;
    const tag = el.tagName || el.localName || "";
    const localTag = tag.replace(/^[^:]+:/, "");
    switch (localTag) {
      case "tbl": {
        if (tableCtx) tableStack.push(tableCtx);
        const newTable = { rows: [], currentRow: [], cell: null };
        walkSection(el, blocks, newTable, tableStack, ctx, depth + 1);
        if (newTable.rows.length > 0) {
          if (tableStack.length > 0) {
            tableCtx = handleNestedTable(newTable, tableStack, blocks, ctx);
          } else {
            blocks.push({ type: "table", table: buildTable(newTable.rows), pageNumber: ctx.sectionNum });
            tableCtx = null;
          }
        } else {
          tableCtx = tableStack.length > 0 ? tableStack.pop() : null;
        }
        break;
      }
      case "tr":
        if (tableCtx) {
          tableCtx.currentRow = [];
          walkSection(el, blocks, tableCtx, tableStack, ctx, depth + 1);
          if (tableCtx.currentRow.length > 0) tableCtx.rows.push(tableCtx.currentRow);
          tableCtx.currentRow = [];
        }
        break;
      case "tc":
        if (tableCtx) {
          tableCtx.cell = { text: "", colSpan: 1, rowSpan: 1 };
          walkSection(el, blocks, tableCtx, tableStack, ctx, depth + 1);
          if (tableCtx.cell) {
            tableCtx.currentRow.push(tableCtx.cell);
            tableCtx.cell = null;
          }
        }
        break;
      case "cellAddr":
        if (tableCtx?.cell) {
          const ca = parseInt(el.getAttribute("colAddr") || "", 10);
          const ra = parseInt(el.getAttribute("rowAddr") || "", 10);
          if (!isNaN(ca)) tableCtx.cell.colAddr = ca;
          if (!isNaN(ra)) tableCtx.cell.rowAddr = ra;
        }
        break;
      case "cellSpan":
        if (tableCtx?.cell) {
          const rawCs = parseInt(el.getAttribute("colSpan") || "1", 10);
          const cs = isNaN(rawCs) ? 1 : rawCs;
          const rawRs = parseInt(el.getAttribute("rowSpan") || "1", 10);
          const rs = isNaN(rawRs) ? 1 : rawRs;
          tableCtx.cell.colSpan = clampSpan(cs, MAX_COLS);
          tableCtx.cell.rowSpan = clampSpan(rs, MAX_ROWS);
        }
        break;
      case "p": {
        const { text, href, footnote, style } = extractParagraphInfo(el, ctx.styleMap);
        if (text) {
          if (tableCtx?.cell) {
            tableCtx.cell.text += (tableCtx.cell.text ? "\n" : "") + text;
          } else if (!tableCtx) {
            const block = { type: "paragraph", text, pageNumber: ctx.sectionNum };
            if (style) block.style = style;
            if (href) block.href = href;
            if (footnote) block.footnoteText = footnote;
            blocks.push(block);
          }
        }
        tableCtx = walkParagraphChildren(el, blocks, tableCtx, tableStack, ctx, depth + 1);
        break;
      }
      // 이미지/그림 — 경로 추출 또는 경고
      case "pic":
      case "shape":
      case "drawingObject": {
        const imgRef = extractImageRef(el);
        if (imgRef) {
          blocks.push({ type: "image", text: imgRef, pageNumber: ctx.sectionNum });
        } else if (ctx.warnings && ctx.sectionNum) {
          ctx.warnings.push({ page: ctx.sectionNum, message: `\uC2A4\uD0B5\uB41C \uC694\uC18C: ${localTag}`, code: "SKIPPED_IMAGE" });
        }
        break;
      }
      default:
        walkSection(el, blocks, tableCtx, tableStack, ctx, depth + 1);
        break;
    }
  }
}
function walkParagraphChildren(node, blocks, tableCtx, tableStack, ctx, depth = 0) {
  if (depth > MAX_XML_DEPTH) return tableCtx;
  const children = node.childNodes;
  if (!children) return tableCtx;
  const walkChildren = (parent, d) => {
    if (d > MAX_XML_DEPTH) return;
    const kids2 = parent.childNodes;
    if (!kids2) return;
    for (let i = 0; i < kids2.length; i++) {
      const el = kids2[i];
      if (el.nodeType !== 1) continue;
      const tag = el.tagName || el.localName || "";
      const localTag = tag.replace(/^[^:]+:/, "");
      if (localTag === "tbl") {
        if (tableCtx) tableStack.push(tableCtx);
        const newTable = { rows: [], currentRow: [], cell: null };
        walkSection(el, blocks, newTable, tableStack, ctx, d + 1);
        if (newTable.rows.length > 0) {
          if (tableStack.length > 0) {
            tableCtx = handleNestedTable(newTable, tableStack, blocks, ctx);
          } else {
            blocks.push({ type: "table", table: buildTable(newTable.rows), pageNumber: ctx.sectionNum });
            tableCtx = null;
          }
        } else {
          tableCtx = tableStack.length > 0 ? tableStack.pop() : null;
        }
      } else if (localTag === "pic" || localTag === "shape" || localTag === "drawingObject") {
        const drawTextChild = findDescendant(el, "drawText");
        if (drawTextChild) {
          extractDrawTextBlocks(drawTextChild, blocks, ctx.styleMap, ctx.sectionNum);
        } else {
          const imgRef = extractImageRef(el);
          if (imgRef) {
            blocks.push({ type: "image", text: imgRef, pageNumber: ctx.sectionNum });
          } else if (ctx.warnings && ctx.sectionNum) {
            ctx.warnings.push({ page: ctx.sectionNum, message: `\uC2A4\uD0B5\uB41C \uC694\uC18C: ${localTag}`, code: "SKIPPED_IMAGE" });
          }
        }
      } else if (localTag === "drawText") {
        extractDrawTextBlocks(el, blocks, ctx.styleMap, ctx.sectionNum);
      } else if (localTag === "r" || localTag === "run" || localTag === "ctrl" || localTag === "rect" || localTag === "ellipse" || localTag === "polygon" || localTag === "line" || localTag === "arc" || localTag === "curve" || localTag === "connectLine" || localTag === "container") {
        walkChildren(el, d + 1);
      } else if (localTag === "run") {
        tableCtx = walkParagraphChildren(el, blocks, tableCtx, tableStack, ctx, depth + 1);
      }
    }
  };
  walkChildren(node, depth);
  return tableCtx;
}
function findDescendant(node, targetTag, depth = 0) {
  if (depth > 5) return null;
  const children = node.childNodes;
  if (!children) return null;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== 1) continue;
    const tag = (child.tagName || child.localName || "").replace(/^[^:]+:/, "");
    if (tag === targetTag) return child;
    const found = findDescendant(child, targetTag, depth + 1);
    if (found) return found;
  }
  return null;
}
function extractDrawTextBlocks(drawTextNode, blocks, styleMap, sectionNum) {
  const children = drawTextNode.childNodes;
  if (!children) return;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== 1) continue;
    const tag = (child.tagName || child.localName || "").replace(/^[^:]+:/, "");
    if (tag === "subList" || tag === "p" || tag === "para") {
      if (tag === "subList") {
        extractDrawTextBlocks(child, blocks, styleMap, sectionNum);
      } else {
        const info = extractParagraphInfo(child, styleMap);
        const text = info.text.trim();
        if (text) {
          blocks.push({ type: "paragraph", text, style: info.style ?? void 0, pageNumber: sectionNum });
        }
      }
    }
  }
}
function extractParagraphInfo(para, styleMap) {
  let text = "";
  let href;
  let footnote;
  let charPrId;
  const walk = (node) => {
    const children = node.childNodes;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 3) {
        text += child.textContent || "";
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = (child.tagName || child.localName || "").replace(/^[^:]+:/, "");
      switch (tag) {
        case "t":
          walk(child);
          break;
        // 자식 순회 (tab 등 하위 요소 처리)
        case "tab": {
          const leader = child.getAttribute("leader");
          if (leader && leader !== "0") {
            text += "";
          } else {
            text += "	";
          }
          break;
        }
        case "br":
          if ((child.getAttribute("type") || "line") === "line") text += "\n";
          break;
        case "fwSpace":
        case "hwSpace":
          text += " ";
          break;
        case "tbl":
          break;
        // 테이블은 walkSection에서 처리
        // 하이퍼링크
        case "hyperlink": {
          const url = child.getAttribute("url") || child.getAttribute("href") || "";
          if (url) {
            const safe = sanitizeHref(url);
            if (safe) href = safe;
          }
          walk(child);
          break;
        }
        // 각주/미주
        case "footNote":
        case "endNote":
        case "fn":
        case "en": {
          const noteText = extractTextFromNode(child);
          if (noteText) footnote = (footnote ? footnote + "; " : "") + noteText;
          break;
        }
        // 제어 요소 — 필드, 컨트롤, 매개변수 등 스킵
        case "ctrl":
        case "fieldBegin":
        case "fieldEnd":
        case "parameters":
        case "stringParam":
        case "integerParam":
        case "boolParam":
        case "floatParam":
        case "secPr":
        // 섹션 속성 (페이지 설정 등)
        case "colPr":
        // 다단 속성
        case "linesegarray":
        case "lineseg":
        // 레이아웃 정보
        // 도형/이미지 요소 — 대체텍스트("사각형입니다." 등) 누출 방지
        case "pic":
        case "shape":
        case "drawingObject":
        case "shapeComment":
        case "drawText":
          break;
        // 수식: <hp:equation> 내부의 <hp:script> 에 HULK-style equation
        // 스크립트가 담겨 있음. hml-equation-parser 로 LaTeX 변환 후 `$...$`
        // 로 래핑. 실패/빈 스크립트면 무시 (대체 텍스트 누출 방지).
        case "equation": {
          const script = findChildByLocalName(child, "script");
          const raw = script ? extractTextFromNode(script) : "";
          if (raw.trim()) {
            try {
              const latex = hmlToLatex(raw).trim();
              if (latex) text += " $" + latex + "$ ";
            } catch {
            }
          }
          break;
        }
        // run 요소에서 charPrIDRef 추출
        case "r": {
          const runCharPr = child.getAttribute("charPrIDRef");
          if (runCharPr && !charPrId) charPrId = runCharPr;
          walk(child);
          break;
        }
        default:
          walk(child);
          break;
      }
    }
  };
  walk(para);
  const leaderIdx = text.indexOf("");
  if (leaderIdx >= 0) text = text.substring(0, leaderIdx);
  let cleanText = text.replace(/[ \t]+/g, " ").trim();
  if (/^그림입니다\.?\s*원본\s*그림의\s*(이름|크기)/.test(cleanText)) cleanText = "";
  cleanText = cleanText.replace(/그림입니다\.?\s*원본\s*그림의\s*(이름|크기)[^\n]*(\n[^\n]*원본\s*그림의\s*(이름|크기)[^\n]*)*/g, "").trim();
  cleanText = cleanText.replace(/(?:모서리가 둥근 |둥근 )?(?:사각형|직사각형|정사각형|원|타원|삼각형|선|직선|곡선|화살표|오각형|육각형|팔각형|별|십자|구름|마름모|도넛|평행사변형|사다리꼴|개체|그리기\s?개체|묶음\s?개체|글상자|표|그림|OLE\s?개체)\s?입니다\.?/g, "").trim();
  let style;
  if (styleMap && charPrId) {
    const charProp = styleMap.charProperties.get(charPrId);
    if (charProp) {
      style = {};
      if (charProp.fontSize) style.fontSize = charProp.fontSize;
      if (charProp.bold) style.bold = true;
      if (charProp.italic) style.italic = true;
      if (charProp.fontName) style.fontName = charProp.fontName;
      if (!style.fontSize && !style.bold && !style.italic) style = void 0;
    }
  }
  return { text: cleanText, href, footnote, style };
}
function findChildByLocalName(parent, name) {
  const children = parent.childNodes;
  if (!children) return null;
  for (let i = 0; i < children.length; i++) {
    const ch = children[i];
    if (ch.nodeType !== 1) continue;
    const tag = (ch.tagName || ch.localName || "").replace(/^[^:]+:/, "");
    if (tag === name) return ch;
  }
  return null;
}
function extractTextFromNode(node) {
  let result = "";
  const children = node.childNodes;
  if (!children) return result;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === 3) result += child.textContent || "";
    else if (child.nodeType === 1) result += extractTextFromNode(child);
  }
  return result.trim();
}
var MAX_DECOMPRESS_SIZE, MAX_ZIP_ENTRIES, MAX_XML_DEPTH;
var init_parser = __esm({
  "src/hwpx/parser.ts"() {
    "use strict";
    init_builder();
    init_types();
    init_utils();
    init_utils();
    init_page_range();
    init_com_fallback();
    init_equation();
    MAX_DECOMPRESS_SIZE = 100 * 1024 * 1024;
    MAX_ZIP_ENTRIES = 500;
    MAX_XML_DEPTH = 200;
  }
});

// src/hwp5/record.ts
import { inflateRawSync as inflateRawSync2, inflateSync } from "zlib";
function readRecords(data) {
  const records = [];
  let offset = 0;
  while (offset + 4 <= data.length && records.length < MAX_RECORDS) {
    const header = data.readUInt32LE(offset);
    offset += 4;
    const tagId = header & 1023;
    const level = header >> 10 & 1023;
    let size = header >> 20 & 4095;
    if (size === 4095) {
      if (offset + 4 > data.length) break;
      size = data.readUInt32LE(offset);
      offset += 4;
    }
    if (offset + size > data.length) break;
    records.push({ tagId, level, size, data: data.subarray(offset, offset + size) });
    offset += size;
  }
  return records;
}
function decompressStream(data) {
  const opts = { maxOutputLength: MAX_DECOMPRESS_SIZE2 };
  if (data.length >= 2 && data[0] === 120) {
    try {
      return inflateSync(data, opts);
    } catch {
    }
  }
  return inflateRawSync2(data, opts);
}
function parseFileHeader(data) {
  if (data.length < 40) throw new KordocError("FileHeader\uAC00 \uB108\uBB34 \uC9E7\uC2B5\uB2C8\uB2E4 (\uCD5C\uC18C 40\uBC14\uC774\uD2B8)");
  const sig = data.subarray(0, 32).toString("utf8").replace(/\0+$/, "");
  return {
    signature: sig,
    versionMajor: data[35],
    flags: data.readUInt32LE(36)
  };
}
function parseDocInfo(records) {
  const charShapes = [];
  const paraShapes = [];
  const styles = [];
  for (const rec of records) {
    if (rec.tagId === TAG_DOC_PARA_SHAPE && rec.data.length >= 4) {
      const flags = rec.data.readUInt32LE(0);
      const outlineLevel = flags >> 25 & 7;
      paraShapes.push({ outlineLevel });
    }
    if (rec.tagId === TAG_DOC_CHAR_SHAPE && rec.data.length >= 18) {
      if (rec.data.length >= 50) {
        const fontSize = rec.data.readUInt32LE(42);
        const attrFlags = rec.data.readUInt32LE(46);
        charShapes.push({ fontSize, attrFlags });
      } else {
        charShapes.push({ fontSize: 0, attrFlags: 0 });
      }
    }
    if (rec.tagId === TAG_DOC_STYLE && rec.data.length >= 8) {
      try {
        let offset = 0;
        const nameLen = rec.data.readUInt16LE(offset);
        offset += 2;
        const nameBytes = nameLen * 2;
        const name = nameBytes > 0 && offset + nameBytes <= rec.data.length ? rec.data.subarray(offset, offset + nameBytes).toString("utf16le") : "";
        offset += nameBytes;
        let nameKo = "";
        if (offset + 2 <= rec.data.length) {
          const nameKoLen = rec.data.readUInt16LE(offset);
          offset += 2;
          const nameKoBytes = nameKoLen * 2;
          if (nameKoBytes > 0 && offset + nameKoBytes <= rec.data.length) {
            nameKo = rec.data.subarray(offset, offset + nameKoBytes).toString("utf16le");
          }
          offset += nameKoBytes;
        }
        const type = offset < rec.data.length ? rec.data.readUInt8(offset) : 0;
        offset += 1;
        offset += 2;
        offset += 2;
        const paraShapeId = offset + 2 <= rec.data.length ? rec.data.readUInt16LE(offset) : 0;
        offset += 2;
        const charShapeId = offset + 2 <= rec.data.length ? rec.data.readUInt16LE(offset) : 0;
        styles.push({ name, nameKo, charShapeId, paraShapeId, type });
      } catch {
      }
    }
  }
  return { charShapes, paraShapes, styles };
}
function extractTextWithControls(data, resolveControl) {
  let result = "";
  let i = 0;
  while (i + 1 < data.length) {
    const ch = data.readUInt16LE(i);
    i += 2;
    switch (ch) {
      // ── char 타입 (2바이트만, 확장 데이터 없음) ──
      case CHAR_LINE:
        result += "\n";
        break;
      case CHAR_SECTION_BREAK: {
        if (i + 16 <= data.length && data.readUInt16LE(i) === 11) {
          const ctrlId = data.subarray(i + 2, i + 6).toString("ascii");
          const replacement = resolveControl?.(ctrlId);
          if (replacement) result += replacement;
          i += 16;
          break;
        }
        result += "\n";
        if (i + 14 <= data.length) i += 14;
        break;
      }
      case CHAR_PARA:
        break;
      // 문단 끝
      case CHAR_HYPHEN:
        result += "-";
        break;
      case CHAR_NBSP:
        result += " ";
        break;
      case CHAR_FIXED_NBSP:
        result += "\xA0";
        break;
      // 진짜 NBSP
      case CHAR_FIXED_WIDTH:
        result += " ";
        break;
      // 고정폭 공백
      // ── inline 타입 (2바이트 + 14바이트 확장) ──
      case CHAR_TAB:
        result += "	";
        if (i + 14 <= data.length) i += 14;
        break;
      default:
        if (ch >= 1 && ch <= 31) {
          const isExtended = ch >= 1 && ch <= 3 || ch >= 11 && ch <= 12 || ch >= 14 && ch <= 18 || ch >= 21 && ch <= 23;
          const isInline = ch >= 4 && ch <= 9 || ch >= 19 && ch <= 20;
          if ((isExtended || isInline) && i + 14 <= data.length) {
            const ctrlId = data.subarray(i, i + 4).toString("ascii");
            const replacement = resolveControl?.(ctrlId);
            if (replacement) result += replacement;
            i += 14;
          }
        } else if (ch >= 32) {
          if (ch >= 55296 && ch <= 56319 && i + 1 < data.length) {
            const lo = data.readUInt16LE(i);
            if (lo >= 56320 && lo <= 57343) {
              i += 2;
              const codePoint = (ch - 55296 << 10) + (lo - 56320) + 65536;
              result += String.fromCodePoint(codePoint);
              break;
            }
          }
          result += String.fromCharCode(ch);
        }
        break;
    }
  }
  return result;
}
function extractEquationText(data) {
  if (data.length < 6) return null;
  const scriptLength = data.readUInt16LE(4);
  const scriptStart = 6;
  const scriptEnd = scriptStart + scriptLength * 2;
  if (scriptLength <= 0 || scriptEnd > data.length) return null;
  const equation = data.subarray(scriptStart, scriptEnd).toString("utf16le").replace(/\0+/g, "").trim();
  return equation || null;
}
var TAG_PARA_HEADER, TAG_PARA_TEXT, TAG_CHAR_SHAPE, TAG_CTRL_HEADER, TAG_LIST_HEADER, TAG_TABLE, TAG_EQEDIT, TAG_DOC_CHAR_SHAPE, TAG_DOC_PARA_SHAPE, TAG_DOC_STYLE, CHAR_LINE, CHAR_SECTION_BREAK, CHAR_PARA, CHAR_TAB, CHAR_HYPHEN, CHAR_NBSP, CHAR_FIXED_NBSP, CHAR_FIXED_WIDTH, FLAG_COMPRESSED, FLAG_ENCRYPTED, FLAG_DISTRIBUTION, FLAG_DRM, MAX_RECORDS, MAX_DECOMPRESS_SIZE2;
var init_record = __esm({
  "src/hwp5/record.ts"() {
    "use strict";
    init_utils();
    TAG_PARA_HEADER = 66;
    TAG_PARA_TEXT = 67;
    TAG_CHAR_SHAPE = 68;
    TAG_CTRL_HEADER = 71;
    TAG_LIST_HEADER = 72;
    TAG_TABLE = 77;
    TAG_EQEDIT = 88;
    TAG_DOC_CHAR_SHAPE = 21;
    TAG_DOC_PARA_SHAPE = 25;
    TAG_DOC_STYLE = 26;
    CHAR_LINE = 0;
    CHAR_SECTION_BREAK = 10;
    CHAR_PARA = 13;
    CHAR_TAB = 9;
    CHAR_HYPHEN = 30;
    CHAR_NBSP = 31;
    CHAR_FIXED_NBSP = 24;
    CHAR_FIXED_WIDTH = 25;
    FLAG_COMPRESSED = 1 << 0;
    FLAG_ENCRYPTED = 1 << 1;
    FLAG_DISTRIBUTION = 1 << 2;
    FLAG_DRM = 1 << 4;
    MAX_RECORDS = 5e5;
    MAX_DECOMPRESS_SIZE2 = 100 * 1024 * 1024;
  }
});

// src/hwp5/aes.ts
function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 128;
    a = a << 1 & 255;
    if (hi) a ^= 27;
    b >>= 1;
  }
  return p;
}
function expandKey(key) {
  const w = new Uint32Array(44);
  for (let i = 0; i < 4; i++) {
    w[i] = key[4 * i] << 24 | key[4 * i + 1] << 16 | key[4 * i + 2] << 8 | key[4 * i + 3];
  }
  for (let i = 4; i < 44; i++) {
    let temp = w[i - 1];
    if (i % 4 === 0) {
      temp = (temp << 8 | temp >>> 24) >>> 0;
      temp = S_BOX[temp >>> 24 & 255] << 24 | S_BOX[temp >>> 16 & 255] << 16 | S_BOX[temp >>> 8 & 255] << 8 | S_BOX[temp & 255];
      temp = (temp ^ RCON[i / 4 - 1] << 24) >>> 0;
    }
    w[i] = (w[i - 4] ^ temp) >>> 0;
  }
  return w;
}
function decryptBlock(block, roundKeys) {
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = block[i];
  addRoundKey(s, roundKeys, 10);
  for (let round = 9; round >= 1; round--) {
    invShiftRows(s);
    invSubBytes(s);
    addRoundKey(s, roundKeys, round);
    invMixColumns(s);
  }
  invShiftRows(s);
  invSubBytes(s);
  addRoundKey(s, roundKeys, 0);
  return s;
}
function addRoundKey(s, w, round) {
  const base = round * 4;
  for (let c2 = 0; c2 < 4; c2++) {
    const k = w[base + c2];
    s[c2 * 4] ^= k >>> 24 & 255;
    s[c2 * 4 + 1] ^= k >>> 16 & 255;
    s[c2 * 4 + 2] ^= k >>> 8 & 255;
    s[c2 * 4 + 3] ^= k & 255;
  }
}
function invSubBytes(s) {
  for (let i = 0; i < 16; i++) s[i] = INV_S_BOX[s[i]];
}
function invShiftRows(s) {
  let t = s[13];
  s[13] = s[9];
  s[9] = s[5];
  s[5] = s[1];
  s[1] = t;
  t = s[2];
  s[2] = s[10];
  s[10] = t;
  t = s[6];
  s[6] = s[14];
  s[14] = t;
  t = s[3];
  s[3] = s[7];
  s[7] = s[11];
  s[11] = s[15];
  s[15] = t;
}
function invMixColumns(s) {
  for (let c2 = 0; c2 < 4; c2++) {
    const i = c2 * 4;
    const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
    s[i] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
    s[i + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
    s[i + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
    s[i + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
  }
}
function aes128EcbDecrypt(data, key) {
  if (key.length !== 16) throw new Error("AES-128 \uD0A4\uB294 16\uBC14\uC774\uD2B8\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  if (data.length % 16 !== 0) throw new Error("AES ECB \uC785\uB825\uC740 16\uBC14\uC774\uD2B8\uC758 \uBC30\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4");
  const roundKeys = expandKey(key);
  const out = new Uint8Array(data.length);
  for (let offset = 0; offset < data.length; offset += 16) {
    const block = data.subarray(offset, offset + 16);
    const decrypted = decryptBlock(block, roundKeys);
    out.set(decrypted, offset);
  }
  return out;
}
var S_BOX, INV_S_BOX, RCON;
var init_aes = __esm({
  "src/hwp5/aes.ts"() {
    "use strict";
    S_BOX = new Uint8Array([
      99,
      124,
      119,
      123,
      242,
      107,
      111,
      197,
      48,
      1,
      103,
      43,
      254,
      215,
      171,
      118,
      202,
      130,
      201,
      125,
      250,
      89,
      71,
      240,
      173,
      212,
      162,
      175,
      156,
      164,
      114,
      192,
      183,
      253,
      147,
      38,
      54,
      63,
      247,
      204,
      52,
      165,
      229,
      241,
      113,
      216,
      49,
      21,
      4,
      199,
      35,
      195,
      24,
      150,
      5,
      154,
      7,
      18,
      128,
      226,
      235,
      39,
      178,
      117,
      9,
      131,
      44,
      26,
      27,
      110,
      90,
      160,
      82,
      59,
      214,
      179,
      41,
      227,
      47,
      132,
      83,
      209,
      0,
      237,
      32,
      252,
      177,
      91,
      106,
      203,
      190,
      57,
      74,
      76,
      88,
      207,
      208,
      239,
      170,
      251,
      67,
      77,
      51,
      133,
      69,
      249,
      2,
      127,
      80,
      60,
      159,
      168,
      81,
      163,
      64,
      143,
      146,
      157,
      56,
      245,
      188,
      182,
      218,
      33,
      16,
      255,
      243,
      210,
      205,
      12,
      19,
      236,
      95,
      151,
      68,
      23,
      196,
      167,
      126,
      61,
      100,
      93,
      25,
      115,
      96,
      129,
      79,
      220,
      34,
      42,
      144,
      136,
      70,
      238,
      184,
      20,
      222,
      94,
      11,
      219,
      224,
      50,
      58,
      10,
      73,
      6,
      36,
      92,
      194,
      211,
      172,
      98,
      145,
      149,
      228,
      121,
      231,
      200,
      55,
      109,
      141,
      213,
      78,
      169,
      108,
      86,
      244,
      234,
      101,
      122,
      174,
      8,
      186,
      120,
      37,
      46,
      28,
      166,
      180,
      198,
      232,
      221,
      116,
      31,
      75,
      189,
      139,
      138,
      112,
      62,
      181,
      102,
      72,
      3,
      246,
      14,
      97,
      53,
      87,
      185,
      134,
      193,
      29,
      158,
      225,
      248,
      152,
      17,
      105,
      217,
      142,
      148,
      155,
      30,
      135,
      233,
      206,
      85,
      40,
      223,
      140,
      161,
      137,
      13,
      191,
      230,
      66,
      104,
      65,
      153,
      45,
      15,
      176,
      84,
      187,
      22
    ]);
    INV_S_BOX = new Uint8Array([
      82,
      9,
      106,
      213,
      48,
      54,
      165,
      56,
      191,
      64,
      163,
      158,
      129,
      243,
      215,
      251,
      124,
      227,
      57,
      130,
      155,
      47,
      255,
      135,
      52,
      142,
      67,
      68,
      196,
      222,
      233,
      203,
      84,
      123,
      148,
      50,
      166,
      194,
      35,
      61,
      238,
      76,
      149,
      11,
      66,
      250,
      195,
      78,
      8,
      46,
      161,
      102,
      40,
      217,
      36,
      178,
      118,
      91,
      162,
      73,
      109,
      139,
      209,
      37,
      114,
      248,
      246,
      100,
      134,
      104,
      152,
      22,
      212,
      164,
      92,
      204,
      93,
      101,
      182,
      146,
      108,
      112,
      72,
      80,
      253,
      237,
      185,
      218,
      94,
      21,
      70,
      87,
      167,
      141,
      157,
      132,
      144,
      216,
      171,
      0,
      140,
      188,
      211,
      10,
      247,
      228,
      88,
      5,
      184,
      179,
      69,
      6,
      208,
      44,
      30,
      143,
      202,
      63,
      15,
      2,
      193,
      175,
      189,
      3,
      1,
      19,
      138,
      107,
      58,
      145,
      17,
      65,
      79,
      103,
      220,
      234,
      151,
      242,
      207,
      206,
      240,
      180,
      230,
      115,
      150,
      172,
      116,
      34,
      231,
      173,
      53,
      133,
      226,
      249,
      55,
      232,
      28,
      117,
      223,
      110,
      71,
      241,
      26,
      113,
      29,
      41,
      197,
      137,
      111,
      183,
      98,
      14,
      170,
      24,
      190,
      27,
      252,
      86,
      62,
      75,
      198,
      210,
      121,
      32,
      154,
      219,
      192,
      254,
      120,
      205,
      90,
      244,
      31,
      221,
      168,
      51,
      136,
      7,
      199,
      49,
      177,
      18,
      16,
      89,
      39,
      128,
      236,
      95,
      96,
      81,
      127,
      169,
      25,
      181,
      74,
      13,
      45,
      229,
      122,
      159,
      147,
      201,
      156,
      239,
      160,
      224,
      59,
      77,
      174,
      42,
      245,
      176,
      200,
      235,
      187,
      60,
      131,
      83,
      153,
      97,
      23,
      43,
      4,
      126,
      186,
      119,
      214,
      38,
      225,
      105,
      20,
      99,
      85,
      33,
      12,
      125
    ]);
    RCON = new Uint8Array([1, 2, 4, 8, 16, 32, 64, 128, 27, 54]);
  }
});

// src/hwp5/crypto.ts
function decryptDistributePayload(payload) {
  if (payload.length < 256) throw new Error("\uBC30\uD3EC\uC6A9 payload\uAC00 256\uBC14\uC774\uD2B8 \uBBF8\uB9CC\uC785\uB2C8\uB2E4");
  const seed = (payload[0] | payload[1] << 8 | payload[2] << 16 | payload[3] << 24) >>> 0;
  const lcg = new MsvcLcg(seed);
  const result = new Uint8Array(payload.subarray(0, 256));
  let i = 0;
  let n = 0;
  let key = 0;
  while (i < 256) {
    if (n === 0) {
      key = lcg.rand() & 255;
      n = (lcg.rand() & 15) + 1;
    }
    if (i >= 4) {
      result[i] ^= key;
    }
    i++;
    n--;
  }
  return result;
}
function extractAesKey(decryptedPayload) {
  const offset = 4 + (decryptedPayload[0] & 15);
  if (offset + 16 > decryptedPayload.length) {
    throw new Error("AES \uD0A4 \uCD94\uCD9C \uC2E4\uD328: \uC624\uD504\uC14B\uC774 payload \uBC94\uC704\uB97C \uCD08\uACFC\uD569\uB2C8\uB2E4");
  }
  return decryptedPayload.slice(offset, offset + 16);
}
function parseRecordHeader(data, offset) {
  if (offset + 4 > data.length) throw new Error("\uB808\uCF54\uB4DC \uD5E4\uB354 \uD30C\uC2F1 \uC2E4\uD328: \uB370\uC774\uD130 \uBD80\uC871");
  const header = (data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24) >>> 0;
  const tagId = header & 1023;
  let size = header >>> 20 & 4095;
  let headerSize = 4;
  if (size === 4095) {
    if (offset + 8 > data.length) throw new Error("\uD655\uC7A5 \uB808\uCF54\uB4DC \uD06C\uAE30 \uD30C\uC2F1 \uC2E4\uD328: \uB370\uC774\uD130 \uBD80\uC871");
    size = (data[offset + 4] | data[offset + 5] << 8 | data[offset + 6] << 16 | data[offset + 7] << 24) >>> 0;
    headerSize = 8;
  }
  return { tagId, size, headerSize };
}
function decryptViewText(viewTextRaw, compressed) {
  const data = new Uint8Array(viewTextRaw);
  const rec = parseRecordHeader(data, 0);
  if (rec.tagId !== TAG_DISTRIBUTE_DOC_DATA) {
    throw new Error(`\uBC30\uD3EC\uC6A9 \uBB38\uC11C\uC758 \uCCAB \uB808\uCF54\uB4DC\uAC00 DISTRIBUTE_DOC_DATA(${TAG_DISTRIBUTE_DOC_DATA})\uAC00 \uC544\uB2D9\uB2C8\uB2E4 (\uC2E4\uC81C: ${rec.tagId})`);
  }
  const payloadStart = rec.headerSize;
  const payloadEnd = payloadStart + rec.size;
  if (payloadEnd > data.length || rec.size < 256) {
    throw new Error("\uBC30\uD3EC\uC6A9 payload\uAC00 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
  }
  const payload = data.subarray(payloadStart, payloadStart + 256);
  const decryptedPayload = decryptDistributePayload(payload);
  const aesKey = extractAesKey(decryptedPayload);
  const encryptedStart = payloadEnd;
  const encryptedData = data.subarray(encryptedStart);
  if (encryptedData.length === 0) {
    throw new Error("\uBC30\uD3EC\uC6A9 \uBB38\uC11C\uC5D0 \uC554\uD638\uD654\uB41C \uBCF8\uBB38 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4");
  }
  const alignedLen = encryptedData.length - encryptedData.length % 16;
  if (alignedLen === 0) {
    throw new Error("\uC554\uD638\uD654\uB41C \uB370\uC774\uD130\uAC00 \uB108\uBB34 \uC9E7\uC2B5\uB2C8\uB2E4 (16\uBC14\uC774\uD2B8 \uBBF8\uB9CC)");
  }
  const alignedData = encryptedData.subarray(0, alignedLen);
  const decrypted = aes128EcbDecrypt(alignedData, aesKey);
  if (compressed) {
    try {
      return decompressStream(Buffer.from(decrypted));
    } catch {
      return Buffer.from(decrypted);
    }
  }
  return Buffer.from(decrypted);
}
var MsvcLcg, TAG_DISTRIBUTE_DOC_DATA;
var init_crypto = __esm({
  "src/hwp5/crypto.ts"() {
    "use strict";
    init_aes();
    init_record();
    MsvcLcg = class {
      seed;
      constructor(seed) {
        this.seed = seed >>> 0;
      }
      /** 0 ~ 0x7FFF 범위 난수 반환 (MSVC rand() 호환) */
      rand() {
        this.seed = Math.imul(this.seed, 214013) + 2531011 >>> 0;
        return this.seed >>> 16 & 32767;
      }
    };
    TAG_DISTRIBUTE_DOC_DATA = 16 + 12;
  }
});

// src/hwp5/equation.ts
function hwpEquationToLatex(equation) {
  return convertEquation(equation.replace(/\0/g, "").trim(), 0);
}
function convertEquation(equation, depth) {
  if (!equation || depth > 12) return equation;
  let result = equation.replace(/\s+/g, " ").replace(/`+/g, "\\,").replace(/~+/g, "\\,").trim();
  result = convertMatrixLike(result);
  result = convertRoots(result, depth);
  result = convertOver(result, depth);
  result = convertSqrt(result, depth);
  result = convertScripts(result);
  result = convertOperators(result);
  result = removeFontDirectives(result);
  result = convertWords(result);
  result = cleanupLatexSpacing(result);
  return result;
}
function convertMatrixLike(input) {
  return input.replace(
    /\bmatrix\s*\{([^{}]*)\}/gi,
    (_match, body) => `\\begin{matrix} ${body.split("#").map((part) => part.trim()).join(" & ")} \\end{matrix}`
  ).replace(
    /\bcases\s*\{([^{}]*)\}/gi,
    (_match, body) => `\\begin{cases} ${body.split("#").map((part) => part.trim()).join(" \\\\ ")} \\end{cases}`
  );
}
function convertRoots(input, depth) {
  return input.replace(/(?<!\\)\broot\s+({[^{}]*}|\S+)\s+of\s+({[^{}]*}|\S+)/gi, (_match, degree, radicand) => {
    return `\\sqrt[${convertEquation(unwrapGroup(degree), depth + 1)}]{${convertEquation(unwrapGroup(radicand), depth + 1)}}`;
  });
}
function convertSqrt(input, depth) {
  return input.replace(/(?<!\\)\bsqrt\s*({[^{}]*}|\S+)/gi, (_match, radicand) => {
    return `\\sqrt{${convertEquation(unwrapGroup(radicand), depth + 1)}}`;
  });
}
function convertOver(input, depth) {
  let result = input;
  for (let guard = 0; guard < 50; guard++) {
    const over = findTopLevelWord(result, "over");
    if (over < 0) break;
    const left = readLeftAtom(result, over);
    const right = readRightAtom(result, over + "over".length);
    if (!left || !right) break;
    const numerator = convertEquation(unwrapGroup(left.atom), depth + 1);
    const denominator = convertEquation(unwrapGroup(right.atom), depth + 1);
    result = result.slice(0, left.start) + `\\frac{${numerator}}{${denominator}}` + result.slice(right.end);
  }
  return result;
}
function convertScripts(input) {
  return input.replace(/\s*\^\s*/g, "^").replace(/\s*_\s*/g, "_").replace(/\^(?!\{)([^\s{}_^]+)/g, "^{$1}").replace(/_(?!\{)([^\s{}_^]+)/g, "_{$1}");
}
function convertOperators(input) {
  return input.replace(/\+-/g, "\\pm").replace(/-\+/g, "\\mp").replace(/\/\//g, "\\parallel").replace(/△/g, "\\triangle ").replace(/□/g, "\\square ").replace(/‧/g, "\\cdot ").replace(/!=/g, "\\neq").replace(/<=/g, "\\leq").replace(/>=/g, "\\geq").replace(/==/g, "\\equiv");
}
function removeFontDirectives(input) {
  return input.replace(/(?<!\\)\b(?:rm|it)\b\s*/gi, "");
}
function convertWords(input) {
  return input.replace(/(?<![\\A-Za-z0-9])([A-Za-z][A-Za-z0-9]*)(?![A-Za-z0-9])/g, (word) => {
    const exact = SYMBOL_WORDS.get(word);
    if (exact) return exact;
    const lower = word.toLowerCase();
    return SYMBOL_WORDS.get(lower) ?? WORD_COMMANDS.get(lower) ?? word;
  });
}
function cleanupLatexSpacing(input) {
  return input.replace(/\\left\s*\{/g, "\\left\\{").replace(/\\right\s*\}/g, "\\right\\}").replace(/\\left\s*([\[\]\(\)\|])/g, "\\left$1").replace(/\\right\s*([\[\]\(\)\|])/g, "\\right$1").replace(/\s*\\,\s*/g, "\\,").replace(/\s+/g, " ").replace(/\{\s+/g, "{").replace(/\s+\}/g, "}").trim();
}
function findTopLevelWord(input, word) {
  let curly = 0;
  let paren = 0;
  for (let i = 0; i <= input.length - word.length; i++) {
    const ch = input[i];
    if (ch === "{") curly++;
    else if (ch === "}") curly = Math.max(0, curly - 1);
    else if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    if (curly !== 0 || paren !== 0) continue;
    if (input.slice(i, i + word.length).toLowerCase() !== word) continue;
    if (isWordChar(input[i - 1]) || isWordChar(input[i + word.length])) continue;
    return i;
  }
  return -1;
}
function readLeftAtom(input, end) {
  let pos = end - 1;
  while (pos >= 0 && /\s/.test(input[pos])) pos--;
  if (pos < 0) return null;
  if (input[pos] === "}") {
    const start2 = findMatchingLeft(input, pos, "{", "}");
    if (start2 >= 0) return { start: start2, atom: input.slice(start2, pos + 1) };
  }
  if (input[pos] === ")") {
    const start2 = findMatchingLeft(input, pos, "(", ")");
    if (start2 >= 0) return { start: start2, atom: input.slice(start2, pos + 1) };
  }
  let start = pos;
  while (start >= 0 && !/\s/.test(input[start]) && !/[+\-=<>]/.test(input[start])) start--;
  return { start: start + 1, atom: input.slice(start + 1, pos + 1) };
}
function readRightAtom(input, start) {
  let pos = start;
  while (pos < input.length && /\s/.test(input[pos])) pos++;
  if (pos >= input.length) return null;
  if (input[pos] === "{") {
    const end2 = findMatchingRight(input, pos, "{", "}");
    if (end2 >= 0) return { end: end2 + 1, atom: input.slice(pos, end2 + 1) };
  }
  if (input[pos] === "(") {
    const end2 = findMatchingRight(input, pos, "(", ")");
    if (end2 >= 0) return { end: end2 + 1, atom: input.slice(pos, end2 + 1) };
  }
  let end = pos;
  while (end < input.length && !/\s/.test(input[end]) && !/[+\-=<>]/.test(input[end])) end++;
  return { end, atom: input.slice(pos, end) };
}
function findMatchingLeft(input, closeIndex, open, close) {
  let depth = 0;
  for (let i = closeIndex; i >= 0; i--) {
    if (input[i] === close) depth++;
    else if (input[i] === open) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
function findMatchingRight(input, openIndex, open, close) {
  let depth = 0;
  for (let i = openIndex; i < input.length; i++) {
    if (input[i] === open) depth++;
    else if (input[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
function unwrapGroup(input) {
  const trimmed = input.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed.slice(1, -1);
  return trimmed;
}
function isWordChar(ch) {
  return !!ch && /[A-Za-z0-9_]/.test(ch);
}
var WORD_COMMANDS, SYMBOL_WORDS;
var init_equation2 = __esm({
  "src/hwp5/equation.ts"() {
    "use strict";
    WORD_COMMANDS = /* @__PURE__ */ new Map([
      ["alpha", "\\alpha"],
      ["beta", "\\beta"],
      ["gamma", "\\gamma"],
      ["delta", "\\delta"],
      ["epsilon", "\\epsilon"],
      ["theta", "\\theta"],
      ["lambda", "\\lambda"],
      ["mu", "\\mu"],
      ["pi", "\\pi"],
      ["sigma", "\\sigma"],
      ["tau", "\\tau"],
      ["phi", "\\phi"],
      ["omega", "\\omega"],
      ["sin", "\\sin"],
      ["cos", "\\cos"],
      ["tan", "\\tan"],
      ["sec", "\\sec"],
      ["csc", "\\csc"],
      ["cot", "\\cot"],
      ["log", "\\log"],
      ["ln", "\\ln"],
      ["lim", "\\lim"],
      ["inf", "\\infty"],
      ["sum", "\\sum"],
      ["smallsum", "\\sum"],
      ["prod", "\\prod"],
      ["int", "\\int"],
      ["oint", "\\oint"],
      ["rightarrow", "\\rightarrow"],
      ["leftarrow", "\\leftarrow"],
      ["partial", "\\partial"],
      ["nabla", "\\nabla"],
      ["angle", "\\angle"],
      ["triangle", "\\triangle"],
      ["vec", "\\vec"],
      ["bar", "\\overline"],
      ["dot", "\\dot"],
      ["hat", "\\hat"],
      ["left", "\\left"],
      ["right", "\\right"]
    ]);
    SYMBOL_WORDS = /* @__PURE__ */ new Map([
      ["times", "\\times"],
      ["divide", "\\div"],
      ["div", "\\div"],
      ["le", "\\leq"],
      ["ge", "\\geq"],
      ["geq", "\\geq"],
      ["deg", "^\\circ"],
      ["rarrow", "\\rightarrow"],
      ["larrow", "\\leftarrow"],
      ["lrarrow", "\\leftrightarrow"],
      ["in", "\\in"],
      ["notin", "\\notin"],
      ["emptyset", "\\emptyset"],
      ["subset", "\\subset"],
      ["nsubset", "\\nsubseteq"],
      ["cup", "\\cup"],
      ["cap", "\\cap"],
      ["smallinter", "\\cap"],
      ["sim", "\\sim"],
      ["circ", "\\circ"],
      ["bot", "\\perp"],
      ["dyad", "\\overleftrightarrow"],
      ["arch", "\\overset{\\frown}"]
    ]);
  }
});

// src/hwp5/cfb-lenient.ts
function parseLenientCfb(data) {
  if (data.length < 512) throw new Error("CFB \uD30C\uC77C\uC774 \uB108\uBB34 \uC9E7\uC2B5\uB2C8\uB2E4 (\uCD5C\uC18C 512\uBC14\uC774\uD2B8)");
  if (!data.subarray(0, 8).equals(CFB_MAGIC)) throw new Error("CFB \uB9E4\uC9C1 \uBC14\uC774\uD2B8 \uBD88\uC77C\uCE58");
  const sectorSizeShift = data.readUInt16LE(30);
  if (sectorSizeShift < 7 || sectorSizeShift > 16) throw new Error("\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC139\uD130 \uD06C\uAE30 \uC2DC\uD504\uD2B8: " + sectorSizeShift);
  const sectorSize = 1 << sectorSizeShift;
  const miniSectorSizeShift = data.readUInt16LE(32);
  if (miniSectorSizeShift > 16) throw new Error("\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uBBF8\uB2C8 \uC139\uD130 \uD06C\uAE30 \uC2DC\uD504\uD2B8: " + miniSectorSizeShift);
  const miniSectorSize = 1 << miniSectorSizeShift;
  const fatSectorCount = data.readUInt32LE(44);
  if (fatSectorCount > 1e4) throw new Error("FAT \uC139\uD130 \uC218\uAC00 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4: " + fatSectorCount);
  const firstDirSector = data.readUInt32LE(48);
  const miniStreamCutoff = data.readUInt32LE(56);
  const firstMiniFatSector = data.readUInt32LE(60);
  const miniFatSectorCount = data.readUInt32LE(64);
  const firstDifatSector = data.readUInt32LE(68);
  const difatSectorCount = data.readUInt32LE(72);
  function sectorOffset(id) {
    return 512 + id * sectorSize;
  }
  function readSectorData(id) {
    const off = sectorOffset(id);
    if (off + sectorSize > data.length) return Buffer.alloc(0);
    return data.subarray(off, off + sectorSize);
  }
  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < fatSectorCount; i++) {
    const sid = data.readUInt32LE(76 + i * 4);
    if (sid === FREE_SECT || sid === END_OF_CHAIN) break;
    fatSectors.push(sid);
  }
  let difatSector = firstDifatSector;
  const visitedDifat = /* @__PURE__ */ new Set();
  for (let d = 0; d < difatSectorCount && difatSector !== END_OF_CHAIN && difatSector !== FREE_SECT; d++) {
    if (visitedDifat.has(difatSector)) break;
    visitedDifat.add(difatSector);
    const buf = readSectorData(difatSector);
    const entriesPerSector = sectorSize / 4 - 1;
    for (let i = 0; i < entriesPerSector && fatSectors.length < fatSectorCount; i++) {
      const sid = buf.readUInt32LE(i * 4);
      if (sid === FREE_SECT || sid === END_OF_CHAIN) continue;
      fatSectors.push(sid);
    }
    difatSector = buf.readUInt32LE(entriesPerSector * 4);
  }
  const entriesPerFatSector = sectorSize / 4;
  const fatTable = new Uint32Array(fatSectors.length * entriesPerFatSector);
  for (let fi = 0; fi < fatSectors.length; fi++) {
    const buf = readSectorData(fatSectors[fi]);
    for (let i = 0; i < entriesPerFatSector; i++) {
      fatTable[fi * entriesPerFatSector + i] = i * 4 + 3 < buf.length ? buf.readUInt32LE(i * 4) : FREE_SECT;
    }
  }
  function readChain(startSector, maxBytes) {
    if (startSector === END_OF_CHAIN || startSector === FREE_SECT) return Buffer.alloc(0);
    if (maxBytes > MAX_STREAM_SIZE) throw new Error("\uC2A4\uD2B8\uB9BC\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4");
    const chunks = [];
    let current = startSector;
    let totalRead = 0;
    const visited = /* @__PURE__ */ new Set();
    while (current !== END_OF_CHAIN && current !== FREE_SECT && totalRead < maxBytes) {
      if (visited.has(current)) break;
      if (visited.size > MAX_CHAIN_LENGTH) break;
      visited.add(current);
      const buf = readSectorData(current);
      const remaining = maxBytes - totalRead;
      chunks.push(remaining < sectorSize ? buf.subarray(0, remaining) : buf);
      totalRead += Math.min(buf.length, remaining);
      current = current < fatTable.length ? fatTable[current] : END_OF_CHAIN;
    }
    return Buffer.concat(chunks);
  }
  let miniFatTable = null;
  function getMiniFatTable() {
    if (miniFatTable) return miniFatTable;
    if (miniFatSectorCount === 0 || firstMiniFatSector === END_OF_CHAIN) {
      miniFatTable = new Uint32Array(0);
      return miniFatTable;
    }
    const miniFatData = readChain(firstMiniFatSector, miniFatSectorCount * sectorSize);
    const entries = miniFatData.length / 4;
    miniFatTable = new Uint32Array(entries);
    for (let i = 0; i < entries; i++) {
      miniFatTable[i] = miniFatData.readUInt32LE(i * 4);
    }
    return miniFatTable;
  }
  const dirData = readChain(firstDirSector, MAX_DIR_ENTRIES * 128);
  const dirEntries = [];
  for (let offset = 0; offset + 128 <= dirData.length && dirEntries.length < MAX_DIR_ENTRIES; offset += 128) {
    const nameLen = dirData.readUInt16LE(offset + 64);
    if (nameLen <= 0 || nameLen > 64) {
      dirEntries.push({ name: "", type: 0, startSector: 0, size: 0 });
      continue;
    }
    const nameBytes = nameLen - 2;
    const name = nameBytes > 0 ? dirData.subarray(offset, offset + nameBytes).toString("utf16le") : "";
    const type = dirData[offset + 66];
    const startSector = dirData.readUInt32LE(offset + 116);
    const size = dirData.readUInt32LE(offset + 120);
    dirEntries.push({ name, type, startSector, size });
  }
  let miniStreamData = null;
  function getMiniStream() {
    if (miniStreamData) return miniStreamData;
    const root = dirEntries[0];
    if (!root || root.type !== 5) {
      miniStreamData = Buffer.alloc(0);
      return miniStreamData;
    }
    miniStreamData = readChain(root.startSector, root.size || MAX_STREAM_SIZE);
    return miniStreamData;
  }
  function readMiniStream(startSector, size) {
    const mft = getMiniFatTable();
    const ms = getMiniStream();
    if (mft.length === 0 || ms.length === 0) return Buffer.alloc(0);
    const chunks = [];
    let current = startSector;
    let totalRead = 0;
    const visited = /* @__PURE__ */ new Set();
    while (current !== END_OF_CHAIN && current !== FREE_SECT && totalRead < size) {
      if (visited.has(current)) break;
      if (visited.size > MAX_CHAIN_LENGTH) break;
      visited.add(current);
      const off = current * miniSectorSize;
      const remaining = size - totalRead;
      const chunkSize = Math.min(miniSectorSize, remaining);
      if (off + chunkSize <= ms.length) {
        chunks.push(ms.subarray(off, off + chunkSize));
      }
      totalRead += chunkSize;
      current = current < mft.length ? mft[current] : END_OF_CHAIN;
    }
    return Buffer.concat(chunks);
  }
  function readStreamData(entry) {
    if (entry.size === 0) return Buffer.alloc(0);
    if (entry.size < miniStreamCutoff) {
      const miniResult = readMiniStream(entry.startSector, entry.size);
      if (miniResult.length > 0) return miniResult;
    }
    return readChain(entry.startSector, entry.size);
  }
  function findEntryByPath(path) {
    const parts = path.replace(/^\//, "").split("/");
    if (parts.length === 1) {
      return dirEntries.find((e) => e.name === parts[0] && e.type === 2) ?? null;
    }
    const storageName = parts[0];
    const streamName = parts.slice(1).join("/");
    for (const e of dirEntries) {
      if (e.type === 2 && e.name === streamName) {
        return e;
      }
    }
    const lastPart = parts[parts.length - 1];
    return dirEntries.find((e) => e.type === 2 && e.name === lastPart) ?? null;
  }
  return {
    findStream(path) {
      const normalized = path.replace(/^\//, "");
      const entry = findEntryByPath(normalized);
      if (!entry || entry.type !== 2) return null;
      const stream = readStreamData(entry);
      return stream.length > 0 ? stream : null;
    },
    entries() {
      return dirEntries.filter((e) => e.type === 2);
    }
  };
}
var CFB_MAGIC, END_OF_CHAIN, FREE_SECT, MAX_CHAIN_LENGTH, MAX_DIR_ENTRIES, MAX_STREAM_SIZE;
var init_cfb_lenient = __esm({
  "src/hwp5/cfb-lenient.ts"() {
    "use strict";
    CFB_MAGIC = Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]);
    END_OF_CHAIN = 4294967294;
    FREE_SECT = 4294967295;
    MAX_CHAIN_LENGTH = 1e6;
    MAX_DIR_ENTRIES = 1e5;
    MAX_STREAM_SIZE = 100 * 1024 * 1024;
  }
});

// src/hwp5/parser.ts
import { createRequire } from "module";
function parseHwp5Document(buffer, options) {
  let cfb = null;
  let lenientCfb = null;
  const warnings = [];
  try {
    cfb = CFB.parse(buffer);
  } catch {
    try {
      lenientCfb = parseLenientCfb(buffer);
      warnings.push({ message: "\uC190\uC0C1\uB41C CFB \uCEE8\uD14C\uC774\uB108 \u2014 lenient \uBAA8\uB4DC\uB85C \uBCF5\uAD6C", code: "LENIENT_CFB_RECOVERY" });
    } catch {
      throw new KordocError("CFB \uCEE8\uD14C\uC774\uB108 \uD30C\uC2F1 \uC2E4\uD328 (strict \uBC0F lenient \uBAA8\uB450)");
    }
  }
  const findStream = (path) => {
    if (cfb) {
      const entry = CFB.find(cfb, path);
      return entry?.content ? Buffer.from(entry.content) : null;
    }
    return lenientCfb.findStream(path);
  };
  const headerData = findStream("/FileHeader");
  if (!headerData) throw new KordocError("FileHeader \uC2A4\uD2B8\uB9BC \uC5C6\uC74C");
  const header = parseFileHeader(headerData);
  if (header.signature !== "HWP Document File") throw new KordocError("HWP \uC2DC\uADF8\uB2C8\uCC98 \uBD88\uC77C\uCE58");
  if (header.flags & FLAG_ENCRYPTED) throw new KordocError("\uC554\uD638\uD654\uB41C HWP\uB294 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
  if (header.flags & FLAG_DRM) throw new KordocError("DRM \uBCF4\uD638\uB41C HWP\uB294 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
  const compressed = (header.flags & FLAG_COMPRESSED) !== 0;
  const distribution = (header.flags & FLAG_DISTRIBUTION) !== 0;
  const metadata = {
    version: `${header.versionMajor}.x`
  };
  if (cfb) extractHwp5Metadata(cfb, metadata);
  const docInfo = cfb ? parseDocInfoStream(cfb, compressed) : parseDocInfoFromStream(findStream("/DocInfo"), compressed);
  const sections = distribution ? cfb ? findViewTextSections(cfb, compressed) : findViewTextSectionsLenient(lenientCfb, compressed) : cfb ? findSections(cfb) : findSectionsLenient(lenientCfb, compressed);
  if (sections.length === 0) throw new KordocError("\uC139\uC158 \uC2A4\uD2B8\uB9BC\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
  metadata.pageCount = sections.length;
  const pageFilter = options?.pages ? parsePageRange(options.pages, sections.length) : null;
  const totalTarget = pageFilter ? pageFilter.size : sections.length;
  const blocks = [];
  const nestedTableCounter = { count: 0 };
  let totalDecompressed = 0;
  let parsedSections = 0;
  for (let si = 0; si < sections.length; si++) {
    if (pageFilter && !pageFilter.has(si + 1)) continue;
    try {
      const sectionData = sections[si];
      const data = !distribution && compressed ? decompressStream(Buffer.from(sectionData)) : Buffer.from(sectionData);
      totalDecompressed += data.length;
      if (totalDecompressed > MAX_TOTAL_DECOMPRESS) throw new KordocError("\uCD1D \uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC (decompression bomb \uC758\uC2EC)");
      const records = readRecords(data);
      const sectionBlocks = parseSection(records, docInfo, warnings, si + 1, nestedTableCounter);
      blocks.push(...sectionBlocks);
      parsedSections++;
      options?.onProgress?.(parsedSections, totalTarget);
    } catch (secErr) {
      if (secErr instanceof KordocError) throw secErr;
      warnings.push({ page: si + 1, message: `\uC139\uC158 ${si + 1} \uD30C\uC2F1 \uC2E4\uD328: ${secErr instanceof Error ? secErr.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958"}`, code: "PARTIAL_PARSE" });
    }
  }
  const images = cfb ? extractHwp5Images(cfb, blocks, compressed, warnings) : extractHwp5ImagesLenient(lenientCfb, blocks, compressed, warnings);
  const flatBlocks = flattenLayoutTables(blocks);
  if (docInfo) {
    detectHwp5Headings(flatBlocks, docInfo);
  }
  const outline = flatBlocks.filter((b) => b.type === "heading" && b.level && b.text).map((b) => ({ level: b.level, text: b.text, pageNumber: b.pageNumber }));
  const markdown = blocksToMarkdown(flatBlocks);
  return { markdown, blocks: flatBlocks, metadata, outline: outline.length > 0 ? outline : void 0, warnings: warnings.length > 0 ? warnings : void 0, images: images.length > 0 ? images : void 0 };
}
function parseDocInfoStream(cfb, compressed) {
  try {
    const entry = CFB.find(cfb, "/DocInfo");
    if (!entry?.content) return null;
    const data = compressed ? decompressStream(Buffer.from(entry.content)) : Buffer.from(entry.content);
    const records = readRecords(data);
    return parseDocInfo(records);
  } catch {
    return null;
  }
}
function parseDocInfoFromStream(raw, compressed) {
  if (!raw) return null;
  try {
    const data = compressed ? decompressStream(raw) : raw;
    return parseDocInfo(readRecords(data));
  } catch {
    return null;
  }
}
function detectHwp5Headings(blocks, docInfo) {
  let baseFontSize = 0;
  for (const style of docInfo.styles) {
    const name = (style.nameKo || style.name).toLowerCase();
    if (name.includes("\uBC14\uD0D5") || name.includes("\uBCF8\uBB38") || name === "normal" || name === "body") {
      const cs = docInfo.charShapes[style.charShapeId];
      if (cs?.fontSize > 0) {
        baseFontSize = cs.fontSize / 10;
        break;
      }
    }
  }
  if (baseFontSize === 0) {
    const sizeFreq = /* @__PURE__ */ new Map();
    for (const b of blocks) {
      if (b.style?.fontSize) {
        sizeFreq.set(b.style.fontSize, (sizeFreq.get(b.style.fontSize) || 0) + 1);
      }
    }
    let maxCount = 0;
    for (const [size, count] of sizeFreq) {
      if (count > maxCount) {
        maxCount = count;
        baseFontSize = size;
      }
    }
  }
  if (baseFontSize <= 0) return;
  for (const block of blocks) {
    if (block.type === "heading") continue;
    if (block.type !== "paragraph" || !block.text) continue;
    const text = block.text.trim();
    if (text.length === 0 || text.length > 200) continue;
    if (/^\d+$/.test(text)) continue;
    let level = 0;
    if (block.style?.fontSize && baseFontSize > 0) {
      const ratio = block.style.fontSize / baseFontSize;
      if (ratio >= HEADING_RATIO_H1) level = 1;
      else if (ratio >= HEADING_RATIO_H2) level = 2;
      else if (ratio >= HEADING_RATIO_H3) level = 3;
    }
    if (/^제\d+[장절편]\s/.test(text) && text.length <= 50) {
      if (level === 0) level = 2;
    } else if (/^제\d+(조의?\d*)\s*[\(（]/.test(text) && text.length <= 80) {
      if (level === 0) level = 3;
    }
    if (level > 0) {
      block.type = "heading";
      block.level = level;
    }
  }
}
function extractHwp5Metadata(cfb, metadata) {
  try {
    const summaryEntry = CFB.find(cfb, "/HwpSummaryInformation") || CFB.find(cfb, "/SummaryInformation");
    if (!summaryEntry?.content) return;
    const data = Buffer.from(summaryEntry.content);
    if (data.length < 48) return;
    const numSets = data.readUInt32LE(24);
    if (numSets === 0) return;
    const setOffset = data.readUInt32LE(44);
    if (setOffset >= data.length - 8) return;
    const numProps = data.readUInt32LE(setOffset + 4);
    if (numProps === 0 || numProps > 100) return;
    for (let i = 0; i < numProps; i++) {
      const entryOffset = setOffset + 8 + i * 8;
      if (entryOffset + 8 > data.length) break;
      const propId = data.readUInt32LE(entryOffset);
      const propOffset = setOffset + data.readUInt32LE(entryOffset + 4);
      if (propOffset + 8 > data.length) continue;
      if (propId !== 2 && propId !== 4 && propId !== 6) continue;
      const propType = data.readUInt32LE(propOffset);
      if (propType !== 30) continue;
      const strLen = data.readUInt32LE(propOffset + 4);
      if (strLen === 0 || strLen > 1e4 || propOffset + 8 + strLen > data.length) continue;
      const str = data.subarray(propOffset + 8, propOffset + 8 + strLen).toString("utf8").replace(/\0+$/, "").trim();
      if (!str) continue;
      if (propId === 2) metadata.title = str;
      else if (propId === 4) metadata.author = str;
      else if (propId === 6) metadata.description = str;
    }
  } catch {
  }
}
function extractHwp5MetadataOnly(buffer) {
  const cfb = CFB.parse(buffer);
  const headerEntry = CFB.find(cfb, "/FileHeader");
  if (!headerEntry?.content) throw new KordocError("FileHeader \uC2A4\uD2B8\uB9BC \uC5C6\uC74C");
  const header = parseFileHeader(Buffer.from(headerEntry.content));
  if (header.signature !== "HWP Document File") throw new KordocError("HWP \uC2DC\uADF8\uB2C8\uCC98 \uBD88\uC77C\uCE58");
  const metadata = {
    version: `${header.versionMajor}.x`
  };
  extractHwp5Metadata(cfb, metadata);
  const sections = findSections(cfb);
  metadata.pageCount = sections.length;
  return metadata;
}
function findViewTextSections(cfb, compressed) {
  const sections = [];
  for (let i = 0; i < MAX_SECTIONS; i++) {
    const entry = CFB.find(cfb, `/ViewText/Section${i}`);
    if (!entry?.content) break;
    try {
      const decrypted = decryptViewText(Buffer.from(entry.content), compressed);
      sections.push({ idx: i, content: decrypted });
    } catch {
      break;
    }
  }
  return sections.sort((a, b) => a.idx - b.idx).map((s) => s.content);
}
function findSections(cfb) {
  const sections = [];
  for (let i = 0; i < MAX_SECTIONS; i++) {
    const entry = CFB.find(cfb, `/BodyText/Section${i}`);
    if (!entry?.content) break;
    sections.push({ idx: i, content: Buffer.from(entry.content) });
  }
  if (sections.length === 0 && cfb.FileIndex) {
    for (const entry of cfb.FileIndex) {
      if (sections.length >= MAX_SECTIONS) break;
      if (entry.name?.startsWith("Section") && entry.content) {
        const idx = parseInt(entry.name.replace("Section", ""), 10) || 0;
        sections.push({ idx, content: Buffer.from(entry.content) });
      }
    }
  }
  return sections.sort((a, b) => a.idx - b.idx).map((s) => s.content);
}
function findSectionsLenient(lcfb, compressed) {
  const sections = [];
  let totalDecompressed = 0;
  for (let i = 0; i < MAX_SECTIONS; i++) {
    const raw = lcfb.findStream(`/BodyText/Section${i}`) ?? lcfb.findStream(`Section${i}`);
    if (!raw) break;
    const content = compressed ? decompressStream(raw) : raw;
    totalDecompressed += content.length;
    if (totalDecompressed > MAX_TOTAL_DECOMPRESS) throw new KordocError("\uCD1D \uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC (decompression bomb \uC758\uC2EC)");
    sections.push({ idx: i, content });
  }
  if (sections.length === 0) {
    for (const e of lcfb.entries()) {
      if (sections.length >= MAX_SECTIONS) break;
      if (e.name.startsWith("Section")) {
        const idx = parseInt(e.name.replace("Section", ""), 10) || 0;
        const raw = lcfb.findStream(e.name);
        if (raw) {
          const content = compressed ? decompressStream(raw) : raw;
          totalDecompressed += content.length;
          if (totalDecompressed > MAX_TOTAL_DECOMPRESS) throw new KordocError("\uCD1D \uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC (decompression bomb \uC758\uC2EC)");
          sections.push({ idx, content });
        }
      }
    }
  }
  return sections.sort((a, b) => a.idx - b.idx).map((s) => s.content);
}
function findViewTextSectionsLenient(lcfb, compressed) {
  const sections = [];
  let totalDecompressed = 0;
  for (let i = 0; i < MAX_SECTIONS; i++) {
    const raw = lcfb.findStream(`/ViewText/Section${i}`) ?? lcfb.findStream(`Section${i}`);
    if (!raw) break;
    try {
      const content = decryptViewText(raw, compressed);
      totalDecompressed += content.length;
      if (totalDecompressed > MAX_TOTAL_DECOMPRESS) throw new KordocError("\uCD1D \uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC (decompression bomb \uC758\uC2EC)");
      sections.push({ idx: i, content });
    } catch {
      break;
    }
  }
  return sections.sort((a, b) => a.idx - b.idx).map((s) => s.content);
}
function extractBinDataId(records, ctrlIdx) {
  const ctrlLevel = records[ctrlIdx].level;
  for (let j = ctrlIdx + 1; j < records.length && j < ctrlIdx + 50; j++) {
    const r = records[j];
    if (r.level <= ctrlLevel) break;
    if (r.data.length >= 2) {
      if (r.tagId > TAG_SHAPE_COMPONENT && r.level > ctrlLevel + 1 && r.data.length >= 4) {
        const possibleId = r.data.readUInt16LE(0);
        if (possibleId < 1e4) return possibleId;
      }
    }
  }
  return -1;
}
function isEquationControlId(ctrlId) {
  return ctrlId === CTRL_ID_EQEDIT || ctrlId === "eqed";
}
function formatEquationForMarkdown(equation) {
  const normalized = hwpEquationToLatex(equation);
  if (!normalized) return "";
  return `$${normalized.replace(/\$/g, "\\$")}$`;
}
function extractEquationFromControl(records, ctrlIdx) {
  const ctrlLevel = records[ctrlIdx].level;
  for (let j = ctrlIdx + 1; j < records.length && j < ctrlIdx + 10; j++) {
    const r = records[j];
    if (r.level <= ctrlLevel) break;
    if (r.tagId !== TAG_EQEDIT) continue;
    const equation = extractEquationText(r.data);
    return equation ? formatEquationForMarkdown(equation) : null;
  }
  return null;
}
function renderTextWithEquations(textRecords, equations) {
  const queue = [...equations];
  return textRecords.map((data) => extractTextWithControls(data, (ctrlId) => {
    if (!isEquationControlId(ctrlId) || queue.length === 0) return null;
    return queue.shift();
  })).join("").replace(/\$\$/g, "$ $");
}
function detectImageMime(data) {
  if (data.length < 4) return null;
  if (data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (data[0] === 71 && data[1] === 73 && data[2] === 70) return "image/gif";
  if (data[0] === 66 && data[1] === 77) return "image/bmp";
  if (data[0] === 215 && data[1] === 205 && data[2] === 198 && data[3] === 154) return "image/wmf";
  if (data[0] === 1 && data[1] === 0 && data[2] === 0 && data[3] === 0) return "image/emf";
  return null;
}
function extractHwp5Images(cfb, blocks, compressed, warnings) {
  const binDataMap = /* @__PURE__ */ new Map();
  const binDataRe = /\/BinData\/[Bb][Ii][Nn](\d{4})$/;
  if (cfb.FileIndex) {
    for (const entry of cfb.FileIndex) {
      if (!entry?.name || !entry.content) continue;
      const match = entry.name.match(binDataRe);
      if (!match) continue;
      const idx = parseInt(match[1], 10);
      let data = Buffer.from(entry.content);
      if (compressed) {
        try {
          data = decompressStream(data);
        } catch {
        }
      }
      binDataMap.set(idx, { data, name: entry.name });
    }
  }
  if (binDataMap.size === 0) return [];
  const images = [];
  let imageIndex = 0;
  for (const block of blocks) {
    if (block.type !== "image" || !block.text) continue;
    const binId = parseInt(block.text, 10);
    if (isNaN(binId)) continue;
    const bin = binDataMap.get(binId);
    if (!bin) {
      warnings.push({ page: block.pageNumber, message: `BinData ${binId} \uC5C6\uC74C`, code: "SKIPPED_IMAGE" });
      block.type = "paragraph";
      block.text = `[\uC774\uBBF8\uC9C0: BinData ${binId}]`;
      continue;
    }
    const mime = detectImageMime(bin.data);
    if (!mime) {
      warnings.push({ page: block.pageNumber, message: `BinData ${binId}: \uC54C \uC218 \uC5C6\uB294 \uC774\uBBF8\uC9C0 \uD615\uC2DD`, code: "SKIPPED_IMAGE" });
      block.type = "paragraph";
      block.text = `[\uC774\uBBF8\uC9C0: ${bin.name}]`;
      continue;
    }
    imageIndex++;
    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("png") ? "png" : mime.includes("gif") ? "gif" : mime.includes("bmp") ? "bmp" : "bin";
    const filename = `image_${String(imageIndex).padStart(3, "0")}.${ext}`;
    images.push({ filename, data: new Uint8Array(bin.data), mimeType: mime });
    block.text = filename;
    block.imageData = { data: new Uint8Array(bin.data), mimeType: mime, filename: bin.name };
  }
  return images;
}
function extractHwp5ImagesLenient(lcfb, blocks, compressed, warnings) {
  const binDataMap = /* @__PURE__ */ new Map();
  const binRe = /^BIN(\d{4})/i;
  for (const e of lcfb.entries()) {
    const match = e.name.match(binRe);
    if (!match) continue;
    const idx = parseInt(match[1], 10);
    let raw = lcfb.findStream(e.name);
    if (!raw) continue;
    if (compressed) {
      try {
        raw = decompressStream(raw);
      } catch {
      }
    }
    binDataMap.set(idx, { data: raw, name: e.name });
  }
  if (binDataMap.size === 0) return [];
  const images = [];
  let imageIndex = 0;
  for (const block of blocks) {
    if (block.type !== "image" || !block.text) continue;
    const binId = parseInt(block.text, 10);
    if (isNaN(binId)) continue;
    const bin = binDataMap.get(binId);
    if (!bin) {
      warnings.push({ page: block.pageNumber, message: `BinData ${binId} \uFFFD\uFFFD\uFFFD\uC74C`, code: "SKIPPED_IMAGE" });
      block.type = "paragraph";
      block.text = `[\uC774\uBBF8\uC9C0: BinData ${binId}]`;
      continue;
    }
    const mime = detectImageMime(bin.data);
    if (!mime) {
      warnings.push({ page: block.pageNumber, message: `BinData ${binId}: \uC54C \uC218 \uC5C6\uB294 \uC774\uBBF8\uC9C0 \uD615\uC2DD`, code: "SKIPPED_IMAGE" });
      block.type = "paragraph";
      block.text = `[\uC774\uBBF8\uC9C0: ${bin.name}]`;
      continue;
    }
    imageIndex++;
    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("png") ? "png" : mime.includes("gif") ? "gif" : mime.includes("bmp") ? "bmp" : "bin";
    const filename = `image_${String(imageIndex).padStart(3, "0")}.${ext}`;
    images.push({ filename, data: new Uint8Array(bin.data), mimeType: mime });
    block.text = filename;
    block.imageData = { data: new Uint8Array(bin.data), mimeType: mime, filename: bin.name };
  }
  return images;
}
function parseSection(records, docInfo, warnings, sectionNum, counter) {
  const blocks = [];
  let i = 0;
  while (i < records.length) {
    const rec = records[i];
    if (rec.tagId === TAG_PARA_HEADER && rec.level === 0) {
      const { paragraph, tables, nextIdx, charShapeIds, paraShapeId } = parseParagraphWithTables(records, i, counter);
      if (paragraph) {
        const block = { type: "paragraph", text: paragraph, pageNumber: sectionNum };
        if (docInfo && charShapeIds.length > 0) {
          const style = resolveCharStyle(charShapeIds, docInfo);
          if (style) block.style = style;
        }
        if (docInfo && paraShapeId >= 0 && paraShapeId < docInfo.paraShapes.length) {
          const ol = docInfo.paraShapes[paraShapeId].outlineLevel;
          if (ol >= 1 && ol <= 6) {
            block.type = "heading";
            block.level = ol;
          }
        }
        blocks.push(block);
      }
      for (const t of tables) blocks.push({ type: "table", table: t, pageNumber: sectionNum });
      i = nextIdx;
      continue;
    }
    if (rec.tagId === TAG_CTRL_HEADER && rec.level <= 1 && rec.data.length >= 4) {
      const ctrlId = rec.data.subarray(0, 4).toString("ascii");
      if (ctrlId === " lbt" || ctrlId === "tbl ") {
        const { table, nextIdx } = parseTableBlock(records, i, counter);
        if (table) blocks.push({ type: "table", table, pageNumber: sectionNum });
        i = nextIdx;
        continue;
      }
      if (ctrlId === "gso " || ctrlId === " osg") {
        const binId = extractBinDataId(records, i);
        if (binId >= 0) {
          blocks.push({ type: "image", text: String(binId), pageNumber: sectionNum });
        } else {
          const boxText = extractTextBoxText(records, i);
          if (boxText) {
            blocks.push({ type: "paragraph", text: boxText, pageNumber: sectionNum });
          }
        }
      } else if (ctrlId === " elo" || ctrlId === "ole ") {
        warnings.push({ page: sectionNum, message: `\uC2A4\uD0B5\uB41C \uC81C\uC5B4 \uC694\uC18C: ${ctrlId.trim()}`, code: "SKIPPED_IMAGE" });
      } else if (ctrlId === "fn  " || ctrlId === " nf " || ctrlId === "en  " || ctrlId === " ne ") {
        const noteText = extractNoteText(records, i);
        if (noteText && blocks.length > 0) {
          const lastBlock = blocks[blocks.length - 1];
          if (lastBlock.type === "paragraph") {
            lastBlock.footnoteText = lastBlock.footnoteText ? lastBlock.footnoteText + "; " + noteText : noteText;
          }
        }
      } else if (ctrlId === "%tok" || ctrlId === "klnk") {
        const url = extractHyperlinkUrl(rec.data);
        if (url && blocks.length > 0) {
          const lastBlock = blocks[blocks.length - 1];
          if (lastBlock.type === "paragraph" && !lastBlock.href) {
            lastBlock.href = sanitizeHref(url) ?? void 0;
          }
        }
      }
    }
    i++;
  }
  return blocks;
}
function extractNoteText(records, ctrlIdx) {
  const ctrlLevel = records[ctrlIdx].level;
  const texts = [];
  let textRecords = [];
  let equations = [];
  const flushText = () => {
    const text = renderTextWithEquations(textRecords, equations).trim();
    if (text) texts.push(text);
    textRecords = [];
    equations = [];
  };
  for (let j = ctrlIdx + 1; j < records.length && j < ctrlIdx + 100; j++) {
    const r = records[j];
    if (r.level <= ctrlLevel) break;
    if (r.tagId === TAG_PARA_HEADER) {
      flushText();
    }
    if (r.tagId === TAG_PARA_TEXT) {
      textRecords.push(r.data);
    }
    if (r.tagId === TAG_CTRL_HEADER && r.data.length >= 4) {
      const ctrlId = r.data.subarray(0, 4).toString("ascii");
      if (isEquationControlId(ctrlId)) {
        const equation = extractEquationFromControl(records, j);
        if (equation) equations.push(equation);
      }
    }
  }
  flushText();
  return texts.length > 0 ? texts.join(" ") : null;
}
function extractTextBoxText(records, ctrlIdx) {
  const ctrlLevel = records[ctrlIdx].level;
  const texts = [];
  let textRecords = [];
  let equations = [];
  const flushText = () => {
    const text = renderTextWithEquations(textRecords, equations).trim();
    if (text) texts.push(text);
    textRecords = [];
    equations = [];
  };
  for (let j = ctrlIdx + 1; j < records.length && j < ctrlIdx + 200; j++) {
    const r = records[j];
    if (r.level <= ctrlLevel) break;
    if (r.tagId === TAG_PARA_HEADER) {
      flushText();
    }
    if (r.tagId === TAG_PARA_TEXT) {
      textRecords.push(r.data);
    }
    if (r.tagId === TAG_CTRL_HEADER && r.data.length >= 4) {
      const ctrlId = r.data.subarray(0, 4).toString("ascii");
      if (isEquationControlId(ctrlId)) {
        const equation = extractEquationFromControl(records, j);
        if (equation) equations.push(equation);
      }
    }
  }
  flushText();
  return texts.length > 0 ? texts.join("\n") : null;
}
function extractHyperlinkUrl(data) {
  try {
    const httpSig = Buffer.from("http", "utf16le");
    const idx = data.indexOf(httpSig);
    if (idx >= 0) {
      let end = idx;
      while (end + 1 < data.length) {
        const ch = data.readUInt16LE(end);
        if (ch === 0) break;
        end += 2;
      }
      const url = data.subarray(idx, end).toString("utf16le");
      if (/^https?:\/\/.+/.test(url) && url.length < 2e3) {
        return url;
      }
    }
  } catch {
  }
  return null;
}
function resolveCharStyle(charShapeIds, docInfo) {
  if (charShapeIds.length === 0 || docInfo.charShapes.length === 0) return void 0;
  const freq = /* @__PURE__ */ new Map();
  let maxCount = 0, dominantId = charShapeIds[0];
  for (const id of charShapeIds) {
    const count = (freq.get(id) || 0) + 1;
    freq.set(id, count);
    if (count > maxCount) {
      maxCount = count;
      dominantId = id;
    }
  }
  const cs = docInfo.charShapes[dominantId];
  if (!cs) return void 0;
  const style = {};
  if (cs.fontSize > 0) style.fontSize = cs.fontSize / 10;
  if (cs.attrFlags & 1) style.italic = true;
  if (cs.attrFlags & 2) style.bold = true;
  return style.fontSize || style.bold || style.italic ? style : void 0;
}
function parseParagraphWithTables(records, startIdx, counter) {
  const startLevel = records[startIdx].level;
  const textRecords = [];
  const equations = [];
  const tables = [];
  const charShapeIds = [];
  const paraHeaderData = records[startIdx].data;
  const paraShapeId = paraHeaderData.length >= 10 ? paraHeaderData.readUInt16LE(8) : -1;
  let i = startIdx + 1;
  while (i < records.length) {
    const rec = records[i];
    if (rec.tagId === TAG_PARA_HEADER && rec.level <= startLevel) break;
    if (rec.tagId === TAG_PARA_TEXT) {
      textRecords.push(rec.data);
    }
    if (rec.tagId === TAG_CHAR_SHAPE && rec.data.length >= 8) {
      for (let offset = 0; offset + 7 < rec.data.length; offset += 8) {
        charShapeIds.push(rec.data.readUInt32LE(offset + 4));
      }
    }
    if (rec.tagId === TAG_CTRL_HEADER && rec.data.length >= 4) {
      const ctrlId = rec.data.subarray(0, 4).toString("ascii");
      if (isEquationControlId(ctrlId)) {
        const equation = extractEquationFromControl(records, i);
        if (equation) equations.push(equation);
      } else if (ctrlId === " lbt" || ctrlId === "tbl ") {
        const { table, nextIdx } = parseTableBlock(records, i, counter);
        if (table) tables.push(table);
        i = nextIdx;
        continue;
      }
    }
    i++;
  }
  const text = renderTextWithEquations(textRecords, equations);
  const trimmed = text.trim();
  return { paragraph: trimmed || null, tables, nextIdx: i, charShapeIds, paraShapeId };
}
function parseTableBlock(records, startIdx, counter) {
  const tableLevel = records[startIdx].level;
  let i = startIdx + 1;
  let rows = 0, cols = 0;
  const cells = [];
  while (i < records.length) {
    const rec = records[i];
    if (rec.tagId === TAG_PARA_HEADER && rec.level <= tableLevel) break;
    if (rec.tagId === TAG_CTRL_HEADER && rec.level <= tableLevel) break;
    if (rec.tagId === TAG_TABLE && rec.data.length >= 8) {
      rows = Math.min(rec.data.readUInt16LE(4), MAX_ROWS);
      cols = Math.min(rec.data.readUInt16LE(6), MAX_COLS);
    }
    if (rec.tagId === TAG_LIST_HEADER) {
      const { cell, nextIdx } = parseCellBlock(records, i, tableLevel, counter);
      if (cell) cells.push(cell);
      i = nextIdx;
      continue;
    }
    i++;
  }
  if (rows === 0 || cols === 0 || cells.length === 0) return { table: null, nextIdx: i };
  const hasAddr = cells.some((c2) => c2.colAddr !== void 0 && c2.rowAddr !== void 0);
  if (hasAddr) {
    const cellRows2 = arrangeCells(rows, cols, cells);
    const irCells = cellRows2.map((row) => row.map((c2) => ({
      text: c2.text.trim(),
      colSpan: c2.colSpan,
      rowSpan: c2.rowSpan
    })));
    return { table: { rows, cols, cells: irCells, hasHeader: rows > 1 }, nextIdx: i };
  }
  const cellRows = arrangeCells(rows, cols, cells);
  return { table: buildTable(cellRows), nextIdx: i };
}
function parseCellBlock(records, startIdx, tableLevel, counter) {
  const rec = records[startIdx];
  const cellLevel = rec.level;
  const texts = [];
  let textRecords = [];
  let equations = [];
  const flushText = () => {
    const text = renderTextWithEquations(textRecords, equations).trim();
    if (text) texts.push(text);
    textRecords = [];
    equations = [];
  };
  let colSpan = 1;
  let rowSpan = 1;
  let colAddr;
  let rowAddr;
  if (rec.data.length >= 16) {
    colAddr = rec.data.readUInt16LE(8);
    rowAddr = rec.data.readUInt16LE(10);
    const cs = rec.data.readUInt16LE(12);
    const rs = rec.data.readUInt16LE(14);
    if (cs > 0) colSpan = Math.min(cs, MAX_COLS);
    if (rs > 0) rowSpan = Math.min(rs, MAX_ROWS);
  }
  let i = startIdx + 1;
  while (i < records.length) {
    const r = records[i];
    if (r.tagId === TAG_LIST_HEADER && r.level <= cellLevel) break;
    if (r.level <= tableLevel && (r.tagId === TAG_PARA_HEADER || r.tagId === TAG_CTRL_HEADER)) break;
    if (r.tagId === TAG_PARA_HEADER) {
      flushText();
    }
    if (r.tagId === TAG_PARA_TEXT) {
      textRecords.push(r.data);
    }
    if (r.tagId === TAG_CTRL_HEADER && r.data.length >= 4) {
      const ctrlId = r.data.subarray(0, 4).toString("ascii");
      if (isEquationControlId(ctrlId)) {
        const equation = extractEquationFromControl(records, i);
        if (equation) equations.push(equation);
      } else if (ctrlId === " lbt" || ctrlId === "tbl ") {
        flushText();
        if (counter) {
          counter.count++;
          texts.push(`[\uC911\uCCA9 \uD14C\uC774\uBE14 #${counter.count}]`);
        } else {
          texts.push("[\uC911\uCCA9 \uD14C\uC774\uBE14]");
        }
      }
    }
    i++;
  }
  flushText();
  return { cell: { text: texts.join("\n"), colSpan, rowSpan, colAddr, rowAddr }, nextIdx: i };
}
function arrangeCells(rows, cols, cells) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  const hasAddr = cells.some((c2) => c2.colAddr !== void 0 && c2.rowAddr !== void 0);
  if (hasAddr) {
    for (const cell of cells) {
      const r = cell.rowAddr ?? 0;
      const c2 = cell.colAddr ?? 0;
      if (r >= rows || c2 >= cols) continue;
      grid[r][c2] = cell;
      for (let dr = 0; dr < cell.rowSpan; dr++) {
        for (let dc = 0; dc < cell.colSpan; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (r + dr < rows && c2 + dc < cols)
            grid[r + dr][c2 + dc] = { text: "", colSpan: 1, rowSpan: 1 };
        }
      }
    }
  } else {
    let cellIdx = 0;
    for (let r = 0; r < rows && cellIdx < cells.length; r++) {
      for (let c2 = 0; c2 < cols && cellIdx < cells.length; c2++) {
        if (grid[r][c2] !== null) continue;
        const cell = cells[cellIdx++];
        grid[r][c2] = cell;
        for (let dr = 0; dr < cell.rowSpan; dr++) {
          for (let dc = 0; dc < cell.colSpan; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (r + dr < rows && c2 + dc < cols)
              grid[r + dr][c2 + dc] = { text: "", colSpan: 1, rowSpan: 1 };
          }
        }
      }
    }
  }
  return grid.map((row) => row.map((c2) => c2 || { text: "", colSpan: 1, rowSpan: 1 }));
}
var cfbRequire, CFB, MAX_SECTIONS, MAX_TOTAL_DECOMPRESS, TAG_SHAPE_COMPONENT, CTRL_ID_EQEDIT;
var init_parser2 = __esm({
  "src/hwp5/parser.ts"() {
    "use strict";
    init_record();
    init_crypto();
    init_equation2();
    init_cfb_lenient();
    init_builder();
    init_types();
    init_utils();
    init_page_range();
    cfbRequire = createRequire(
      typeof __filename !== "undefined" ? __filename : import.meta.url
    );
    CFB = cfbRequire("cfb");
    MAX_SECTIONS = 100;
    MAX_TOTAL_DECOMPRESS = 100 * 1024 * 1024;
    TAG_SHAPE_COMPONENT = 74;
    CTRL_ID_EQEDIT = "deqe";
  }
});

// src/hwp5/sentinel.ts
function isDistributionSentinel(markdown) {
  if (!markdown) return false;
  const hit = SENTINEL_PATTERNS.some((p) => p.test(markdown));
  if (!hit) return false;
  const stripped = markdown.split(/\r?\n/).filter((line) => !SENTINEL_PATTERNS.some((p) => p.test(line))).join("").replace(/\s+/g, "");
  return stripped.length < 120;
}
var SENTINEL_PATTERNS;
var init_sentinel = __esm({
  "src/hwp5/sentinel.ts"() {
    "use strict";
    SENTINEL_PATTERNS = [
      /상위\s*버전의\s*배포용\s*문서/,
      /최신\s*버전의\s*한글.*뷰어/,
      /문서를\s*읽으려면/
    ];
  }
});

// src/xlsx/parser.ts
import JSZip3 from "jszip";
import { DOMParser as DOMParser2 } from "@xmldom/xmldom";
function cleanNumericValue(raw) {
  if (!/^-?\d+\.\d+$/.test(raw)) return raw;
  const num = parseFloat(raw);
  if (!isFinite(num)) return raw;
  const cleaned = parseFloat(num.toPrecision(15)).toString();
  return cleaned;
}
function parseCellRef(ref) {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: parseInt(m[2], 10) - 1 };
}
function parseMergeRef(ref) {
  const parts = ref.split(":");
  if (parts.length !== 2) return null;
  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  if (!start || !end) return null;
  return { startCol: start.col, startRow: start.row, endCol: end.col, endRow: end.row };
}
function getElements(parent, tagName) {
  const nodes = parent.getElementsByTagName(tagName);
  const result = [];
  for (let i = 0; i < nodes.length; i++) result.push(nodes[i]);
  return result;
}
function getTextContent(el) {
  return el.textContent?.trim() ?? "";
}
function parseXml(text) {
  return new DOMParser2().parseFromString(stripDtd(text), "text/xml");
}
function parseSharedStrings(xml) {
  const doc = parseXml(xml);
  const strings = [];
  const siList = getElements(doc.documentElement, "si");
  for (const si of siList) {
    const tElements = getElements(si, "t");
    strings.push(tElements.map((t) => t.textContent ?? "").join(""));
  }
  return strings;
}
function parseWorkbook(xml) {
  const doc = parseXml(xml);
  const sheets = [];
  const sheetElements = getElements(doc.documentElement, "sheet");
  for (const el of sheetElements) {
    sheets.push({
      name: el.getAttribute("name") ?? `Sheet${sheets.length + 1}`,
      sheetId: el.getAttribute("sheetId") ?? "",
      rId: el.getAttribute("r:id") ?? ""
    });
  }
  return sheets;
}
function parseRels(xml) {
  const doc = parseXml(xml);
  const map = /* @__PURE__ */ new Map();
  const rels = getElements(doc.documentElement, "Relationship");
  for (const rel of rels) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) map.set(id, target);
  }
  return map;
}
function parseWorksheet(xml, sharedStrings) {
  const doc = parseXml(xml);
  const grid = [];
  let maxRow = 0;
  let maxCol = 0;
  const rows = getElements(doc.documentElement, "row");
  for (const rowEl of rows) {
    const rowNum = parseInt(rowEl.getAttribute("r") ?? "0", 10) - 1;
    if (rowNum < 0 || rowNum >= MAX_ROWS2) continue;
    const cells = getElements(rowEl, "c");
    for (const cellEl of cells) {
      const ref = cellEl.getAttribute("r");
      if (!ref) continue;
      const pos = parseCellRef(ref);
      if (!pos || pos.col >= MAX_COLS2) continue;
      const type = cellEl.getAttribute("t");
      const vElements = getElements(cellEl, "v");
      const fElements = getElements(cellEl, "f");
      let value = "";
      if (vElements.length > 0) {
        const raw = getTextContent(vElements[0]);
        if (type === "s") {
          const idx = parseInt(raw, 10);
          value = sharedStrings[idx] ?? "";
        } else if (type === "b") {
          value = raw === "1" ? "TRUE" : "FALSE";
        } else {
          value = cleanNumericValue(raw);
        }
      } else if (type === "inlineStr") {
        const isEl = getElements(cellEl, "is");
        if (isEl.length > 0) {
          const tElements = getElements(isEl[0], "t");
          value = tElements.map((t) => t.textContent ?? "").join("");
        }
      }
      if (!value && fElements.length > 0) {
        value = `=${getTextContent(fElements[0])}`;
      }
      while (grid.length <= pos.row) grid.push([]);
      while (grid[pos.row].length <= pos.col) grid[pos.row].push("");
      grid[pos.row][pos.col] = value;
      if (pos.row > maxRow) maxRow = pos.row;
      if (pos.col > maxCol) maxCol = pos.col;
    }
  }
  const merges = [];
  const mergeCellElements = getElements(doc.documentElement, "mergeCell");
  for (const el of mergeCellElements) {
    const ref = el.getAttribute("ref");
    if (!ref) continue;
    const m = parseMergeRef(ref);
    if (m) merges.push(m);
  }
  return { grid, merges, maxRow, maxCol };
}
function sheetToBlocks(sheetName, grid, merges, maxRow, maxCol, sheetIndex) {
  const blocks = [];
  if (sheetName) {
    blocks.push({
      type: "heading",
      text: sheetName,
      level: 2,
      pageNumber: sheetIndex + 1
    });
  }
  if (maxRow < 0 || maxCol < 0 || grid.length === 0) return blocks;
  const mergeMap = /* @__PURE__ */ new Map();
  const mergeSkip = /* @__PURE__ */ new Set();
  for (const m of merges) {
    const colSpan = m.endCol - m.startCol + 1;
    const rowSpan = m.endRow - m.startRow + 1;
    mergeMap.set(`${m.startRow},${m.startCol}`, { colSpan, rowSpan });
    for (let r = m.startRow; r <= m.endRow; r++) {
      for (let c2 = m.startCol; c2 <= m.endCol; c2++) {
        if (r !== m.startRow || c2 !== m.startCol) {
          mergeSkip.add(`${r},${c2}`);
        }
      }
    }
  }
  let firstRow = -1;
  let lastRow = -1;
  for (let r = 0; r <= maxRow; r++) {
    const row = grid[r];
    if (row && row.some((cell) => cell !== "")) {
      if (firstRow === -1) firstRow = r;
      lastRow = r;
    }
  }
  if (firstRow === -1) return blocks;
  const cellRows = [];
  for (let r = firstRow; r <= lastRow; r++) {
    const row = [];
    for (let c2 = 0; c2 <= maxCol; c2++) {
      const key = `${r},${c2}`;
      if (mergeSkip.has(key)) continue;
      const text = (grid[r] && grid[r][c2]) ?? "";
      const merge = mergeMap.get(key);
      row.push({
        text,
        colSpan: merge?.colSpan ?? 1,
        rowSpan: merge?.rowSpan ?? 1
      });
    }
    cellRows.push(row);
  }
  if (cellRows.length > 0) {
    const table = buildTable(cellRows);
    if (table.rows > 0) {
      blocks.push({ type: "table", table, pageNumber: sheetIndex + 1 });
    }
  }
  return blocks;
}
async function parseXlsxDocument(buffer, options) {
  precheckZipSize(buffer, MAX_DECOMPRESS_SIZE3);
  const zip = await JSZip3.loadAsync(buffer);
  const warnings = [];
  const workbookFile = zip.file("xl/workbook.xml");
  if (!workbookFile) {
    throw new KordocError("\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 XLSX \uD30C\uC77C: xl/workbook.xml\uC774 \uC5C6\uC2B5\uB2C8\uB2E4");
  }
  let sharedStrings = [];
  const ssFile = zip.file("xl/sharedStrings.xml");
  if (ssFile) {
    sharedStrings = parseSharedStrings(await ssFile.async("text"));
  }
  const sheets = parseWorkbook(await workbookFile.async("text"));
  if (sheets.length === 0) {
    throw new KordocError("XLSX \uD30C\uC77C\uC5D0 \uC2DC\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4");
  }
  let relsMap = /* @__PURE__ */ new Map();
  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (relsFile) {
    relsMap = parseRels(await relsFile.async("text"));
  }
  let pageFilter = null;
  if (options?.pages) {
    const { parsePageRange: parsePageRange2 } = await Promise.resolve().then(() => (init_page_range(), page_range_exports));
    pageFilter = parsePageRange2(options.pages, sheets.length);
  }
  const blocks = [];
  const processedSheets = Math.min(sheets.length, MAX_SHEETS);
  for (let i = 0; i < processedSheets; i++) {
    if (pageFilter && !pageFilter.has(i + 1)) continue;
    const sheet = sheets[i];
    options?.onProgress?.(i + 1, processedSheets);
    let sheetPath = relsMap.get(sheet.rId);
    if (sheetPath) {
      if (!sheetPath.startsWith("xl/") && !sheetPath.startsWith("/")) {
        sheetPath = `xl/${sheetPath}`;
      } else if (sheetPath.startsWith("/")) {
        sheetPath = sheetPath.slice(1);
      }
    } else {
      sheetPath = `xl/worksheets/sheet${i + 1}.xml`;
    }
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) {
      warnings.push({
        page: i + 1,
        message: `\uC2DC\uD2B8 "${sheet.name}" \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${sheetPath}`,
        code: "PARTIAL_PARSE"
      });
      continue;
    }
    try {
      const sheetXml = await sheetFile.async("text");
      const { grid, merges, maxRow, maxCol } = parseWorksheet(sheetXml, sharedStrings);
      const sheetBlocks = sheetToBlocks(sheet.name, grid, merges, maxRow, maxCol, i);
      blocks.push(...sheetBlocks);
    } catch (err) {
      warnings.push({
        page: i + 1,
        message: `\uC2DC\uD2B8 "${sheet.name}" \uD30C\uC2F1 \uC2E4\uD328: ${err instanceof Error ? err.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958"}`,
        code: "PARTIAL_PARSE"
      });
    }
  }
  const metadata = {
    pageCount: processedSheets
  };
  const coreFile = zip.file("docProps/core.xml");
  if (coreFile) {
    try {
      const coreXml = await coreFile.async("text");
      const doc = parseXml(coreXml);
      const getFirst = (tag) => {
        const els = doc.getElementsByTagName(tag);
        return els.length > 0 ? (els[0].textContent ?? "").trim() : void 0;
      };
      metadata.title = getFirst("dc:title") || getFirst("dcterms:title");
      metadata.author = getFirst("dc:creator");
      metadata.description = getFirst("dc:description");
      const created = getFirst("dcterms:created");
      if (created) metadata.createdAt = created;
      const modified = getFirst("dcterms:modified");
      if (modified) metadata.modifiedAt = modified;
    } catch {
    }
  }
  const markdown = blocksToMarkdown(blocks);
  return { markdown, blocks, metadata, warnings: warnings.length > 0 ? warnings : void 0 };
}
var MAX_SHEETS, MAX_DECOMPRESS_SIZE3, MAX_ROWS2, MAX_COLS2;
var init_parser3 = __esm({
  "src/xlsx/parser.ts"() {
    "use strict";
    init_utils();
    init_builder();
    MAX_SHEETS = 100;
    MAX_DECOMPRESS_SIZE3 = 100 * 1024 * 1024;
    MAX_ROWS2 = 1e4;
    MAX_COLS2 = 200;
  }
});

// src/docx/equation.ts
function lname(el) {
  return el.localName || el.tagName?.replace(/^[^:]+:/, "") || "";
}
function kids(parent, name) {
  const out = [];
  const nodes = parent.childNodes;
  if (!nodes) return out;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.nodeType !== 1) continue;
    const el = n;
    if (lname(el) === name) out.push(el);
  }
  return out;
}
function firstKid(parent, name) {
  const list = kids(parent, name);
  return list[0] ?? null;
}
function eachChild(parent) {
  const out = [];
  const nodes = parent.childNodes;
  if (!nodes) return out;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].nodeType === 1) out.push(nodes[i]);
  }
  return out;
}
function runToLatex(r) {
  let out = "";
  for (const t of kids(r, "t")) out += t.textContent ?? "";
  return out;
}
function mapDelim(ch, isLeft) {
  const l = {
    "(": "(",
    "[": "[",
    "{": "\\{",
    "\u27E8": "\\langle",
    "|": "|",
    "\u2016": "\\|",
    "\u230A": "\\lfloor",
    "\u2308": "\\lceil",
    "": "."
  };
  const r = {
    ")": ")",
    "]": "]",
    "}": "\\}",
    "\u27E9": "\\rangle",
    "|": "|",
    "\u2016": "\\|",
    "\u230B": "\\rfloor",
    "\u2309": "\\rceil",
    "": "."
  };
  const map = isLeft ? l : r;
  return map[ch] ?? ch;
}
function grp(body) {
  const s = body.trim();
  if (s.length === 0) return "{}";
  if (s.startsWith("{") && s.endsWith("}")) return s;
  return "{" + s + "}";
}
function childrenToLatex(parent) {
  let out = "";
  for (const ch of eachChild(parent)) {
    out += nodeToLatex(ch);
  }
  return out;
}
function nodeToLatex(el) {
  const tag = lname(el);
  switch (tag) {
    case "r":
      return runToLatex(el);
    case "e":
    // generic container (인자로 쓰임) — 자식 연결
    case "num":
    case "den":
    case "sub":
    case "sup":
    case "deg":
    case "lim":
    case "fName":
      return childrenToLatex(el);
    // 분수
    case "f": {
      const n = firstKid(el, "num");
      const d = firstKid(el, "den");
      const num = n ? childrenToLatex(n) : "";
      const den = d ? childrenToLatex(d) : "";
      return "\\frac" + grp(num) + grp(den);
    }
    // 첨자
    case "sSup": {
      const e = firstKid(el, "e");
      const sup = firstKid(el, "sup");
      return grp(e ? childrenToLatex(e) : "") + "^" + grp(sup ? childrenToLatex(sup) : "");
    }
    case "sSub": {
      const e = firstKid(el, "e");
      const sub = firstKid(el, "sub");
      return grp(e ? childrenToLatex(e) : "") + "_" + grp(sub ? childrenToLatex(sub) : "");
    }
    case "sSubSup": {
      const e = firstKid(el, "e");
      const sub = firstKid(el, "sub");
      const sup = firstKid(el, "sup");
      return grp(e ? childrenToLatex(e) : "") + "_" + grp(sub ? childrenToLatex(sub) : "") + "^" + grp(sup ? childrenToLatex(sup) : "");
    }
    case "sPre": {
      const sub = firstKid(el, "sub");
      const sup = firstKid(el, "sup");
      const e = firstKid(el, "e");
      const preSub = sub ? grp(childrenToLatex(sub)) : "{}";
      const preSup = sup ? grp(childrenToLatex(sup)) : "{}";
      const body = e ? childrenToLatex(e) : "";
      return "{}_" + preSub + "^" + preSup + grp(body);
    }
    // 근호
    case "rad": {
      const deg = firstKid(el, "deg");
      const e = firstKid(el, "e");
      const body = e ? childrenToLatex(e) : "";
      const radPr = firstKid(el, "radPr");
      let hide = false;
      if (radPr) {
        const degHide = firstKid(radPr, "degHide");
        if (degHide) {
          const val = degHide.getAttribute("m:val") ?? degHide.getAttribute("val");
          hide = val === "1" || val === "on" || val === "true";
        }
      }
      const degStr = !hide && deg ? childrenToLatex(deg).trim() : "";
      return degStr ? "\\sqrt[" + degStr + "]" + grp(body) : "\\sqrt" + grp(body);
    }
    // n-ary 연산자 (sum, prod, int, …)
    case "nary": {
      const naryPr = firstKid(el, "naryPr");
      let op = "\\int";
      let subHide = false;
      let supHide = false;
      let limLoc = "";
      if (naryPr) {
        const chr = firstKid(naryPr, "chr");
        if (chr) {
          const v = chr.getAttribute("m:val") ?? chr.getAttribute("val") ?? "";
          if (v && NARY_MAP[v]) op = NARY_MAP[v];
          else if (v) op = v;
        } else {
          op = "\\int";
        }
        const sh = firstKid(naryPr, "subHide");
        const ph = firstKid(naryPr, "supHide");
        if (sh) subHide = (sh.getAttribute("m:val") ?? sh.getAttribute("val")) !== "0";
        if (ph) supHide = (ph.getAttribute("m:val") ?? ph.getAttribute("val")) !== "0";
        const ll = firstKid(naryPr, "limLoc");
        if (ll) limLoc = ll.getAttribute("m:val") ?? ll.getAttribute("val") ?? "";
      }
      const sub = firstKid(el, "sub");
      const sup = firstKid(el, "sup");
      const e = firstKid(el, "e");
      const subStr = !subHide && sub ? childrenToLatex(sub) : "";
      const supStr = !supHide && sup ? childrenToLatex(sup) : "";
      const body = e ? childrenToLatex(e) : "";
      let head = op;
      if (limLoc === "undOvr") {
        if (subStr) head += "_" + grp(subStr);
        if (supStr) head += "^" + grp(supStr);
      } else {
        if (subStr) head += "_" + grp(subStr);
        if (supStr) head += "^" + grp(supStr);
      }
      return head + " " + body;
    }
    // 괄호 (delimiter)
    case "d": {
      const dPr = firstKid(el, "dPr");
      let beg = "(";
      let end = ")";
      let sep2 = ",";
      if (dPr) {
        const begChr = firstKid(dPr, "begChr");
        const endChr = firstKid(dPr, "endChr");
        const sepChr = firstKid(dPr, "sepChr");
        if (begChr) beg = begChr.getAttribute("m:val") ?? begChr.getAttribute("val") ?? beg;
        if (endChr) end = endChr.getAttribute("m:val") ?? endChr.getAttribute("val") ?? end;
        if (sepChr) sep2 = sepChr.getAttribute("m:val") ?? sepChr.getAttribute("val") ?? sep2;
      }
      const items = kids(el, "e").map(childrenToLatex);
      const body = items.join(sep2);
      return "\\left" + mapDelim(beg, true) + body + "\\right" + mapDelim(end, false);
    }
    // 행렬
    case "m": {
      const rows = [];
      for (const mr of kids(el, "mr")) {
        const cells = kids(mr, "e").map(childrenToLatex);
        rows.push(cells.join(" & "));
      }
      return "\\begin{matrix}" + rows.join(" \\\\ ") + "\\end{matrix}";
    }
    // 상자/박스 (acc 와 유사하지만 bar 가 아닌 box)
    case "box":
      return childrenToLatex(el);
    // 함수 적용 (sin, cos, log …)
    case "func": {
      const fn = firstKid(el, "fName");
      const e = firstKid(el, "e");
      const fnStr = fn ? childrenToLatex(fn).trim() : "";
      const body = e ? childrenToLatex(e) : "";
      const fnLatex = FUNC_NAMES.has(fnStr) ? "\\" + fnStr : fnStr;
      return fnLatex + grp(body);
    }
    // 악센트 (hat/bar/vec/…)
    case "acc": {
      const accPr = firstKid(el, "accPr");
      let chr = "";
      if (accPr) {
        const chrEl = firstKid(accPr, "chr");
        if (chrEl) chr = chrEl.getAttribute("m:val") ?? chrEl.getAttribute("val") ?? "";
      }
      if (!chr) chr = "\u0302";
      const e = firstKid(el, "e");
      const body = e ? childrenToLatex(e) : "";
      const cmd = ACCENT_MAP[chr] ?? "\\hat";
      return cmd + grp(body);
    }
    // bar (위/아래 줄)
    case "bar": {
      const barPr = firstKid(el, "barPr");
      let pos = "top";
      if (barPr) {
        const posEl = firstKid(barPr, "pos");
        if (posEl) pos = posEl.getAttribute("m:val") ?? posEl.getAttribute("val") ?? pos;
      }
      const e = firstKid(el, "e");
      const body = e ? childrenToLatex(e) : "";
      return (pos === "bot" ? "\\underline" : "\\overline") + grp(body);
    }
    // lim 위/아래
    case "limLow": {
      const e = firstKid(el, "e");
      const lim = firstKid(el, "lim");
      const base = e ? childrenToLatex(e).trim() : "";
      const below = lim ? childrenToLatex(lim) : "";
      if (FUNC_NAMES.has(base)) return "\\" + base + "_" + grp(below);
      return base + "_" + grp(below);
    }
    case "limUpp": {
      const e = firstKid(el, "e");
      const lim = firstKid(el, "lim");
      const base = e ? childrenToLatex(e).trim() : "";
      const above = lim ? childrenToLatex(lim) : "";
      if (FUNC_NAMES.has(base)) return "\\" + base + "^" + grp(above);
      return base + "^" + grp(above);
    }
    // group character (over/underset 비슷)
    case "groupChr":
      return childrenToLatex(firstKid(el, "e") ?? el);
    // box/borderBox/phantom/eqArr/… 는 자식 본문만 유지
    case "borderBox":
    case "phant":
    case "eqArr":
      return childrenToLatex(el);
    // 최상위 컨테이너
    case "oMath":
    case "oMathPara":
      return childrenToLatex(el);
    // 메타 — 속성만 들어있으므로 출력 제외
    case "rPr":
    case "fPr":
    case "sSubPr":
    case "sSupPr":
    case "sSubSupPr":
    case "radPr":
    case "naryPr":
    case "dPr":
    case "accPr":
    case "barPr":
    case "funcPr":
    case "mPr":
    case "ctrlPr":
      return "";
    default:
      return childrenToLatex(el);
  }
}
function isOmmlRoot(el) {
  const t = lname(el);
  return t === "oMath" || t === "oMathPara";
}
function ommlElementToLatex(el) {
  if (!isOmmlRoot(el)) return "";
  const raw = childrenToLatex(el);
  return raw.replace(/\s+/g, " ").trim();
}
function isDisplayMath(el) {
  return lname(el) === "oMathPara";
}
var FUNC_NAMES, ACCENT_MAP, NARY_MAP;
var init_equation3 = __esm({
  "src/docx/equation.ts"() {
    "use strict";
    FUNC_NAMES = /* @__PURE__ */ new Set([
      "sin",
      "cos",
      "tan",
      "cot",
      "sec",
      "csc",
      "sinh",
      "cosh",
      "tanh",
      "coth",
      "arcsin",
      "arccos",
      "arctan",
      "log",
      "ln",
      "lg",
      "exp",
      "det",
      "dim",
      "gcd",
      "inf",
      "sup",
      "lim",
      "max",
      "min",
      "Pr",
      "arg"
    ]);
    ACCENT_MAP = {
      "\u0302": "\\hat",
      // U+0302 COMBINING CIRCUMFLEX
      "\u0303": "\\tilde",
      // U+0303
      "\u0304": "\\bar",
      // U+0304
      "\u0307": "\\dot",
      // U+0307
      "\u0308": "\\ddot",
      // U+0308
      "\u0301": "\\acute",
      // U+0301
      "\u0300": "\\grave",
      // U+0300
      "\u0306": "\\breve",
      // U+0306
      "\u030C": "\\check",
      // U+030C
      "\u20D7": "\\vec",
      // U+20D7 COMBINING RIGHT ARROW ABOVE
      "\u2192": "\\vec"
    };
    NARY_MAP = {
      "\u2211": "\\sum",
      "\u220F": "\\prod",
      "\u2210": "\\coprod",
      "\u222B": "\\int",
      "\u222C": "\\iint",
      "\u222D": "\\iiint",
      "\u222E": "\\oint",
      "\u222F": "\\oiint",
      "\u2230": "\\oiiint",
      "\u22C3": "\\bigcup",
      "\u22C2": "\\bigcap",
      "\u2A01": "\\bigoplus",
      "\u2A02": "\\bigotimes",
      "\u2A00": "\\bigodot"
    };
  }
});

// src/docx/parser.ts
import JSZip4 from "jszip";
import { DOMParser as DOMParser3 } from "@xmldom/xmldom";
function getChildElements(parent, localName3) {
  const result = [];
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType === 1) {
      const el = node;
      if (el.localName === localName3 || el.tagName?.endsWith(`:${localName3}`)) {
        result.push(el);
      }
    }
  }
  return result;
}
function findElements(parent, localName3) {
  const result = [];
  const walk = (node) => {
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1) {
        const el = child;
        if (el.localName === localName3 || el.tagName?.endsWith(`:${localName3}`)) {
          result.push(el);
        }
        walk(el);
      }
    }
  };
  walk(parent);
  return result;
}
function getAttr(el, localName3) {
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    if (attr.localName === localName3 || attr.name === localName3) return attr.value;
  }
  return null;
}
function parseXml2(text) {
  return new DOMParser3().parseFromString(stripDtd(text), "text/xml");
}
function parseStyles(xml) {
  const doc = parseXml2(xml);
  const styles = /* @__PURE__ */ new Map();
  const styleElements = findElements(doc, "style");
  for (const el of styleElements) {
    const styleId = getAttr(el, "styleId");
    if (!styleId) continue;
    const nameEls = getChildElements(el, "name");
    const name = nameEls.length > 0 ? getAttr(nameEls[0], "val") ?? "" : "";
    const basedOnEls = getChildElements(el, "basedOn");
    const basedOn = basedOnEls.length > 0 ? getAttr(basedOnEls[0], "val") ?? void 0 : void 0;
    const pPrEls = getChildElements(el, "pPr");
    let outlineLevel;
    if (pPrEls.length > 0) {
      const outlineEls = getChildElements(pPrEls[0], "outlineLvl");
      if (outlineEls.length > 0) {
        const val = getAttr(outlineEls[0], "val");
        if (val !== null) outlineLevel = parseInt(val, 10);
      }
    }
    if (outlineLevel === void 0) {
      const headingMatch = name.match(/^(?:heading|Heading)\s*(\d+)$/i);
      if (headingMatch) outlineLevel = parseInt(headingMatch[1], 10) - 1;
    }
    styles.set(styleId, { name, basedOn, outlineLevel });
  }
  return styles;
}
function parseNumbering(xml) {
  const doc = parseXml2(xml);
  const abstractNums = /* @__PURE__ */ new Map();
  const abstractElements = findElements(doc, "abstractNum");
  for (const el of abstractElements) {
    const abstractNumId = getAttr(el, "abstractNumId");
    if (!abstractNumId) continue;
    const levels = /* @__PURE__ */ new Map();
    const lvlElements = getChildElements(el, "lvl");
    for (const lvl of lvlElements) {
      const ilvl = parseInt(getAttr(lvl, "ilvl") ?? "0", 10);
      const numFmtEls = getChildElements(lvl, "numFmt");
      const numFmt = numFmtEls.length > 0 ? getAttr(numFmtEls[0], "val") ?? "bullet" : "bullet";
      levels.set(ilvl, { numFmt, level: ilvl });
    }
    abstractNums.set(abstractNumId, levels);
  }
  const nums = /* @__PURE__ */ new Map();
  const numElements = findElements(doc, "num");
  for (const el of numElements) {
    const numId = getAttr(el, "numId");
    if (!numId) continue;
    const abstractRefs = getChildElements(el, "abstractNumId");
    if (abstractRefs.length > 0) {
      const ref = getAttr(abstractRefs[0], "val");
      if (ref && abstractNums.has(ref)) {
        nums.set(numId, abstractNums.get(ref));
      }
    }
  }
  return nums;
}
function parseRels2(xml) {
  const doc = parseXml2(xml);
  const map = /* @__PURE__ */ new Map();
  const rels = findElements(doc, "Relationship");
  for (const rel of rels) {
    const id = getAttr(rel, "Id");
    const target = getAttr(rel, "Target");
    if (id && target) map.set(id, target);
  }
  return map;
}
function parseFootnotes(xml) {
  const doc = parseXml2(xml);
  const notes = /* @__PURE__ */ new Map();
  const fnElements = findElements(doc, "footnote");
  for (const fn of fnElements) {
    const id = getAttr(fn, "id");
    if (!id || id === "0" || id === "-1") continue;
    const texts = [];
    const pElements = findElements(fn, "p");
    for (const p of pElements) {
      const runs = findElements(p, "r");
      for (const r of runs) {
        const tElements = getChildElements(r, "t");
        for (const t of tElements) texts.push(t.textContent ?? "");
      }
    }
    notes.set(id, texts.join("").trim());
  }
  return notes;
}
function collectOmmlRoots(p) {
  const out = [];
  const walk = (node) => {
    const children = node.childNodes;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType !== 1) continue;
      const el = child;
      const tag = el.localName || el.tagName?.replace(/^[^:]+:/, "") || "";
      if (tag === "oMath" || tag === "oMathPara") {
        out.push(el);
      } else {
        walk(el);
      }
    }
  };
  walk(p);
  return out;
}
function extractRun(r) {
  const tElements = getChildElements(r, "t");
  const text = tElements.map((t) => t.textContent ?? "").join("");
  let bold = false;
  let italic = false;
  const rPrEls = getChildElements(r, "rPr");
  if (rPrEls.length > 0) {
    bold = getChildElements(rPrEls[0], "b").length > 0;
    italic = getChildElements(rPrEls[0], "i").length > 0;
  }
  return { text, bold, italic };
}
function parseParagraph(p, styles, numbering, footnotes, rels) {
  const pPrEls = getChildElements(p, "pPr");
  let styleId = "";
  let numId = "";
  let ilvl = 0;
  if (pPrEls.length > 0) {
    const pStyleEls = getChildElements(pPrEls[0], "pStyle");
    if (pStyleEls.length > 0) styleId = getAttr(pStyleEls[0], "val") ?? "";
    const numPrEls = getChildElements(pPrEls[0], "numPr");
    if (numPrEls.length > 0) {
      const numIdEls = getChildElements(numPrEls[0], "numId");
      const ilvlEls = getChildElements(numPrEls[0], "ilvl");
      numId = numIdEls.length > 0 ? getAttr(numIdEls[0], "val") ?? "" : "";
      ilvl = ilvlEls.length > 0 ? parseInt(getAttr(ilvlEls[0], "val") ?? "0", 10) : 0;
    }
  }
  const parts = [];
  let hasBold = false;
  let hasItalic = false;
  let href;
  let footnoteText;
  const hyperlinks = getChildElements(p, "hyperlink");
  const hyperlinkTexts = /* @__PURE__ */ new Set();
  for (const hl of hyperlinks) {
    const rId = getAttr(hl, "id");
    const hlText = [];
    const runs2 = findElements(hl, "r");
    for (const r of runs2) {
      const result = extractRun(r);
      hlText.push(result.text);
    }
    const text2 = hlText.join("");
    if (text2) {
      hyperlinkTexts.add(text2);
      if (rId && rels.has(rId)) {
        href = rels.get(rId);
        parts.push(text2);
      } else {
        parts.push(text2);
      }
    }
  }
  const runs = getChildElements(p, "r");
  for (const r of runs) {
    if (r.parentNode && r.parentNode.localName === "hyperlink") continue;
    const result = extractRun(r);
    if (result.bold) hasBold = true;
    if (result.italic) hasItalic = true;
    const fnRefEls = getChildElements(r, "footnoteReference");
    if (fnRefEls.length > 0) {
      const fnId = getAttr(fnRefEls[0], "id");
      if (fnId && footnotes.has(fnId)) {
        footnoteText = footnotes.get(fnId);
      }
    }
    if (result.text) parts.push(result.text);
  }
  for (const om of collectOmmlRoots(p)) {
    const latex = ommlElementToLatex(om);
    if (!latex) continue;
    if (isDisplayMath(om)) parts.push(" $$" + latex + "$$ ");
    else parts.push(" $" + latex + "$ ");
  }
  const text = parts.join("").replace(/[ \t]{2,}/g, " ").trim();
  if (!text) return null;
  const style = styles.get(styleId);
  if (style?.outlineLevel !== void 0 && style.outlineLevel >= 0 && style.outlineLevel <= 5) {
    return {
      type: "heading",
      text,
      level: style.outlineLevel + 1
    };
  }
  if (numId && numId !== "0") {
    const numDef = numbering.get(numId);
    const levelInfo = numDef?.get(ilvl);
    const listType = levelInfo?.numFmt === "bullet" ? "unordered" : "ordered";
    return { type: "list", text, listType };
  }
  const block = { type: "paragraph", text };
  if (hasBold || hasItalic) {
    block.style = { bold: hasBold || void 0, italic: hasItalic || void 0 };
  }
  if (href) block.href = href;
  if (footnoteText) block.footnoteText = footnoteText;
  return block;
}
function parseTable(tbl, styles, numbering, footnotes, rels) {
  const trElements = getChildElements(tbl, "tr");
  if (trElements.length === 0) return null;
  const rows = [];
  let maxCols = 0;
  for (const tr of trElements) {
    const tcElements = getChildElements(tr, "tc");
    const row = [];
    for (const tc of tcElements) {
      let colSpan = 1;
      let rowSpan = 1;
      const tcPrEls = getChildElements(tc, "tcPr");
      if (tcPrEls.length > 0) {
        const gridSpanEls = getChildElements(tcPrEls[0], "gridSpan");
        if (gridSpanEls.length > 0) {
          colSpan = parseInt(getAttr(gridSpanEls[0], "val") ?? "1", 10);
        }
        const vMergeEls = getChildElements(tcPrEls[0], "vMerge");
        if (vMergeEls.length > 0) {
          const val = getAttr(vMergeEls[0], "val");
          if (val !== "restart" && val !== null) {
            row.push({ text: "", colSpan, rowSpan: 0 });
            continue;
          }
        }
      }
      const cellTexts = [];
      const pElements = getChildElements(tc, "p");
      for (const p of pElements) {
        const block = parseParagraph(p, styles, numbering, footnotes, rels);
        if (block?.text) cellTexts.push(block.text);
      }
      row.push({ text: cellTexts.join("\n"), colSpan, rowSpan });
    }
    rows.push(row);
    if (row.length > maxCols) maxCols = row.length;
  }
  for (let c2 = 0; c2 < maxCols; c2++) {
    for (let r = 0; r < rows.length; r++) {
      const cell = rows[r][c2];
      if (!cell || cell.rowSpan === 0) continue;
      let span = 1;
      for (let nr = r + 1; nr < rows.length; nr++) {
        if (rows[nr][c2]?.rowSpan === 0) span++;
        else break;
      }
      cell.rowSpan = span;
    }
  }
  const cleanRows = [];
  for (const row of rows) {
    const clean = row.filter((cell) => cell.rowSpan !== 0);
    cleanRows.push(clean);
  }
  if (cleanRows.length === 0) return null;
  let cols = 0;
  for (const row of cleanRows) {
    let c2 = 0;
    for (const cell of row) c2 += cell.colSpan;
    if (c2 > cols) cols = c2;
  }
  const table = {
    rows: cleanRows.length,
    cols,
    cells: cleanRows,
    hasHeader: cleanRows.length > 1
  };
  return { type: "table", table };
}
async function extractImages(zip, rels, doc) {
  const blocks = [];
  const images = [];
  const drawingElements = findElements(doc.documentElement, "drawing");
  let imgIdx = 0;
  for (const drawing of drawingElements) {
    const blips = findElements(drawing, "blip");
    for (const blip of blips) {
      const embedId = getAttr(blip, "embed");
      if (!embedId) continue;
      const target = rels.get(embedId);
      if (!target) continue;
      const imgPath = target.startsWith("/") ? target.slice(1) : target.startsWith("word/") ? target : `word/${target}`;
      const imgFile = zip.file(imgPath);
      if (!imgFile) continue;
      try {
        const data = await imgFile.async("uint8array");
        imgIdx++;
        const ext = imgPath.split(".").pop()?.toLowerCase() ?? "png";
        const mimeMap = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          bmp: "image/bmp",
          wmf: "image/wmf",
          emf: "image/emf"
        };
        const filename = `image_${String(imgIdx).padStart(3, "0")}.${ext}`;
        images.push({ filename, data, mimeType: mimeMap[ext] ?? "image/png" });
        blocks.push({ type: "image", text: filename });
      } catch {
      }
    }
  }
  return { blocks, images };
}
async function parseDocxDocument(buffer, options) {
  precheckZipSize(buffer, MAX_DECOMPRESS_SIZE4);
  const zip = await JSZip4.loadAsync(buffer);
  const warnings = [];
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new KordocError("\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 DOCX \uD30C\uC77C: word/document.xml\uC774 \uC5C6\uC2B5\uB2C8\uB2E4");
  }
  let rels = /* @__PURE__ */ new Map();
  const relsFile = zip.file("word/_rels/document.xml.rels");
  if (relsFile) {
    rels = parseRels2(await relsFile.async("text"));
  }
  let styles = /* @__PURE__ */ new Map();
  const stylesFile = zip.file("word/styles.xml");
  if (stylesFile) {
    try {
      styles = parseStyles(await stylesFile.async("text"));
    } catch {
    }
  }
  let numbering = /* @__PURE__ */ new Map();
  const numFile = zip.file("word/numbering.xml");
  if (numFile) {
    try {
      numbering = parseNumbering(await numFile.async("text"));
    } catch {
    }
  }
  let footnotes = /* @__PURE__ */ new Map();
  const fnFile = zip.file("word/footnotes.xml");
  if (fnFile) {
    try {
      footnotes = parseFootnotes(await fnFile.async("text"));
    } catch {
    }
  }
  const docXml = await docFile.async("text");
  const doc = parseXml2(docXml);
  const body = findElements(doc, "body");
  if (body.length === 0) {
    throw new KordocError("DOCX \uBCF8\uBB38(w:body)\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
  }
  const blocks = [];
  const bodyEl = body[0];
  const children = bodyEl.childNodes;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType !== 1) continue;
    const el = node;
    const localName3 = el.localName ?? el.tagName?.split(":").pop();
    if (localName3 === "p") {
      const block = parseParagraph(el, styles, numbering, footnotes, rels);
      if (block) blocks.push(block);
    } else if (localName3 === "tbl") {
      const block = parseTable(el, styles, numbering, footnotes, rels);
      if (block) blocks.push(block);
    }
  }
  const { blocks: imgBlocks, images } = await extractImages(zip, rels, doc);
  const metadata = {};
  const coreFile = zip.file("docProps/core.xml");
  if (coreFile) {
    try {
      const coreXml = await coreFile.async("text");
      const coreDoc = parseXml2(coreXml);
      const getFirst = (tag) => {
        const els = coreDoc.getElementsByTagName(tag);
        return els.length > 0 ? (els[0].textContent ?? "").trim() : void 0;
      };
      metadata.title = getFirst("dc:title") || getFirst("dcterms:title");
      metadata.author = getFirst("dc:creator");
      metadata.description = getFirst("dc:description");
      const created = getFirst("dcterms:created");
      if (created) metadata.createdAt = created;
      const modified = getFirst("dcterms:modified");
      if (modified) metadata.modifiedAt = modified;
    } catch {
    }
  }
  const outline = blocks.filter((b) => b.type === "heading").map((b) => ({ level: b.level ?? 2, text: b.text ?? "" }));
  const markdown = blocksToMarkdown(blocks);
  return {
    markdown,
    blocks,
    metadata,
    outline: outline.length > 0 ? outline : void 0,
    warnings: warnings.length > 0 ? warnings : void 0,
    images: images.length > 0 ? images : void 0
  };
}
var MAX_DECOMPRESS_SIZE4;
var init_parser4 = __esm({
  "src/docx/parser.ts"() {
    "use strict";
    init_utils();
    init_builder();
    init_equation3();
    MAX_DECOMPRESS_SIZE4 = 100 * 1024 * 1024;
  }
});

// src/hwpml/parser.ts
import { DOMParser as DOMParser4 } from "@xmldom/xmldom";
function parseHwpmlDocument(buffer, options) {
  if (buffer.byteLength > MAX_HWPML_BYTES) {
    throw new Error(`HWPML \uD30C\uC77C \uD06C\uAE30 \uCD08\uACFC (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB > 50MB)`);
  }
  const text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
  const normalized = text.replace(/&nbsp;/g, "&#160;");
  const xml = stripDtd(normalized);
  const warnings = [];
  const parser = new DOMParser4({
    onError: (_level, msg) => {
      warnings.push({ message: `HWPML XML \uD30C\uC2F1 \uACBD\uACE0: ${msg}`, code: "MALFORMED_XML" });
    }
  });
  const doc = parser.parseFromString(xml, "text/xml");
  if (!doc.documentElement) {
    return { markdown: "", blocks: [], warnings };
  }
  const root = doc.documentElement;
  const metadata = {};
  const docSummary = findChild(root, "DOCSUMMARY");
  if (docSummary) {
    const title = findChild(docSummary, "TITLE");
    const author = findChild(docSummary, "AUTHOR");
    const date = findChild(docSummary, "DATE");
    if (title) metadata.title = textContent(title).trim();
    if (author) metadata.author = textContent(author).trim();
    if (date) metadata.createdAt = textContent(date).trim() || void 0;
  }
  const paraShapeMap = buildParaShapeMap(root);
  const body = findChild(root, "BODY");
  if (!body) {
    return { markdown: "", blocks: [], metadata, warnings };
  }
  const blocks = [];
  const pageFilter = options?.pages ? parsePageRange(options.pages, countSections(body)) : null;
  let sectionIdx = 0;
  const children = body.childNodes;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType !== 1) continue;
    if (localName(el) !== "SECTION") continue;
    sectionIdx++;
    if (pageFilter && !pageFilter.has(sectionIdx)) continue;
    parseSection2(el, blocks, paraShapeMap, sectionIdx, warnings);
  }
  const outline = blocks.filter((b) => b.type === "heading" && b.text).map((b) => ({ level: b.level ?? 1, text: b.text, pageNumber: b.pageNumber }));
  const markdown = blocksToMarkdown(blocks);
  return {
    markdown,
    blocks,
    metadata: Object.keys(metadata).length > 0 ? metadata : void 0,
    outline: outline.length > 0 ? outline : void 0,
    warnings: warnings.length > 0 ? warnings : void 0
  };
}
function buildParaShapeMap(root) {
  const map = /* @__PURE__ */ new Map();
  const head = findChild(root, "HEAD");
  if (!head) return map;
  const mappingTable = findChild(head, "MAPPINGTABLE");
  if (!mappingTable) return map;
  const paraShapeList = findChild(mappingTable, "PARASHAPELIST");
  if (!paraShapeList) return map;
  const children = paraShapeList.childNodes;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType !== 1 || localName(el) !== "PARASHAPE") continue;
    const id = el.getAttribute("Id") ?? "";
    const headingType = el.getAttribute("HeadingType") ?? "None";
    const level = parseInt(el.getAttribute("Level") ?? "0", 10);
    let headingLevel = null;
    if (headingType === "Outline") {
      const safeLevel = isNaN(level) ? 0 : Math.max(0, level);
      headingLevel = Math.min(safeLevel + 1, 6);
    }
    map.set(id, { headingLevel });
  }
  return map;
}
function parseSection2(section, blocks, paraShapeMap, sectionNum, warnings) {
  walkContent(section, blocks, paraShapeMap, sectionNum, warnings, false);
}
function walkContent(node, blocks, paraShapeMap, sectionNum, warnings, inHeaderFooter, depth = 0) {
  if (depth > MAX_XML_DEPTH2) return;
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType !== 1) continue;
    const tag = localName(el);
    if (tag === "HEADER" || tag === "FOOTER") {
      continue;
    }
    if (tag === "P") {
      if (!inHeaderFooter) {
        parseParagraph2(el, blocks, paraShapeMap, sectionNum);
      }
      continue;
    }
    if (tag === "TABLE") {
      if (!inHeaderFooter) {
        parseTable2(el, blocks, paraShapeMap, sectionNum, warnings);
      }
      continue;
    }
    if (tag === "PARALIST" || tag === "SECTION" || tag === "COLDEF") {
      walkContent(el, blocks, paraShapeMap, sectionNum, warnings, inHeaderFooter, depth + 1);
      continue;
    }
    walkContent(el, blocks, paraShapeMap, sectionNum, warnings, inHeaderFooter, depth + 1);
  }
}
function parseParagraph2(el, blocks, paraShapeMap, sectionNum) {
  const paraShapeId = el.getAttribute("ParaShape") ?? "";
  const shapeInfo = paraShapeMap.get(paraShapeId);
  const text = extractParagraphText(el);
  if (!text) return;
  if (shapeInfo?.headingLevel != null) {
    blocks.push({ type: "heading", text, level: shapeInfo.headingLevel, pageNumber: sectionNum });
  } else {
    blocks.push({ type: "paragraph", text, pageNumber: sectionNum });
  }
}
function extractParagraphText(p) {
  const parts = [];
  collectCharText(p, parts);
  return parts.join("").trim();
}
function collectCharText(node, parts, depth = 0) {
  if (depth > MAX_XML_DEPTH2) return;
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType !== 1) continue;
    const tag = localName(el);
    if (tag === "CHAR") {
      const t = textContent(el);
      if (t) parts.push(t);
    } else if (tag === "TABLE" || tag === "PICTURE" || tag === "SHAPEOBJECT") {
    } else if (tag === "AUTONUM") {
    } else {
      collectCharText(el, parts, depth + 1);
    }
  }
}
function parseTable2(el, blocks, paraShapeMap, sectionNum, warnings) {
  const cells = [];
  const rowCount = parseInt(el.getAttribute("RowCount") ?? "0", 10);
  const colCount = parseInt(el.getAttribute("ColCount") ?? "0", 10);
  if (isNaN(rowCount) || isNaN(colCount) || rowCount === 0 || colCount === 0) return;
  if (rowCount > MAX_TABLE_ROWS || colCount > MAX_TABLE_COLS) {
    warnings.push({ message: `\uD14C\uC774\uBE14 \uD06C\uAE30 \uCD08\uACFC (${rowCount}x${colCount}) \u2014 \uC2A4\uD0B5`, code: "TRUNCATED_TABLE" });
    return;
  }
  const children = el.childNodes;
  for (let i = 0; i < children.length; i++) {
    const rowEl = children[i];
    if (rowEl.nodeType !== 1 || localName(rowEl) !== "ROW") continue;
    const rowCells = rowEl.childNodes;
    for (let j = 0; j < rowCells.length; j++) {
      const cellEl = rowCells[j];
      if (cellEl.nodeType !== 1 || localName(cellEl) !== "CELL") continue;
      const colAddr = parseInt(cellEl.getAttribute("ColAddr") ?? "0", 10);
      const rowAddr = parseInt(cellEl.getAttribute("RowAddr") ?? "0", 10);
      const colSpan = Math.min(Math.max(1, parseInt(cellEl.getAttribute("ColSpan") ?? "1", 10) || 1), MAX_TABLE_COLS);
      const rowSpan = Math.min(Math.max(1, parseInt(cellEl.getAttribute("RowSpan") ?? "1", 10) || 1), MAX_TABLE_ROWS);
      const cellText = extractCellText(cellEl);
      cells.push({ text: cellText, colSpan, rowSpan, colAddr, rowAddr });
    }
  }
  if (cells.length === 0) return;
  const grid = Array.from({ length: rowCount }, () => Array(colCount).fill(null));
  for (const cell of cells) {
    const r = cell.rowAddr ?? 0;
    const c2 = cell.colAddr ?? 0;
    if (isNaN(r) || isNaN(c2) || r >= rowCount || c2 >= colCount) continue;
    grid[r][c2] = cell;
    for (let dr = 0; dr < cell.rowSpan; dr++) {
      for (let dc = 0; dc < cell.colSpan; dc++) {
        if (dr === 0 && dc === 0) continue;
        if (r + dr < rowCount && c2 + dc < colCount) {
          grid[r + dr][c2 + dc] = { text: "", colSpan: 1, rowSpan: 1 };
        }
      }
    }
  }
  const cellRows = grid.map(
    (row) => row.map((cell) => cell ?? { text: "", colSpan: 1, rowSpan: 1 })
  );
  const table = buildTable(cellRows);
  blocks.push({ type: "table", table, pageNumber: sectionNum });
}
function extractCellText(cellEl) {
  const textParts = [];
  collectCellText(cellEl, textParts, 0);
  return textParts.filter(Boolean).join("\n").trim();
}
function collectCellText(node, parts, depth) {
  if (depth > 20) return;
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType !== 1) continue;
    const tag = localName(el);
    if (tag === "P") {
      const t = extractParagraphText(el);
      if (t) parts.push(t);
    } else if (tag === "TABLE") {
      parts.push("[\uC911\uCCA9 \uD14C\uC774\uBE14]");
    } else {
      collectCellText(el, parts, depth + 1);
    }
  }
}
function localName(el) {
  return (el.tagName || el.localName || "").replace(/^[^:]+:/, "");
}
function findChild(parent, tag) {
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType === 1 && localName(el) === tag) return el;
  }
  return null;
}
function textContent(el) {
  const children = el.childNodes;
  const parts = [];
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType === 3) {
      parts.push(node.nodeValue || "");
    } else if (node.nodeType === 1) {
      parts.push(textContent(node));
    }
  }
  return parts.join("");
}
function countSections(body) {
  let count = 0;
  const children = body.childNodes;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType === 1 && localName(el) === "SECTION") count++;
  }
  return count;
}
var MAX_XML_DEPTH2, MAX_TABLE_ROWS, MAX_TABLE_COLS, MAX_HWPML_BYTES;
var init_parser5 = __esm({
  "src/hwpml/parser.ts"() {
    "use strict";
    init_builder();
    init_page_range();
    init_utils();
    MAX_XML_DEPTH2 = 200;
    MAX_TABLE_ROWS = 5e3;
    MAX_TABLE_COLS = 500;
    MAX_HWPML_BYTES = 50 * 1024 * 1024;
  }
});

// src/form/recognize.ts
function isLabelCell(text) {
  const trimmed = text.trim().replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰*※]+$/g, "").trim();
  if (!trimmed || trimmed.length > 30) return false;
  for (const kw of LABEL_KEYWORDS) {
    if (trimmed.includes(kw)) return true;
  }
  if (/^[가-힣\s()（）·:：]+$/.test(trimmed) && trimmed.replace(/\s/g, "").length >= 2 && trimmed.replace(/\s/g, "").length <= 8 && !/\d/.test(trimmed)) return true;
  if (/^[가-힣A-Za-z\s]+[:：]$/.test(trimmed)) return true;
  return false;
}
function extractFormFields(blocks) {
  const fields = [];
  let totalTables = 0;
  let formTables = 0;
  for (const block of blocks) {
    if (block.type !== "table" || !block.table) continue;
    totalTables++;
    const tableFields = extractFromTable(block.table);
    if (tableFields.length > 0) {
      formTables++;
      fields.push(...tableFields);
    }
  }
  for (const block of blocks) {
    if (block.type === "paragraph" && block.text) {
      const inlineFields = extractInlineFields(block.text);
      fields.push(...inlineFields);
    }
  }
  const confidence = totalTables > 0 ? formTables / totalTables : fields.length > 0 ? 0.3 : 0;
  return { fields, confidence: Math.min(confidence, 1) };
}
function extractFromTable(table) {
  const fields = [];
  if (table.cols >= 2) {
    for (let r = 0; r < table.rows; r++) {
      for (let c2 = 0; c2 < table.cols - 1; c2++) {
        const labelCell = table.cells[r][c2];
        const valueCell = table.cells[r][c2 + 1];
        if (isLabelCell(labelCell.text)) {
          fields.push({
            label: labelCell.text.trim().replace(/[:：]\s*$/, ""),
            value: valueCell.text.trim(),
            row: r,
            col: c2
          });
        }
      }
    }
  }
  if (fields.length === 0 && table.rows >= 2 && table.cols >= 2) {
    const headerRow = table.cells[0];
    const allLabels = headerRow.every((cell) => {
      const t = cell.text.trim();
      return t.length > 0 && t.length <= 20;
    });
    if (allLabels) {
      for (let r = 1; r < table.rows; r++) {
        for (let c2 = 0; c2 < table.cols; c2++) {
          const label = headerRow[c2].text.trim();
          const value = table.cells[r][c2].text.trim();
          if (label && value) {
            fields.push({ label, value, row: r, col: c2 });
          }
        }
      }
    }
  }
  return fields;
}
function extractInlineFields(text) {
  const fields = [];
  const pattern = /([가-힣A-Za-z]{2,10})\s*[:：]\s*([^\n,;]{1,100})/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const label = match[1].trim();
    const value = match[2].trim();
    if (value) {
      fields.push({ label, value, row: -1, col: -1 });
    }
  }
  return fields;
}
var LABEL_KEYWORDS;
var init_recognize = __esm({
  "src/form/recognize.ts"() {
    "use strict";
    LABEL_KEYWORDS = /* @__PURE__ */ new Set([
      "\uC131\uBA85",
      "\uC774\uB984",
      "\uC8FC\uC18C",
      "\uC804\uD654",
      "\uC804\uD654\uBC88\uD638",
      "\uD734\uB300\uD3F0",
      "\uD578\uB4DC\uD3F0",
      "\uC5F0\uB77D\uCC98",
      "\uC0DD\uB144\uC6D4\uC77C",
      "\uC8FC\uBBFC\uB4F1\uB85D\uBC88\uD638",
      "\uC18C\uC18D",
      "\uC9C1\uC704",
      "\uC9C1\uAE09",
      "\uBD80\uC11C",
      "\uC774\uBA54\uC77C",
      "\uD329\uC2A4",
      "\uD559\uAD50",
      "\uD559\uB144",
      "\uBC18",
      "\uBC88\uD638",
      "\uC2E0\uCCAD\uC778",
      "\uB300\uD45C\uC790",
      "\uB2F4\uB2F9\uC790",
      "\uC791\uC131\uC790",
      "\uD655\uC778\uC790",
      "\uC2B9\uC778\uC790",
      "\uC77C\uC2DC",
      "\uB0A0\uC9DC",
      "\uAE30\uAC04",
      "\uC7A5\uC18C",
      "\uBAA9\uC801",
      "\uC0AC\uC720",
      "\uBE44\uACE0",
      "\uAE08\uC561",
      "\uC218\uB7C9",
      "\uB2E8\uAC00",
      "\uD569\uACC4",
      "\uACC4",
      "\uC18C\uACC4",
      "\uB4F1\uB85D\uAE30\uC900\uC9C0",
      "\uBCF8\uC801",
      "\uC704\uC784\uC778",
      "\uCCAD\uAD6C\uC0AC\uC720",
      "\uC18C\uBA85\uC790\uB8CC"
    ]);
  }
});

// src/form/match.ts
function normalizeLabel(label) {
  return label.trim().replace(/[:：\s()（）·]/g, "");
}
function findMatchingKey(cellLabel, values) {
  if (values.has(cellLabel)) return cellLabel;
  let bestKey;
  let bestLen = 0;
  for (const key of values.keys()) {
    if (cellLabel.startsWith(key)) {
      if (key.length >= cellLabel.length * 0.6 && key.length > bestLen) {
        bestLen = key.length;
        bestKey = key;
      }
    } else if (key.startsWith(cellLabel)) {
      if (cellLabel.length >= key.length * 0.6 && cellLabel.length > bestLen) {
        bestLen = cellLabel.length;
        bestKey = key;
      }
    }
  }
  return bestKey;
}
function isKeywordLabel(text) {
  const trimmed = text.trim().replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰*※]+$/g, "").trim();
  if (!trimmed || trimmed.length > 15) return false;
  for (const kw of LABEL_KEYWORDS) {
    if (trimmed.includes(kw)) return true;
  }
  return false;
}
function fillInCellPatterns(cellText, values, matchedLabels) {
  let text = cellText;
  const matches = [];
  text = text.replace(
    /([가-힣A-Za-z]+)\(\s{1,}\)([가-힣A-Za-z]*)/g,
    (match, prefix, suffix) => {
      const label = prefix + suffix;
      const normalizedLabel = normalizeLabel(label);
      const matchKey = values.has(normalizedLabel) ? normalizedLabel : values.has(normalizeLabel(prefix)) ? normalizeLabel(prefix) : void 0;
      if (matchKey === void 0) return match;
      const newValue = values.get(matchKey);
      matchedLabels.add(matchKey);
      matches.push({ key: matchKey, label, value: newValue });
      return `${prefix}(${newValue})${suffix}`;
    }
  );
  text = text.replace(
    /□([가-힣A-Za-z]+)/g,
    (match, keyword) => {
      const normalizedKw = normalizeLabel(keyword);
      const matchKey = values.has(normalizedKw) ? normalizedKw : void 0;
      if (matchKey === void 0) return match;
      const val = values.get(matchKey);
      const isTruthy = ["\u2611", "\u2713", "\u2714", "v", "V", "true", "1", "yes", "o", "O"].includes(val.trim()) || val.trim() === "";
      if (!isTruthy) return match;
      matchedLabels.add(matchKey);
      matches.push({ key: matchKey, label: `\u25A1${keyword}`, value: "\u2611" });
      return `\u2611${keyword}`;
    }
  );
  text = text.replace(
    /\(([가-힣A-Za-z]+)[:：]\s{1,}\)/g,
    (match, keyword) => {
      const normalizedKw = normalizeLabel(keyword);
      const matchKey = values.has(normalizedKw) ? normalizedKw : void 0;
      if (matchKey === void 0) return match;
      const newValue = values.get(matchKey);
      matchedLabels.add(matchKey);
      matches.push({ key: matchKey, label: keyword, value: newValue });
      return `(${keyword}\uFF1A${newValue})`;
    }
  );
  return matches.length > 0 ? { text, matches } : null;
}
function normalizeValues(values) {
  const map = /* @__PURE__ */ new Map();
  for (const [label, value] of Object.entries(values)) {
    map.set(normalizeLabel(label), value);
  }
  return map;
}
function resolveUnmatched(normalizedValues, matchedLabels, originalValues) {
  return [...normalizedValues.keys()].filter((k) => !matchedLabels.has(k)).map((k) => {
    for (const orig of Object.keys(originalValues)) {
      if (normalizeLabel(orig) === k) return orig;
    }
    return k;
  });
}
var init_match = __esm({
  "src/form/match.ts"() {
    "use strict";
    init_recognize();
  }
});

// src/form/filler.ts
function fillFormFields(blocks, values) {
  const cloned = structuredClone(blocks);
  const filled = [];
  const matchedLabels = /* @__PURE__ */ new Set();
  const normalizedValues = normalizeValues(values);
  const patternFilledCells = /* @__PURE__ */ new Set();
  for (const block of cloned) {
    if (block.type !== "table" || !block.table) continue;
    for (let r = 0; r < block.table.rows; r++) {
      for (let c2 = 0; c2 < block.table.cols; c2++) {
        const cell = block.table.cells[r]?.[c2];
        if (!cell) continue;
        const result = fillInCellPatterns(cell.text, normalizedValues, matchedLabels);
        if (result) {
          cell.text = result.text;
          patternFilledCells.add(`${r},${c2}`);
          for (const m of result.matches) {
            filled.push({ label: m.label, value: m.value, row: r, col: c2 });
          }
        }
      }
    }
  }
  for (const block of cloned) {
    if (block.type !== "table" || !block.table) continue;
    fillTable(block.table, normalizedValues, filled, matchedLabels, patternFilledCells);
  }
  for (const block of cloned) {
    if (block.type !== "paragraph" || !block.text) continue;
    const newText = fillInlineFields(block.text, normalizedValues, filled, matchedLabels);
    if (newText !== block.text) block.text = newText;
  }
  const unmatched = resolveUnmatched(normalizedValues, matchedLabels, values);
  return { blocks: cloned, filled, unmatched };
}
function fillTable(table, values, filled, matchedLabels, patternFilledCells) {
  if (table.cols < 2) return;
  for (let r = 0; r < table.rows; r++) {
    for (let c2 = 0; c2 < table.cols - 1; c2++) {
      const labelCell = table.cells[r][c2];
      const valueCell = table.cells[r][c2 + 1];
      if (!labelCell || !valueCell) continue;
      if (!isLabelCell(labelCell.text)) continue;
      if (isKeywordLabel(valueCell.text)) continue;
      const normalizedCellLabel = normalizeLabel(labelCell.text);
      if (!normalizedCellLabel) continue;
      const matchKey = findMatchingKey(normalizedCellLabel, values);
      if (matchKey === void 0) continue;
      const newValue = values.get(matchKey);
      if (patternFilledCells?.has(`${r},${c2 + 1}`)) {
        valueCell.text = newValue + " " + valueCell.text;
      } else {
        valueCell.text = newValue;
      }
      matchedLabels.add(matchKey);
      filled.push({
        label: labelCell.text.trim().replace(/[:：]\s*$/, ""),
        value: newValue,
        row: r,
        col: c2
      });
    }
  }
  if (table.rows >= 2 && table.cols >= 2) {
    const headerRow = table.cells[0];
    const allLabels = headerRow.every((cell) => {
      const t = cell.text.trim();
      return t.length > 0 && t.length <= 20 && isLabelCell(t);
    });
    if (!allLabels) return;
    for (let r = 1; r < table.rows; r++) {
      for (let c2 = 0; c2 < table.cols; c2++) {
        const headerLabel = normalizeLabel(headerRow[c2].text);
        const matchKey = findMatchingKey(headerLabel, values);
        if (matchKey === void 0) continue;
        if (matchedLabels.has(matchKey)) continue;
        const newValue = values.get(matchKey);
        table.cells[r][c2].text = newValue;
        matchedLabels.add(matchKey);
        filled.push({
          label: headerRow[c2].text.trim(),
          value: newValue,
          row: r,
          col: c2
        });
      }
    }
  }
}
function fillInlineFields(text, values, filled, matchedLabels) {
  return text.replace(
    /([가-힣A-Za-z]{2,10})\s*[:：]\s*([^\n,;]{0,100})/g,
    (match, rawLabel, _oldValue) => {
      const normalized = normalizeLabel(rawLabel);
      const matchKey = findMatchingKey(normalized, values);
      if (matchKey === void 0) return match;
      const newValue = values.get(matchKey);
      matchedLabels.add(matchKey);
      filled.push({
        label: rawLabel.trim(),
        value: newValue,
        row: -1,
        col: -1
      });
      return `${rawLabel}: ${newValue}`;
    }
  );
}
var init_filler = __esm({
  "src/form/filler.ts"() {
    "use strict";
    init_recognize();
    init_match();
  }
});

// src/form/filler-hwpx.ts
import JSZip5 from "jszip";
import { DOMParser as DOMParser5, XMLSerializer } from "@xmldom/xmldom";
async function fillHwpx(hwpxBuffer, values) {
  const zip = await JSZip5.loadAsync(hwpxBuffer);
  const filled = [];
  const matchedLabels = /* @__PURE__ */ new Set();
  const normalizedValues = normalizeValues(values);
  const sectionFiles = Object.keys(zip.files).filter((name) => /[Ss]ection\d+\.xml$/i.test(name)).sort();
  if (sectionFiles.length === 0) {
    throw new KordocError("HWPX\uC5D0\uC11C \uC139\uC158 \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
  }
  const xmlParser = new DOMParser5();
  const xmlSerializer = new XMLSerializer();
  for (const sectionPath of sectionFiles) {
    const zipEntry = zip.file(sectionPath);
    if (!zipEntry) continue;
    const rawXml = await zipEntry.async("text");
    const doc = xmlParser.parseFromString(stripDtd(rawXml), "text/xml");
    if (!doc.documentElement) continue;
    let modified = false;
    const tables = findAllElements(doc.documentElement, "tbl");
    const cellPatternApplied = /* @__PURE__ */ new Set();
    for (const tblEl of tables) {
      const allCells = findAllElements(tblEl, "tc");
      for (const tcEl of allCells) {
        const tNodes = collectCellTextNodes(tcEl);
        const fullText = tNodes.map((n) => n.text).join("");
        const result = fillInCellPatterns(fullText, normalizedValues, matchedLabels);
        if (!result) continue;
        applyTextReplacements(tNodes, fullText, result.text);
        cellPatternApplied.add(tcEl);
        for (const m of result.matches) {
          filled.push({ label: m.label, value: m.value, row: -1, col: -1 });
        }
        modified = true;
      }
    }
    for (const tblEl of tables) {
      const rows = findDirectChildren(tblEl, "tr");
      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const trEl = rows[rowIdx];
        const cells = findDirectChildren(trEl, "tc");
        for (let colIdx = 0; colIdx < cells.length - 1; colIdx++) {
          const labelText = extractCellText2(cells[colIdx]);
          if (!isLabelCell(labelText)) continue;
          const valueCell = cells[colIdx + 1];
          const valueText = extractCellText2(valueCell);
          if (isKeywordLabel(valueText)) continue;
          const normalizedCellLabel = normalizeLabel(labelText);
          if (!normalizedCellLabel) continue;
          const matchKey = findMatchingKey(normalizedCellLabel, normalizedValues);
          if (matchKey === void 0) continue;
          const newValue = normalizedValues.get(matchKey);
          if (cellPatternApplied.has(valueCell)) {
            prependCellText(valueCell, newValue);
          } else {
            replaceCellText(valueCell, newValue);
          }
          matchedLabels.add(matchKey);
          filled.push({
            label: labelText.trim().replace(/[:：]\s*$/, ""),
            value: newValue,
            row: rowIdx,
            col: colIdx
          });
          modified = true;
        }
      }
      if (rows.length >= 2) {
        const headerCells = findDirectChildren(rows[0], "tc");
        const allLabels = headerCells.every((cell) => {
          const t = extractCellText2(cell).trim();
          return t.length > 0 && t.length <= 20 && isLabelCell(t);
        });
        if (allLabels) {
          for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
            const dataCells = findDirectChildren(rows[rowIdx], "tc");
            for (let colIdx = 0; colIdx < Math.min(headerCells.length, dataCells.length); colIdx++) {
              const headerLabel = normalizeLabel(extractCellText2(headerCells[colIdx]));
              const matchKey = findMatchingKey(headerLabel, normalizedValues);
              if (matchKey === void 0) continue;
              if (matchedLabels.has(matchKey)) continue;
              const newValue = normalizedValues.get(matchKey);
              replaceCellText(dataCells[colIdx], newValue);
              matchedLabels.add(matchKey);
              filled.push({
                label: extractCellText2(headerCells[colIdx]).trim(),
                value: newValue,
                row: rowIdx,
                col: colIdx
              });
              modified = true;
            }
          }
        }
      }
    }
    const allParagraphs = findAllElements(doc.documentElement, "p");
    for (const pEl of allParagraphs) {
      if (isInsideTable(pEl)) continue;
      const tNodes = collectTextNodes(pEl);
      const fullText = tNodes.map((n) => n.text).join("");
      const pattern = /([가-힣A-Za-z]{2,10})\s*[:：]\s*([^\n,;]{0,100})/g;
      let match;
      while ((match = pattern.exec(fullText)) !== null) {
        const rawLabel = match[1];
        const normalized = normalizeLabel(rawLabel);
        const matchKey = findMatchingKey(normalized, normalizedValues);
        if (matchKey === void 0) continue;
        const newValue = normalizedValues.get(matchKey);
        const valueStart = match.index + match[0].length - match[2].length;
        const valueEnd = match.index + match[0].length;
        replaceTextRange(tNodes, valueStart, valueEnd, newValue);
        matchedLabels.add(matchKey);
        filled.push({ label: rawLabel.trim(), value: newValue, row: -1, col: -1 });
        modified = true;
        break;
      }
    }
    if (modified) {
      const newXml = xmlSerializer.serializeToString(doc);
      zip.file(sectionPath, newXml);
    }
  }
  const unmatched = resolveUnmatched(normalizedValues, matchedLabels, values);
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  return { buffer, filled, unmatched };
}
function localName2(el) {
  return (el.tagName || el.localName || "").replace(/^[^:]+:/, "");
}
function findAllElements(node, tagLocalName) {
  const result = [];
  const walk = (n) => {
    const children = n.childNodes;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType !== 1) continue;
      if (localName2(child) === tagLocalName) result.push(child);
      walk(child);
    }
  };
  walk(node);
  return result;
}
function findDirectChildren(parent, tagLocalName) {
  const result = [];
  const children = parent.childNodes;
  if (!children) return result;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === 1 && localName2(child) === tagLocalName) {
      result.push(child);
    }
  }
  return result;
}
function isInsideTable(el) {
  let parent = el.parentNode;
  while (parent) {
    if (parent.nodeType === 1 && localName2(parent) === "tbl") return true;
    parent = parent.parentNode;
  }
  return false;
}
function extractCellText2(tcEl) {
  const parts = [];
  const walk = (node) => {
    const children = node.childNodes;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 3) {
        parts.push(child.textContent || "");
      } else if (child.nodeType === 1) {
        const tag = localName2(child);
        if (tag === "t") walk(child);
        else if (tag === "run" || tag === "r" || tag === "p" || tag === "subList") walk(child);
        else if (tag === "tab") parts.push("	");
        else if (tag === "br") parts.push("\n");
      }
    }
  };
  walk(tcEl);
  return parts.join("");
}
function prependCellText(tcEl, text) {
  const tElements = findAllElements(tcEl, "t");
  if (tElements.length === 0) return;
  const firstT = tElements[0];
  const existing = firstT.textContent || "";
  clearChildren(firstT);
  firstT.appendChild(firstT.ownerDocument.createTextNode(text + " " + existing));
}
function replaceCellText(tcEl, newValue) {
  const paragraphs = findAllElements(tcEl, "p");
  if (paragraphs.length === 0) return;
  const firstP = paragraphs[0];
  const runs = findAllElements(firstP, "run").concat(findAllElements(firstP, "r"));
  if (runs.length > 0) {
    setRunText(runs[0], newValue);
    for (let i = 1; i < runs.length; i++) {
      setRunText(runs[i], "");
    }
  } else {
    const tElements = findAllElements(firstP, "t");
    if (tElements.length > 0) {
      clearChildren(tElements[0]);
      tElements[0].appendChild(tElements[0].ownerDocument.createTextNode(newValue));
      for (let i = 1; i < tElements.length; i++) {
        clearChildren(tElements[i]);
      }
    }
  }
  for (let i = 1; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.parentNode) {
      const pRuns = findAllElements(p, "run").concat(findAllElements(p, "r"));
      for (const run of pRuns) setRunText(run, "");
      const pTs = findAllElements(p, "t");
      for (const t of pTs) clearChildren(t);
    }
  }
}
function setRunText(runEl, text) {
  const tElements = findAllElements(runEl, "t");
  if (tElements.length > 0) {
    clearChildren(tElements[0]);
    tElements[0].appendChild(tElements[0].ownerDocument.createTextNode(text));
    for (let i = 1; i < tElements.length; i++) {
      clearChildren(tElements[i]);
    }
  }
}
function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
function collectTextNodes(pEl) {
  const tElements = findAllElements(pEl, "t");
  const result = [];
  let offset = 0;
  for (const t of tElements) {
    const text = t.textContent || "";
    result.push({ element: t, text, offset });
    offset += text.length;
  }
  return result;
}
function replaceTextRange(tNodes, globalStart, globalEnd, newValue) {
  let replaced = false;
  for (const node of tNodes) {
    const nodeStart = node.offset;
    const nodeEnd = node.offset + node.text.length;
    if (nodeEnd <= globalStart || nodeStart >= globalEnd) continue;
    const localStart = Math.max(0, globalStart - nodeStart);
    const localEnd = Math.min(node.text.length, globalEnd - nodeStart);
    if (!replaced) {
      const before = node.text.slice(0, localStart);
      const after = node.text.slice(localEnd);
      const newText = before + newValue + after;
      clearChildren(node.element);
      node.element.appendChild(node.element.ownerDocument.createTextNode(newText));
      replaced = true;
    } else {
      const before = node.text.slice(0, localStart);
      const after = node.text.slice(localEnd);
      const newText = before + after;
      clearChildren(node.element);
      node.element.appendChild(node.element.ownerDocument.createTextNode(newText));
    }
  }
}
function collectCellTextNodes(tcEl) {
  const tElements = findAllElements(tcEl, "t");
  const result = [];
  let offset = 0;
  for (const t of tElements) {
    const text = t.textContent || "";
    result.push({ element: t, text, offset });
    offset += text.length;
  }
  return result;
}
function applyTextReplacements(tNodes, originalFull, replacedFull) {
  if (originalFull === replacedFull) return;
  if (tNodes.length === 1) {
    clearChildren(tNodes[0].element);
    tNodes[0].element.appendChild(
      tNodes[0].element.ownerDocument.createTextNode(replacedFull)
    );
    return;
  }
  let diffStart = 0;
  while (diffStart < originalFull.length && diffStart < replacedFull.length && originalFull[diffStart] === replacedFull[diffStart]) {
    diffStart++;
  }
  let diffEndOrig = originalFull.length;
  let diffEndRepl = replacedFull.length;
  while (diffEndOrig > diffStart && diffEndRepl > diffStart && originalFull[diffEndOrig - 1] === replacedFull[diffEndRepl - 1]) {
    diffEndOrig--;
    diffEndRepl--;
  }
  const newPart = replacedFull.slice(diffStart, diffEndRepl);
  replaceTextRange(tNodes, diffStart, diffEndOrig, newPart);
}
var init_filler_hwpx = __esm({
  "src/form/filler-hwpx.ts"() {
    "use strict";
    init_recognize();
    init_utils();
    init_match();
  }
});

// src/hwpx/generator.ts
import JSZip6 from "jszip";
async function markdownToHwpx(markdown) {
  const blocks = parseMarkdownToBlocks(markdown);
  const sectionXml = blocksToSectionXml(blocks);
  const zip = new JSZip6();
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", generateContainerXml());
  zip.file("Contents/content.hpf", generateManifest());
  zip.file("Contents/header.xml", generateHeaderXml());
  zip.file("Contents/section0.xml", sectionXml);
  zip.file("Preview/PrvText.txt", buildPrvText(blocks));
  return await zip.generateAsync({ type: "arraybuffer" });
}
function buildPrvText(blocks) {
  const lines = [];
  let bytes = 0;
  for (const b of blocks) {
    const text = b.text || (b.rows ? b.rows.map((r) => r.join(" ")).join("\n") : "");
    if (!text) continue;
    lines.push(text);
    bytes += text.length * 3;
    if (bytes > 1024) break;
  }
  return lines.join("\n").slice(0, 1024);
}
function parseMarkdownToBlocks(md) {
  const lines = md.split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2].trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: "code_block", text: codeLines.join("\n"), lang });
      continue;
    }
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", text: headingMatch[2].trim(), level: headingMatch[1].length });
      i++;
      continue;
    }
    if (line.trimStart().startsWith("|")) {
      const tableRows = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        const row = lines[i];
        if (/^[\s|:\-]+$/.test(row)) {
          i++;
          continue;
        }
        const cells = row.split("|").slice(1, -1).map((c2) => c2.trim());
        if (cells.length > 0) tableRows.push(cells);
        i++;
      }
      if (tableRows.length > 0) blocks.push({ type: "table", rows: tableRows });
      continue;
    }
    if (line.trimStart().startsWith("> ")) {
      const quoteLines = [];
      while (i < lines.length && (lines[i].trimStart().startsWith("> ") || lines[i].trimStart().startsWith(">"))) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      for (const ql of quoteLines) {
        blocks.push({ type: "blockquote", text: ql.trim() || "" });
      }
      continue;
    }
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)]) (.+)$/);
    if (listMatch) {
      const indent = Math.floor(listMatch[1].length / 2);
      const ordered = /\d/.test(listMatch[2]);
      blocks.push({ type: "list_item", text: listMatch[3].trim(), ordered, indent });
      i++;
      continue;
    }
    blocks.push({ type: "paragraph", text: line.trim() });
    i++;
  }
  return blocks;
}
function parseInlineMarkdown(text) {
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, t, u) => t || u);
  text = text.replace(/~~([^~]+)~~/g, "$1");
  const spans = [];
  const regex = /(`[^`]+`|\*{3}[^*]+\*{3}|\*{2}[^*]+\*{2}|\*[^*]+\*|_{2}[^_]+_{2}|_[^_]+_)/g;
  let lastIdx = 0;
  for (const match of text.matchAll(regex)) {
    const idx = match.index;
    if (idx > lastIdx) {
      spans.push({ text: text.slice(lastIdx, idx), bold: false, italic: false, code: false });
    }
    const raw = match[0];
    if (raw.startsWith("`")) {
      spans.push({ text: raw.slice(1, -1), bold: false, italic: false, code: true });
    } else if (raw.startsWith("***") || raw.startsWith("___")) {
      spans.push({ text: raw.slice(3, -3), bold: true, italic: true, code: false });
    } else if (raw.startsWith("**") || raw.startsWith("__")) {
      spans.push({ text: raw.slice(2, -2), bold: true, italic: false, code: false });
    } else {
      spans.push({ text: raw.slice(1, -1), bold: false, italic: true, code: false });
    }
    lastIdx = idx + raw.length;
  }
  if (lastIdx < text.length) {
    spans.push({ text: text.slice(lastIdx), bold: false, italic: false, code: false });
  }
  if (spans.length === 0) {
    spans.push({ text, bold: false, italic: false, code: false });
  }
  return spans;
}
function spanToCharPrId(span) {
  if (span.code) return CHAR_CODE;
  if (span.bold && span.italic) return CHAR_BOLD_ITALIC;
  if (span.bold) return CHAR_BOLD;
  if (span.italic) return CHAR_ITALIC;
  return CHAR_NORMAL;
}
function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function generateRuns(text, defaultCharPr = CHAR_NORMAL) {
  const spans = parseInlineMarkdown(text);
  return spans.map((span) => {
    const charId = span.code || span.bold || span.italic ? spanToCharPrId(span) : defaultCharPr;
    return `<hp:run charPrIDRef="${charId}"><hp:t>${escapeXml(span.text)}</hp:t></hp:run>`;
  }).join("");
}
function generateParagraph(text, paraPrId = PARA_NORMAL, charPrId = CHAR_NORMAL) {
  if (paraPrId === PARA_CODE) {
    return `<hp:p paraPrIDRef="${paraPrId}" styleIDRef="0"><hp:run charPrIDRef="${CHAR_CODE}"><hp:t>${escapeXml(text)}</hp:t></hp:run></hp:p>`;
  }
  const runs = generateRuns(text, charPrId);
  return `<hp:p paraPrIDRef="${paraPrId}" styleIDRef="0">${runs}</hp:p>`;
}
function headingParaPrId(level) {
  if (level === 1) return PARA_H1;
  if (level === 2) return PARA_H2;
  if (level === 3) return PARA_H3;
  return PARA_H4;
}
function headingCharPrId(level) {
  if (level === 1) return CHAR_H1;
  if (level === 2) return CHAR_H2;
  if (level === 3) return CHAR_H3;
  return CHAR_H4;
}
function generateContainerXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<ocf:container xmlns:ocf="${NS_OCF}" xmlns:hpf="${NS_HPF}">
  <ocf:rootfiles>
    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </ocf:rootfiles>
</ocf:container>`;
}
function generateManifest() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<opf:package xmlns:opf="${NS_OPF}" xmlns:hpf="${NS_HPF}" xmlns:hh="${NS_HEAD}">
  <opf:manifest>
    <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="header" linear="no"/>
    <opf:itemref idref="section0" linear="yes"/>
  </opf:spine>
</opf:package>`;
}
function charPr(id, height, bold, italic, fontId = 0) {
  const boldAttr = bold ? ` bold="1"` : "";
  const italicAttr = italic ? ` italic="1"` : "";
  const effFont = bold ? 2 : fontId;
  return `      <hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="0"${boldAttr}${italicAttr}>
        <hh:fontRef hangul="${effFont}" latin="${effFont}" hanja="${effFont}" japanese="${effFont}" other="${effFont}" symbol="${effFont}" user="${effFont}"/>
        <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      </hh:charPr>`;
}
function paraPr(id, opts = {}) {
  const { align = "JUSTIFY", spaceBefore = 0, spaceAfter = 0, lineSpacing = 160, indent = 0 } = opts;
  return `      <hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="AUTO">
        <hh:align horizontal="${align}" vertical="BASELINE"/>
        <hh:heading type="NONE" idRef="0" level="0"/>
        <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
        <hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
        <hh:margin indent="${indent}" left="0" right="0" prev="${spaceBefore}" next="${spaceAfter}"/>
        <hh:lineSpacing type="PERCENT" value="${lineSpacing}"/>
        <hh:border borderFillIDRef="0" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>
      </hh:paraPr>`;
}
function generateHeaderXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="${NS_HEAD}" xmlns:hp="${NS_PARA}" version="1.4" secCnt="1">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:refList>
    <hh:fontfaces itemCnt="7">
      <hh:fontface lang="HANGUL" fontCnt="3">
        <hh:font id="0" face="\uD568\uCD08\uB86C\uBC14\uD0D5" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
        <hh:font id="1" face="\uD568\uCD08\uB86C\uB3CB\uC6C0" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
        <hh:font id="2" face="HY\uACAC\uACE0\uB515" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="9" proportion="0" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
      </hh:fontface>
      <hh:fontface lang="LATIN" fontCnt="3">
        <hh:font id="0" face="Times New Roman" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_OLDSTYLE" weight="5" proportion="4" contrast="2" strokeVariation="0" armStyle="0" letterform="0" midline="0" xHeight="4"/>
        </hh:font>
        <hh:font id="1" face="Consolas" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_MODERN" weight="5" proportion="0" contrast="0" strokeVariation="0" armStyle="0" letterform="0" midline="0" xHeight="0"/>
        </hh:font>
        <hh:font id="2" face="Arial Black" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="9" proportion="0" contrast="0" strokeVariation="0" armStyle="0" letterform="0" midline="0" xHeight="0"/>
        </hh:font>
      </hh:fontface>
      <hh:fontface lang="HANJA" fontCnt="1">
        <hh:font id="0" face="\uD568\uCD08\uB86C\uBC14\uD0D5" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
      </hh:fontface>
      <hh:fontface lang="JAPANESE" fontCnt="1">
        <hh:font id="0" face="\uAD74\uB9BC" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="0" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
      </hh:fontface>
      <hh:fontface lang="OTHER" fontCnt="1">
        <hh:font id="0" face="\uAD74\uB9BC" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="0" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
      </hh:fontface>
      <hh:fontface lang="SYMBOL" fontCnt="1">
        <hh:font id="0" face="Symbol" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="0" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
      </hh:fontface>
      <hh:fontface lang="USER" fontCnt="1">
        <hh:font id="0" face="\uAD74\uB9BC" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="0" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
      </hh:fontface>
    </hh:fontfaces>
    <hh:borderFills itemCnt="2">
      <hh:borderFill id="0" threeD="0" shadow="0" centerLine="0" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/>
        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        <hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:diagonal type="NONE" width="0.1 mm" color="#000000"/>
        <hh:fillInfo/>
      </hh:borderFill>
      <hh:borderFill id="1" threeD="0" shadow="0" centerLine="0" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/>
        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        <hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/>
        <hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/>
        <hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/>
        <hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/>
        <hh:diagonal type="NONE" width="0.1 mm" color="#000000"/>
        <hh:fillInfo/>
      </hh:borderFill>
    </hh:borderFills>
    <hh:charProperties itemCnt="9">
${charPr(0, 1e3, false, false)}
${charPr(1, 1e3, true, false)}
${charPr(2, 1e3, false, true)}
${charPr(3, 1e3, true, true)}
${charPr(4, 900, false, false, 1)}
${charPr(5, 1800, true, false, 1)}
${charPr(6, 1400, true, false, 1)}
${charPr(7, 1200, true, false, 1)}
${charPr(8, 1100, true, false, 1)}
    </hh:charProperties>
    <hh:tabProperties itemCnt="0"/>
    <hh:numberings itemCnt="0"/>
    <hh:bullets itemCnt="0"/>
    <hh:paraProperties itemCnt="8">
${paraPr(0)}
${paraPr(1, { align: "LEFT", spaceBefore: 800, spaceAfter: 200, lineSpacing: 180 })}
${paraPr(2, { align: "LEFT", spaceBefore: 600, spaceAfter: 150, lineSpacing: 170 })}
${paraPr(3, { align: "LEFT", spaceBefore: 400, spaceAfter: 100, lineSpacing: 160 })}
${paraPr(4, { align: "LEFT", spaceBefore: 300, spaceAfter: 100, lineSpacing: 160 })}
${paraPr(5, { align: "LEFT", lineSpacing: 130, indent: 400 })}
${paraPr(6, { align: "LEFT", lineSpacing: 150, indent: 600 })}
${paraPr(7, { align: "LEFT", lineSpacing: 160, indent: 600 })}
    </hh:paraProperties>
    <hh:styles itemCnt="1">
      <hh:style id="0" type="PARA" name="\uBC14\uD0D5\uAE00" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langIDRef="1042" lockForm="0"/>
    </hh:styles>
  </hh:refList>
  <hh:compatibleDocument targetProgram="HWP2018"/>
</hh:head>`;
}
function generateSecPr() {
  return `<hp:secPr textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:margin header="2835" footer="2835" gutter="0" left="5670" right="4252" top="8504" bottom="4252"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr></hp:secPr>`;
}
function nextTableId() {
  return ++tableIdCounter;
}
function generateTable(rows) {
  const rowCnt = rows.length;
  const colCnt = Math.max(...rows.map((r) => r.length), 1);
  const cellW = Math.floor(44e3 / colCnt);
  const cellH = 1500;
  const tblW = cellW * colCnt;
  const tblH = cellH * rowCnt;
  const tblId = nextTableId();
  const trElements = rows.map((row, rowIdx) => {
    const cells = row.length < colCnt ? [...row, ...Array(colCnt - row.length).fill("")] : row;
    const tdElements = cells.map((cell, colIdx) => {
      const runs = generateRuns(cell);
      const p = `<hp:p paraPrIDRef="0" styleIDRef="0">${runs}</hp:p>`;
      return `<hp:tc name="" header="${rowIdx === 0 ? 1 : 0}" hasMargin="0" protect="0" editable="1" dirty="0" borderFillIDRef="1"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${p}</hp:subList><hp:cellAddr colAddr="${colIdx}" rowAddr="${rowIdx}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${cellW}" height="${cellH}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`;
    }).join("");
    return `<hp:tr>${tdElements}</hp:tr>`;
  }).join("");
  const tblInner = `<hp:sz width="${tblW}" widthRelTo="ABSOLUTE" height="${tblH}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="0" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>` + trElements;
  const tbl = `<hp:tbl id="${tblId}" zOrder="0" numberingType="TABLE" pageBreak="CELL" repeatHeader="0" rowCnt="${rowCnt}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="1" noShading="0">${tblInner}</hp:tbl>`;
  return `<hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0">${tbl}</hp:run></hp:p>`;
}
function blocksToSectionXml(blocks) {
  const paraXmls = [];
  let isFirst = true;
  const orderedCounters = {};
  let prevWasOrdered = false;
  for (const block of blocks) {
    let xml = "";
    if (block.type !== "list_item" || !block.ordered) {
      if (prevWasOrdered) {
        for (const k of Object.keys(orderedCounters)) delete orderedCounters[+k];
      }
      prevWasOrdered = false;
    }
    switch (block.type) {
      case "heading": {
        const pId = headingParaPrId(block.level || 1);
        const cId = headingCharPrId(block.level || 1);
        xml = generateParagraph(block.text || "", pId, cId);
        break;
      }
      case "paragraph":
        xml = generateParagraph(block.text || "");
        break;
      case "code_block": {
        const codeLines = (block.text || "").split("\n");
        xml = codeLines.map((line) => generateParagraph(line || " ", PARA_CODE)).join("\n  ");
        break;
      }
      case "blockquote":
        xml = generateParagraph(block.text || "", PARA_QUOTE);
        break;
      case "list_item": {
        const indent = block.indent || 0;
        let marker;
        if (block.ordered) {
          orderedCounters[indent] = (orderedCounters[indent] || 0) + 1;
          for (const k of Object.keys(orderedCounters)) {
            if (+k > indent) delete orderedCounters[+k];
          }
          marker = `${orderedCounters[indent]}. `;
          prevWasOrdered = true;
        } else {
          marker = "\xB7 ";
          if (prevWasOrdered) {
            for (const k of Object.keys(orderedCounters)) delete orderedCounters[+k];
          }
          prevWasOrdered = false;
        }
        const indentPrefix = "  ".repeat(indent);
        xml = generateParagraph(indentPrefix + marker + (block.text || ""), PARA_LIST);
        break;
      }
      case "hr":
        xml = `<hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500</hp:t></hp:run></hp:p>`;
        break;
      case "table":
        if (block.rows) {
          if (isFirst) {
            const secRun = `<hp:run charPrIDRef="0">${generateSecPr()}<hp:t></hp:t></hp:run>`;
            paraXmls.push(`<hp:p paraPrIDRef="0" styleIDRef="0">${secRun}</hp:p>`);
            isFirst = false;
          }
          xml = generateTable(block.rows);
        }
        break;
    }
    if (!xml) continue;
    if (isFirst && block.type !== "table") {
      xml = xml.replace(
        /<hp:run charPrIDRef="(\d+)">/,
        `<hp:run charPrIDRef="$1">${generateSecPr()}`
      );
      isFirst = false;
    }
    paraXmls.push(xml);
  }
  if (paraXmls.length === 0) {
    paraXmls.push(`<hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0">${generateSecPr()}<hp:t></hp:t></hp:run></hp:p>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hs="${NS_SECTION}" xmlns:hp="${NS_PARA}">
  ${paraXmls.join("\n  ")}
</hs:sec>`;
}
var NS_SECTION, NS_PARA, NS_HEAD, NS_OPF, NS_HPF, NS_OCF, CHAR_NORMAL, CHAR_BOLD, CHAR_ITALIC, CHAR_BOLD_ITALIC, CHAR_CODE, CHAR_H1, CHAR_H2, CHAR_H3, CHAR_H4, PARA_NORMAL, PARA_H1, PARA_H2, PARA_H3, PARA_H4, PARA_CODE, PARA_QUOTE, PARA_LIST, TABLE_ID_BASE, tableIdCounter;
var init_generator = __esm({
  "src/hwpx/generator.ts"() {
    "use strict";
    NS_SECTION = "http://www.hancom.co.kr/hwpml/2011/section";
    NS_PARA = "http://www.hancom.co.kr/hwpml/2011/paragraph";
    NS_HEAD = "http://www.hancom.co.kr/hwpml/2011/head";
    NS_OPF = "http://www.idpf.org/2007/opf/";
    NS_HPF = "http://www.hancom.co.kr/schema/2011/hpf";
    NS_OCF = "urn:oasis:names:tc:opendocument:xmlns:container";
    CHAR_NORMAL = 0;
    CHAR_BOLD = 1;
    CHAR_ITALIC = 2;
    CHAR_BOLD_ITALIC = 3;
    CHAR_CODE = 4;
    CHAR_H1 = 5;
    CHAR_H2 = 6;
    CHAR_H3 = 7;
    CHAR_H4 = 8;
    PARA_NORMAL = 0;
    PARA_H1 = 1;
    PARA_H2 = 2;
    PARA_H3 = 3;
    PARA_H4 = 4;
    PARA_CODE = 5;
    PARA_QUOTE = 6;
    PARA_LIST = 7;
    TABLE_ID_BASE = 1e3;
    tableIdCounter = TABLE_ID_BASE;
  }
});

// src/diff/text-diff.ts
function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}
function normalizedSimilarity(a, b) {
  return similarity(normalize(a), normalize(b));
}
function normalize(s) {
  return s.replace(/\s+/g, " ").trim();
}
function levenshtein(a, b) {
  if (a.length + b.length > MAX_LEVENSHTEIN_LEN) {
    const sampleLen = Math.min(500, a.length, b.length);
    let diffs = 0;
    for (let i = 0; i < sampleLen; i++) if (a[i] !== b[i]) diffs++;
    const sampleRate = sampleLen > 0 ? diffs / sampleLen : 1;
    return Math.abs(a.length - b.length) + Math.round(Math.min(a.length, b.length) * sampleRate);
  }
  if (a.length > b.length) [a, b] = [b, a];
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let curr = new Array(m + 1);
  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      if (a[i - 1] === b[j - 1]) {
        curr[i] = prev[i - 1];
      } else {
        curr[i] = 1 + Math.min(prev[i - 1], prev[i], curr[i - 1]);
      }
    }
    ;
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}
var MAX_LEVENSHTEIN_LEN;
var init_text_diff = __esm({
  "src/diff/text-diff.ts"() {
    "use strict";
    MAX_LEVENSHTEIN_LEN = 1e4;
  }
});

// src/diff/compare.ts
async function compare(bufferA, bufferB, options) {
  const [resultA, resultB] = await Promise.all([
    parse(bufferA, options),
    parse(bufferB, options)
  ]);
  if (!resultA.success) throw new Error(`\uBB38\uC11CA \uD30C\uC2F1 \uC2E4\uD328: ${resultA.error}`);
  if (!resultB.success) throw new Error(`\uBB38\uC11CB \uD30C\uC2F1 \uC2E4\uD328: ${resultB.error}`);
  return diffBlocks(resultA.blocks, resultB.blocks);
}
function diffBlocks(blocksA, blocksB) {
  const aligned = alignBlocks(blocksA, blocksB);
  const stats = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  const diffs = [];
  for (const [a, b] of aligned) {
    if (a && b) {
      const sim = blockSimilarity(a, b);
      if (sim >= 0.99) {
        diffs.push({ type: "unchanged", before: a, after: b, similarity: 1 });
        stats.unchanged++;
      } else {
        const diff = { type: "modified", before: a, after: b, similarity: sim };
        if (a.type === "table" && b.type === "table" && a.table && b.table) {
          diff.cellDiffs = diffTableCells(a.table, b.table);
        }
        diffs.push(diff);
        stats.modified++;
      }
    } else if (a) {
      diffs.push({ type: "removed", before: a });
      stats.removed++;
    } else if (b) {
      diffs.push({ type: "added", after: b });
      stats.added++;
    }
  }
  return { stats, diffs };
}
function alignBlocks(a, b) {
  const m = a.length, n = b.length;
  if (m * n > 1e7) return fallbackAlign(a, b);
  const simCache = /* @__PURE__ */ new Map();
  const getSim = (i2, j2) => {
    const key = `${i2},${j2}`;
    let v = simCache.get(key);
    if (v === void 0) {
      v = blockSimilarity(a[i2], b[j2]);
      simCache.set(key, v);
    }
    return v;
  };
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i2 = 1; i2 <= m; i2++) {
    for (let j2 = 1; j2 <= n; j2++) {
      if (getSim(i2 - 1, j2 - 1) >= SIMILARITY_THRESHOLD) {
        dp[i2][j2] = dp[i2 - 1][j2 - 1] + 1;
      } else {
        dp[i2][j2] = Math.max(dp[i2 - 1][j2], dp[i2][j2 - 1]);
      }
    }
  }
  const pairs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (getSim(i - 1, j - 1) >= SIMILARITY_THRESHOLD && dp[i][j] === dp[i - 1][j - 1] + 1) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();
  const result = [];
  let ai = 0, bi = 0;
  for (const [pi, pj] of pairs) {
    while (ai < pi) result.push([a[ai++], null]);
    while (bi < pj) result.push([null, b[bi++]]);
    result.push([a[ai++], b[bi++]]);
  }
  while (ai < m) result.push([a[ai++], null]);
  while (bi < n) result.push([null, b[bi++]]);
  return result;
}
function fallbackAlign(a, b) {
  const result = [];
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    result.push([a[i] || null, b[i] || null]);
  }
  return result;
}
function blockSimilarity(a, b) {
  if (a.type !== b.type) return 0;
  if (a.text !== void 0 && b.text !== void 0) {
    return normalizedSimilarity(a.text || "", b.text || "");
  }
  if (a.type === "table" && a.table && b.table) {
    return tableSimilarity(a.table, b.table);
  }
  if (a.type === b.type) return 1;
  return 0;
}
function tableSimilarity(a, b) {
  const dimSim = 1 - Math.abs(a.rows * a.cols - b.rows * b.cols) / Math.max(a.rows * a.cols, b.rows * b.cols, 1);
  const textsA = a.cells.flat().map((c2) => c2.text).join(" ");
  const textsB = b.cells.flat().map((c2) => c2.text).join(" ");
  const contentSim = normalizedSimilarity(textsA, textsB);
  return dimSim * 0.3 + contentSim * 0.7;
}
function diffTableCells(a, b) {
  const maxRows = Math.max(a.rows, b.rows);
  const maxCols = Math.max(a.cols, b.cols);
  const result = [];
  for (let r = 0; r < maxRows; r++) {
    const row = [];
    for (let c2 = 0; c2 < maxCols; c2++) {
      const cellA = r < a.rows && c2 < a.cols ? a.cells[r][c2].text : void 0;
      const cellB = r < b.rows && c2 < b.cols ? b.cells[r][c2].text : void 0;
      let type;
      if (cellA === void 0) type = "added";
      else if (cellB === void 0) type = "removed";
      else if (cellA === cellB) type = "unchanged";
      else type = "modified";
      row.push({ type, before: cellA, after: cellB });
    }
    result.push(row);
  }
  return result;
}
var SIMILARITY_THRESHOLD;
var init_compare = __esm({
  "src/diff/compare.ts"() {
    "use strict";
    init_index();
    init_text_diff();
    SIMILARITY_THRESHOLD = 0.4;
  }
});

// src/pdf/line-detector.ts
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
function extractLines(fnArray, argsArray) {
  const horizontals = [];
  const verticals = [];
  let lineWidth = 1;
  let currentPath = [];
  let pathStartX = 0, pathStartY = 0;
  let curX = 0, curY = 0;
  function pushRectangle(path, rx, ry, rw, rh) {
    if (Math.abs(rh) < ORIENTATION_TOL * 2) {
      path.push({ x1: rx, y1: ry + rh / 2, x2: rx + rw, y2: ry + rh / 2 });
    } else if (Math.abs(rw) < ORIENTATION_TOL * 2) {
      path.push({ x1: rx + rw / 2, y1: ry, x2: rx + rw / 2, y2: ry + rh });
    } else {
      path.push(
        { x1: rx, y1: ry, x2: rx + rw, y2: ry },
        { x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rh },
        { x1: rx + rw, y1: ry + rh, x2: rx, y2: ry + rh },
        { x1: rx, y1: ry + rh, x2: rx, y2: ry }
      );
    }
  }
  function flushPath(isStroke) {
    if (!isStroke) {
      currentPath = [];
      return;
    }
    for (const seg of currentPath) {
      classifyAndAdd(seg, lineWidth, horizontals, verticals);
    }
    currentPath = [];
  }
  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i];
    const args = argsArray[i];
    switch (op) {
      case OPS.setLineWidth:
        lineWidth = args[0] || 1;
        break;
      case OPS.constructPath: {
        const arg0 = args[0];
        if (Array.isArray(arg0)) {
          const subOps = arg0;
          const coords = args[1];
          let ci = 0;
          for (const subOp of subOps) {
            if (subOp === OPS.moveTo) {
              curX = coords[ci++];
              curY = coords[ci++];
              pathStartX = curX;
              pathStartY = curY;
            } else if (subOp === OPS.lineTo) {
              const x2 = coords[ci++], y2 = coords[ci++];
              currentPath.push({ x1: curX, y1: curY, x2, y2 });
              curX = x2;
              curY = y2;
            } else if (subOp === OPS.rectangle) {
              const rx = coords[ci++], ry = coords[ci++];
              const rw = coords[ci++], rh = coords[ci++];
              pushRectangle(currentPath, rx, ry, rw, rh);
            } else if (subOp === OPS.closePath) {
              if (curX !== pathStartX || curY !== pathStartY) {
                currentPath.push({ x1: curX, y1: curY, x2: pathStartX, y2: pathStartY });
              }
              curX = pathStartX;
              curY = pathStartY;
            } else if (subOp === OPS.curveTo) {
              ci += 6;
            } else if (subOp === OPS.curveTo2 || subOp === OPS.curveTo3) {
              ci += 4;
            }
          }
        } else {
          const afterOp = arg0;
          const dataArr = args[1];
          const pathData = dataArr?.[0];
          if (pathData && typeof pathData === "object") {
            const len = Object.keys(pathData).length;
            let di = 0;
            while (di < len) {
              const drawOp = pathData[di++];
              if (drawOp === 0 /* moveTo */) {
                curX = pathData[di++];
                curY = pathData[di++];
                pathStartX = curX;
                pathStartY = curY;
              } else if (drawOp === 1 /* lineTo */) {
                const x2 = pathData[di++], y2 = pathData[di++];
                currentPath.push({ x1: curX, y1: curY, x2, y2 });
                curX = x2;
                curY = y2;
              } else if (drawOp === 2 /* curveTo */) {
                di += 6;
              } else if (drawOp === 3 /* quadraticCurveTo */) {
                di += 4;
              } else if (drawOp === 4 /* closePath */) {
                if (curX !== pathStartX || curY !== pathStartY) {
                  currentPath.push({ x1: curX, y1: curY, x2: pathStartX, y2: pathStartY });
                }
                curX = pathStartX;
                curY = pathStartY;
              } else {
                break;
              }
            }
          }
          if (afterOp === OPS.stroke || afterOp === OPS.closeStroke) {
            flushPath(true);
          } else if (afterOp === OPS.fill || afterOp === OPS.eoFill || afterOp === OPS.fillStroke || afterOp === OPS.eoFillStroke || afterOp === OPS.closeFillStroke || afterOp === OPS.closeEOFillStroke) {
            flushPath(true);
          } else if (afterOp === OPS.endPath) {
            flushPath(false);
          }
        }
        break;
      }
      case OPS.stroke:
      case OPS.closeStroke:
        flushPath(true);
        break;
      case OPS.fill:
      case OPS.eoFill:
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        flushPath(true);
        break;
      case OPS.endPath:
        flushPath(false);
        break;
    }
  }
  return { horizontals, verticals };
}
function classifyAndAdd(seg, lineWidth, horizontals, verticals) {
  const dx = Math.abs(seg.x2 - seg.x1);
  const dy = Math.abs(seg.y2 - seg.y1);
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < MIN_LINE_LENGTH) return;
  if (dy <= ORIENTATION_TOL) {
    const y = (seg.y1 + seg.y2) / 2;
    const x1 = Math.min(seg.x1, seg.x2);
    const x2 = Math.max(seg.x1, seg.x2);
    horizontals.push({ x1, y1: y, x2, y2: y, lineWidth });
  } else if (dx <= ORIENTATION_TOL) {
    const x = (seg.x1 + seg.x2) / 2;
    const y1 = Math.min(seg.y1, seg.y2);
    const y2 = Math.max(seg.y1, seg.y2);
    verticals.push({ x1: x, y1, x2: x, y2, lineWidth });
  }
}
function preprocessLines(horizontals, verticals) {
  let h = horizontals.filter((l) => l.lineWidth <= MAX_LINE_WIDTH);
  let v = verticals.filter((l) => l.lineWidth <= MAX_LINE_WIDTH);
  h = mergeParallelLines(h, "h");
  v = mergeParallelLines(v, "v");
  return { horizontals: h, verticals: v };
}
function mergeParallelLines(lines, dir) {
  if (lines.length <= 1) return lines;
  const sorted = [...lines].sort((a, b) => {
    const posA = dir === "h" ? a.y1 : a.x1;
    const posB = dir === "h" ? b.y1 : b.x1;
    if (Math.abs(posA - posB) > 0.1) return posA - posB;
    return dir === "h" ? a.x1 - b.x1 : a.y1 - b.y1;
  });
  const MERGE_TOL = 3;
  const result = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];
    const prevPos = dir === "h" ? prev.y1 : prev.x1;
    const currPos = dir === "h" ? curr.y1 : curr.x1;
    if (Math.abs(prevPos - currPos) <= MERGE_TOL) {
      const prevStart = dir === "h" ? prev.x1 : prev.y1;
      const prevEnd = dir === "h" ? prev.x2 : prev.y2;
      const currStart = dir === "h" ? curr.x1 : curr.y1;
      const currEnd = dir === "h" ? curr.x2 : curr.y2;
      const overlap = Math.min(prevEnd, currEnd) - Math.max(prevStart, currStart);
      const minLen = Math.min(prevEnd - prevStart, currEnd - currStart);
      if (overlap > minLen * 0.3) {
        if (dir === "h") {
          prev.x1 = Math.min(prev.x1, curr.x1);
          prev.x2 = Math.max(prev.x2, curr.x2);
          prev.y1 = (prev.y1 + curr.y1) / 2;
          prev.y2 = prev.y1;
        } else {
          prev.y1 = Math.min(prev.y1, curr.y1);
          prev.y2 = Math.max(prev.y2, curr.y2);
          prev.x1 = (prev.x1 + curr.x1) / 2;
          prev.x2 = prev.x1;
        }
        prev.lineWidth = Math.max(prev.lineWidth, curr.lineWidth);
        continue;
      }
    }
    result.push(curr);
  }
  return result;
}
function filterPageBorderLines(horizontals, verticals, pageWidth, pageHeight) {
  const margin = 5;
  return {
    horizontals: horizontals.filter(
      (l) => !(Math.abs(l.y1) < margin || Math.abs(l.y1 - pageHeight) < margin) || l.x2 - l.x1 < pageWidth * 0.9
    ),
    verticals: verticals.filter(
      (l) => !(Math.abs(l.x1) < margin || Math.abs(l.x1 - pageWidth) < margin) || l.y2 - l.y1 < pageHeight * 0.9
    )
  };
}
function buildVertices(horizontals, verticals) {
  const vertices = [];
  const tol = CONNECT_TOL;
  for (const h of horizontals) {
    for (const v of verticals) {
      if (v.x1 >= h.x1 - tol && v.x1 <= h.x2 + tol && h.y1 >= v.y1 - tol && h.y1 <= v.y2 + tol) {
        const radius = Math.max(h.lineWidth, v.lineWidth, 1);
        vertices.push({ x: v.x1, y: h.y1, radius });
      }
    }
  }
  return vertices;
}
function mergeVertices(vertices) {
  if (vertices.length <= 1) return vertices;
  const merged = [];
  const used = new Array(vertices.length).fill(false);
  for (let i = 0; i < vertices.length; i++) {
    if (used[i]) continue;
    let sumX = vertices[i].x, sumY = vertices[i].y;
    let maxRadius = vertices[i].radius;
    let count = 1;
    for (let j = i + 1; j < vertices.length; j++) {
      if (used[j]) continue;
      const mergeTol = VERTEX_MERGE_FACTOR * Math.max(maxRadius, vertices[j].radius);
      if (Math.abs(vertices[i].x - vertices[j].x) <= mergeTol && Math.abs(vertices[i].y - vertices[j].y) <= mergeTol) {
        sumX += vertices[j].x;
        sumY += vertices[j].y;
        maxRadius = Math.max(maxRadius, vertices[j].radius);
        count++;
        used[j] = true;
      }
    }
    merged.push({ x: sumX / count, y: sumY / count, radius: maxRadius });
  }
  return merged;
}
function buildTableGrids(horizontals, verticals) {
  if (horizontals.length < 2 || verticals.length < 2) return [];
  const allVertices = buildVertices(horizontals, verticals);
  const vertices = mergeVertices(allVertices);
  if (vertices.length < 4) return [];
  const globalRadius = vertices.reduce((max, v) => Math.max(max, v.radius), 1);
  const allLines = [
    ...horizontals.map((l, i) => ({ ...l, type: "h", id: i })),
    ...verticals.map((l, i) => ({ ...l, type: "v", id: i + horizontals.length }))
  ];
  const groups = groupConnectedLines(allLines);
  const grids = [];
  for (const group of groups) {
    const hLines = group.filter((l) => l.type === "h");
    const vLines = group.filter((l) => l.type === "v");
    if (hLines.length < 2 || vLines.length < 2) continue;
    let gx1 = Infinity, gy1 = Infinity, gx2 = -Infinity, gy2 = -Infinity;
    for (const l of vLines) {
      if (l.x1 < gx1) gx1 = l.x1;
      if (l.x1 > gx2) gx2 = l.x1;
    }
    for (const l of hLines) {
      if (l.y1 < gy1) gy1 = l.y1;
      if (l.y1 > gy2) gy2 = l.y1;
    }
    const groupBbox = {
      x1: gx1 - CONNECT_TOL,
      y1: gy1 - CONNECT_TOL,
      x2: gx2 + CONNECT_TOL,
      y2: gy2 + CONNECT_TOL
    };
    const groupVertices = vertices.filter(
      (v) => v.x >= groupBbox.x1 && v.x <= groupBbox.x2 && v.y >= groupBbox.y1 && v.y <= groupBbox.y2
    );
    const groupRadius = groupVertices.length > 0 ? groupVertices.reduce((max, v) => Math.max(max, v.radius), 1) : globalRadius;
    const coordMergeTol = Math.max(VERTEX_MERGE_FACTOR * groupRadius, MIN_COORD_MERGE_TOL);
    const rawYs = [
      ...hLines.map((l) => l.y1),
      ...groupVertices.map((v) => v.y)
    ];
    const rowYs = clusterCoordinates(rawYs, coordMergeTol).sort((a, b) => b - a);
    const rawXs = [
      ...vLines.map((l) => l.x1),
      ...groupVertices.map((v) => v.x)
    ];
    const colXs = clusterCoordinates(rawXs, coordMergeTol).sort((a, b) => a - b);
    if (rowYs.length < 2 || colXs.length < 2) continue;
    const validColXs = enforceMinWidth(colXs, MIN_COL_WIDTH);
    const validRowYs = enforceMinHeight(rowYs, MIN_ROW_HEIGHT);
    if (validRowYs.length < 2 || validColXs.length < 2) continue;
    const bbox = {
      x1: validColXs[0],
      y1: validRowYs[validRowYs.length - 1],
      x2: validColXs[validColXs.length - 1],
      y2: validRowYs[0]
    };
    grids.push({ rowYs: validRowYs, colXs: validColXs, bbox, vertexRadius: groupRadius });
  }
  return mergeAdjacentGrids(grids);
}
function enforceMinWidth(colXs, minWidth) {
  if (colXs.length <= 2) return colXs;
  const result = [colXs[0]];
  for (let i = 1; i < colXs.length; i++) {
    const prevX = result[result.length - 1];
    if (colXs[i] - prevX < minWidth && i < colXs.length - 1) {
      continue;
    }
    result.push(colXs[i]);
  }
  return result;
}
function enforceMinHeight(rowYs, minHeight) {
  if (rowYs.length <= 2) return rowYs;
  const result = [rowYs[0]];
  for (let i = 1; i < rowYs.length; i++) {
    const prevY = result[result.length - 1];
    if (prevY - rowYs[i] < minHeight && i < rowYs.length - 1) {
      continue;
    }
    result.push(rowYs[i]);
  }
  return result;
}
function mergeAdjacentGrids(grids) {
  if (grids.length <= 1) return grids;
  const sorted = [...grids].sort((a, b) => b.bbox.y2 - a.bbox.y2);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (prev.colXs.length === curr.colXs.length) {
      const mergeTol = Math.max(VERTEX_MERGE_FACTOR * Math.max(prev.vertexRadius, curr.vertexRadius), 6) * 3;
      const colMatch = prev.colXs.every((x, ci) => Math.abs(x - curr.colXs[ci]) <= mergeTol);
      const verticalGap = prev.bbox.y1 - curr.bbox.y2;
      if (colMatch && verticalGap >= -CONNECT_TOL && verticalGap <= 20) {
        const allRowYs = [.../* @__PURE__ */ new Set([...prev.rowYs, ...curr.rowYs])].sort((a, b) => b - a);
        merged[merged.length - 1] = {
          rowYs: allRowYs,
          colXs: prev.colXs,
          bbox: {
            x1: Math.min(prev.bbox.x1, curr.bbox.x1),
            y1: Math.min(prev.bbox.y1, curr.bbox.y1),
            x2: Math.max(prev.bbox.x2, curr.bbox.x2),
            y2: Math.max(prev.bbox.y2, curr.bbox.y2)
          },
          vertexRadius: Math.max(prev.vertexRadius, curr.vertexRadius)
        };
        continue;
      }
    }
    merged.push(curr);
  }
  return merged;
}
function clusterCoordinates(values, tolerance) {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const clusters = [{ sum: sorted[0], count: 1 }];
  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1];
    const avg = last.sum / last.count;
    if (Math.abs(sorted[i] - avg) <= tolerance) {
      last.sum += sorted[i];
      last.count++;
    } else {
      clusters.push({ sum: sorted[i], count: 1 });
    }
  }
  return clusters.map((c2) => c2.sum / c2.count);
}
function groupConnectedLines(lines) {
  const parent = lines.map((_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (linesIntersect(lines[i], lines[j])) {
        union(i, j);
      }
    }
  }
  const groups = /* @__PURE__ */ new Map();
  for (let i = 0; i < lines.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(lines[i]);
  }
  return [...groups.values()];
}
function linesIntersect(a, b) {
  if (a.type === b.type) {
    if (a.type === "h") {
      if (Math.abs(a.y1 - b.y1) > CONNECT_TOL) return false;
      return Math.min(a.x2, b.x2) >= Math.max(a.x1, b.x1) - CONNECT_TOL;
    } else {
      if (Math.abs(a.x1 - b.x1) > CONNECT_TOL) return false;
      return Math.min(a.y2, b.y2) >= Math.max(a.y1, b.y1) - CONNECT_TOL;
    }
  }
  const h = a.type === "h" ? a : b;
  const v = a.type === "h" ? b : a;
  const tol = CONNECT_TOL;
  return v.x1 >= h.x1 - tol && v.x1 <= h.x2 + tol && h.y1 >= v.y1 - tol && h.y1 <= v.y2 + tol;
}
function extractCells(grid, horizontals, verticals) {
  const { rowYs, colXs } = grid;
  const numRows = rowYs.length - 1;
  const numCols = colXs.length - 1;
  if (numRows <= 0 || numCols <= 0) return [];
  const vBorders = Array.from(
    { length: numRows },
    (_, r) => Array.from(
      { length: numCols + 1 },
      (_2, c2) => hasVerticalLine(verticals, colXs[c2], rowYs[r], rowYs[r + 1], grid.vertexRadius)
    )
  );
  const hBorders = Array.from(
    { length: numRows + 1 },
    (_, r) => Array.from(
      { length: numCols },
      (_2, c2) => hasHorizontalLine(horizontals, rowYs[r], colXs[c2], colXs[c2 + 1], grid.vertexRadius)
    )
  );
  const occupied = Array.from({ length: numRows }, () => Array(numCols).fill(false));
  const cells = [];
  for (let r = 0; r < numRows; r++) {
    for (let c2 = 0; c2 < numCols; c2++) {
      if (occupied[r][c2]) continue;
      let colSpan = 1;
      let rowSpan = 1;
      while (c2 + colSpan < numCols && !vBorders[r][c2 + colSpan]) {
        let canExpand = true;
        for (let dr = 0; dr < rowSpan; dr++) {
          if (vBorders[r + dr][c2 + colSpan]) {
            canExpand = false;
            break;
          }
        }
        if (!canExpand) break;
        colSpan++;
      }
      while (r + rowSpan < numRows) {
        let hasLine = false;
        for (let dc = 0; dc < colSpan; dc++) {
          if (hBorders[r + rowSpan][c2 + dc]) {
            hasLine = true;
            break;
          }
        }
        if (hasLine) break;
        rowSpan++;
      }
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) {
          occupied[r + dr][c2 + dc] = true;
        }
      }
      cells.push({
        row: r,
        col: c2,
        rowSpan,
        colSpan,
        bbox: {
          x1: colXs[c2],
          y1: rowYs[r + rowSpan],
          x2: colXs[c2 + colSpan],
          y2: rowYs[r]
        }
      });
    }
  }
  return cells;
}
function hasVerticalLine(verticals, x, topY, botY, vertexRadius) {
  const tol = Math.max(VERTEX_MERGE_FACTOR * vertexRadius, 4);
  for (const v of verticals) {
    if (Math.abs(v.x1 - x) <= tol) {
      const cellH = Math.abs(topY - botY);
      if (cellH < 0.1) continue;
      const overlapTop = Math.min(v.y2, topY);
      const overlapBot = Math.max(v.y1, botY);
      const overlap = overlapTop - overlapBot;
      if (overlap >= cellH * 0.75) return true;
    }
  }
  return false;
}
function hasHorizontalLine(horizontals, y, leftX, rightX, vertexRadius) {
  const tol = Math.max(VERTEX_MERGE_FACTOR * vertexRadius, 4);
  for (const h of horizontals) {
    if (Math.abs(h.y1 - y) <= tol) {
      const cellW = Math.abs(rightX - leftX);
      if (cellW < 0.1) continue;
      const overlapLeft = Math.max(h.x1, leftX);
      const overlapRight = Math.min(h.x2, rightX);
      const overlap = overlapRight - overlapLeft;
      if (overlap >= cellW * 0.75) return true;
    }
  }
  return false;
}
function mapTextToCells(items, cells) {
  const result = /* @__PURE__ */ new Map();
  for (const cell of cells) {
    result.set(cell, []);
  }
  for (const item of items) {
    const pad = CELL_PADDING;
    let bestCell = null;
    let bestScore = 0;
    for (const cell of cells) {
      const ix1 = Math.max(item.x, cell.bbox.x1 - pad);
      const ix2 = Math.min(item.x + item.w, cell.bbox.x2 + pad);
      const iy1 = Math.max(item.y, cell.bbox.y1 - pad);
      const iy2 = Math.min(item.y + (item.h || item.fontSize), cell.bbox.y2 + pad);
      if (ix1 >= ix2 || iy1 >= iy2) continue;
      const intersectArea = (ix2 - ix1) * (iy2 - iy1);
      const itemArea = Math.max(item.w, 1) * Math.max(item.h || item.fontSize, 1);
      const score = intersectArea / itemArea;
      if (score > bestScore) {
        bestScore = score;
        bestCell = cell;
      }
    }
    if (bestCell && bestScore > 0.3) {
      result.get(bestCell).push(item);
    }
  }
  return result;
}
function cellTextToString(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0].text;
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  let curLine = [sorted[0]];
  let curY = sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    const tol = Math.max(3, Math.min(sorted[i].fontSize, curLine[0].fontSize) * 0.6);
    if (Math.abs(sorted[i].y - curY) <= tol) {
      curLine.push(sorted[i]);
    } else {
      lines.push(curLine);
      curLine = [sorted[i]];
      curY = sorted[i].y;
    }
  }
  lines.push(curLine);
  const textLines = lines.map((line) => {
    const s = line.sort((a, b) => a.x - b.x);
    if (s.length === 1) return s[0].text;
    const evenSpaced = detectEvenSpacedItems(s);
    let result = s[0].text;
    for (let j = 1; j < s.length; j++) {
      if (evenSpaced[j]) {
        result += s[j].text;
        continue;
      }
      const gap = s[j].x - (s[j - 1].x + s[j - 1].w);
      const avgFs = (s[j].fontSize + s[j - 1].fontSize) / 2;
      const prevIsKorean = /[가-힣]$/.test(result);
      const currIsKorean = /^[가-힣]/.test(s[j].text);
      if (gap < avgFs * 0.15) {
        result += s[j].text;
      } else if (gap < avgFs * 0.35 && (prevIsKorean || currIsKorean)) {
        result += s[j].text;
      } else {
        result += " " + s[j].text;
      }
    }
    return result;
  });
  return mergeCellTextLines(textLines);
}
function detectEvenSpacedItems(items) {
  const result = new Array(items.length).fill(false);
  if (items.length < 3) return result;
  let runStart = -1;
  for (let i = 0; i < items.length; i++) {
    const isShortKorean = /^[가-힣]{1}$/.test(items[i].text) || /^[\d]{1}$/.test(items[i].text);
    if (isShortKorean && runStart >= 0 && i > 0) {
      const gap = items[i].x - (items[i - 1].x + items[i - 1].w);
      const maxRunGap = Math.max(items[i].fontSize * 3, 30);
      if (gap > maxRunGap) {
        if (i - runStart >= 3) markEvenRun(items, result, runStart, i);
        runStart = i;
        continue;
      }
    }
    if (isShortKorean) {
      if (runStart < 0) runStart = i;
    } else {
      if (runStart >= 0 && i - runStart >= 3) {
        markEvenRun(items, result, runStart, i);
      }
      runStart = -1;
    }
  }
  if (runStart >= 0 && items.length - runStart >= 3) {
    markEvenRun(items, result, runStart, items.length);
  }
  return result;
}
function markEvenRun(items, result, start, end) {
  const gaps = [];
  for (let i = start + 1; i < end; i++) {
    gaps.push(items[i].x - (items[i - 1].x + items[i - 1].w));
  }
  const posGaps = gaps.filter((g2) => g2 > 0);
  if (posGaps.length < 2) return;
  let minGap = Infinity, maxGap = -Infinity;
  for (const g2 of posGaps) {
    if (g2 < minGap) minGap = g2;
    if (g2 > maxGap) maxGap = g2;
  }
  const avgFs = items[start].fontSize;
  if (minGap >= avgFs * 0.1 && maxGap <= avgFs * 3 && maxGap / Math.max(minGap, 0.1) <= 3) {
    for (let i = start + 1; i < end; i++) {
      result[i] = true;
    }
  }
}
function mergeCellTextLines(textLines) {
  if (textLines.length <= 1) return textLines[0] || "";
  const merged = [textLines[0]];
  for (let i = 1; i < textLines.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = textLines[i];
    if (/[가-힣]$/.test(prev) && /^[가-힣]+$/.test(curr) && curr.length <= 8 && !curr.includes(" ")) {
      merged[merged.length - 1] = prev + curr;
    } else if (curr.trim().length <= 3 && /^[)\]%}]/.test(curr.trim())) {
      merged[merged.length - 1] = prev + curr.trim();
    } else if (/[,(]$/.test(prev.trim()) && curr.trim().length <= 15) {
      merged[merged.length - 1] = prev + curr.trim();
    } else if (/[\d,]$/.test(prev) && /^[\d,]+[)\]]?$/.test(curr.trim()) && curr.trim().length <= 10) {
      merged[merged.length - 1] = prev + curr.trim();
    } else {
      merged.push(curr);
    }
  }
  return merged.join("\n");
}
var ORIENTATION_TOL, MIN_LINE_LENGTH, MAX_LINE_WIDTH, CONNECT_TOL, CELL_PADDING, MIN_COL_WIDTH, MIN_ROW_HEIGHT, VERTEX_MERGE_FACTOR, MIN_COORD_MERGE_TOL;
var init_line_detector = __esm({
  "src/pdf/line-detector.ts"() {
    "use strict";
    ORIENTATION_TOL = 2;
    MIN_LINE_LENGTH = 15;
    MAX_LINE_WIDTH = 5;
    CONNECT_TOL = 5;
    CELL_PADDING = 2;
    MIN_COL_WIDTH = 15;
    MIN_ROW_HEIGHT = 6;
    VERTEX_MERGE_FACTOR = 4;
    MIN_COORD_MERGE_TOL = 8;
  }
});

// src/pdf/cluster-detector.ts
function detectClusterTables(items, pageNum) {
  if (items.length < MIN_ROWS * MIN_COLS) return [];
  const { merged, originMap } = mergeEvenSpacedClusters(items);
  const rows = groupByBaseline(merged);
  if (rows.length < MIN_ROWS) return [];
  const results = [];
  const headerResult = detectHeaderRow(rows);
  if (headerResult) {
    const { columns, headerIdx } = headerResult;
    const headerRow = rows[headerIdx];
    const headerItems = [...headerRow.items].sort((a, b) => a.x - b.x);
    const headerAndBelow = rows.slice(headerIdx);
    const mergedRows = mergeMultiLineRows(headerAndBelow, columns);
    const tableRegions = findTableRegionsByHeader(mergedRows, columns, headerItems);
    for (const region of tableRegions) {
      const table = buildClusterTable(region.rows, columns, pageNum);
      if (table) {
        expandUsedItems(table.usedItems, originMap);
        results.push(table);
      }
    }
  }
  if (results.length === 0) {
    const suspiciousRows = rows.filter((row) => hasSuspiciousGaps(row));
    if (suspiciousRows.length >= MIN_ROWS) {
      const columns = extractColumnClusters(suspiciousRows);
      if (columns.length >= MIN_COLS) {
        const tableRegions = findTableRegions(rows, columns);
        for (const region of tableRegions) {
          const mergedRows = mergeMultiLineRows(region.rows, columns);
          const table = buildClusterTable(mergedRows, columns, pageNum);
          if (table) {
            expandUsedItems(table.usedItems, originMap);
            results.push(table);
          }
        }
      }
    }
  }
  return results;
}
function mergeEvenSpacedClusters(items) {
  const originMap = /* @__PURE__ */ new Map();
  const rows = groupByBaseline(items);
  const merged = [];
  for (const row of rows) {
    const sorted = [...row.items].sort((a, b) => a.x - b.x);
    let i = 0;
    while (i < sorted.length) {
      if (/^[가-힣\d]$/.test(sorted[i].text)) {
        let runEnd = i + 1;
        while (runEnd < sorted.length && /^[가-힣\d]$/.test(sorted[runEnd].text)) {
          const gap = sorted[runEnd].x - (sorted[runEnd - 1].x + sorted[runEnd - 1].w);
          const fs = sorted[runEnd].fontSize;
          if (gap < fs * 0.1 || gap > fs * 3) break;
          runEnd++;
        }
        if (runEnd - i >= 3) {
          const gaps = [];
          for (let g2 = i + 1; g2 < runEnd; g2++) {
            gaps.push(sorted[g2].x - (sorted[g2 - 1].x + sorted[g2 - 1].w));
          }
          let minG = Infinity, maxG = -Infinity;
          for (const g2 of gaps) {
            if (g2 < minG) minG = g2;
            if (g2 > maxG) maxG = g2;
          }
          if (minG > 0 && maxG / minG <= 3) {
            const run = sorted.slice(i, runEnd);
            const text = run.map((r) => r.text).join("");
            const first = run[0], last = run[runEnd - i - 1];
            const item = {
              text,
              x: first.x,
              y: first.y,
              w: last.x + last.w - first.x,
              h: first.h,
              fontSize: first.fontSize,
              fontName: first.fontName
            };
            originMap.set(item, run);
            merged.push(item);
            i = runEnd;
            continue;
          }
        }
      }
      merged.push(sorted[i]);
      i++;
    }
  }
  return { merged, originMap };
}
function expandUsedItems(usedItems, originMap) {
  const toAdd = [];
  for (const item of usedItems) {
    const origins = originMap.get(item);
    if (origins) for (const o of origins) toAdd.push(o);
  }
  for (const a of toAdd) usedItems.add(a);
}
function detectHeaderRow(rows) {
  const allItems = rows.flatMap((r) => r.items);
  if (allItems.length === 0) return null;
  let allMinX = Infinity, allMaxX = -Infinity;
  for (const i of allItems) {
    if (i.x < allMinX) allMinX = i.x;
    const r = i.x + i.w;
    if (r > allMaxX) allMaxX = r;
  }
  const pageSpan = allMaxX - allMinX;
  if (pageSpan <= 0) return null;
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (row.items.length < MIN_COLS || row.items.length > 6) continue;
    if (row.items.some((i) => i.text.length > 8)) continue;
    if (!row.items.some((i) => /[가-힣]/.test(i.text))) continue;
    if (row.items.some((i) => /^[□■○●·※▶▷◆◇\-]/.test(i.text))) continue;
    const sorted = [...row.items].sort((a, b) => a.x - b.x);
    const xSpan = sorted[sorted.length - 1].x + sorted[sorted.length - 1].w - sorted[0].x;
    if (xSpan / pageSpan < 0.4) continue;
    const avgFs = sorted.reduce((s, i) => s + i.fontSize, 0) / sorted.length;
    let hasLargeGap = false;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w);
      if (gap >= avgFs * 2.5) {
        hasLargeGap = true;
        break;
      }
    }
    if (!hasLargeGap) continue;
    const columns = sorted.map((item) => ({ x: item.x, count: 0 }));
    let matchCount = 0;
    for (let j = ri + 1; j < rows.length && matchCount < MIN_ROWS + 2; j++) {
      const matched = countMatchedColumnsRange(rows[j], columns, sorted);
      if (matched >= MIN_COLS) matchCount++;
    }
    if (matchCount < MIN_ROWS) continue;
    return { columns, headerIdx: ri };
  }
  return null;
}
function mergeMultiLineRows(rows, columns) {
  if (rows.length <= 1) return rows;
  const result = [rows[0]];
  const allFontSizes = rows.flatMap((r) => r.items).map((i) => i.fontSize);
  const avgFontSize = allFontSizes.length > 0 ? allFontSizes.reduce((s, v) => s + v, 0) / allFontSizes.length : 12;
  for (let i = 1; i < rows.length; i++) {
    const prev = result[result.length - 1];
    const curr = rows[i];
    const yGap = Math.abs(prev.y - curr.y);
    const matchedCols = countMatchedColumns(curr, columns);
    if (yGap < avgFontSize * 1.8 && curr.items.length <= 2 && (matchedCols < MIN_COLS || curr.items.length === 1)) {
      result[result.length - 1] = {
        y: prev.y,
        items: [...prev.items, ...curr.items]
      };
    } else {
      result.push(curr);
    }
  }
  return result;
}
function groupByBaseline(items) {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  let curItems = [sorted[0]];
  let curY = sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - curY) <= Y_TOL) {
      curItems.push(sorted[i]);
    } else {
      rows.push({ y: curY, items: curItems });
      curItems = [sorted[i]];
      curY = sorted[i].y;
    }
  }
  if (curItems.length > 0) rows.push({ y: curY, items: curItems });
  return rows;
}
function hasSuspiciousGaps(row) {
  if (row.items.length < 2) return false;
  const sorted = [...row.items].sort((a, b) => a.x - b.x);
  if (sorted.length === 2 && sorted[1].text.length > 20) return false;
  const avgFontSize = sorted.reduce((s, i) => s + i.fontSize, 0) / sorted.length;
  const minGap = Math.max(avgFontSize * MIN_GAP_FACTOR, MIN_GAP_ABSOLUTE);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w);
    if (gap >= minGap) return true;
  }
  return false;
}
function extractColumnClusters(rows) {
  const allX = [];
  for (const row of rows) {
    for (const item of row.items) allX.push(item.x);
  }
  if (allX.length === 0) return [];
  allX.sort((a, b) => a - b);
  const clusters = [];
  let clusterStart = 0;
  for (let i = 1; i <= allX.length; i++) {
    if (i === allX.length || allX[i] - allX[i - 1] > COL_CLUSTER_TOL) {
      const slice = allX.slice(clusterStart, i);
      const avg = Math.round(slice.reduce((s, v) => s + v, 0) / slice.length);
      clusters.push({ x: avg, count: slice.length });
      clusterStart = i;
    }
  }
  const minCount = Math.max(2, Math.floor(rows.length * MIN_COL_FILL_RATIO));
  return clusters.filter((c2) => c2.count >= minCount).sort((a, b) => a.x - b.x);
}
function findTableRegionsByHeader(allRows, columns, headerItems) {
  const regions = [];
  let currentRegion = [];
  let missStreak = 0;
  for (const row of allRows) {
    const matchedCols = countMatchedColumnsRange(row, columns, headerItems);
    if (matchedCols >= MIN_COLS) {
      currentRegion.push(row);
      missStreak = 0;
    } else if (currentRegion.length > 0 && (row.items.length <= 2 || missStreak === 0)) {
      currentRegion.push(row);
      missStreak++;
    } else {
      while (currentRegion.length > 0) {
        const last = currentRegion[currentRegion.length - 1];
        if (countMatchedColumnsRange(last, columns, headerItems) >= MIN_COLS) break;
        currentRegion.pop();
      }
      if (currentRegion.length >= MIN_ROWS) {
        regions.push({ rows: [...currentRegion] });
      }
      currentRegion = [];
      missStreak = 0;
    }
  }
  while (currentRegion.length > 0) {
    const last = currentRegion[currentRegion.length - 1];
    if (countMatchedColumnsRange(last, columns, headerItems) >= MIN_COLS) break;
    currentRegion.pop();
  }
  if (currentRegion.length >= MIN_ROWS) {
    regions.push({ rows: currentRegion });
  }
  return regions;
}
function findTableRegions(allRows, columns) {
  const regions = [];
  let currentRegion = [];
  for (const row of allRows) {
    const matchedCols = countMatchedColumns(row, columns);
    if (matchedCols >= MIN_COLS) {
      currentRegion.push(row);
    } else if (row.items.length === 1) {
      if (currentRegion.length > 0) {
        currentRegion.push(row);
      }
    } else {
      if (currentRegion.length >= MIN_ROWS) {
        regions.push({ rows: [...currentRegion] });
      }
      currentRegion = [];
    }
  }
  if (currentRegion.length >= MIN_ROWS) {
    regions.push({ rows: currentRegion });
  }
  return regions;
}
function countMatchedColumns(row, columns) {
  const matched = /* @__PURE__ */ new Set();
  for (const item of row.items) {
    for (let ci = 0; ci < columns.length; ci++) {
      if (Math.abs(item.x - columns[ci].x) <= COL_CLUSTER_TOL * 2) {
        matched.add(ci);
        break;
      }
    }
  }
  return matched.size;
}
function countMatchedColumnsRange(row, columns, headerItems) {
  const boundaries = [];
  for (let ci = 0; ci < headerItems.length; ci++) {
    const left = ci === 0 ? 0 : (headerItems[ci - 1].x + headerItems[ci - 1].w + headerItems[ci].x) / 2;
    const right = ci === headerItems.length - 1 ? Infinity : (headerItems[ci].x + headerItems[ci].w + headerItems[ci + 1].x) / 2;
    boundaries.push({ left, right });
  }
  const matched = /* @__PURE__ */ new Set();
  for (const item of row.items) {
    for (let ci = 0; ci < boundaries.length; ci++) {
      if (item.x >= boundaries[ci].left && item.x < boundaries[ci].right) {
        matched.add(ci);
        break;
      }
    }
  }
  return matched.size;
}
function assignRowItems(items, columns, numCols) {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const colCenters = columns.map((c2) => c2.x);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push({ idx: i, size: sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w) });
  }
  const gapSizes = gaps.map((g2) => g2.size).sort((a, b) => a - b);
  const medianGap = gapSizes.length > 0 ? gapSizes[Math.floor(gapSizes.length / 2)] : 0;
  const gapThreshold = sorted.length <= numCols + 1 ? 12 : Math.max(medianGap * 2.5, 12);
  const significantGaps = gaps.filter((g2) => g2.size >= gapThreshold).sort((a, b) => b.size - a.size).slice(0, numCols - 1).sort((a, b) => a.idx - b.idx);
  const groups = [];
  let start = 0;
  for (const gap of significantGaps) {
    groups.push(sorted.slice(start, gap.idx));
    start = gap.idx;
  }
  groups.push(sorted.slice(start));
  const result = [];
  const usedCols = /* @__PURE__ */ new Set();
  const groupCenters = groups.map((g2) => {
    let minX = Infinity, maxX = -Infinity;
    for (const i of g2) {
      if (i.x < minX) minX = i.x;
      const r = i.x + i.w;
      if (r > maxX) maxX = r;
    }
    return (minX + maxX) / 2;
  });
  const assignments = [];
  for (let gi = 0; gi < groups.length; gi++) {
    for (let ci = 0; ci < numCols; ci++) {
      assignments.push({ gi, ci, dist: Math.abs(groupCenters[gi] - colCenters[ci]) });
    }
  }
  assignments.sort((a, b) => a.dist - b.dist);
  const assignedGroups = /* @__PURE__ */ new Set();
  for (const { gi, ci } of assignments) {
    if (assignedGroups.has(gi) || usedCols.has(ci)) continue;
    result.push({ col: ci, items: groups[gi] });
    assignedGroups.add(gi);
    usedCols.add(ci);
  }
  for (let gi = 0; gi < groups.length; gi++) {
    if (assignedGroups.has(gi)) continue;
    let bestCol = 0, bestDist = Infinity;
    for (let ci = 0; ci < numCols; ci++) {
      const d = Math.abs(groupCenters[gi] - colCenters[ci]);
      if (d < bestDist) {
        bestDist = d;
        bestCol = ci;
      }
    }
    result.push({ col: bestCol, items: groups[gi] });
  }
  return result;
}
function buildClusterTable(rows, columns, pageNum) {
  const numCols = columns.length;
  const numRows = rows.length;
  if (numRows < MIN_ROWS || numCols < MIN_COLS) return null;
  const cells = Array.from(
    { length: numRows },
    () => Array.from({ length: numCols }, () => ({ text: "", colSpan: 1, rowSpan: 1 }))
  );
  const usedItems = /* @__PURE__ */ new Set();
  for (let r = 0; r < numRows; r++) {
    const row = rows[r];
    if (row.items.length === 1 && numCols > 1) {
      cells[r][0] = { text: row.items[0].text, colSpan: numCols, rowSpan: 1 };
      usedItems.add(row.items[0]);
      continue;
    }
    const assignments = assignRowItems(row.items, columns, numCols);
    for (const { col, items } of assignments) {
      const text = items.map((i) => i.text).join(" ");
      const existing = cells[r][col].text;
      cells[r][col].text = existing ? existing + " " + text : text;
      for (const item of items) usedItems.add(item);
    }
  }
  let emptyRows = 0;
  for (const row of cells) {
    if (row.every((c2) => c2.text === "")) emptyRows++;
  }
  if (emptyRows > numRows * 0.5) return null;
  for (let c2 = 0; c2 < numCols; c2++) {
    const hasValue = cells.some((row) => row[c2].text !== "");
    if (!hasValue) return null;
  }
  for (let r = numRows - 1; r >= 1; r--) {
    const nonEmptyCols = cells[r].filter((c2) => c2.text.trim()).length;
    if (nonEmptyCols !== 1) continue;
    if (cells[r][0].text.trim() !== "") continue;
    const contentText = cells[r].find((c2) => c2.text.trim())?.text.trim() || "";
    if (/^[○●▶\-·]/.test(contentText)) continue;
    for (let pr = r - 1; pr >= 0; pr--) {
      if (cells[pr].some((c2) => c2.text.trim())) {
        for (let c2 = 0; c2 < numCols; c2++) {
          const prev = cells[pr][c2].text.trim();
          const curr = cells[r][c2].text.trim();
          if (curr) cells[pr][c2].text = prev ? prev + " " + curr : curr;
        }
        for (let c2 = 0; c2 < numCols; c2++) cells[r][c2].text = "";
        break;
      }
    }
  }
  for (let r = 0; r < cells.length - 1; r++) {
    const row = cells[r];
    const hasCol0 = row[0].text.trim() !== "";
    const hasColLast = numCols > 1 && row[numCols - 1].text.trim() !== "";
    const midEmpty = row.slice(1, numCols - 1).every((c2) => c2.text.trim() === "");
    if (hasCol0 && hasColLast && midEmpty) {
      const next = cells[r + 1];
      if (next[0].text.trim() === "" && next.some((c2) => c2.text.trim())) {
        for (let c2 = 1; c2 < numCols; c2++) {
          const curr = next[c2].text.trim();
          if (curr) row[c2].text = row[c2].text.trim() ? row[c2].text.trim() + " " + curr : curr;
        }
        for (let c2 = 0; c2 < numCols; c2++) next[c2].text = "";
      }
    }
  }
  const filteredCells = cells.filter((row) => row.some((c2) => c2.text.trim()));
  const finalRowCount = filteredCells.length;
  if (finalRowCount < MIN_ROWS) return null;
  const irTable = {
    rows: finalRowCount,
    cols: numCols,
    cells: filteredCells,
    hasHeader: finalRowCount > 1
  };
  const allItems = rows.flatMap((r) => r.items);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of allItems) {
    if (i.x < minX) minX = i.x;
    if (i.y < minY) minY = i.y;
    if (i.x + i.w > maxX) maxX = i.x + i.w;
    const h = i.h > 0 ? i.h : i.fontSize;
    if (i.y + h > maxY) maxY = i.y + h;
  }
  return {
    table: irTable,
    bbox: { page: pageNum, x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    usedItems
  };
}
var Y_TOL, COL_CLUSTER_TOL, MIN_ROWS, MIN_COLS, MIN_GAP_FACTOR, MIN_GAP_ABSOLUTE, MIN_COL_FILL_RATIO;
var init_cluster_detector = __esm({
  "src/pdf/cluster-detector.ts"() {
    "use strict";
    Y_TOL = 3;
    COL_CLUSTER_TOL = 15;
    MIN_ROWS = 3;
    MIN_COLS = 2;
    MIN_GAP_FACTOR = 2;
    MIN_GAP_ABSOLUTE = 20;
    MIN_COL_FILL_RATIO = 0.4;
  }
});

// src/pdf/polyfill.ts
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
var g;
var init_polyfill = __esm({
  "src/pdf/polyfill.ts"() {
    "use strict";
    g = globalThis;
    if (typeof g.DOMMatrix === "undefined") {
      g.DOMMatrix = class DOMMatrix {
        m = [1, 0, 0, 1, 0, 0];
        constructor(init) {
          if (init) this.m = init;
        }
      };
    }
    if (typeof g.Path2D === "undefined") {
      g.Path2D = class Path2D {
      };
    }
    g.pdfjsWorker = pdfjsWorker;
  }
});

// src/ocr/provider.ts
var provider_exports = {};
__export(provider_exports, {
  ocrPages: () => ocrPages
});
async function ocrPages(doc, provider, pageFilter, effectivePageCount) {
  const blocks = [];
  for (let i = 1; i <= effectivePageCount; i++) {
    if (pageFilter && !pageFilter.has(i)) continue;
    const page = await doc.getPage(i);
    try {
      const imageData = await renderPageToPng(page);
      const text = await provider(imageData, i, "image/png");
      if (text.trim()) {
        blocks.push({ type: "paragraph", text: text.trim(), pageNumber: i });
      }
    } catch {
      blocks.push({ type: "paragraph", text: `[OCR \uC2E4\uD328: \uD398\uC774\uC9C0 ${i}]` });
    }
  }
  return blocks;
}
async function renderPageToPng(page) {
  let createCanvas;
  try {
    const canvasModule = await import("canvas");
    createCanvas = canvasModule.createCanvas;
  } catch {
    throw new Error("OCR\uC744 \uC0AC\uC6A9\uD558\uB824\uBA74 'canvas' \uD328\uD0A4\uC9C0\uB97C \uC124\uCE58\uD558\uC138\uC694: npm install canvas");
  }
  const scale = 2;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return new Uint8Array(canvas.toBuffer("image/png"));
}
var init_provider = __esm({
  "src/ocr/provider.ts"() {
    "use strict";
  }
});

// src/pdf/formula/models.ts
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { mkdir, stat, unlink, rename } from "fs/promises";
import { createWriteStream } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
function getFormulaModelsDir() {
  const override = process.env.KORDOC_MODEL_CACHE;
  if (override && override.trim()) {
    return join(override, "pix2text");
  }
  return join(homedir(), ".cache", "kordoc", "models", "pix2text");
}
async function getFormulaModelStatus() {
  const dir = getFormulaModelsDir();
  const result = [];
  for (const spec of ALL_FORMULA_MODELS) {
    const localPath = join(dir, spec.filename);
    let exists = false;
    try {
      const s = await stat(localPath);
      exists = s.isFile() && s.size > 0;
    } catch {
      exists = false;
    }
    if (!exists) {
      result.push({ spec, localPath, exists: false, verified: false });
      continue;
    }
    try {
      const actual = await sha256OfFile(localPath);
      if (actual === spec.sha256) {
        result.push({ spec, localPath, exists: true, verified: true });
      } else {
        result.push({
          spec,
          localPath,
          exists: true,
          verified: false,
          invalidReason: `SHA256 mismatch: expected ${spec.sha256}, got ${actual}`
        });
      }
    } catch (e) {
      result.push({
        spec,
        localPath,
        exists: true,
        verified: false,
        invalidReason: `SHA compute failed: ${e.message}`
      });
    }
  }
  return result;
}
async function ensureFormulaModels(onProgress) {
  const dir = getFormulaModelsDir();
  await mkdir(dir, { recursive: true });
  for (const spec of ALL_FORMULA_MODELS) {
    const localPath = join(dir, spec.filename);
    if (await isExistingValid(localPath, spec.sha256)) {
      onProgress?.({
        spec,
        downloaded: 0,
        total: null,
        phase: "skip",
        message: "\uC774\uBBF8 \uC874\uC7AC + SHA \uC77C\uCE58"
      });
      continue;
    }
    try {
      await unlink(localPath);
    } catch {
    }
    await downloadToFile(spec, localPath, onProgress);
  }
}
async function ensureSingleModel(spec, onProgress) {
  const dir = getFormulaModelsDir();
  await mkdir(dir, { recursive: true });
  const localPath = join(dir, spec.filename);
  if (await isExistingValid(localPath, spec.sha256)) {
    onProgress?.({ spec, downloaded: 0, total: null, phase: "skip" });
    return;
  }
  try {
    await unlink(localPath);
  } catch {
  }
  await downloadToFile(spec, localPath, onProgress);
}
async function isExistingValid(localPath, sha256Expected) {
  try {
    const s = await stat(localPath);
    if (!s.isFile() || s.size === 0) return false;
  } catch {
    return false;
  }
  try {
    const actual = await sha256OfFile(localPath);
    return actual === sha256Expected;
  } catch {
    return false;
  }
}
async function downloadToFile(spec, localPath, onProgress) {
  const partPath = `${localPath}.part`;
  await mkdir(dirname(localPath), { recursive: true });
  const resp = await fetch(spec.url, {
    headers: {
      // HF CDN 은 UA 없으면 가끔 403 을 뱉는다
      "User-Agent": "kordoc-formula-ocr/1.0 (+https://github.com/chrisryugj/kordoc)"
    }
  });
  if (!resp.ok || !resp.body) {
    throw new Error(
      `${spec.name} \uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328: HTTP ${resp.status} ${resp.statusText} (${spec.url})`
    );
  }
  const lenHeader = resp.headers.get("content-length");
  const total = lenHeader ? Number.parseInt(lenHeader, 10) : null;
  let downloaded = 0;
  const ws = createWriteStream(partPath);
  try {
    const reader = Readable.fromWeb(resp.body);
    reader.on("data", (chunk) => {
      downloaded += chunk.length;
      onProgress?.({
        spec,
        downloaded,
        total,
        phase: "download"
      });
    });
    await pipeline(reader, ws);
  } catch (e) {
    try {
      await unlink(partPath);
    } catch {
    }
    throw new Error(`${spec.name} \uC2A4\uD2B8\uB9AC\uBC0D \uC2E4\uD328: ${e.message}`);
  }
  onProgress?.({
    spec,
    downloaded,
    total,
    phase: "verify"
  });
  let actual;
  try {
    actual = await sha256OfFile(partPath);
  } catch (e) {
    try {
      await unlink(partPath);
    } catch {
    }
    throw new Error(`${spec.name} SHA \uACC4\uC0B0 \uC2E4\uD328: ${e.message}`);
  }
  if (actual !== spec.sha256) {
    try {
      await unlink(partPath);
    } catch {
    }
    throw new Error(
      `${spec.name} SHA256 mismatch: expected ${spec.sha256}, got ${actual} \u2014 \uBAA8\uB378 URL \uC774 \uC624\uC5FC\uB418\uC5C8\uAC70\uB098 \uC804\uC1A1 \uC911 \uC190\uC0C1\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`
    );
  }
  await rename(partPath, localPath);
  onProgress?.({
    spec,
    downloaded,
    total,
    phase: "done"
  });
}
async function sha256OfFile(p) {
  const h = createHash("sha256");
  const stream = createReadStream(p);
  await pipeline(stream, async function* (src) {
    for await (const chunk of src) {
      h.update(chunk);
    }
  });
  return h.digest("hex");
}
var MFD_MODEL, MFR_ENCODER_MODEL, MFR_DECODER_MODEL, MFR_TOKENIZER, ALL_FORMULA_MODELS;
var init_models = __esm({
  "src/pdf/formula/models.ts"() {
    "use strict";
    MFD_MODEL = {
      name: "Pix2Text MFD",
      filename: "mfd.onnx",
      url: "https://huggingface.co/breezedeus/pix2text-mfd/resolve/main/mfd-v20240618.onnx",
      sha256: "51a8854743b17ae654729af8db82a630c1ccfa06debf4856c8b28055f87d02c1",
      sizeMb: 42
    };
    MFR_ENCODER_MODEL = {
      name: "Pix2Text MFR encoder",
      filename: "encoder_model.onnx",
      url: "https://huggingface.co/breezedeus/pix2text-mfr/resolve/main/encoder_model.onnx",
      sha256: "bd8d5c322792e9ec45793af5569e9748f82a3d728a9e00213dbfc56c1486f37d",
      sizeMb: 87
    };
    MFR_DECODER_MODEL = {
      name: "Pix2Text MFR decoder",
      filename: "decoder_model.onnx",
      url: "https://huggingface.co/breezedeus/pix2text-mfr/resolve/main/decoder_model.onnx",
      sha256: "fd0f92d7a012f3dae41e1ac79421aea0ea888b5a66cb3f9a004e424f82f3daed",
      sizeMb: 30
    };
    MFR_TOKENIZER = {
      name: "Pix2Text MFR tokenizer",
      filename: "tokenizer.json",
      url: "https://huggingface.co/breezedeus/pix2text-mfr/resolve/main/tokenizer.json",
      sha256: "3e2ab757277d22639bec28c9d7972e352d3d1dba223051fa674002dc5ab64df3",
      sizeMb: 1
    };
    ALL_FORMULA_MODELS = [
      MFD_MODEL,
      MFR_ENCODER_MODEL,
      MFR_DECODER_MODEL,
      MFR_TOKENIZER
    ];
  }
});

// src/pdf/formula/postprocess.ts
function postProcessLatex(latex) {
  let s = stripTrailingWhitespace(latex);
  s = collapseSpaces(s);
  for (let i = 0; i < 10; i++) {
    const next = stripEmptyGroups(s);
    if (next === s) break;
    s = next;
  }
  s = fixLatexSpacing(s);
  s = normalizeFormulaSpacing(s);
  s = s.trim();
  if (isTrivialFormula(s)) return "";
  return s;
}
function stripTrailingWhitespace(s) {
  let t = s;
  for (; ; ) {
    const trimmed = t.replace(/[\s]+$/, "");
    let changed = false;
    for (const p of TRAILING_WHITESPACE_CMDS) {
      if (trimmed.endsWith(p)) {
        t = trimmed.slice(0, trimmed.length - p.length);
        changed = true;
        break;
      }
    }
    if (!changed) return trimmed;
  }
}
function collapseSpaces(s) {
  let out = "";
  let prevSpace = false;
  for (const c2 of s) {
    if (/\s/.test(c2)) {
      if (!prevSpace) {
        out += " ";
        prevSpace = true;
      }
    } else {
      out += c2;
      prevSpace = false;
    }
  }
  return out;
}
function stripEmptyGroups(s) {
  let out = "";
  let i = 0;
  const bytes = s;
  while (i < bytes.length) {
    const ch = bytes[i];
    if (ch === "{") {
      let j = i + 1;
      while (j < bytes.length && /\s/.test(bytes[j])) j++;
      if (j < bytes.length && bytes[j] === "}") {
        while (out.endsWith(" ") || out.endsWith("	")) {
          out = out.slice(0, -1);
        }
        if (out.endsWith("^") || out.endsWith("_")) {
          out = out.slice(0, -1);
        } else {
          let k = out.length;
          while (k > 0 && /[A-Za-z]/.test(out[k - 1])) k--;
          if (k > 0 && out[k - 1] === "\\" && k < out.length) {
            out = out.slice(0, k - 1);
          }
        }
        i = j + 1;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}
function fixLatexSpacing(s) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\\" && i + 1 < s.length && /[A-Za-z]/.test(s[i + 1])) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
      const full = s.slice(i + 1, j);
      const nextChar = j < s.length ? s[j] : "";
      if (nextChar === "{") {
        out += "\\" + full;
        i = j;
        continue;
      }
      let splitAt = full.length;
      if (!KNOWN_LATEX_CMDS.has(full) && full.length >= 3) {
        for (let len = full.length - 1; len >= 2; len--) {
          if (KNOWN_LATEX_CMDS.has(full.slice(0, len))) {
            splitAt = len;
            break;
          }
        }
      }
      out += "\\" + full.slice(0, splitAt);
      if (splitAt < full.length) {
        out += " " + full.slice(splitAt);
      }
      i = j;
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
}
function isTrivialFormula(s) {
  const t = s.trim();
  if (t.length === 0) return true;
  const stripped = t.replace(/[\s{}]/g, "");
  if (stripped.length <= 2) return true;
  if (/^\\[A-Za-z]+$/.test(t)) return true;
  if (/^\\(?:mathrm|textrm|text|operatorname|mathit|mathbf|mathcal|mathsf|mathtt)\{[A-Za-z]{1,6}\}$/.test(
    t
  ))
    return true;
  const tokens = tokenizeLatex(t);
  if (tokens.length >= 3) {
    const freq = /* @__PURE__ */ new Map();
    for (const tok of tokens) freq.set(tok, (freq.get(tok) ?? 0) + 1);
    let maxCount = 0;
    for (const c2 of freq.values()) if (c2 > maxCount) maxCount = c2;
    if (maxCount >= 3 && maxCount / tokens.length >= 0.5) return true;
  }
  if (tokens.length >= 2 && tokens.length <= 4) {
    const hasOpOrNum = tokens.some(
      (tok) => /^[=+\-/*<>]$/.test(tok) || /^[0-9]$/.test(tok)
    );
    if (!hasOpOrNum) return true;
  }
  if (hasHighRepetition(t)) return true;
  if (t.includes("\\square")) return true;
  if (/^[-+]?\d+\.?\d*$/.test(t.replace(/[\s{}\\]/g, ""))) return true;
  if (/(\([^()]{2,15}\))\s*\1/.test(t)) return true;
  if (/(\{(?:[^{}]|\{[^{}]*\})+\})\s*\1/.test(t)) return true;
  const argMatch = t.match(/^[A-Za-z\\][A-Za-z]*\(([^()]+)\)$/);
  if (argMatch) {
    const args = argMatch[1].split(",").map((a) => a.trim());
    if (args.length >= 2) {
      const freq = /* @__PURE__ */ new Map();
      for (const a of args) if (a) freq.set(a, (freq.get(a) ?? 0) + 1);
      for (const [, c2] of freq) {
        if (c2 >= 2 && c2 / args.length >= 0.5) return true;
      }
    }
  }
  if (/\\frac\{([^{}]+)\}\{\1\}/.test(t)) return true;
  if (/(\\[A-Za-z]+|\b[A-Za-z])\s*\/\s*\1\b/.test(t)) return true;
  if (/\\begin\{(?:matrix|pmatrix|bmatrix|vmatrix)\}/.test(t)) {
    const cdotsCount = (t.match(/\\cdots/g) ?? []).length;
    if (cdotsCount >= 2) return true;
  }
  if (tokens.length <= 12) {
    const mathrmCount = (t.match(/\\mathrm\{/g) ?? []).length;
    if (mathrmCount >= 2) {
      const hasRealMath = /[=+\-*/<>^]/.test(t) && /\d/.test(t);
      if (!hasRealMath) return true;
    }
  }
  if (/^[a-zA-Z]{2,3}_\{\\mathrm\{[a-zA-Z]{3,}\}\}$/.test(t)) return true;
  if (/^\\mathrm\{[a-z]{2,}\}[-+][-+]?(?:\\[a-zA-Z]+|[a-zA-Z0-9])$/.test(t)) return true;
  if (/\\(?:mathsf|mathtt|texttt)\{/.test(t)) return true;
  if (/\\begin\{aligned\}/.test(t) && !t.includes("=")) return true;
  if (/\\begin\{matrix\}/.test(t) && (t.match(/\\downarrow/g) ?? []).length >= 2) return true;
  return false;
}
function hasHighRepetition(s) {
  if (s.length < 15) return false;
  for (let len = 5; len <= 15; len++) {
    if (len * 3 > s.length) break;
    const seen = /* @__PURE__ */ new Map();
    for (let i = 0; i <= s.length - len; i++) {
      const sub = s.slice(i, i + len);
      if (!/[a-zA-Z]/.test(sub)) continue;
      seen.set(sub, (seen.get(sub) ?? 0) + 1);
    }
    for (const [, count] of seen) {
      if (count < 3) continue;
      if (count * len / s.length >= 0.6) return true;
    }
  }
  return false;
}
function tokenizeLatex(s) {
  const result = [];
  let i = 0;
  while (i < s.length) {
    const c2 = s[i];
    if (c2 === "\\") {
      let j = i + 1;
      while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
      if (j === i + 1 && j < s.length) j++;
      result.push(s.slice(i, j));
      i = j;
    } else if (/\s/.test(c2)) {
      i++;
    } else {
      result.push(c2);
      i++;
    }
  }
  return result;
}
function normalizeFormulaSpacing(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c2 = s[i];
    if (c2 === "\\") {
      let j = i + 1;
      while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
      if (j === i + 1 && j < s.length) j++;
      tokens.push(s.slice(i, j));
      i = j;
    } else if (/\s/.test(c2)) {
      tokens.push(" ");
      i++;
    } else {
      tokens.push(c2);
      i++;
    }
  }
  const out = [];
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k] !== " ") {
      out.push(tokens[k]);
      continue;
    }
    let prev = "";
    for (let p = k - 1; p >= 0; p--) {
      if (tokens[p] !== " ") {
        prev = tokens[p];
        break;
      }
    }
    let next = "";
    for (let q = k + 1; q < tokens.length; q++) {
      if (tokens[q] !== " ") {
        next = tokens[q];
        break;
      }
    }
    const prevIsCmd = /^\\[A-Za-z]+$/.test(prev);
    const nextIsAlpha = /^[A-Za-z]$/.test(next);
    if (prevIsCmd && nextIsAlpha) {
      if (out.length === 0 || out[out.length - 1] !== " ") {
        out.push(" ");
      }
    }
  }
  while (out.length > 0 && out[0] === " ") out.shift();
  while (out.length > 0 && out[out.length - 1] === " ") out.pop();
  return out.join("");
}
var TRAILING_WHITESPACE_CMDS, KNOWN_LATEX_CMDS;
var init_postprocess = __esm({
  "src/pdf/formula/postprocess.ts"() {
    "use strict";
    TRAILING_WHITESPACE_CMDS = [
      "\\,",
      "\\:",
      "\\;",
      "\\!",
      "\\ ",
      "\\quad",
      "\\qquad",
      "\\enspace",
      "\\thinspace"
    ];
    KNOWN_LATEX_CMDS = /* @__PURE__ */ new Set([
      // 연산자
      "cdot",
      "cdots",
      "ldots",
      "dots",
      "vdots",
      "ddots",
      "times",
      "div",
      "pm",
      "mp",
      "ast",
      "star",
      "circ",
      "bullet",
      "oplus",
      "ominus",
      "otimes",
      "odot",
      // 관계
      "approx",
      "equiv",
      "neq",
      "ne",
      "sim",
      "simeq",
      "cong",
      "leq",
      "geq",
      "le",
      "ge",
      "ll",
      "gg",
      "prec",
      "succ",
      "preceq",
      "succeq",
      "propto",
      "parallel",
      "perp",
      // 집합/논리
      "in",
      "notin",
      "ni",
      "subset",
      "supset",
      "subseteq",
      "supseteq",
      "cap",
      "cup",
      "bigcap",
      "bigcup",
      "emptyset",
      "varnothing",
      "forall",
      "exists",
      "nexists",
      "neg",
      "lnot",
      "land",
      "lor",
      "vee",
      "wedge",
      // 그리스 소문자
      "alpha",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "varepsilon",
      "zeta",
      "eta",
      "theta",
      "vartheta",
      "iota",
      "kappa",
      "lambda",
      "mu",
      "nu",
      "xi",
      "omicron",
      "pi",
      "varpi",
      "rho",
      "varrho",
      "sigma",
      "varsigma",
      "tau",
      "upsilon",
      "phi",
      "varphi",
      "chi",
      "psi",
      "omega",
      // 그리스 대문자
      "Gamma",
      "Delta",
      "Theta",
      "Lambda",
      "Xi",
      "Pi",
      "Sigma",
      "Upsilon",
      "Phi",
      "Psi",
      "Omega",
      // 화살표
      "to",
      "gets",
      "mapsto",
      "rightarrow",
      "leftarrow",
      "leftrightarrow",
      "Rightarrow",
      "Leftarrow",
      "Leftrightarrow",
      "uparrow",
      "downarrow",
      "longrightarrow",
      "longleftarrow",
      "longmapsto",
      // 큰 연산자
      "sum",
      "prod",
      "coprod",
      "int",
      "iint",
      "iiint",
      "oint",
      "bigoplus",
      "bigotimes",
      // 함수명
      "sin",
      "cos",
      "tan",
      "sec",
      "csc",
      "cot",
      "arcsin",
      "arccos",
      "arctan",
      "sinh",
      "cosh",
      "tanh",
      "log",
      "ln",
      "lg",
      "exp",
      "lim",
      "liminf",
      "limsup",
      "sup",
      "inf",
      "max",
      "min",
      "arg",
      "det",
      "dim",
      "gcd",
      "deg",
      "hom",
      "ker",
      "mod",
      // 특수 기호/수식
      "infty",
      "partial",
      "nabla",
      "prime",
      "aleph",
      "ell",
      "hbar",
      "Re",
      "Im",
      "top",
      "bot",
      "angle",
      "vdash",
      "dashv",
      // 기타
      "left",
      "right",
      "big",
      "Big",
      "bigg",
      "Bigg"
    ]);
  }
});

// src/pdf/formula/detector.ts
async function detectFormulaRegions(session, frame, ort) {
  const { scale, padX, padY, tensor } = letterbox(frame, MFD_IMG_SIZE);
  const input = new ort.Tensor("float32", tensor, [1, 3, MFD_IMG_SIZE, MFD_IMG_SIZE]);
  const feeds = { images: input };
  const outputs = await session.run(feeds);
  const firstKey = Object.keys(outputs)[0];
  const out = outputs[firstKey];
  if (!out || out.type !== "float32") {
    throw new Error("MFD \uCD9C\uB825 \uC5C6\uC74C \uB610\uB294 dtype \uBD88\uC77C\uCE58");
  }
  const outDims = out.dims;
  if (outDims.length !== 3) {
    throw new Error(`MFD \uCD9C\uB825 \uCC28\uC6D0 \uC608\uC0C1 3, \uC2E4\uC81C ${outDims.length}: [${outDims.join(",")}]`);
  }
  const channels = outDims[1];
  const anchors = outDims[2];
  if (channels !== MFD_CHANNELS) {
    throw new Error(`MFD \uCC44\uB110 \uC218 \uC608\uC0C1 ${MFD_CHANNELS}, \uC2E4\uC81C ${channels}`);
  }
  if (anchors <= 0) return [];
  const data = out.data;
  const candidates = [];
  for (let a = 0; a < anchors; a++) {
    const cx = data[a];
    const cy = data[anchors + a];
    const w = data[2 * anchors + a];
    const h = data[3 * anchors + a];
    let bestCls = 0;
    let bestScore = 0;
    for (let c2 = 0; c2 < MFD_NUM_CLASSES; c2++) {
      const s = data[(4 + c2) * anchors + a];
      if (s > bestScore) {
        bestScore = s;
        bestCls = c2;
      }
    }
    const threshold = bestCls === 1 ? MFD_CONF_DISPLAY : MFD_CONF_INLINE;
    if (bestScore < threshold) continue;
    let x1 = (cx - w / 2 - padX) / scale;
    let y1 = (cy - h / 2 - padY) / scale;
    let x2 = (cx + w / 2 - padX) / scale;
    let y2 = (cy + h / 2 - padY) / scale;
    x1 = clamp(x1, 0, frame.width - 1);
    y1 = clamp(y1, 0, frame.height - 1);
    x2 = clamp(x2, 0, frame.width - 1);
    y2 = clamp(y2, 0, frame.height - 1);
    if (x2 - x1 < 2 || y2 - y1 < 2) continue;
    if ((x2 - x1) * (y2 - y1) < MFD_MIN_AREA) continue;
    candidates.push({
      x1,
      y1,
      x2,
      y2,
      kind: bestCls === 1 ? "display" : "inline",
      score: bestScore
    });
  }
  const kept = [];
  for (const kind of ["inline", "display"]) {
    const subset = candidates.filter((c2) => c2.kind === kind);
    kept.push(...nms(subset, MFD_IOU_THRESHOLD));
  }
  kept.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  return kept.map((d) => ({
    bbox: { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 },
    kind: d.kind,
    score: d.score
  }));
}
function letterbox(frame, target) {
  const w = frame.width;
  const h = frame.height;
  const scale = Math.min(target / w, target / h);
  const newW = Math.max(1, Math.round(w * scale));
  const newH = Math.max(1, Math.round(h * scale));
  const padX = (target - newW) / 2;
  const padY = (target - newH) / 2;
  const offX = Math.floor(padX);
  const offY = Math.floor(padY);
  const ts = target;
  const tensor = new Float32Array(3 * ts * ts);
  tensor.fill(PAD_VALUE);
  const src = frame.data;
  const srcW = frame.width;
  const srcH = frame.height;
  for (let y = 0; y < newH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y + 0.5) / newH * srcH));
    for (let x = 0; x < newW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x + 0.5) / newW * srcW));
      const srcIdx = (sy * srcW + sx) * 4;
      const r = src[srcIdx];
      const g2 = src[srcIdx + 1];
      const b = src[srcIdx + 2];
      const tx = x + offX;
      const ty = y + offY;
      const idx = ty * ts + tx;
      tensor[idx] = r / 255;
      tensor[ts * ts + idx] = g2 / 255;
      tensor[2 * ts * ts + idx] = b / 255;
    }
  }
  return { scale, padX, padY, tensor };
}
function nms(cands, iouThreshold) {
  const sorted = [...cands].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const cand of sorted) {
    let keep = true;
    for (const k of kept) {
      if (iou(cand, k) > iouThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) kept.push(cand);
  }
  return kept;
}
function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const inter = interW * interH;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}
function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
var MFD_IMG_SIZE, MFD_NUM_CLASSES, MFD_CHANNELS, MFD_CONF_INLINE, MFD_CONF_DISPLAY, MFD_IOU_THRESHOLD, MFD_MIN_AREA, PAD_VALUE;
var init_detector = __esm({
  "src/pdf/formula/detector.ts"() {
    "use strict";
    MFD_IMG_SIZE = 768;
    MFD_NUM_CLASSES = 2;
    MFD_CHANNELS = 4 + MFD_NUM_CLASSES;
    MFD_CONF_INLINE = 0.3;
    MFD_CONF_DISPLAY = 0.4;
    MFD_IOU_THRESHOLD = 0.45;
    MFD_MIN_AREA = 80;
    PAD_VALUE = 114 / 255;
  }
});

// src/pdf/formula/recognizer.ts
async function recognizeFormula(deps, crop) {
  const tensor = deitPreprocess(crop, MFR_IMG_SIZE);
  const { ort, encoder, decoder, tokenizer } = deps;
  const pixelInput = new ort.Tensor("float32", tensor, [1, 3, MFR_IMG_SIZE, MFR_IMG_SIZE]);
  const encOut = await encoder.run({ pixel_values: pixelInput });
  const encKey = Object.keys(encOut).find((k) => k.includes("hidden")) ?? Object.keys(encOut)[0];
  const encTensor = encOut[encKey];
  if (!encTensor || encTensor.type !== "float32") {
    throw new Error("MFR encoder \uCD9C\uB825 \uC5C6\uC74C");
  }
  const encDims = encTensor.dims;
  if (encDims.length !== 3) {
    throw new Error(`MFR encoder \uCC28\uC6D0 \uC608\uC0C1 3, \uC2E4\uC81C ${encDims.length}`);
  }
  const encSeq = encDims[1];
  const encHidden = encDims[2];
  if (encHidden !== MFR_ENC_HIDDEN) {
    throw new Error(`MFR encoder hidden \uC608\uC0C1 ${MFR_ENC_HIDDEN}, \uC2E4\uC81C ${encHidden}`);
  }
  const encData = encTensor.data;
  const tokens = [MFR_EOS_ID];
  for (let step = 0; step < MFR_MAX_NEW_TOKENS; step++) {
    const seqLen = tokens.length;
    const idsArr = BigInt64Array.from(tokens.map((t) => BigInt(t)));
    const idsTensor = new ort.Tensor("int64", idsArr, [1, seqLen]);
    const hidCopy = new Float32Array(encData);
    const hidTensor = new ort.Tensor("float32", hidCopy, [1, encSeq, encHidden]);
    const decOut = await decoder.run({
      input_ids: idsTensor,
      encoder_hidden_states: hidTensor
    });
    const logitKey = Object.keys(decOut).find((k) => k.includes("logit")) ?? Object.keys(decOut)[0];
    const logitsTensor = decOut[logitKey];
    if (!logitsTensor || logitsTensor.type !== "float32") {
      throw new Error("MFR decoder logits \uC5C6\uC74C");
    }
    const dims = logitsTensor.dims;
    if (dims.length !== 3) {
      throw new Error(`MFR decoder \uCC28\uC6D0 \uC608\uC0C1 3, \uC2E4\uC81C ${dims.length}`);
    }
    const decSeq = dims[1];
    const vocab = dims[2];
    const logitsData = logitsTensor.data;
    const lastOffset = (decSeq - 1) * vocab;
    let bestId = 0;
    let bestVal = -Infinity;
    for (let v = 0; v < vocab; v++) {
      const val = logitsData[lastOffset + v];
      if (val > bestVal) {
        bestVal = val;
        bestId = v;
      }
    }
    tokens.push(bestId);
    if (bestId === MFR_EOS_ID) break;
  }
  const body = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === MFR_EOS_ID) break;
    if (t === MFR_PAD_ID) continue;
    if (t < 0) continue;
    body.push(t);
  }
  const raw = tokenizer.decode(body, { skip_special_tokens: true });
  return postProcessLatex(raw);
}
function deitPreprocess(crop, target) {
  const ts = target;
  const out = new Float32Array(3 * ts * ts);
  const { data: src, width: srcW, height: srcH } = crop;
  for (let y = 0; y < ts; y++) {
    const sy = Math.min(srcH - 1, Math.max(0, Math.floor((y + 0.5) / ts * srcH)));
    for (let x = 0; x < ts; x++) {
      const sx = Math.min(srcW - 1, Math.max(0, Math.floor((x + 0.5) / ts * srcW)));
      const srcIdx = (sy * srcW + sx) * 4;
      const r = src[srcIdx];
      const g2 = src[srcIdx + 1];
      const b = src[srcIdx + 2];
      const idx = y * ts + x;
      out[idx] = r / 127.5 - 1;
      out[ts * ts + idx] = g2 / 127.5 - 1;
      out[2 * ts * ts + idx] = b / 127.5 - 1;
    }
  }
  return out;
}
var MFR_IMG_SIZE, MFR_ENC_HIDDEN, MFR_MAX_NEW_TOKENS, MFR_EOS_ID, MFR_PAD_ID;
var init_recognizer = __esm({
  "src/pdf/formula/recognizer.ts"() {
    "use strict";
    init_postprocess();
    MFR_IMG_SIZE = 384;
    MFR_ENC_HIDDEN = 384;
    MFR_MAX_NEW_TOKENS = 256;
    MFR_EOS_ID = 2;
    MFR_PAD_ID = 0;
  }
});

// src/pdf/formula/pipeline.ts
import { join as join2 } from "path";
async function tryImport(name, loader) {
  try {
    return await loader();
  } catch (e) {
    throw new Error(
      `\uC218\uC2DD OCR \uC744 \uC0AC\uC6A9\uD558\uB824\uBA74 optional dependency '${name}' \uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \`npm install ${name}\` \uD6C4 \uB2E4\uC2DC \uC2E4\uD589\uD558\uC138\uC694. \uC6D0\uC778: ${e.message}`
    );
  }
}
async function withTimeout(promise, ms, msg) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(msg)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function bgraToRgba(bgra) {
  const out = new Uint8Array(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    out[i] = bgra[i + 2];
    out[i + 1] = bgra[i + 1];
    out[i + 2] = bgra[i];
    out[i + 3] = bgra[i + 3];
  }
  return out;
}
var RENDER_SCALE, FormulaPipeline;
var init_pipeline = __esm({
  "src/pdf/formula/pipeline.ts"() {
    "use strict";
    init_detector();
    init_recognizer();
    init_models();
    RENDER_SCALE = 2;
    FormulaPipeline = class _FormulaPipeline {
      mfd;
      encoder;
      decoder;
      tokenizer;
      ort;
      sharp;
      pdfium;
      opts;
      constructor(parts) {
        this.mfd = parts.mfd;
        this.encoder = parts.encoder;
        this.decoder = parts.decoder;
        this.tokenizer = parts.tokenizer;
        this.ort = parts.ort;
        this.sharp = parts.sharp;
        this.pdfium = parts.pdfium;
        this.opts = parts.opts;
      }
      /**
       * 수식 OCR 엔진 초기화. 모델 파일이 로컬에 없으면 즉시 실패 — 호출자가
       * `ensureFormulaModels()` 를 먼저 돌려야 한다.
       */
      static async create(options) {
        const opts = {
          scale: options?.scale ?? RENDER_SCALE,
          maxRegionsPerPage: options?.maxRegionsPerPage ?? 50,
          pageTimeoutMs: options?.pageTimeoutMs ?? 6e4
        };
        const [ortMod, sharpModRaw, hfMod, pdfiumMod] = await Promise.all([
          tryImport(
            "onnxruntime-node",
            () => import("onnxruntime-node")
          ),
          tryImport(
            "sharp",
            () => import("sharp")
          ),
          tryImport(
            "@huggingface/transformers",
            () => import("@huggingface/transformers")
          ),
          tryImport(
            "@hyzyla/pdfium",
            () => import("@hyzyla/pdfium")
          )
        ]);
        const sharpAny = sharpModRaw;
        const sharpMod = typeof sharpAny === "function" ? sharpAny : sharpAny.default ?? sharpAny;
        const modelsDir = getFormulaModelsDir();
        const mfdPath = join2(modelsDir, MFD_MODEL.filename);
        const encPath = join2(modelsDir, MFR_ENCODER_MODEL.filename);
        const decPath = join2(modelsDir, MFR_DECODER_MODEL.filename);
        const tokPath = join2(modelsDir, MFR_TOKENIZER.filename);
        const sessionOpts = {
          graphOptimizationLevel: "all",
          executionProviders: ["cpu"]
        };
        const [mfd, encoder, decoder] = await Promise.all([
          ortMod.InferenceSession.create(mfdPath, sessionOpts),
          ortMod.InferenceSession.create(encPath, sessionOpts),
          ortMod.InferenceSession.create(decPath, sessionOpts)
        ]);
        const { readFile: readFile3 } = await import("fs/promises");
        const tokenizerJson = JSON.parse(await readFile3(tokPath, "utf-8"));
        const PretrainedCtor = hfMod.PreTrainedTokenizer;
        const tokenizer = new PretrainedCtor(tokenizerJson, {});
        const pdfium = await pdfiumMod.PDFiumLibrary.init();
        return new _FormulaPipeline({
          mfd,
          encoder,
          decoder,
          tokenizer,
          ort: ortMod,
          sharp: sharpMod,
          pdfium,
          opts
        });
      }
      /** 리소스 해제 — 더 이상 사용하지 않을 때 호출. */
      async destroy() {
        try {
          this.pdfium.destroy();
        } catch {
        }
      }
      /**
       * PDF 버퍼를 열어 페이지별 수식 영역을 인식한다.
       * 실패한 페이지는 skip (에러 전파 없음 — 로그만).
       *
       * @param pageFilter null 이면 전체 페이지. Set 이면 1-based 페이지 번호 일치만.
       */
      async runOnBuffer(buffer, pageFilter = null, onPageProgress) {
        const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const doc = await this.pdfium.loadDocument(view);
        try {
          const pages = [];
          let pageIdx = 0;
          for (const page of doc.pages()) {
            pageIdx++;
            if (pageFilter && !pageFilter.has(page.number)) continue;
            onPageProgress?.(page.number, doc.getPageCount());
            try {
              const result = await withTimeout(
                this.processPage(page.number, page),
                this.opts.pageTimeoutMs,
                `formula page ${page.number} timed out after ${this.opts.pageTimeoutMs}ms`
              );
              if (result) pages.push(result);
            } catch (e) {
              process.stderr.write(
                `[kordoc-formula] page ${page.number} skipped: ${e.message}
`
              );
            }
          }
          return pages;
        } finally {
          doc.destroy();
        }
      }
      async processPage(pageNumber, page) {
        const { originalWidth: pdfWidth, originalHeight: pdfHeight } = page.getOriginalSize();
        const sharpCtor = this.sharp;
        const rendered = await page.render({
          scale: this.opts.scale,
          render: async ({ data, width, height }) => {
            return data;
          }
        });
        const { data: bgra, width: rw, height: rh } = rendered;
        const rgba = bgraToRgba(bgra);
        const pageFrame = { width: rw, height: rh, data: rgba };
        const regions0 = await detectFormulaRegions(this.mfd, pageFrame, this.ort);
        if (regions0.length === 0) {
          return { pageNumber, renderedWidth: rw, renderedHeight: rh, pdfWidth, pdfHeight, regions: [] };
        }
        const capped = regions0.slice(0, this.opts.maxRegionsPerPage);
        const regions = [];
        for (const r of capped) {
          const x1 = Math.floor(Math.max(0, r.bbox.x1));
          const y1 = Math.floor(Math.max(0, r.bbox.y1));
          const x2 = Math.ceil(Math.min(rw, r.bbox.x2));
          const y2 = Math.ceil(Math.min(rh, r.bbox.y2));
          const cw = x2 - x1;
          const ch = y2 - y1;
          if (cw < 4 || ch < 4) continue;
          const cropRgba = await sharpCtor(rgba, {
            raw: { width: rw, height: rh, channels: 4 }
          }).extract({ left: x1, top: y1, width: cw, height: ch }).raw().toBuffer();
          const cropFrame = { width: cw, height: ch, data: new Uint8Array(cropRgba) };
          let latex = "";
          try {
            latex = await recognizeFormula(
              {
                encoder: this.encoder,
                decoder: this.decoder,
                tokenizer: this.tokenizer,
                ort: this.ort
              },
              cropFrame
            );
          } catch (e) {
            process.stderr.write(
              `[kordoc-formula] recognize failed at page ${pageNumber} ${JSON.stringify(r.bbox)}: ${e.message}
`
            );
            latex = "";
          }
          regions.push({ ...r, latex });
        }
        return {
          pageNumber,
          renderedWidth: rw,
          renderedHeight: rh,
          pdfWidth,
          pdfHeight,
          regions
        };
      }
    };
  }
});

// src/pdf/formula/index.ts
var formula_exports = {};
__export(formula_exports, {
  ALL_FORMULA_MODELS: () => ALL_FORMULA_MODELS,
  FormulaPipeline: () => FormulaPipeline,
  MFD_MODEL: () => MFD_MODEL,
  MFR_DECODER_MODEL: () => MFR_DECODER_MODEL,
  MFR_ENCODER_MODEL: () => MFR_ENCODER_MODEL,
  MFR_TOKENIZER: () => MFR_TOKENIZER,
  ensureFormulaModels: () => ensureFormulaModels,
  ensureSingleModel: () => ensureSingleModel,
  getFormulaModelStatus: () => getFormulaModelStatus,
  getFormulaModelsDir: () => getFormulaModelsDir,
  postProcessLatex: () => postProcessLatex
});
var init_formula = __esm({
  "src/pdf/formula/index.ts"() {
    "use strict";
    init_models();
    init_postprocess();
    init_pipeline();
  }
});

// src/pdf/parser.ts
var parser_exports = {};
__export(parser_exports, {
  cleanPdfText: () => cleanPdfText,
  extractPdfMetadataOnly: () => extractPdfMetadataOnly,
  parsePdfDocument: () => parsePdfDocument
});
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
async function loadPdfWithTimeout(buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false
  });
  let timer;
  try {
    return await Promise.race([
      loadingTask.promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          loadingTask.destroy();
          reject(new KordocError("PDF \uB85C\uB529 \uD0C0\uC784\uC544\uC6C3 (30\uCD08 \uCD08\uACFC)"));
        }, PDF_LOAD_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
}
async function parsePdfDocument(buffer, options) {
  const formulaBuffer = options?.formulaOcr ? buffer.slice(0) : null;
  const doc = await loadPdfWithTimeout(buffer);
  try {
    const pageCount = doc.numPages;
    if (pageCount === 0) throw new KordocError("PDF\uC5D0 \uD398\uC774\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const metadata = { pageCount };
    await extractPdfMetadata(doc, metadata);
    const blocks = [];
    const warnings = [];
    let totalChars = 0;
    let totalTextBytes = 0;
    const effectivePageCount = Math.min(pageCount, MAX_PAGES);
    const pageFilter = options?.pages ? parsePageRange(options.pages, effectivePageCount) : null;
    const totalTarget = pageFilter ? pageFilter.size : effectivePageCount;
    const fontSizeFreq = /* @__PURE__ */ new Map();
    const pageHeights = /* @__PURE__ */ new Map();
    let parsedPages = 0;
    for (let i = 1; i <= effectivePageCount; i++) {
      if (pageFilter && !pageFilter.has(i)) continue;
      try {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        pageHeights.set(i, viewport.height);
        const rawItems = tc.items;
        const items = normalizeItems(rawItems);
        const { visible, hiddenCount } = filterHiddenText(items, viewport.width, viewport.height);
        if (hiddenCount > 0) {
          warnings.push({ page: i, message: `${hiddenCount}\uAC1C \uC228\uACA8\uC9C4 \uD14D\uC2A4\uD2B8 \uC694\uC18C \uD544\uD130\uB9C1\uB428`, code: "HIDDEN_TEXT_FILTERED" });
        }
        for (const item of visible) {
          if (item.fontSize > 0) fontSizeFreq.set(item.fontSize, (fontSizeFreq.get(item.fontSize) || 0) + 1);
        }
        const opList = await page.getOperatorList();
        const pageBlocks = extractPageBlocksWithLines(visible, i, opList, viewport.width, viewport.height);
        for (const b of pageBlocks) blocks.push(b);
        for (const b of pageBlocks) {
          const t = b.text || "";
          totalChars += t.replace(/\s/g, "").length;
          totalTextBytes += t.length * 2;
        }
        if (totalTextBytes > MAX_TOTAL_TEXT) throw new KordocError("\uD14D\uC2A4\uD2B8 \uCD94\uCD9C \uD06C\uAE30 \uCD08\uACFC");
        parsedPages++;
        options?.onProgress?.(parsedPages, totalTarget);
      } catch (pageErr) {
        if (pageErr instanceof KordocError) throw pageErr;
        warnings.push({ page: i, message: `\uD398\uC774\uC9C0 ${i} \uD30C\uC2F1 \uC2E4\uD328: ${pageErr instanceof Error ? pageErr.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958"}`, code: "PARTIAL_PARSE" });
      }
    }
    const parsedPageCount = parsedPages || (pageFilter ? pageFilter.size : effectivePageCount);
    if (totalChars / Math.max(parsedPageCount, 1) < 10) {
      if (options?.ocr) {
        try {
          const { ocrPages: ocrPages2 } = await Promise.resolve().then(() => (init_provider(), provider_exports));
          const ocrBlocks = await ocrPages2(doc, options.ocr, pageFilter, effectivePageCount);
          if (ocrBlocks.length > 0) {
            const ocrMarkdown = ocrBlocks.map((b) => b.text || "").filter(Boolean).join("\n\n");
            return { markdown: ocrMarkdown, blocks: ocrBlocks, metadata, warnings, isImageBased: true };
          }
        } catch {
        }
      }
      throw Object.assign(new KordocError(`\uC774\uBBF8\uC9C0 \uAE30\uBC18 PDF (${pageCount}\uD398\uC774\uC9C0, ${totalChars}\uC790)`), { isImageBased: true });
    }
    if (options?.removeHeaderFooter !== false && parsedPageCount >= 3) {
      const removed = removeHeaderFooterBlocks(blocks, pageHeights, warnings);
      for (let ri = removed.length - 1; ri >= 0; ri--) {
        blocks.splice(removed[ri], 1);
      }
    }
    if (options?.formulaOcr && formulaBuffer) {
      try {
        await applyFormulaOcr(formulaBuffer, blocks, pageFilter, effectivePageCount, warnings, options.onProgress);
      } catch (e) {
        warnings.push({
          message: `\uC218\uC2DD OCR \uC2E4\uD328: ${e instanceof Error ? e.message : String(e)}`,
          code: "PARTIAL_PARSE"
        });
      }
    }
    const medianFontSize = computeMedianFontSizeFromFreq(fontSizeFreq);
    if (medianFontSize > 0) {
      detectHeadings(blocks, medianFontSize);
    }
    detectMarkerHeadings(blocks);
    const outline = blocks.filter((b) => b.type === "heading" && b.level && b.text).map((b) => ({ level: b.level, text: b.text, pageNumber: b.pageNumber }));
    let markdown = cleanPdfText(blocksToMarkdown(blocks));
    return { markdown, blocks, metadata, outline: outline.length > 0 ? outline : void 0, warnings: warnings.length > 0 ? warnings : void 0 };
  } finally {
    await doc.destroy().catch(() => {
    });
  }
}
async function extractPdfMetadata(doc, metadata) {
  try {
    const result = await doc.getMetadata();
    if (!result?.info) return;
    const info = result.info;
    if (typeof info.Title === "string" && info.Title.trim()) metadata.title = info.Title.trim();
    if (typeof info.Author === "string" && info.Author.trim()) metadata.author = info.Author.trim();
    if (typeof info.Creator === "string" && info.Creator.trim()) metadata.creator = info.Creator.trim();
    if (typeof info.Subject === "string" && info.Subject.trim()) metadata.description = info.Subject.trim();
    if (typeof info.Keywords === "string" && info.Keywords.trim()) {
      metadata.keywords = info.Keywords.split(/[,;]/).map((k) => k.trim()).filter(Boolean);
    }
    if (typeof info.CreationDate === "string") metadata.createdAt = parsePdfDate(info.CreationDate);
    if (typeof info.ModDate === "string") metadata.modifiedAt = parsePdfDate(info.ModDate);
  } catch {
  }
}
function parsePdfDate(dateStr) {
  const m = dateStr.match(/D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return void 0;
  const [, year, month = "01", day = "01", hour = "00", min = "00", sec = "00"] = m;
  return `${year}-${month}-${day}T${hour}:${min}:${sec}`;
}
async function extractPdfMetadataOnly(buffer) {
  const doc = await loadPdfWithTimeout(buffer);
  try {
    const metadata = { pageCount: doc.numPages };
    await extractPdfMetadata(doc, metadata);
    return metadata;
  } finally {
    await doc.destroy().catch(() => {
    });
  }
}
function filterHiddenText(items, pageWidth, pageHeight) {
  let hiddenCount = 0;
  const visible = [];
  for (const item of items) {
    if (item.isHidden) {
      hiddenCount++;
      continue;
    }
    const margin = Math.max(pageWidth, pageHeight) * 0.1;
    if (item.x < -margin || item.x > pageWidth + margin || item.y < -margin || item.y > pageHeight + margin) {
      hiddenCount++;
      continue;
    }
    visible.push(item);
  }
  return { visible, hiddenCount };
}
function computeMedianFontSizeFromFreq(freq) {
  if (freq.size === 0) return 0;
  let total = 0;
  for (const count of freq.values()) total += count;
  const sorted = [...freq.entries()].sort((a, b) => a[0] - b[0]);
  const mid = Math.floor(total / 2);
  let cumulative = 0;
  for (const [size, count] of sorted) {
    cumulative += count;
    if (cumulative > mid) return size;
  }
  return sorted[sorted.length - 1][0];
}
function detectHeadings(blocks, medianFontSize) {
  for (const block of blocks) {
    if (block.type !== "paragraph" || !block.text || !block.style?.fontSize) continue;
    const text = block.text.trim();
    if (text.length === 0 || text.length > 200) continue;
    if (/^\d+$/.test(text)) continue;
    const ratio = block.style.fontSize / medianFontSize;
    let level = 0;
    if (ratio >= HEADING_RATIO_H1) level = 1;
    else if (ratio >= HEADING_RATIO_H2) level = 2;
    else if (ratio >= HEADING_RATIO_H3) level = 3;
    if (level > 0) {
      block.type = "heading";
      block.level = level;
      block.text = collapseEvenSpacing(text);
    }
  }
}
function collapseEvenSpacing(text) {
  const tokens = text.split(" ");
  const singleCharCount = tokens.filter((t) => t.length === 1).length;
  if (tokens.length >= 3 && singleCharCount / tokens.length >= 0.7) {
    return tokens.join("");
  }
  return text.replace(
    /(?<![가-힣])[가-힣](?: [가-힣\d]){2,}(?![가-힣])/g,
    (match) => match.replace(/ /g, "")
  );
}
function shouldDemoteTable(table) {
  const allCells = table.cells.flatMap((row) => row.map((c2) => c2.text.trim())).filter(Boolean);
  const allText = allCells.join(" ");
  if (table.rows <= 3 && table.cols <= 3) {
    const totalCells2 = table.rows * table.cols;
    const emptyCells2 = totalCells2 - allCells.length;
    if (emptyCells2 >= totalCells2 * 0.3) return true;
    if (/[□■◆○●▶ㅇ]/.test(allText)) return true;
    if (/<[^>]+>/.test(allText)) return true;
  }
  if (allText.length > 200) return false;
  if (/[□■◆○●▶]/.test(allText) && table.rows <= 3) return true;
  const totalCells = table.rows * table.cols;
  const emptyCells = totalCells - allCells.length;
  if (table.rows <= 2 && emptyCells > totalCells * 0.5) return true;
  if (table.rows === 1 && !/\d{2,}/.test(allText)) return true;
  return false;
}
function demoteTableToText(table) {
  const lines = [];
  for (let r = 0; r < table.rows; r++) {
    const cells = table.cells[r].map((c2) => c2.text.trim()).filter(Boolean);
    if (cells.length === 0) continue;
    if (table.cols === 2 && cells.length === 2) {
      lines.push(`${cells[0]} : ${cells[1]}`);
    } else {
      lines.push(cells.join(" "));
    }
  }
  return lines.join("\n");
}
function detectMarkerHeadings(blocks) {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type !== "paragraph" || !block.text) continue;
    const text = block.text.trim();
    if (text.length < 50 && /^[□■◆◇▶]\s*[가-힣]/.test(text)) {
      block.type = "heading";
      block.level = 4;
      continue;
    }
    if (/^[가-힣]{2,6}$/.test(text) && block.style?.fontSize) {
      const prev = blocks[i - 1];
      const next = blocks[i + 1];
      const prevIsStructural = !prev || prev.type === "table" || prev.type === "heading" || prev.type === "separator";
      const nextIsStructural = !next || next.type === "table" || next.type === "heading" || next.type === "paragraph" && next.text && /^[□■◆○●]/.test(next.text.trim());
      if (prevIsStructural || nextIsStructural) {
        block.type = "heading";
        block.level = 3;
      }
    }
  }
}
function xyCutOrder(items, gapThreshold, depth = 0) {
  if (items.length === 0) return [];
  if (items.length <= 2 || depth >= MAX_XYCUT_DEPTH) return [items];
  const region = computeRegion(items);
  const ySplit = findYSplit(items, region, gapThreshold);
  if (ySplit !== null) {
    const upper = items.filter((i) => i.y > ySplit);
    const lower = items.filter((i) => i.y <= ySplit);
    if (upper.length > 0 && lower.length > 0 && upper.length < items.length) {
      return [...xyCutOrder(upper, gapThreshold, depth + 1), ...xyCutOrder(lower, gapThreshold, depth + 1)];
    }
  }
  const xSplit = findXSplit(items, region, gapThreshold);
  if (xSplit !== null) {
    const left = items.filter((i) => i.x + i.w / 2 < xSplit);
    const right = items.filter((i) => i.x + i.w / 2 >= xSplit);
    if (left.length > 0 && right.length > 0 && left.length < items.length) {
      return [...xyCutOrder(left, gapThreshold, depth + 1), ...xyCutOrder(right, gapThreshold, depth + 1)];
    }
  }
  return [items];
}
function computeRegion(items) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of items) {
    if (i.x < minX) minX = i.x;
    if (i.y < minY) minY = i.y;
    if (i.x + i.w > maxX) maxX = i.x + i.w;
    if (i.y + i.h > maxY) maxY = i.y + i.h;
  }
  return { items, minX, minY, maxX, maxY };
}
function findYSplit(items, _region, gapThreshold) {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  let bestGap = gapThreshold;
  let bestSplit = null;
  for (let i = 1; i < sorted.length; i++) {
    const prevBottom = sorted[i - 1].y - sorted[i - 1].h;
    const currTop = sorted[i].y;
    const gap = prevBottom - currTop;
    if (gap > bestGap) {
      bestGap = gap;
      bestSplit = (prevBottom + currTop) / 2;
    }
  }
  return bestSplit;
}
function findXSplit(items, _region, gapThreshold) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let bestGap = gapThreshold;
  let bestSplit = null;
  for (let i = 1; i < sorted.length; i++) {
    const prevRight = sorted[i - 1].x + sorted[i - 1].w;
    const currLeft = sorted[i].x;
    const gap = currLeft - prevRight;
    if (gap > bestGap) {
      bestGap = gap;
      bestSplit = (prevRight + currLeft) / 2;
    }
  }
  return bestSplit;
}
function extractPageBlocksWithLines(items, pageNum, opList, pageWidth, pageHeight) {
  if (items.length === 0) return [];
  let { horizontals, verticals } = extractLines(opList.fnArray, opList.argsArray);
  ({ horizontals, verticals } = filterPageBorderLines(horizontals, verticals, pageWidth, pageHeight));
  ({ horizontals, verticals } = preprocessLines(horizontals, verticals));
  const grids = buildTableGrids(horizontals, verticals);
  if (grids.length > 0) {
    return extractBlocksWithGrids(items, pageNum, grids, horizontals, verticals);
  }
  return extractPageBlocksFallback(items, pageNum);
}
function extractBlocksWithGrids(items, pageNum, grids, horizontals, verticals) {
  const blocks = [];
  const usedItems = /* @__PURE__ */ new Set();
  const sortedGrids = [...grids].sort((a, b) => b.bbox.y2 - a.bbox.y2);
  for (const grid of sortedGrids) {
    const numGridRows = grid.rowYs.length - 1;
    const numGridCols = grid.colXs.length - 1;
    if (numGridRows === 1 && numGridCols >= 2) continue;
    if (numGridCols === 1 && numGridRows >= 2) continue;
    const tableItems = [];
    const pad = 3;
    const gridW = grid.bbox.x2 - grid.bbox.x1;
    for (const item of items) {
      if (usedItems.has(item)) continue;
      if (item.y < grid.bbox.y1 - pad || item.y > grid.bbox.y2 + pad) continue;
      if (item.x < grid.bbox.x1 - pad || item.x + item.w > grid.bbox.x2 + pad) continue;
      if (gridW < 120 && item.x + item.w > grid.bbox.x2 - 2) continue;
      tableItems.push(item);
      usedItems.add(item);
    }
    const cells = extractCells(grid, horizontals, verticals);
    if (cells.length === 0) continue;
    const textItems = tableItems.map((i) => ({
      text: i.text,
      x: i.x,
      y: i.y,
      w: i.w,
      h: i.h,
      fontSize: i.fontSize,
      fontName: i.fontName
    }));
    const cellTextMap = mapTextToCells(textItems, cells);
    const numRows = grid.rowYs.length - 1;
    const numCols = grid.colXs.length - 1;
    const irGrid = Array.from(
      { length: numRows },
      () => Array.from({ length: numCols }, () => ({ text: "", colSpan: 1, rowSpan: 1 }))
    );
    for (const cell of cells) {
      const cellItems = cellTextMap.get(cell) || [];
      let text = cellTextToString(cellItems);
      text = text.replace(/^[\s]*[-–—]\s*\d+\s*[-–—][\s]*$/gm, "").trim();
      text = text.split("\n").map((line) => collapseEvenSpacing(line)).join("\n");
      irGrid[cell.row][cell.col] = {
        text,
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan
      };
    }
    const irTable = {
      rows: numRows,
      cols: numCols,
      cells: irGrid,
      hasHeader: numRows > 1
    };
    const hasContent = irGrid.some((row) => row.some((cell) => cell.text.trim() !== ""));
    if (!hasContent) continue;
    const tableBbox = {
      page: pageNum,
      x: grid.bbox.x1,
      y: grid.bbox.y1,
      width: grid.bbox.x2 - grid.bbox.x1,
      height: grid.bbox.y2 - grid.bbox.y1
    };
    if (shouldDemoteTable(irTable)) {
      const demoted = demoteTableToText(irTable);
      if (demoted) {
        const text = numGridRows === 1 ? "\n" + demoted + "\n" : demoted;
        blocks.push({ type: "paragraph", text, pageNumber: pageNum, bbox: tableBbox, style: dominantStyle(tableItems) });
      }
      continue;
    }
    blocks.push({ type: "table", table: irTable, pageNumber: pageNum, bbox: tableBbox });
  }
  let remaining = items.filter((i) => !usedItems.has(i));
  if (remaining.length > 0) {
    remaining.sort((a, b) => b.y - a.y || a.x - b.x);
    const clusterItems = remaining.map((i) => ({
      text: i.text,
      x: i.x,
      y: i.y,
      w: i.w,
      h: i.h,
      fontSize: i.fontSize,
      fontName: i.fontName
    }));
    const clusterResults = detectClusterTables(clusterItems, pageNum);
    if (clusterResults.length > 0) {
      const ciToIdx = /* @__PURE__ */ new Map();
      for (let ci = 0; ci < clusterItems.length; ci++) ciToIdx.set(clusterItems[ci], ci);
      const usedClusterIndices = /* @__PURE__ */ new Set();
      for (const cr of clusterResults) {
        for (const ci of cr.usedItems) {
          const idx = ciToIdx.get(ci);
          if (idx !== void 0) usedClusterIndices.add(idx);
        }
        blocks.push({ type: "table", table: cr.table, pageNumber: pageNum, bbox: cr.bbox });
      }
      remaining = remaining.filter((_, idx) => !usedClusterIndices.has(idx));
    }
    if (remaining.length > 0) {
      const allY = remaining.map((i) => i.y);
      const pageH = safeMax(allY) - safeMin(allY);
      const groups = xyCutOrder(remaining, Math.max(15, pageH * 0.03));
      const textBlocks = [];
      for (const group of groups) {
        if (group.length === 0) continue;
        const groupBlocks = extractPageBlocksFallback(group, pageNum);
        for (const b of groupBlocks) textBlocks.push(b);
      }
      const finalTextBlocks = detectListBlocks(textBlocks);
      for (const b of finalTextBlocks) blocks.push(b);
    }
    blocks.sort((a, b) => {
      const ay = a.bbox ? a.bbox.y + a.bbox.height : 0;
      const by = b.bbox ? b.bbox.y + b.bbox.height : 0;
      return by - ay;
    });
    return mergeAdjacentTableBlocks(blocks);
  }
  return mergeAdjacentTableBlocks(blocks);
}
function mergeAdjacentTableBlocks(blocks) {
  if (blocks.length <= 1) return blocks;
  const result = [blocks[0]];
  for (let i = 1; i < blocks.length; i++) {
    const prev = result[result.length - 1];
    const curr = blocks[i];
    if (prev.type === "table" && curr.type === "table" && prev.table && curr.table && prev.table.cols === curr.table.cols) {
      const merged = {
        rows: prev.table.rows + curr.table.rows,
        cols: prev.table.cols,
        cells: [...prev.table.cells, ...curr.table.cells],
        hasHeader: prev.table.hasHeader
      };
      result[result.length - 1] = { ...prev, table: merged };
    } else {
      result.push(curr);
    }
  }
  return result;
}
function extractPageBlocksFallback(items, pageNum) {
  if (items.length === 0) return [];
  const blocks = [];
  const clusterItems = items.map((i) => ({
    text: i.text,
    x: i.x,
    y: i.y,
    w: i.w,
    h: i.h,
    fontSize: i.fontSize,
    fontName: i.fontName
  }));
  const clusterResults = detectClusterTables(clusterItems, pageNum);
  if (clusterResults.length > 0) {
    const ciToIdx = /* @__PURE__ */ new Map();
    for (let ci = 0; ci < clusterItems.length; ci++) ciToIdx.set(clusterItems[ci], ci);
    const usedIndices = /* @__PURE__ */ new Set();
    for (const cr of clusterResults) {
      for (const ci of cr.usedItems) {
        const idx = ciToIdx.get(ci);
        if (idx !== void 0) usedIndices.add(idx);
      }
      blocks.push({ type: "table", table: cr.table, pageNumber: pageNum, bbox: cr.bbox });
    }
    const remaining = items.filter((_, idx) => !usedIndices.has(idx));
    if (remaining.length > 0) {
      const yLines = groupByY(remaining);
      for (const line of yLines) {
        const text = mergeLineSimple(line);
        if (!text.trim()) continue;
        const bbox = computeBBox(line, pageNum);
        blocks.push({ type: "paragraph", text, pageNumber: pageNum, bbox, style: dominantStyle(line) });
      }
    }
    blocks.sort((a, b) => {
      const ay = a.bbox ? a.bbox.y + a.bbox.height : 0;
      const by = b.bbox ? b.bbox.y + b.bbox.height : 0;
      return by - ay;
    });
  } else {
    const allYLines = groupByY(items);
    const columns = detectColumns(allYLines);
    if (columns && columns.length >= 3) {
      const tableText = extractWithColumns(allYLines, columns);
      const bbox = computeBBox(items, pageNum);
      blocks.push({ type: "paragraph", text: tableText, pageNumber: pageNum, bbox, style: dominantStyle(items) });
    } else {
      const allY = items.map((i) => i.y);
      const pageHeight = safeMax(allY) - safeMin(allY);
      const gapThreshold = Math.max(15, pageHeight * 0.03);
      const orderedGroups = xyCutOrder(items, gapThreshold);
      for (const group of orderedGroups) {
        if (group.length === 0) continue;
        const yLines = groupByY(group);
        const groupColumns = detectColumns(yLines);
        if (groupColumns && groupColumns.length >= 3) {
          const tableText = extractWithColumns(yLines, groupColumns);
          const bbox = computeBBox(group, pageNum);
          blocks.push({ type: "paragraph", text: tableText, pageNumber: pageNum, bbox, style: dominantStyle(group) });
        } else {
          for (const line of yLines) {
            const text = mergeLineSimple(line);
            if (!text.trim()) continue;
            const bbox = computeBBox(line, pageNum);
            blocks.push({ type: "paragraph", text, pageNumber: pageNum, bbox, style: dominantStyle(line) });
          }
        }
      }
    }
  }
  return detectSpecialKoreanTables(blocks);
}
function computeBBox(items, pageNum) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of items) {
    if (i.x < minX) minX = i.x;
    if (i.y < minY) minY = i.y;
    if (i.x + i.w > maxX) maxX = i.x + i.w;
    const effectiveH = i.h > 0 ? i.h : i.fontSize;
    if (i.y + effectiveH > maxY) maxY = i.y + effectiveH;
  }
  return { page: pageNum, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
function dominantStyle(items) {
  if (items.length === 0) return void 0;
  const freq = /* @__PURE__ */ new Map();
  let maxCount = 0, dominantSize = 0;
  for (const i of items) {
    if (i.fontSize <= 0) continue;
    const count = (freq.get(i.fontSize) || 0) + 1;
    freq.set(i.fontSize, count);
    if (count > maxCount) {
      maxCount = count;
      dominantSize = i.fontSize;
    }
  }
  if (dominantSize === 0) return void 0;
  const fontName = items.find((i) => i.fontSize === dominantSize)?.fontName || void 0;
  return { fontSize: dominantSize, fontName };
}
function normalizeItems(rawItems) {
  const items = [];
  const spacePositions = [];
  for (const i of rawItems) {
    if (typeof i.str !== "string") continue;
    const x = Math.round(i.transform[4]);
    const y = Math.round(i.transform[5]);
    if (!i.str.trim()) {
      spacePositions.push({ x, y });
      continue;
    }
    const scaleY = Math.abs(i.transform[3]);
    const scaleX = Math.abs(i.transform[0]);
    const fontSize = Math.round(Math.max(scaleY, scaleX));
    const w = Math.round(i.width);
    const h = Math.round(i.height);
    const isHidden = fontSize === 0 || i.width === 0 && i.str.trim().length > 0;
    let text = i.str.trim();
    if (/^[\d\s\-().·,☎]+$/.test(text) && /\d/.test(text) && / /.test(text)) {
      text = text.replace(/ /g, "");
    }
    const split = splitEvenSpacedItem(text, x, w, fontSize);
    if (split) {
      for (const s of split) {
        items.push({ text: s.text, x: s.x, y, w: s.w, h, fontSize, fontName: i.fontName || "", isHidden });
      }
    } else {
      items.push({ text, x, y, w, h, fontSize, fontName: i.fontName || "", isHidden });
    }
  }
  const sorted = items.sort((a, b) => b.y - a.y || a.x - b.x);
  const deduped = [];
  for (let i = 0; i < sorted.length; i++) {
    let isDup = false;
    for (let j = deduped.length - 1; j >= 0; j--) {
      const prev = deduped[j];
      if (prev.y - sorted[i].y > 3) break;
      if (Math.abs(prev.y - sorted[i].y) <= 3 && prev.text === sorted[i].text && Math.abs(prev.x - sorted[i].x) <= 3) {
        isDup = true;
        break;
      }
    }
    if (!isDup) deduped.push(sorted[i]);
  }
  if (spacePositions.length > 0) {
    for (const item of deduped) {
      for (const sp of spacePositions) {
        if (Math.abs(sp.y - item.y) <= 3) {
          const dist = item.x - sp.x;
          if (dist >= 0 && dist <= 20) {
            item.hasSpaceBefore = true;
            break;
          }
        }
      }
    }
  }
  return deduped;
}
function splitEvenSpacedItem(text, itemX, itemW, fontSize) {
  if (!/^[가-힣\d](?: [가-힣\d]){2,}$/.test(text)) return null;
  const chars = text.split(" ");
  if (chars.length < 3) return null;
  const charW = itemW / chars.length;
  if (charW > fontSize * 2) return null;
  return chars.map((ch, idx) => ({
    text: ch,
    x: Math.round(itemX + idx * charW),
    w: Math.round(charW * 0.8)
    // 실제 글자 폭은 간격보다 좁음
  }));
}
function groupByY(items) {
  if (items.length === 0) return [];
  const lines = [];
  let curY = items[0].y;
  let curLine = [items[0]];
  for (let i = 1; i < items.length; i++) {
    if (Math.abs(items[i].y - curY) > 3) {
      lines.push(curLine);
      curLine = [];
      curY = items[i].y;
    }
    curLine.push(items[i]);
  }
  if (curLine.length > 0) lines.push(curLine);
  return lines;
}
function isProseSpread(items) {
  if (items.length < 4) return false;
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w));
  }
  const maxGap = safeMax(gaps);
  const avgLen = items.reduce((s, i) => s + i.text.length, 0) / items.length;
  return maxGap < 40 && avgLen < 5;
}
function detectColumns(yLines) {
  const allItems = yLines.flat();
  if (allItems.length === 0) return null;
  const pageWidth = safeMax(allItems.map((i) => i.x + i.w)) - safeMin(allItems.map((i) => i.x));
  if (pageWidth < 100) return null;
  let bigoLineIdx = -1;
  for (let i = 0; i < yLines.length; i++) {
    if (yLines[i].length <= 2 && yLines[i].some((item) => item.text === "\uBE44\uACE0")) {
      bigoLineIdx = i;
      break;
    }
  }
  const tableYLines = bigoLineIdx >= 0 ? yLines.slice(0, bigoLineIdx) : yLines;
  const CLUSTER_TOL = 22;
  const xClusters = [];
  for (const line of tableYLines) {
    if (isProseSpread(line)) continue;
    for (const item of line) {
      let found = false;
      for (const c2 of xClusters) {
        if (Math.abs(item.x - c2.center) <= CLUSTER_TOL) {
          c2.center = Math.round((c2.center * c2.count + item.x) / (c2.count + 1));
          c2.minX = Math.min(c2.minX, item.x);
          c2.count++;
          found = true;
          break;
        }
      }
      if (!found) {
        xClusters.push({ center: item.x, count: 1, minX: item.x });
      }
    }
  }
  const peaks = xClusters.filter((c2) => c2.count >= 3).sort((a, b) => a.minX - b.minX);
  if (peaks.length < 3) return null;
  const MERGE_TOL = 40;
  const merged = [peaks[0]];
  for (let i = 1; i < peaks.length; i++) {
    const prev = merged[merged.length - 1];
    if (peaks[i].minX - prev.minX < MERGE_TOL) {
      if (peaks[i].count > prev.count) {
        prev.center = peaks[i].center;
      }
      prev.count += peaks[i].count;
      prev.minX = Math.min(prev.minX, peaks[i].minX);
    } else {
      merged.push({ ...peaks[i] });
    }
  }
  const rawColumns = merged.filter((c2) => c2.count >= 3).map((c2) => c2.minX);
  if (rawColumns.length < 3) return null;
  const MIN_DETECT_COL_WIDTH = 30;
  const columns = [rawColumns[0]];
  for (let i = 1; i < rawColumns.length; i++) {
    if (rawColumns[i] - columns[columns.length - 1] < MIN_DETECT_COL_WIDTH) continue;
    columns.push(rawColumns[i]);
  }
  return columns.length >= 3 ? columns : null;
}
function findColumn(x, columns) {
  for (let i = columns.length - 1; i >= 0; i--) {
    if (x >= columns[i] - 10) return i;
  }
  return 0;
}
function extractWithColumns(yLines, columns) {
  const result = [];
  const colMin = columns[0];
  const colMax = columns[columns.length - 1];
  let bigoIdx = -1;
  for (let i = 0; i < yLines.length; i++) {
    if (yLines[i].length <= 2 && yLines[i].some((item) => item.text === "\uBE44\uACE0")) {
      bigoIdx = i;
      break;
    }
  }
  let tableStart = -1;
  for (let i = 0; i < (bigoIdx >= 0 ? bigoIdx : yLines.length); i++) {
    const usedCols = new Set(yLines[i].map((item) => findColumn(item.x, columns)));
    if (usedCols.size >= 3) {
      tableStart = i;
      break;
    }
  }
  const tableEnd = bigoIdx >= 0 ? bigoIdx : yLines.length;
  for (let i = 0; i < (tableStart >= 0 ? tableStart : tableEnd); i++) {
    result.push(mergeLineSimple(yLines[i]));
  }
  if (tableStart >= 0) {
    const tableLines = yLines.slice(tableStart, tableEnd);
    const gridLines = [];
    for (const line of tableLines) {
      const inRange = line.some(
        (item) => item.x >= colMin - 20 && item.x <= colMax + 200
      );
      if (inRange && !isProseSpread(line)) {
        gridLines.push(line);
      } else {
        if (gridLines.length > 0) {
          result.push(buildGridTable(gridLines.splice(0), columns));
        }
        result.push(mergeLineSimple(line));
      }
    }
    if (gridLines.length > 0) {
      result.push(buildGridTable(gridLines, columns));
    }
  }
  if (bigoIdx >= 0) {
    result.push("");
    for (let i = bigoIdx; i < yLines.length; i++) {
      result.push(mergeLineSimple(yLines[i]));
    }
  }
  return result.join("\n");
}
function buildGridTable(lines, columns) {
  const numCols = columns.length;
  const yRows = lines.map((items) => {
    const row = Array(numCols).fill("");
    for (const item of items) {
      const col = findColumn(item.x, columns);
      row[col] = row[col] ? row[col] + " " + item.text : item.text;
    }
    return row;
  });
  const dataColStart = Math.max(2, Math.floor(numCols / 2));
  const merged = [];
  for (const row of yRows) {
    if (row.every((c2) => c2 === "")) continue;
    if (merged.length === 0) {
      merged.push([...row]);
      continue;
    }
    const prev = merged[merged.length - 1];
    const filledCols = row.map((c2, i) => c2 ? i : -1).filter((i) => i >= 0);
    const filledCount = filledCols.length;
    let isNewRow = false;
    if (row[0] && row[0].length >= 3) {
      isNewRow = true;
    }
    if (!isNewRow && numCols > 1 && row[1]) {
      isNewRow = true;
    }
    if (!isNewRow) {
      const hasData = row.slice(dataColStart).some((c2) => c2 !== "");
      const prevHasData = prev.slice(dataColStart).some((c2) => c2 !== "");
      if (hasData && prevHasData) {
        isNewRow = true;
      }
    }
    if (isNewRow && filledCount === 1 && row[0] && row[0].length <= 2) {
      isNewRow = false;
    }
    if (isNewRow) {
      merged.push([...row]);
    } else {
      for (let c2 = 0; c2 < numCols; c2++) {
        if (row[c2]) {
          prev[c2] = prev[c2] ? prev[c2] + " " + row[c2] : row[c2];
        }
      }
    }
  }
  if (merged.length < 2) {
    return merged.map((r) => r.filter((c2) => c2).join(" ")).join("\n");
  }
  let headerEnd = 0;
  for (let r = 0; r < merged.length; r++) {
    const hasDataValues = merged[r].slice(dataColStart).some((c2) => c2 && /\d/.test(c2));
    if (hasDataValues) break;
    headerEnd = r + 1;
  }
  if (headerEnd > 1) {
    const headerRow = Array(numCols).fill("");
    for (let r = 0; r < headerEnd; r++) {
      for (let c2 = 0; c2 < numCols; c2++) {
        if (merged[r][c2]) {
          headerRow[c2] = headerRow[c2] ? headerRow[c2] + " " + merged[r][c2] : merged[r][c2];
        }
      }
    }
    merged.splice(0, headerEnd, headerRow);
  }
  for (const row of merged) {
    for (let c2 = 0; c2 < row.length; c2++) {
      if (row[c2]) row[c2] = collapseEvenSpacing(row[c2]);
    }
  }
  const totalCells = merged.length * numCols;
  const filledCells = merged.reduce((s, row) => s + row.filter((c2) => c2).length, 0);
  if (filledCells < totalCells * 0.35 || merged.length < 2 || merged.length <= 3 && numCols >= 7) {
    return merged.map((r) => r.filter((c2) => c2).join("	")).join("\n");
  }
  const md = [];
  md.push("| " + merged[0].join(" | ") + " |");
  md.push("| " + merged[0].map(() => "---").join(" | ") + " |");
  for (let r = 1; r < merged.length; r++) {
    md.push("| " + merged[r].join(" | ") + " |");
  }
  return md.join("\n");
}
function mergeLineSimple(items) {
  if (items.length <= 1) return items[0]?.text || "";
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const isEvenSpaced = detectEvenSpacedItems(sorted);
  let result = sorted[0].text;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w);
    const avgFs = (sorted[i].fontSize + sorted[i - 1].fontSize) / 2;
    const tabThreshold = Math.max(avgFs * 2, 30);
    if (gap > tabThreshold) {
      result += "	";
      result += sorted[i].text;
      continue;
    }
    if (isEvenSpaced[i]) {
      result += sorted[i].text;
      continue;
    }
    if (sorted[i].hasSpaceBefore && gap >= avgFs * 0.05) {
      result += " ";
      result += sorted[i].text;
      continue;
    }
    if (/[□■○●▶◆◇ㅇ]$/.test(sorted[i - 1].text) && /^[가-힣]/.test(sorted[i].text) && gap > 1) {
      result += " ";
      result += sorted[i].text;
      continue;
    }
    if (gap < avgFs * 0.15) {
    } else if (gap < avgFs * 0.35 && (/[가-힣]$/.test(result) || /^[가-힣]/.test(sorted[i].text))) {
    } else if (gap > 3) result += " ";
    result += sorted[i].text;
  }
  return result;
}
function cleanPdfText(text) {
  return mergeKoreanLines(
    text.replace(/^\d{1,4}\n/, "").replace(/^[\s]*[-–—]\s*[-–—]?\d+[-–—]?[\s]*[-–—]?[\s]*$/gm, "").replace(/^\s*\d+\s*\/\s*\d+\s*$/gm, "").replace(/\n\d{1,4}\n/g, "\n").replace(/\n\d{1,4}$/, "").replace(/^#{1,6}\s*\d{1,4}\s*$/gm, "")
  ).replace(/^(?!\| ---).*$/gm, (line) => {
    if (/^\s*\${1,2}.+\${1,2}\s*$/.test(line)) return line;
    return collapseEvenSpacing(line);
  }).replace(/([□■◆○●▶ㅇ])\s+([가-힣])\s+([가-힣])/g, "$1 $2$3").replace(/\n{3,}/g, "\n\n").trim();
}
function startsWithMarker(line) {
  const t = line.trimStart();
  return /^[가-힣ㄱ-ㅎ][.)]/.test(t) || /^\d+[.)]/.test(t) || /^\([가-힣ㄱ-ㅎ\d]+\)/.test(t) || /^[○●※▶▷◆◇■□★☆\-·]\s/.test(t) || /^제\d+[조항호장절]/.test(t);
}
function isStandaloneHeader(line) {
  return /^제\d+[조항호장절](\([^)]*\))?(\s+\S+){0,7}$/.test(line.trim());
}
function detectListBlocks(blocks) {
  const result = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === "paragraph" && block.text) {
      const text = block.text.trim();
      if (/^\d+\.\s/.test(text)) {
        result.push({ ...block, type: "list", listType: "ordered", text: block.text });
        continue;
      }
      if (/^[○●·※▶▷◆◇\-]\s/.test(text)) {
        result.push({ ...block, type: "list", listType: "unordered", text: block.text });
        continue;
      }
    }
    result.push(block);
  }
  return result;
}
function detectSpecialKoreanTables(blocks) {
  const result = [];
  let kvLines = [];
  const flushKvTable = () => {
    if (kvLines.length < 2) {
      for (const kv of kvLines) result.push(kv.block);
      kvLines = [];
      return;
    }
    const cells = kvLines.map((kv) => {
      if (kv.value) {
        return [
          { text: kv.key, colSpan: 1, rowSpan: 1 },
          { text: kv.value, colSpan: 1, rowSpan: 1 }
        ];
      }
      return [
        { text: kv.key, colSpan: 2, rowSpan: 1 },
        { text: "", colSpan: 1, rowSpan: 1 }
      ];
    });
    const irTable = {
      rows: cells.length,
      cols: 2,
      cells,
      hasHeader: true
    };
    const firstBlock = kvLines[0].block;
    result.push({
      type: "table",
      table: irTable,
      pageNumber: firstBlock.pageNumber,
      bbox: firstBlock.bbox
    });
    kvLines = [];
  };
  for (const block of blocks) {
    if (block.type !== "paragraph" || !block.text) {
      flushKvTable();
      result.push(block);
      continue;
    }
    const text = block.text.trim();
    if (KOREAN_TABLE_HEADER_RE.test(text)) {
      const colonIdx = text.indexOf(":");
      if (colonIdx >= 0) {
        kvLines.push({
          key: text.slice(0, colonIdx).trim(),
          value: text.slice(colonIdx + 1).trim(),
          block
        });
      } else {
        const spaceIdx = text.search(/\s/);
        if (spaceIdx > 0) {
          kvLines.push({
            key: text.slice(0, spaceIdx).trim(),
            value: text.slice(spaceIdx + 1).trim(),
            block
          });
        } else {
          kvLines.push({ key: text, value: "", block });
        }
      }
      continue;
    }
    if (kvLines.length > 0 && text.includes(":")) {
      if (!KV_FALSE_POSITIVE_RE.test(text) && !text.includes("(") && !text.includes(")")) {
        const colonIdx = text.indexOf(":");
        const key = text.slice(0, colonIdx).trim();
        if (/^[가-힣]+$/.test(key) && key.length >= 2 && key.length <= 8) {
          kvLines.push({
            key,
            value: text.slice(colonIdx + 1).trim(),
            block
          });
          continue;
        }
      }
    }
    flushKvTable();
    result.push(block);
  }
  flushKvTable();
  return result;
}
function removeHeaderFooterBlocks(blocks, pageHeights, warnings) {
  const ZONE_RATIO = 0.12;
  const MIN_REPEAT = 3;
  const Y_BUCKET = 5;
  const topEntries = [];
  const bottomEntries = [];
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    if (!b.bbox || !b.pageNumber || !b.text?.trim()) continue;
    const ph = pageHeights.get(b.bbox.page) || pageHeights.get(b.pageNumber);
    if (!ph) continue;
    const blockTop = ph - (b.bbox.y + b.bbox.height);
    const blockBottom = ph - b.bbox.y;
    const entry = { blockIdx: bi, page: b.pageNumber, y: b.bbox.y, text: b.text.trim() };
    if (blockBottom <= ph * ZONE_RATIO) bottomEntries.push(entry);
    else if (blockTop >= ph * (1 - ZONE_RATIO)) topEntries.push(entry);
  }
  const removeSet = /* @__PURE__ */ new Set();
  for (const entries of [topEntries, bottomEntries]) {
    if (entries.length === 0) continue;
    const patternCount = /* @__PURE__ */ new Map();
    const patternPages = /* @__PURE__ */ new Map();
    for (const e of entries) {
      const norm = e.text.replace(/\d+/g, "#");
      patternCount.set(norm, (patternCount.get(norm) || 0) + 1);
      const pages = patternPages.get(norm) || /* @__PURE__ */ new Set();
      pages.add(e.page);
      patternPages.set(norm, pages);
    }
    const repeatedPatterns = /* @__PURE__ */ new Set();
    for (const [p, count] of patternCount) {
      if (count >= MIN_REPEAT && (patternPages.get(p)?.size ?? 0) >= MIN_REPEAT) {
        repeatedPatterns.add(p);
      }
    }
    const bucketPages = /* @__PURE__ */ new Map();
    for (const e of entries) {
      const bucket = Math.round(e.y / Y_BUCKET);
      const pages = bucketPages.get(bucket) || /* @__PURE__ */ new Set();
      pages.add(e.page);
      bucketPages.set(bucket, pages);
    }
    const repeatedBuckets = /* @__PURE__ */ new Set();
    for (const [b, pages] of bucketPages) {
      if (pages.size >= MIN_REPEAT) repeatedBuckets.add(b);
    }
    for (const e of entries) {
      const norm = e.text.replace(/\d+/g, "#");
      const bucket = Math.round(e.y / Y_BUCKET);
      if (repeatedPatterns.has(norm) || repeatedBuckets.has(bucket)) {
        removeSet.add(e.blockIdx);
      }
    }
  }
  if (removeSet.size > 0) {
    warnings.push({ message: `${removeSet.size}\uAC1C \uBA38\uB9AC\uAE00/\uBC14\uB2E5\uAE00 \uC694\uC18C \uC81C\uAC70\uB428`, code: "HIDDEN_TEXT_FILTERED" });
  }
  return [...removeSet].sort((a, b) => a - b);
}
function mergeKoreanLines(text) {
  if (!text) return "";
  const lines = text.split("\n");
  if (lines.length <= 1) return text;
  const result = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const prev = result[result.length - 1];
    const curr = lines[i];
    const currTrimmed = curr.trim();
    if (/^#{1,6}\s/.test(prev) || /^#{1,6}\s/.test(curr) || /^\|/.test(currTrimmed) || /^---/.test(currTrimmed)) {
      result.push(curr);
      continue;
    }
    if (/,$/.test(prev.trim()) && currTrimmed.length > 0) {
      result[result.length - 1] = prev + "\n" + curr;
      continue;
    }
    if (/^\(※/.test(currTrimmed)) {
      result[result.length - 1] = prev + " " + currTrimmed;
      continue;
    }
    if (/[가-힣·,\-]$/.test(prev) && /^[가-힣(]/.test(curr) && !startsWithMarker(curr) && !isStandaloneHeader(prev) && !startsWithMarker(prev)) {
      result[result.length - 1] = prev + " " + curr;
    } else {
      result.push(curr);
    }
  }
  return result.join("\n");
}
async function applyFormulaOcr(buffer, blocks, pageFilter, effectivePageCount, warnings, _onProgress) {
  const formulaMod = await Promise.resolve().then(() => (init_formula(), formula_exports));
  const { FormulaPipeline: FormulaPipeline2, ensureFormulaModels: ensureFormulaModels2 } = formulaMod;
  await ensureFormulaModels2((p) => {
    if (p.phase === "download" && p.total) {
      const pct = Math.floor(p.downloaded / p.total * 100);
      process.stderr.write(`\r[kordoc-formula] ${p.spec.name} ${pct}% (${formatMb(p.downloaded)}/${formatMb(p.total)})`);
      if (p.downloaded >= p.total) process.stderr.write("\n");
    } else if (p.phase === "verify") {
      process.stderr.write(`[kordoc-formula] ${p.spec.name} SHA-256 \uAC80\uC99D \uC911...
`);
    } else if (p.phase === "done") {
      process.stderr.write(`[kordoc-formula] ${p.spec.name} \uC900\uBE44 \uC644\uB8CC
`);
    } else if (p.phase === "skip") {
    }
  });
  const pipeline2 = await FormulaPipeline2.create();
  try {
    const pagesResult = await pipeline2.runOnBuffer(buffer, pageFilter);
    if (pagesResult.length === 0) return;
    let insertedCount = 0;
    let removedDupCount = 0;
    for (const page of pagesResult) {
      const pageNumber = page.pageNumber;
      const pdfHeight = page.pdfHeight;
      const scaleX = page.renderedWidth > 0 ? page.pdfWidth / page.renderedWidth : 0.5;
      const scaleY = page.renderedHeight > 0 ? page.pdfHeight / page.renderedHeight : 0.5;
      const candidates = [];
      for (const r of page.regions) {
        if (!r.latex || !r.latex.trim()) continue;
        const wrapped = r.kind === "display" ? `$$${r.latex}$$` : `$${r.latex}$`;
        const x1 = r.bbox.x1 * scaleX;
        const x2 = r.bbox.x2 * scaleX;
        const yTop = pdfHeight - r.bbox.y1 * scaleY;
        const yBottom = pdfHeight - r.bbox.y2 * scaleY;
        const centerY = (yTop + yBottom) / 2;
        const width = x2 - x1;
        const height = yTop - yBottom;
        candidates.push({
          block: {
            type: "paragraph",
            text: wrapped,
            pageNumber,
            bbox: { page: pageNumber, x: x1, y: yBottom, width, height }
          },
          pdfBbox: { x1, x2, yTop, yBottom },
          centerY
        });
      }
      if (candidates.length === 0) continue;
      const OVERLAP_THRESHOLD = 0.6;
      const indicesToRemove = /* @__PURE__ */ new Set();
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.pageNumber !== pageNumber) continue;
        if (b.type === "table") continue;
        if (!b.bbox || b.bbox.width <= 0 || b.bbox.height <= 0) continue;
        const blockArea = b.bbox.width * b.bbox.height;
        if (blockArea <= 0) continue;
        for (const c2 of candidates) {
          const ox1 = Math.max(b.bbox.x, c2.pdfBbox.x1);
          const ox2 = Math.min(b.bbox.x + b.bbox.width, c2.pdfBbox.x2);
          const oy1 = Math.max(b.bbox.y, c2.pdfBbox.yBottom);
          const oy2 = Math.min(b.bbox.y + b.bbox.height, c2.pdfBbox.yTop);
          const interArea = Math.max(0, ox2 - ox1) * Math.max(0, oy2 - oy1);
          if (interArea / blockArea >= OVERLAP_THRESHOLD) {
            indicesToRemove.add(i);
            break;
          }
        }
      }
      if (indicesToRemove.size > 0) {
        const sorted = [...indicesToRemove].sort((a, b) => b - a);
        for (const idx of sorted) blocks.splice(idx, 1);
        removedDupCount += indicesToRemove.size;
      }
      candidates.sort((a, b) => b.centerY - a.centerY);
      for (const c2 of candidates) {
        let insertIdx = -1;
        let pageFirstIdx = -1;
        let pageLastIdx = -1;
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          if (b.pageNumber !== pageNumber) continue;
          if (pageFirstIdx === -1) pageFirstIdx = i;
          pageLastIdx = i;
          if (!b.bbox) continue;
          const blockCenter = b.bbox.y + b.bbox.height / 2;
          if (blockCenter < c2.centerY) {
            insertIdx = i;
            break;
          }
        }
        if (insertIdx !== -1) {
          blocks.splice(insertIdx, 0, c2.block);
        } else if (pageLastIdx !== -1) {
          blocks.splice(pageLastIdx + 1, 0, c2.block);
        } else {
          blocks.push(c2.block);
        }
        insertedCount++;
      }
    }
    if (insertedCount > 0 || removedDupCount > 0) {
      process.stderr.write(
        `[kordoc-formula] ${insertedCount}\uAC1C \uC218\uC2DD \uC0BD\uC785, ${removedDupCount}\uAC1C \uC911\uBCF5 block \uC81C\uAC70 (${pagesResult.length}\uAC1C \uD398\uC774\uC9C0)
`
      );
    }
  } finally {
    await pipeline2.destroy().catch(() => {
    });
  }
}
function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
var MAX_PAGES, MAX_TOTAL_TEXT, PDF_LOAD_TIMEOUT_MS, MAX_XYCUT_DEPTH, KOREAN_TABLE_HEADER_RE, KV_FALSE_POSITIVE_RE;
var init_parser6 = __esm({
  "src/pdf/parser.ts"() {
    "use strict";
    init_types();
    init_utils();
    init_page_range();
    init_builder();
    init_line_detector();
    init_cluster_detector();
    init_polyfill();
    GlobalWorkerOptions.workerSrc = "";
    MAX_PAGES = 5e3;
    MAX_TOTAL_TEXT = 100 * 1024 * 1024;
    PDF_LOAD_TIMEOUT_MS = 3e4;
    MAX_XYCUT_DEPTH = 50;
    KOREAN_TABLE_HEADER_RE = /^\(?(구분|항목|종류|분류|유형|대상|내용|기간|금액|비율|방법|절차|요건|조건|근거|목적|범위|기준)\)?[:\s]/;
    KV_FALSE_POSITIVE_RE = /\d{1,2}:\d{2}|:\/\/|\d+:\d+/;
  }
});

// src/index.ts
import { readFile } from "fs/promises";
async function parse(input, options) {
  let buffer;
  const opts = typeof input === "string" && !options?.filePath ? { ...options, filePath: input } : options;
  if (typeof input === "string") {
    try {
      const buf = await readFile(input);
      buffer = toArrayBuffer(buf);
    } catch (err) {
      const msg = err instanceof Error && "code" in err && err.code === "ENOENT" ? `\uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${input}` : `\uD30C\uC77C \uC77D\uAE30 \uC2E4\uD328: ${input}`;
      return { success: false, fileType: "unknown", error: msg, code: "PARSE_ERROR" };
    }
  } else if (Buffer.isBuffer(input)) {
    buffer = toArrayBuffer(input);
  } else {
    buffer = input;
  }
  if (!buffer || buffer.byteLength === 0) {
    return { success: false, fileType: "unknown", error: "\uBE48 \uBC84\uD37C\uC774\uAC70\uB098 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC785\uB825\uC785\uB2C8\uB2E4.", code: "EMPTY_INPUT" };
  }
  const format = detectFormat(buffer);
  switch (format) {
    case "hwpx": {
      const zipFormat = await detectZipFormat(buffer);
      if (zipFormat === "xlsx") return parseXlsx(buffer, opts);
      if (zipFormat === "docx") return parseDocx(buffer, opts);
      return parseHwpx(buffer, opts);
    }
    case "hwp":
      return parseHwp(buffer, opts);
    case "hwpml":
      return parseHwpml(buffer, opts);
    case "pdf":
      return parsePdf(buffer, opts);
    default:
      return { success: false, fileType: "unknown", error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD30C\uC77C \uD615\uC2DD\uC785\uB2C8\uB2E4.", code: "UNSUPPORTED_FORMAT" };
  }
}
async function parseHwpx(buffer, options) {
  try {
    const { markdown, blocks, metadata, outline, warnings, images } = await parseHwpxDocument(buffer, options);
    return { success: true, fileType: "hwpx", markdown, blocks, metadata, outline, warnings, images: images?.length ? images : void 0 };
  } catch (err) {
    return { success: false, fileType: "hwpx", error: err instanceof Error ? err.message : "HWPX \uD30C\uC2F1 \uC2E4\uD328", code: classifyError(err) };
  }
}
async function parseHwp(buffer, options) {
  try {
    const { markdown, blocks, metadata, outline, warnings, images } = parseHwp5Document(Buffer.from(buffer), options);
    if (isDistributionSentinel(markdown) && isComFallbackAvailable() && options?.filePath) {
      try {
        const { pages, pageCount, warnings: comWarns } = extractTextViaCom(options.filePath);
        if (pages.some((p) => p && p.trim().length > 0)) {
          const com = comResultToParseResult(pages, pageCount, comWarns);
          return {
            success: true,
            fileType: "hwp",
            markdown: com.markdown,
            blocks: com.blocks,
            metadata: com.metadata,
            warnings: com.warnings
          };
        }
      } catch {
      }
    }
    return { success: true, fileType: "hwp", markdown, blocks, metadata, outline, warnings, images: images?.length ? images : void 0 };
  } catch (err) {
    return { success: false, fileType: "hwp", error: err instanceof Error ? err.message : "HWP \uD30C\uC2F1 \uC2E4\uD328", code: classifyError(err) };
  }
}
async function parsePdf(buffer, options) {
  let parsePdfDocument2;
  try {
    const mod = await Promise.resolve().then(() => (init_parser6(), parser_exports));
    parsePdfDocument2 = mod.parsePdfDocument;
  } catch {
    return {
      success: false,
      fileType: "pdf",
      error: "PDF \uD30C\uC2F1\uC5D0 pdfjs-dist\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4. \uC124\uCE58: npm install pdfjs-dist",
      code: "MISSING_DEPENDENCY"
    };
  }
  try {
    const { markdown, blocks, metadata, outline, warnings, isImageBased } = await parsePdfDocument2(buffer, options);
    return { success: true, fileType: "pdf", markdown, blocks, metadata, outline, warnings, isImageBased };
  } catch (err) {
    const isImageBased = err instanceof Error && "isImageBased" in err ? true : void 0;
    return { success: false, fileType: "pdf", error: err instanceof Error ? err.message : "PDF \uD30C\uC2F1 \uC2E4\uD328", code: classifyError(err), isImageBased };
  }
}
async function parseXlsx(buffer, options) {
  try {
    const { markdown, blocks, metadata, warnings } = await parseXlsxDocument(buffer, options);
    return { success: true, fileType: "xlsx", markdown, blocks, metadata, warnings };
  } catch (err) {
    return { success: false, fileType: "xlsx", error: err instanceof Error ? err.message : "XLSX \uD30C\uC2F1 \uC2E4\uD328", code: classifyError(err) };
  }
}
async function parseDocx(buffer, options) {
  try {
    const { markdown, blocks, metadata, outline, warnings, images } = await parseDocxDocument(buffer, options);
    return { success: true, fileType: "docx", markdown, blocks, metadata, outline, warnings, images: images?.length ? images : void 0 };
  } catch (err) {
    return { success: false, fileType: "docx", error: err instanceof Error ? err.message : "DOCX \uD30C\uC2F1 \uC2E4\uD328", code: classifyError(err) };
  }
}
async function parseHwpml(buffer, options) {
  try {
    const { markdown, blocks, metadata, outline, warnings } = parseHwpmlDocument(buffer, options);
    return { success: true, fileType: "hwpml", markdown, blocks, metadata, outline, warnings };
  } catch (err) {
    return { success: false, fileType: "hwpml", error: err instanceof Error ? err.message : "HWPML \uD30C\uC2F1 \uC2E4\uD328", code: classifyError(err) };
  }
}
var init_index = __esm({
  "src/index.ts"() {
    "use strict";
    init_detect();
    init_parser();
    init_parser2();
    init_com_fallback();
    init_sentinel();
    init_parser3();
    init_parser4();
    init_parser5();
    init_utils();
    init_filler();
    init_filler_hwpx();
    init_builder();
    init_generator();
    init_compare();
    init_recognize();
    init_filler();
    init_filler_hwpx();
    init_generator();
    init_detect();
    init_builder();
    init_utils();
  }
});

// src/watch.ts
var watch_exports = {};
__export(watch_exports, {
  watchDirectory: () => watchDirectory
});
import { watch, readFileSync, writeFileSync, mkdirSync, statSync, existsSync, realpathSync } from "fs";
import { basename, resolve, extname, sep } from "path";
async function watchDirectory(options) {
  const { dir, outDir, webhook, format = "markdown", pages, silent } = options;
  if (!existsSync(dir)) throw new Error(`\uB514\uB809\uD1A0\uB9AC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${dir}`);
  if (webhook) validateWebhookUrl(webhook);
  if (outDir) mkdirSync(outDir, { recursive: true });
  const log = silent ? () => {
  } : (msg) => process.stderr.write(msg + "\n");
  log(`[kordoc watch] \uAC10\uC2DC \uC2DC\uC791: ${resolve(dir)}`);
  if (outDir) log(`[kordoc watch] \uCD9C\uB825: ${resolve(outDir)}`);
  if (webhook) log(`[kordoc watch] \uC6F9\uD6C5: ${webhook}`);
  const pending = /* @__PURE__ */ new Map();
  const MAX_CONCURRENT = 3;
  let activeCount = 0;
  const inProgress = /* @__PURE__ */ new Set();
  const waitForStableSize = async (absPath) => {
    let prevSize = statSync(absPath).size;
    await new Promise((r) => setTimeout(r, STABLE_CHECK_MS));
    if (!existsSync(absPath)) return 0;
    const currSize = statSync(absPath).size;
    if (currSize !== prevSize) {
      await new Promise((r) => setTimeout(r, STABLE_CHECK_MS));
      if (!existsSync(absPath)) return 0;
      return statSync(absPath).size;
    }
    return currSize;
  };
  const processFile = async (filePath) => {
    const ext = extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) return;
    if (inProgress.has(filePath) || activeCount >= MAX_CONCURRENT) return;
    inProgress.add(filePath);
    activeCount++;
    const fileName = basename(filePath);
    try {
      const rawPath = resolve(dir, filePath);
      if (!existsSync(rawPath)) return;
      let absPath;
      try {
        absPath = realpathSync(rawPath);
      } catch {
        return;
      }
      const realDir = realpathSync(resolve(dir));
      if (!absPath.startsWith(realDir + sep) && absPath !== realDir) return;
      const fileSize = await waitForStableSize(absPath);
      if (fileSize > MAX_FILE_SIZE || fileSize === 0) return;
      log(`[kordoc watch] \uBCC0\uD658 \uC911: ${fileName}`);
      const buffer = readFileSync(absPath);
      const arrayBuffer = toArrayBuffer(buffer);
      const parseOptions = pages ? { pages } : void 0;
      const result = await parse(arrayBuffer, parseOptions);
      if (!result.success) {
        log(`[kordoc watch] \uC2E4\uD328: ${fileName} \u2014 ${result.error}`);
        await sendWebhook(webhook, { file: fileName, format: detectFormat(arrayBuffer), success: false, error: result.error });
        return;
      }
      const output = format === "json" ? JSON.stringify(result, null, 2) : result.markdown;
      if (outDir) {
        const outExt = format === "json" ? ".json" : ".md";
        const outPath = resolve(outDir, fileName.replace(/\.[^.]+$/, outExt));
        writeFileSync(outPath, output, "utf-8");
        log(`[kordoc watch] \uC644\uB8CC: ${fileName} \u2192 ${basename(outPath)}`);
      } else {
        process.stdout.write(output + "\n");
      }
      await sendWebhook(webhook, {
        file: fileName,
        format: result.fileType,
        success: true,
        markdown: format === "markdown" ? output.substring(0, 1e3) : void 0
      });
    } catch (err) {
      log(`[kordoc watch] \uC5D0\uB7EC: ${fileName} \u2014 ${err instanceof Error ? err.message : err}`);
    } finally {
      inProgress.delete(filePath);
      activeCount--;
    }
  };
  watch(dir, { recursive: true }, (event, filename) => {
    if (!filename) return;
    const filePath = filename.toString();
    const existing = pending.get(filePath);
    if (existing) clearTimeout(existing);
    pending.set(filePath, setTimeout(() => {
      pending.delete(filePath);
      processFile(filePath).catch((err) => {
        process.stderr.write(`[kordoc watch] \uCC98\uB9AC \uC2E4\uD328: ${filePath} \u2014 ${err instanceof Error ? err.message : String(err)}
`);
      });
    }, DEBOUNCE_MS));
  });
  return new Promise(() => {
  });
}
function validateWebhookUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 webhook URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uB294 webhook \uD504\uB85C\uD1A0\uCF5C: ${parsed.protocol}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "[::1]" || hostname.startsWith("127.") || hostname.startsWith("10.") || hostname.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) || hostname === "0.0.0.0" || hostname.startsWith("169.254.") || hostname.endsWith(".local") || // IPv6 사설 대역
  hostname.startsWith("[fc") || hostname.startsWith("[fd") || hostname.startsWith("[fe80:") || hostname === "[::0]" || hostname === "[::]" || // 클라우드 메타데이터 엔드포인트
  hostname === "metadata.google.internal" || hostname === "metadata.google" || // 16진수/8진수/10진수 정수 IP 인코딩 우회 방지
  /^0x[0-9a-f]+$/i.test(hostname) || /^0[0-7]+$/.test(hostname) || /^\d+$/.test(hostname)) {
    throw new Error(`\uB0B4\uBD80 \uB124\uD2B8\uC6CC\uD06C \uB300\uC0C1 webhook\uC740 \uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4: ${hostname}`);
  }
}
async function sendWebhook(url, payload) {
  if (!url) return;
  try {
    validateWebhookUrl(url);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, timestamp: (/* @__PURE__ */ new Date()).toISOString() }),
      redirect: "error"
    });
  } catch (err) {
    process.stderr.write(`[kordoc watch] webhook \uC804\uC1A1 \uC2E4\uD328: ${err instanceof Error ? err.message : String(err)}
`);
  }
}
var SUPPORTED_EXTENSIONS, DEBOUNCE_MS, STABLE_CHECK_MS, MAX_FILE_SIZE;
var init_watch = __esm({
  "src/watch.ts"() {
    "use strict";
    init_index();
    init_utils();
    SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set([".hwp", ".hwpx", ".pdf", ".xlsx", ".docx"]);
    DEBOUNCE_MS = 1e3;
    STABLE_CHECK_MS = 300;
    MAX_FILE_SIZE = 500 * 1024 * 1024;
  }
});

// src/mcp.ts
var mcp_exports = {};
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, realpathSync as realpathSync2, openSync, readSync, closeSync, statSync as statSync2, mkdirSync as mkdirSync2 } from "fs";
import { resolve as resolve2, isAbsolute, extname as extname2, dirname as dirname2 } from "path";
function safePath(filePath) {
  if (!filePath) throw new KordocError("\uD30C\uC77C \uACBD\uB85C\uAC00 \uBE44\uC5B4\uC788\uC2B5\uB2C8\uB2E4");
  const resolved = resolve2(filePath);
  let real;
  try {
    real = realpathSync2(resolved);
  } catch (err) {
    if (err?.code === "ENOENT") throw new KordocError(`\uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${resolved}`);
    if (err?.code === "EACCES" || err?.code === "EPERM") throw new KordocError(`\uD30C\uC77C \uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4: ${resolved}`);
    throw new KordocError(`\uACBD\uB85C \uCC98\uB9AC \uC624\uB958 [${err?.code ?? "UNKNOWN"}]`);
  }
  if (!isAbsolute(real)) throw new KordocError("\uC808\uB300 \uACBD\uB85C\uB9CC \uD5C8\uC6A9\uB429\uB2C8\uB2E4");
  const ext = extname2(real).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new KordocError(`\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD655\uC7A5\uC790\uC785\uB2C8\uB2E4: ${ext} (\uD5C8\uC6A9: ${[...ALLOWED_EXTENSIONS].join(", ")})`);
  return real;
}
function readValidatedFile(filePath, maxSize = MAX_FILE_SIZE2) {
  const resolved = safePath(filePath);
  let fileSize;
  try {
    fileSize = statSync2(resolved).size;
  } catch (err) {
    throw new KordocError(`\uD30C\uC77C \uC0C1\uD0DC \uC77D\uAE30 \uC2E4\uD328 [${err?.code ?? "UNKNOWN"}]: ${resolved}`);
  }
  if (fileSize > maxSize) {
    throw new KordocError(`\uD30C\uC77C\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4: ${(fileSize / 1024 / 1024).toFixed(1)}MB (\uCD5C\uB300 ${maxSize / 1024 / 1024}MB)`);
  }
  let raw;
  try {
    raw = readFileSync2(resolved);
  } catch (err) {
    throw new KordocError(`\uD30C\uC77C \uC77D\uAE30 \uC2E4\uD328 [${err?.code ?? "UNKNOWN"}]: ${resolved}`);
  }
  return { buffer: toArrayBuffer(raw), resolved };
}
function detectFormatFromHeader(resolved) {
  const fd = openSync(resolved, "r");
  try {
    const headerBuf = Buffer.alloc(16);
    readSync(fd, headerBuf, 0, 16, 0);
    return detectFormat(toArrayBuffer(headerBuf));
  } finally {
    closeSync(fd);
  }
}
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
var ALLOWED_EXTENSIONS, MAX_FILE_SIZE2, MAX_METADATA_FILE_SIZE, server;
var init_mcp = __esm({
  "src/mcp.ts"() {
    "use strict";
    init_index();
    init_utils();
    init_parser2();
    init_parser();
    ALLOWED_EXTENSIONS = /* @__PURE__ */ new Set([".hwp", ".hwpx", ".pdf", ".xlsx", ".docx"]);
    MAX_FILE_SIZE2 = 500 * 1024 * 1024;
    MAX_METADATA_FILE_SIZE = 50 * 1024 * 1024;
    server = new McpServer({
      name: "kordoc",
      version: VERSION
    });
    server.tool(
      "parse_document",
      "\uD55C\uAD6D \uBB38\uC11C \uD30C\uC77C(HWP, HWPX, PDF, XLSX, DOCX)\uC744 \uB9C8\uD06C\uB2E4\uC6B4\uC73C\uB85C \uBCC0\uD658\uD569\uB2C8\uB2E4. \uD30C\uC77C \uACBD\uB85C\uB97C \uC785\uB825\uD558\uBA74 \uD3EC\uB9F7\uC744 \uC790\uB3D9 \uAC10\uC9C0\uD558\uC5EC \uD14D\uC2A4\uD2B8\uB97C \uCD94\uCD9C\uD569\uB2C8\uB2E4.",
      {
        file_path: z.string().min(1).describe("\uD30C\uC2F1\uD560 \uBB38\uC11C \uD30C\uC77C\uC758 \uC808\uB300 \uACBD\uB85C (HWP, HWPX, PDF, XLSX, DOCX)")
      },
      async ({ file_path }) => {
        try {
          const { buffer } = readValidatedFile(file_path);
          const format = detectFormat(buffer);
          if (format === "unknown") {
            return {
              content: [{ type: "text", text: `\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD30C\uC77C \uD615\uC2DD\uC785\uB2C8\uB2E4: ${file_path}` }],
              isError: true
            };
          }
          const result = await parse(buffer);
          if (!result.success) {
            return {
              content: [{ type: "text", text: `\uD30C\uC2F1 \uC2E4\uD328 (${result.fileType}): ${result.error}` }],
              isError: true
            };
          }
          const meta = [
            `\uD3EC\uB9F7: ${result.fileType.toUpperCase()}`,
            result.pageCount ? `\uD398\uC774\uC9C0: ${result.pageCount}` : null,
            result.metadata?.title ? `\uC81C\uBAA9: ${result.metadata.title}` : null,
            result.metadata?.author ? `\uC791\uC131\uC790: ${result.metadata.author}` : null,
            result.isImageBased ? "\uC774\uBBF8\uC9C0 \uAE30\uBC18 PDF (\uD14D\uC2A4\uD2B8 \uCD94\uCD9C \uBD88\uAC00)" : null
          ].filter(Boolean).join(" | ");
          const parts = [`[${meta}]`];
          if (result.outline && result.outline.length > 0) {
            const outlineText = result.outline.map((o) => `${"  ".repeat(o.level - 1)}- ${o.text}`).join("\n");
            parts.push(`
\u{1F4D1} \uBB38\uC11C \uAD6C\uC870:
${outlineText}`);
          }
          if (result.warnings && result.warnings.length > 0) {
            const warnText = result.warnings.map((w) => `- [p${w.page || "?"}] ${w.message}`).join("\n");
            parts.push(`
\u26A0\uFE0F \uACBD\uACE0:
${warnText}`);
          }
          parts.push(`

${result.markdown}`);
          return {
            content: [{ type: "text", text: parts.join("") }]
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `\uC624\uB958: ${sanitizeError(err)}` }],
            isError: true
          };
        }
      }
    );
    server.tool(
      "detect_format",
      "\uD30C\uC77C\uC758 \uD3EC\uB9F7\uC744 \uB9E4\uC9C1 \uBC14\uC774\uD2B8\uB85C \uAC10\uC9C0\uD569\uB2C8\uB2E4 (hwpx, hwp, pdf, unknown).",
      {
        file_path: z.string().min(1).describe("\uAC10\uC9C0\uD560 \uD30C\uC77C\uC758 \uC808\uB300 \uACBD\uB85C")
      },
      async ({ file_path }) => {
        try {
          const resolved = safePath(file_path);
          const format = detectFormatFromHeader(resolved);
          return {
            content: [{ type: "text", text: `${file_path}: ${format}` }]
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `\uC624\uB958: ${sanitizeError(err)}` }],
            isError: true
          };
        }
      }
    );
    server.tool(
      "parse_metadata",
      "\uBB38\uC11C\uC758 \uBA54\uD0C0\uB370\uC774\uD130(\uC81C\uBAA9, \uC791\uC131\uC790, \uB0A0\uC9DC \uB4F1)\uB9CC \uBE60\uB974\uAC8C \uCD94\uCD9C\uD569\uB2C8\uB2E4. \uC804\uCCB4 \uD30C\uC2F1 \uC5C6\uC774 \uD5E4\uB354/\uB9E4\uB2C8\uD398\uC2A4\uD2B8\uB9CC \uC77D\uC2B5\uB2C8\uB2E4.",
      {
        file_path: z.string().min(1).describe("\uBA54\uD0C0\uB370\uC774\uD130\uB97C \uCD94\uCD9C\uD560 \uBB38\uC11C \uD30C\uC77C\uC758 \uC808\uB300 \uACBD\uB85C")
      },
      async ({ file_path }) => {
        try {
          const resolved = safePath(file_path);
          const format = detectFormatFromHeader(resolved);
          if (format === "unknown") {
            return {
              content: [{ type: "text", text: `\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD30C\uC77C \uD615\uC2DD\uC785\uB2C8\uB2E4: ${file_path}` }],
              isError: true
            };
          }
          const { buffer } = readValidatedFile(file_path, MAX_METADATA_FILE_SIZE);
          let metadata;
          let effectiveFormat = format;
          if (format === "hwpx") {
            const { detectZipFormat: detectZipFormat2 } = await Promise.resolve().then(() => (init_detect(), detect_exports));
            const zipFormat = await detectZipFormat2(buffer);
            if (zipFormat === "xlsx" || zipFormat === "docx") effectiveFormat = zipFormat;
          }
          switch (effectiveFormat) {
            case "hwp":
              metadata = extractHwp5MetadataOnly(Buffer.from(buffer));
              break;
            case "hwpx":
              metadata = await extractHwpxMetadataOnly(buffer);
              break;
            case "pdf":
              try {
                const { extractPdfMetadataOnly: extractPdfMetadataOnly2 } = await Promise.resolve().then(() => (init_parser6(), parser_exports));
                metadata = await extractPdfMetadataOnly2(buffer);
              } catch {
                metadata = void 0;
              }
              break;
            case "xlsx":
            case "docx": {
              const result = await parse(buffer);
              metadata = result.success ? result.metadata : void 0;
              break;
            }
          }
          return {
            content: [{ type: "text", text: JSON.stringify({ format, ...metadata }, null, 2) }]
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `\uC624\uB958: ${sanitizeError(err)}` }],
            isError: true
          };
        }
      }
    );
    server.tool(
      "parse_pages",
      "\uBB38\uC11C\uC758 \uD2B9\uC815 \uD398\uC774\uC9C0/\uC139\uC158 \uBC94\uC704\uB9CC \uD30C\uC2F1\uD569\uB2C8\uB2E4. PDF\uB294 \uC815\uD655\uD55C \uD398\uC774\uC9C0, HWP/HWPX\uB294 \uC139\uC158 \uB2E8\uC704 \uADFC\uC0AC\uCE58\uC785\uB2C8\uB2E4.",
      {
        file_path: z.string().min(1).describe("\uD30C\uC2F1\uD560 \uBB38\uC11C \uD30C\uC77C\uC758 \uC808\uB300 \uACBD\uB85C"),
        pages: z.string().min(1).describe("\uD398\uC774\uC9C0 \uBC94\uC704 (\uC608: '1-3', '1,3,5-7')")
      },
      async ({ file_path, pages }) => {
        try {
          const { buffer } = readValidatedFile(file_path);
          const format = detectFormat(buffer);
          if (format === "unknown") {
            return {
              content: [{ type: "text", text: `\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD30C\uC77C \uD615\uC2DD\uC785\uB2C8\uB2E4: ${file_path}` }],
              isError: true
            };
          }
          const result = await parse(buffer, { pages });
          if (!result.success) {
            return {
              content: [{ type: "text", text: `\uD30C\uC2F1 \uC2E4\uD328 (${result.fileType}): ${result.error}` }],
              isError: true
            };
          }
          const meta = [
            `\uD3EC\uB9F7: ${result.fileType.toUpperCase()}`,
            `\uBC94\uC704: ${pages}`,
            result.pageCount ? `\uD398\uC774\uC9C0: ${result.pageCount}` : null
          ].filter(Boolean).join(" | ");
          return {
            content: [{ type: "text", text: `[${meta}]

${result.markdown}` }]
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `\uC624\uB958: ${sanitizeError(err)}` }],
            isError: true
          };
        }
      }
    );
    server.tool(
      "parse_table",
      "\uBB38\uC11C\uC5D0\uC11C N\uBC88\uC9F8 \uD14C\uC774\uBE14\uB9CC \uCD94\uCD9C\uD569\uB2C8\uB2E4 (0-based index). \uD14C\uC774\uBE14\uC774 \uC5C6\uAC70\uB098 \uC778\uB371\uC2A4 \uBC94\uC704\uB97C \uCD08\uACFC\uD558\uBA74 \uC624\uB958\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4.",
      {
        file_path: z.string().min(1).describe("\uD30C\uC2F1\uD560 \uBB38\uC11C \uD30C\uC77C\uC758 \uC808\uB300 \uACBD\uB85C"),
        table_index: z.number().int().min(0).describe("\uCD94\uCD9C\uD560 \uD14C\uC774\uBE14 \uC778\uB371\uC2A4 (0\uBD80\uD130 \uC2DC\uC791)")
      },
      async ({ file_path, table_index }) => {
        try {
          const { buffer } = readValidatedFile(file_path);
          const format = detectFormat(buffer);
          if (format === "unknown") {
            return {
              content: [{ type: "text", text: `\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD30C\uC77C \uD615\uC2DD\uC785\uB2C8\uB2E4: ${file_path}` }],
              isError: true
            };
          }
          const result = await parse(buffer);
          if (!result.success) {
            return {
              content: [{ type: "text", text: `\uD30C\uC2F1 \uC2E4\uD328 (${result.fileType}): ${result.error}` }],
              isError: true
            };
          }
          const tableBlocks = result.blocks.filter((b) => b.type === "table" && b.table);
          if (tableBlocks.length === 0) {
            return {
              content: [{ type: "text", text: `\uBB38\uC11C\uC5D0 \uD14C\uC774\uBE14\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.` }],
              isError: true
            };
          }
          if (table_index >= tableBlocks.length) {
            return {
              content: [{ type: "text", text: `\uD14C\uC774\uBE14 \uC778\uB371\uC2A4 \uCD08\uACFC: ${table_index} (\uCD1D ${tableBlocks.length}\uAC1C \uD14C\uC774\uBE14)` }],
              isError: true
            };
          }
          const tableBlock = tableBlocks[table_index];
          const tableMarkdown = blocksToMarkdown([tableBlock]);
          return {
            content: [{ type: "text", text: `[\uD14C\uC774\uBE14 #${table_index} / \uCD1D ${tableBlocks.length}\uAC1C]

${tableMarkdown}` }]
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `\uC624\uB958: ${sanitizeError(err)}` }],
            isError: true
          };
        }
      }
    );
    server.tool(
      "compare_documents",
      "\uB450 \uD55C\uAD6D \uBB38\uC11C \uD30C\uC77C\uC744 \uBE44\uAD50\uD558\uC5EC \uCD94\uAC00/\uC0AD\uC81C/\uBCC0\uACBD\uB41C \uBE14\uB85D\uC744 \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uC2E0\uAD6C\uB300\uC870\uD45C \uC0DD\uC131\uC5D0 \uD65C\uC6A9\uB429\uB2C8\uB2E4. \uD06C\uB85C\uC2A4 \uD3EC\uB9F7(HWP\u2194HWPX) \uBE44\uAD50 \uAC00\uB2A5.",
      {
        file_path_a: z.string().min(1).describe("\uBE44\uAD50 \uC6D0\uBCF8 \uBB38\uC11C\uC758 \uC808\uB300 \uACBD\uB85C"),
        file_path_b: z.string().min(1).describe("\uBE44\uAD50 \uB300\uC0C1 \uBB38\uC11C\uC758 \uC808\uB300 \uACBD\uB85C")
      },
      async ({ file_path_a, file_path_b }) => {
        try {
          const { buffer: bufA } = readValidatedFile(file_path_a);
          const { buffer: bufB } = readValidatedFile(file_path_b);
          const result = await compare(bufA, bufB);
          const { stats, diffs } = result;
          const lines = [
            `## \uBB38\uC11C \uBE44\uAD50 \uACB0\uACFC`,
            `\uCD94\uAC00: ${stats.added} | \uC0AD\uC81C: ${stats.removed} | \uBCC0\uACBD: ${stats.modified} | \uB3D9\uC77C: ${stats.unchanged}`,
            ""
          ];
          for (const d of diffs) {
            const prefix = d.type === "added" ? "+" : d.type === "removed" ? "-" : d.type === "modified" ? "~" : " ";
            const text = d.after?.text || d.before?.text || (d.after?.table ? "[\uD14C\uC774\uBE14]" : d.before?.table ? "[\uD14C\uC774\uBE14]" : "");
            const sim = d.similarity !== void 0 ? ` (${(d.similarity * 100).toFixed(0)}%)` : "";
            lines.push(`${prefix} ${text.substring(0, 200)}${sim}`);
          }
          return {
            content: [{ type: "text", text: lines.join("\n") }]
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `\uC624\uB958: ${sanitizeError(err)}` }],
            isError: true
          };
        }
      }
    );
    server.tool(
      "parse_form",
      "\uD55C\uAD6D \uC11C\uC2DD \uBB38\uC11C\uC5D0\uC11C \uB808\uC774\uBE14-\uAC12 \uC30D\uC744 \uAD6C\uC870\uD654\uB41C JSON\uC73C\uB85C \uCD94\uCD9C\uD569\uB2C8\uB2E4. \uC591\uC2DD/\uC11C\uC2DD \uBB38\uC11C\uC5D0 \uCD5C\uC801\uD654.",
      {
        file_path: z.string().min(1).describe("\uC11C\uC2DD \uBB38\uC11C \uD30C\uC77C\uC758 \uC808\uB300 \uACBD\uB85C")
      },
      async ({ file_path }) => {
        try {
          const { buffer } = readValidatedFile(file_path);
          const result = await parse(buffer);
          if (!result.success) {
            return {
              content: [{ type: "text", text: `\uD30C\uC2F1 \uC2E4\uD328: ${result.error}` }],
              isError: true
            };
          }
          const form = extractFormFields(result.blocks);
          return {
            content: [{ type: "text", text: JSON.stringify(form, null, 2) }]
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `\uC624\uB958: ${sanitizeError(err)}` }],
            isError: true
          };
        }
      }
    );
    server.tool(
      "fill_form",
      "\uD55C\uAD6D \uC11C\uC2DD \uBB38\uC11C\uC758 \uBE48\uCE78\uC744 \uCC44\uC6CC\uC11C \uC0C8 \uBB38\uC11C\uB85C \uCD9C\uB825\uD569\uB2C8\uB2E4. hwpx-preserve\uB97C \uC0AC\uC6A9\uD558\uBA74 \uC6D0\uBCF8 \uC11C\uC2DD(\uD14C\uB450\uB9AC, \uD3F0\uD2B8, \uBCD1\uD569 \uB4F1)\uC744 100% \uC720\uC9C0\uD569\uB2C8\uB2E4.",
      {
        file_path: z.string().min(1).describe("\uC11C\uC2DD \uD15C\uD50C\uB9BF \uBB38\uC11C\uC758 \uC808\uB300 \uACBD\uB85C (HWP, HWPX, PDF, XLSX, DOCX)"),
        fields: z.record(z.string(), z.string()).describe('\uCC44\uC6B8 \uD544\uB4DC \uB9F5 (\uB77C\uBCA8 \u2192 \uAC12). \uC608: {"\uC131\uBA85": "\uD64D\uAE38\uB3D9", "\uC804\uD654\uBC88\uD638": "010-1234-5678"}'),
        output_format: z.enum(["markdown", "hwpx", "hwpx-preserve"]).default("hwpx-preserve").describe("\uCD9C\uB825 \uD3EC\uB9F7: hwpx-preserve (\uC6D0\uBCF8 \uC2A4\uD0C0\uC77C \uBCF4\uC874, HWPX \uC804\uC6A9), hwpx (\uC0C8 HWPX \uC0DD\uC131), markdown"),
        output_path: z.string().optional().describe("\uCD9C\uB825 \uD30C\uC77C \uC800\uC7A5 \uACBD\uB85C (\uC120\uD0DD). \uC9C0\uC815 \uC2DC \uD30C\uC77C\uB85C \uC800\uC7A5, \uBBF8\uC9C0\uC815 \uC2DC \uD14D\uC2A4\uD2B8\uB85C \uBC18\uD658")
      },
      async ({ file_path, fields, output_format, output_path }) => {
        try {
          const { buffer } = readValidatedFile(file_path);
          if (output_format === "hwpx-preserve") {
            const format = detectFormat(buffer);
            let isHwpx = format === "hwpx";
            if (isHwpx) {
              const zipFormat = await detectZipFormat(buffer);
              isHwpx = zipFormat === "hwpx";
            }
            if (!isHwpx) {
              return {
                content: [{ type: "text", text: `hwpx-preserve\uB294 HWPX \uD30C\uC77C\uB9CC \uC9C0\uC6D0\uD569\uB2C8\uB2E4 (\uAC10\uC9C0\uB41C \uD3EC\uB9F7: ${format}). hwpx \uB610\uB294 markdown\uC744 \uC0AC\uC6A9\uD558\uC138\uC694.` }],
                isError: true
              };
            }
            const hwpxResult = await fillHwpx(buffer, fields);
            const summary2 = [
              `\uCC44\uC6CC\uC9C4 \uD544\uB4DC: ${hwpxResult.filled.length}\uAC1C (\uC6D0\uBCF8 \uC2A4\uD0C0\uC77C \uBCF4\uC874)`,
              hwpxResult.unmatched.length > 0 ? `\uB9E4\uCE6D \uC2E4\uD328: ${hwpxResult.unmatched.join(", ")}` : null
            ].filter(Boolean).join(" | ");
            const filledList = hwpxResult.filled.map((f) => `  - ${f.label}: ${f.value}`).join("\n");
            if (output_path) {
              mkdirSync2(dirname2(resolve2(output_path)), { recursive: true });
              writeFileSync2(resolve2(output_path), Buffer.from(hwpxResult.buffer));
              return {
                content: [{ type: "text", text: `[${summary2}]

\uCC44\uC6CC\uC9C4 \uD544\uB4DC:
${filledList}

HWPX \uD30C\uC77C \uC800\uC7A5 (\uC6D0\uBCF8 \uC11C\uC2DD \uC720\uC9C0): ${resolve2(output_path)}` }]
              };
            }
            return {
              content: [{ type: "text", text: `[${summary2}]

\uCC44\uC6CC\uC9C4 \uD544\uB4DC:
${filledList}

\u26A0\uFE0F output_path\uB97C \uC9C0\uC815\uD558\uBA74 \uC6D0\uBCF8 \uC11C\uC2DD\uC774 \uC720\uC9C0\uB41C HWPX \uD30C\uC77C\uB85C \uC800\uC7A5\uB429\uB2C8\uB2E4.` }]
            };
          }
          const result = await parse(buffer);
          if (!result.success) {
            return {
              content: [{ type: "text", text: `\uD30C\uC2F1 \uC2E4\uD328: ${result.error}` }],
              isError: true
            };
          }
          const formInfo = extractFormFields(result.blocks);
          const fillResult = fillFormFields(result.blocks, fields);
          if (fillResult.filled.length === 0 && formInfo.fields.length === 0) {
            return {
              content: [{ type: "text", text: `\uC11C\uC2DD \uD544\uB4DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC77C\uBC18 \uBB38\uC11C\uC774\uAC70\uB098 \uC11C\uC2DD \uD328\uD134\uC774 \uAC10\uC9C0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.` }],
              isError: true
            };
          }
          const markdown = blocksToMarkdown(fillResult.blocks);
          const summary = [
            `\uCC44\uC6CC\uC9C4 \uD544\uB4DC: ${fillResult.filled.length}\uAC1C`,
            fillResult.unmatched.length > 0 ? `\uB9E4\uCE6D \uC2E4\uD328: ${fillResult.unmatched.join(", ")}` : null,
            formInfo.fields.length > 0 ? `\uC11C\uC2DD \uD544\uB4DC: ${formInfo.fields.length}\uAC1C (\uD655\uC2E0\uB3C4 ${(formInfo.confidence * 100).toFixed(0)}%)` : null
          ].filter(Boolean).join(" | ");
          if (output_format === "hwpx") {
            const hwpxBuffer = await markdownToHwpx(markdown);
            if (output_path) {
              mkdirSync2(dirname2(resolve2(output_path)), { recursive: true });
              writeFileSync2(resolve2(output_path), Buffer.from(hwpxBuffer));
              return {
                content: [{ type: "text", text: `[${summary}]

HWPX \uD30C\uC77C \uC800\uC7A5: ${resolve2(output_path)}` }]
              };
            }
            return {
              content: [{ type: "text", text: `[${summary}]

\u26A0\uFE0F output_path\uB97C \uC9C0\uC815\uD558\uBA74 HWPX \uD30C\uC77C\uB85C \uC800\uC7A5\uB429\uB2C8\uB2E4. \uBBF8\uB9AC\uBCF4\uAE30:

${markdown}` }]
            };
          }
          if (output_path) {
            mkdirSync2(dirname2(resolve2(output_path)), { recursive: true });
            writeFileSync2(resolve2(output_path), markdown, "utf-8");
            return {
              content: [{ type: "text", text: `[${summary}]

\uB9C8\uD06C\uB2E4\uC6B4 \uD30C\uC77C \uC800\uC7A5: ${resolve2(output_path)}

${markdown}` }]
            };
          }
          return {
            content: [{ type: "text", text: `[${summary}]

${markdown}` }]
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `\uC624\uB958: ${sanitizeError(err)}` }],
            isError: true
          };
        }
      }
    );
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
});

// src/setup.ts
var setup_exports = {};
__export(setup_exports, {
  runSetup: () => runSetup
});
import { createInterface } from "readline/promises";
import { readFile as readFile2, writeFile, mkdir as mkdir2 } from "fs/promises";
import { existsSync as existsSync2 } from "fs";
import { resolve as resolve3, dirname as dirname3 } from "path";
import { homedir as homedir2, platform as platform2 } from "os";
import { stdin, stdout } from "process";
function detectClients() {
  const home = homedir2();
  const os = platform2();
  const clients = [];
  const claudePaths = {
    darwin: resolve3(home, "Library/Application Support/Claude/claude_desktop_config.json"),
    win32: resolve3(process.env["APPDATA"] ?? resolve3(home, "AppData/Roaming"), "Claude/claude_desktop_config.json"),
    linux: resolve3(home, ".config/Claude/claude_desktop_config.json")
  };
  const claudePath = claudePaths[os];
  if (claudePath) clients.push({ name: "Claude Desktop", configPath: claudePath, format: "mcpServers" });
  clients.push({ name: "Claude Code (\uD604\uC7AC \uB514\uB809\uD1A0\uB9AC)", configPath: resolve3(process.cwd(), ".mcp.json"), format: "mcpServers" });
  clients.push({ name: "Cursor", configPath: resolve3(home, ".cursor/mcp.json"), format: "mcpServers" });
  clients.push({ name: "VS Code (\uD604\uC7AC \uB514\uB809\uD1A0\uB9AC)", configPath: resolve3(process.cwd(), ".vscode/mcp.json"), format: "servers" });
  clients.push({ name: "Windsurf", configPath: resolve3(home, ".codeium/windsurf/mcp_config.json"), format: "mcpServers" });
  clients.push({ name: "Gemini CLI", configPath: resolve3(home, ".gemini/settings.json"), format: "mcpServers" });
  const zedPaths = {
    darwin: resolve3(home, ".zed/settings.json"),
    linux: resolve3(home, ".config/zed/settings.json"),
    win32: resolve3(home, ".zed/settings.json")
  };
  const zedPath = zedPaths[os];
  if (zedPath) clients.push({ name: "Zed", configPath: zedPath, format: "context_servers" });
  clients.push({ name: "Antigravity", configPath: resolve3(home, ".gemini/antigravity/mcp_config.json"), format: "mcpServers" });
  return clients;
}
async function readJsonFile(path) {
  if (!existsSync2(path)) return {};
  const raw = await readFile2(path, "utf-8");
  return JSON.parse(raw);
}
async function writeJsonFile(path, data) {
  const dir = dirname3(path);
  if (!existsSync2(dir)) await mkdir2(dir, { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}
function buildServerEntry() {
  if (platform2() === "win32") {
    return { command: "cmd", args: ["/c", "npx", "-y", "kordoc", "mcp"] };
  }
  return { command: "npx", args: ["-y", "kordoc", "mcp"] };
}
function buildZedEntry() {
  const base = platform2() === "win32" ? { path: "cmd", args: ["/c", "npx", "-y", "kordoc", "mcp"] } : { path: "npx", args: ["-y", "kordoc", "mcp"] };
  return { command: base };
}
function rgb(r, g2, b) {
  return `${ESC}38;2;${r};${g2};${b}m`;
}
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
async function typewrite(text, delay = 15) {
  for (const ch of text) {
    process.stdout.write(ch);
    await sleep(delay);
  }
  console.log();
}
async function printBanner() {
  const gradients = [
    rgb(255, 120, 80),
    rgb(255, 140, 80),
    rgb(255, 160, 80),
    rgb(240, 180, 80),
    rgb(220, 200, 80),
    rgb(200, 220, 80)
  ];
  const logo = [
    "  _                  _            ",
    " | | _____  _ __ __| | ___   ___ ",
    " | |/ / _ \\| '__/ _` |/ _ \\ / __|",
    " |   < (_) | | | (_| | (_) | (__ ",
    " |_|\\_\\___/|_|  \\__,_|\\___/ \\___|"
  ];
  console.log();
  for (let i = 0; i < logo.length; i++) {
    console.log(`${gradients[i % gradients.length]}${c.bold}${logo[i]}${c.reset}`);
    await sleep(60);
  }
  console.log();
  await typewrite(`${c.dim}  \uBAA8\uB450 \uD30C\uC2F1\uD574\uBC84\uB9AC\uACA0\uB2E4  \u2501\u2501  HWP \xB7 HWPX \xB7 PDF \xB7 XLSX \xB7 DOCX \u2192 Markdown${c.reset}`, 10);
  console.log();
  console.log(`${c.cyan}  ${"\u2501".repeat(60)}${c.reset}`);
  console.log();
}
function stepHeader(step, total, title) {
  const dots = `${c.dim}${"\xB7".repeat(Math.max(0, 40 - title.length))}${c.reset}`;
  console.log(`  ${c.cyan}${c.bold}[${step}/${total}]${c.reset} ${c.white}${c.bold}${title}${c.reset} ${dots}`);
  console.log();
}
function successLine(label, detail) {
  console.log(`  ${c.green}${c.bold}+${c.reset} ${c.white}${label}${c.reset}${c.dim} ${detail}${c.reset}`);
}
function failLine(label, detail) {
  console.log(`  ${c.red}${c.bold}x${c.reset} ${c.white}${label}${c.reset}${c.dim} ${detail}${c.reset}`);
}
async function printComplete() {
  console.log();
  const box = [
    `  ${c.green}${c.bold}\u2554${"\u2550".repeat(50)}\u2557${c.reset}`,
    `  ${c.green}${c.bold}\u2551${c.reset}${" ".repeat(14)}${c.green}${c.bold}Setup Complete!${c.reset}${" ".repeat(22)}${c.green}${c.bold}\u2551${c.reset}`,
    `  ${c.green}${c.bold}\u255A${"\u2550".repeat(50)}\u255D${c.reset}`
  ];
  for (const line of box) {
    console.log(line);
    await sleep(40);
  }
  console.log();
  console.log(`  ${c.dim}\uD074\uB77C\uC774\uC5B8\uD2B8\uB97C \uC7AC\uC2DC\uC791\uD558\uBA74 'kordoc' MCP \uC11C\uBC84\uAC00 \uD65C\uC131\uD654\uB429\uB2C8\uB2E4.${c.reset}`);
  console.log(`  ${c.dim}8\uAC1C \uB3C4\uAD6C: parse_document / parse_metadata / parse_pages / parse_table${c.reset}`);
  console.log(`  ${c.dim}         detect_format / compare_documents / parse_form / fill_form${c.reset}`);
  console.log();
}
async function runSetup() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    await printBanner();
    stepHeader(1, 2, "MCP \uD074\uB77C\uC774\uC5B8\uD2B8 \uC120\uD0DD");
    const clients = detectClients();
    clients.forEach((cl, i) => {
      const exists = existsSync2(cl.configPath);
      const badge = exists ? `${c.green} [\uAC10\uC9C0\uB428]${c.reset}` : "";
      const num = `${c.cyan}${String(i + 1).padStart(2)}${c.reset}`;
      console.log(`  ${num}) ${c.white}${cl.name}${c.reset}${badge}`);
    });
    console.log();
    const clientInput = (await rl.question(`  ${c.cyan}>${c.reset} \uBC88\uD638 (\uC608: 1,3): `)).trim();
    if (!clientInput) {
      console.log(`
  ${c.yellow}\uC120\uD0DD \uC5C6\uC74C${c.reset} \u2014 \uC218\uB3D9 \uC124\uC815 \uC548\uB0B4:`);
      printManualConfig();
      return;
    }
    const indices = clientInput.split(",").map((s) => parseInt(s.trim(), 10) - 1).filter((i) => i >= 0 && i < clients.length);
    if (indices.length === 0) {
      console.log(`
  ${c.yellow}\uC720\uD6A8\uD55C \uC120\uD0DD \uC5C6\uC74C${c.reset} \u2014 \uC218\uB3D9 \uC124\uC815 \uC548\uB0B4:`);
      printManualConfig();
      return;
    }
    console.log();
    stepHeader(2, 2, "\uC124\uC815 \uD30C\uC77C \uC5C5\uB370\uC774\uD2B8");
    const entry = buildServerEntry();
    for (const idx of indices) {
      const client = clients[idx];
      await sleep(150);
      try {
        const config = await readJsonFile(client.configPath);
        const key = client.format;
        const serverEntry = key === "context_servers" ? buildZedEntry() : entry;
        const servers = config[key] ?? {};
        servers["kordoc"] = serverEntry;
        config[key] = servers;
        await writeJsonFile(client.configPath, config);
        successLine(client.name, client.configPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failLine(client.name, msg);
      }
    }
    await printComplete();
  } catch (err) {
    if (err?.code === "ERR_USE_AFTER_CLOSE") return;
    throw err;
  } finally {
    rl.close();
  }
}
function printManualConfig() {
  const entry = buildServerEntry();
  console.log();
  console.log(`  ${c.dim}\uC544\uB798 JSON\uC744 \uC124\uC815 \uD30C\uC77C\uC758 mcpServers\uC5D0 \uCD94\uAC00\uD558\uC138\uC694:${c.reset}`);
  console.log();
  console.log(`  ${c.cyan}"kordoc"${c.reset}: ${JSON.stringify(entry, null, 4)}`);
  console.log();
}
var ESC, c;
var init_setup = __esm({
  "src/setup.ts"() {
    "use strict";
    ESC = "\x1B[";
    c = {
      reset: `${ESC}0m`,
      bold: `${ESC}1m`,
      dim: `${ESC}2m`,
      cyan: `${ESC}36m`,
      green: `${ESC}32m`,
      yellow: `${ESC}33m`,
      red: `${ESC}31m`,
      white: `${ESC}37m`
    };
  }
});

// src/cli.ts
init_index();
init_utils();
import { readFileSync as readFileSync3, writeFileSync as writeFileSync3, mkdirSync as mkdirSync3, statSync as statSync3 } from "fs";
import { basename as basename2, dirname as dirname4, resolve as resolve4, extname as extname3 } from "path";
import { Command } from "commander";
var program = new Command();
program.name("kordoc").description("\uBAA8\uB450 \uD30C\uC2F1\uD574\uBC84\uB9AC\uACA0\uB2E4 \u2014 HWP, HWPX, PDF, XLSX, DOCX \u2192 Markdown").version(VERSION).argument("<files...>", "\uBCC0\uD658\uD560 \uD30C\uC77C \uACBD\uB85C (HWP, HWPX, PDF, XLSX, DOCX)").option("-o, --output <path>", "\uCD9C\uB825 \uD30C\uC77C \uACBD\uB85C (\uB2E8\uC77C \uD30C\uC77C \uC2DC)").option("-d, --out-dir <dir>", "\uCD9C\uB825 \uB514\uB809\uD1A0\uB9AC (\uB2E4\uC911 \uD30C\uC77C \uC2DC)").option("-p, --pages <range>", "\uD398\uC774\uC9C0/\uC139\uC158 \uBC94\uC704 (\uC608: 1-3, 1,3,5)").option("--format <type>", "\uCD9C\uB825 \uD615\uC2DD: markdown (\uAE30\uBCF8) \uB610\uB294 json", "markdown").option("--no-header-footer", "PDF \uBA38\uB9AC\uAE00/\uBC14\uB2E5\uAE00 \uC790\uB3D9 \uC81C\uAC70").option("--formula-ocr", "PDF \uC218\uC2DD OCR \uD65C\uC131\uD654 (MFD+MFR ONNX, \uCCAB \uC0AC\uC6A9 \uC2DC \uBAA8\uB378 ~155MB \uC790\uB3D9 \uB2E4\uC6B4\uB85C\uB4DC)").option("--silent", "\uC9C4\uD589 \uBA54\uC2DC\uC9C0 \uC228\uAE30\uAE30").action(async (files, opts) => {
  const validFormats = ["markdown", "json"];
  if (!validFormats.includes(opts.format)) {
    process.stderr.write(`[kordoc] \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD615\uC2DD: ${opts.format} (markdown \uB610\uB294 json)
`);
    process.exit(1);
  }
  for (let fi = 0; fi < files.length; fi++) {
    const filePath = files[fi];
    const absPath = resolve4(filePath);
    const fileName = basename2(absPath);
    const filePrefix = files.length > 1 ? `[${fi + 1}/${files.length}] ` : "";
    try {
      const fileSize = statSync3(absPath).size;
      if (fileSize > 500 * 1024 * 1024) {
        process.stderr.write(`
[kordoc] SKIP: ${fileName} \u2014 \uD30C\uC77C\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4 (${(fileSize / 1024 / 1024).toFixed(1)}MB)
`);
        process.exitCode = 1;
        continue;
      }
      const buffer = readFileSync3(absPath);
      const arrayBuffer = toArrayBuffer(buffer);
      const format = detectFormat(arrayBuffer);
      if (!opts.silent) {
        process.stderr.write(`[kordoc] ${filePrefix}${fileName} (${format}) ...`);
      }
      const parseOptions = { filePath: absPath };
      if (opts.pages) parseOptions.pages = opts.pages;
      if (opts.headerFooter === false) parseOptions.removeHeaderFooter = false;
      if (opts.formulaOcr) parseOptions.formulaOcr = true;
      if (!opts.silent) {
        parseOptions.onProgress = (current, total) => {
          process.stderr.write(`\r[kordoc] ${filePrefix}${fileName} (${format}) [${current}/${total}]`);
        };
      }
      const result = await parse(arrayBuffer, parseOptions);
      if (!result.success) {
        process.stderr.write(` FAIL
`);
        process.stderr.write(`  \u2192 ${result.error}
`);
        process.exitCode = 1;
        continue;
      }
      if (!opts.silent) process.stderr.write(` OK
`);
      let markdown = result.markdown;
      if (opts.outDir && result.images?.length) {
        markdown = markdown.replace(/!\[image\]\(image_/g, "![image](images/image_");
      }
      const output = opts.format === "json" ? JSON.stringify(
        result,
        (_key, value) => value instanceof Uint8Array ? Buffer.from(value).toString("base64") : value,
        2
      ) : markdown;
      const saveImages = (dir) => {
        if (!result.images?.length) return;
        const imgDir = resolve4(dir, "images");
        mkdirSync3(imgDir, { recursive: true });
        for (const img of result.images) {
          writeFileSync3(resolve4(imgDir, img.filename), img.data);
        }
        if (!opts.silent) process.stderr.write(`  \u2192 ${result.images.length}\uAC1C \uC774\uBBF8\uC9C0 \u2192 ${imgDir}
`);
      };
      if (opts.output && files.length === 1) {
        writeFileSync3(opts.output, output, "utf-8");
        if (!opts.silent) process.stderr.write(`  \u2192 ${opts.output}
`);
        saveImages(resolve4(opts.output, ".."));
      } else if (opts.outDir) {
        mkdirSync3(opts.outDir, { recursive: true });
        const outExt = opts.format === "json" ? ".json" : ".md";
        const outPath = resolve4(opts.outDir, fileName.replace(/\.[^.]+$/, outExt));
        writeFileSync3(outPath, output, "utf-8");
        if (!opts.silent) process.stderr.write(`  \u2192 ${outPath}
`);
        saveImages(opts.outDir);
      } else {
        process.stdout.write(output + "\n");
      }
    } catch (err) {
      process.stderr.write(`
[kordoc] ERROR: ${fileName} \u2014 ${sanitizeError(err)}
`);
      process.exitCode = 1;
    }
  }
});
program.command("watch <dir>").description("\uB514\uB809\uD1A0\uB9AC \uAC10\uC2DC \u2014 \uC0C8 \uBB38\uC11C \uC790\uB3D9 \uBCC0\uD658").option("--webhook <url>", "\uACB0\uACFC \uC804\uC1A1 \uC6F9\uD6C5 URL").option("-d, --out-dir <dir>", "\uBCC0\uD658 \uACB0\uACFC \uCD9C\uB825 \uB514\uB809\uD1A0\uB9AC").option("-p, --pages <range>", "\uD398\uC774\uC9C0/\uC139\uC158 \uBC94\uC704").option("--format <type>", "\uCD9C\uB825 \uD615\uC2DD: markdown \uB610\uB294 json", "markdown").option("--silent", "\uC9C4\uD589 \uBA54\uC2DC\uC9C0 \uC228\uAE30\uAE30").action(async (dir, opts) => {
  const { watchDirectory: watchDirectory2 } = await Promise.resolve().then(() => (init_watch(), watch_exports));
  await watchDirectory2({
    dir,
    outDir: opts.outDir,
    webhook: opts.webhook,
    format: opts.format,
    pages: opts.pages,
    silent: opts.silent
  });
});
program.command("fill <template>").description("\uC11C\uC2DD \uBB38\uC11C\uC758 \uBE48\uCE78\uC744 \uCC44\uC6CC\uC11C \uCD9C\uB825 \u2014 kordoc fill \uC2E0\uCCAD\uC11C.hwpx -f '\uC131\uBA85=\uD64D\uAE38\uB3D9,\uC804\uD654=010-1234-5678' -o \uACB0\uACFC.hwpx").option("-f, --fields <pairs>", "\uCC44\uC6B8 \uD544\uB4DC (key=value \uC27C\uD45C \uAD6C\uBD84 \uB610\uB294 JSON)").option("-j, --json <path>", "\uCC44\uC6B8 \uD544\uB4DC JSON \uD30C\uC77C \uACBD\uB85C").option("-o, --output <path>", "\uCD9C\uB825 \uD30C\uC77C \uACBD\uB85C (\uD655\uC7A5\uC790\uB85C \uD3EC\uB9F7 \uACB0\uC815: .md, .hwpx)").option("--format <type>", "\uCD9C\uB825 \uD3EC\uB9F7: hwpx-preserve (\uAE30\uBCF8, \uC6D0\uBCF8 \uC2A4\uD0C0\uC77C \uBCF4\uC874), hwpx, markdown", "hwpx-preserve").option("--dry-run", "\uCC44\uC6B0\uC9C0 \uC54A\uACE0 \uC11C\uC2DD \uD544\uB4DC \uBAA9\uB85D\uB9CC \uCD9C\uB825").option("--silent", "\uC9C4\uD589 \uBA54\uC2DC\uC9C0 \uC228\uAE30\uAE30").action(async (template, opts) => {
  try {
    const absPath = resolve4(template);
    const fileSize = statSync3(absPath).size;
    if (fileSize > 500 * 1024 * 1024) {
      process.stderr.write(`[kordoc] \uD30C\uC77C\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4 (${(fileSize / 1024 / 1024).toFixed(1)}MB)
`);
      process.exit(1);
    }
    const buffer = readFileSync3(absPath);
    const arrayBuffer = toArrayBuffer(buffer);
    if (!opts.silent) process.stderr.write(`[kordoc] ${basename2(absPath)} \uD30C\uC2F1 \uC911...
`);
    if (opts.dryRun) {
      const result2 = await parse(arrayBuffer);
      if (!result2.success) {
        process.stderr.write(`[kordoc] \uD30C\uC2F1 \uC2E4\uD328: ${result2.error}
`);
        process.exit(1);
      }
      const formInfo2 = extractFormFields(result2.blocks);
      if (formInfo2.fields.length === 0) {
        process.stderr.write(`[kordoc] \uC11C\uC2DD \uD544\uB4DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.
`);
        process.exit(1);
      }
      process.stdout.write(JSON.stringify(formInfo2, null, 2) + "\n");
      return;
    }
    let values = {};
    if (opts.json) {
      const jsonPath = resolve4(opts.json);
      const jsonContent = readFileSync3(jsonPath, "utf-8");
      values = JSON.parse(jsonContent);
    } else if (opts.fields) {
      const fieldsStr = opts.fields;
      if (fieldsStr.startsWith("{")) {
        values = JSON.parse(fieldsStr);
      } else {
        const pairs = fieldsStr.split(/,(?=[가-힣A-Za-z][가-힣A-Za-z\s]*=)/);
        for (const pair of pairs) {
          const eqIdx = pair.indexOf("=");
          if (eqIdx > 0) {
            const key = pair.slice(0, eqIdx).trim();
            const val = pair.slice(eqIdx + 1).trim();
            values[key] = val;
          }
        }
      }
    } else {
      process.stderr.write(`[kordoc] \uCC44\uC6B8 \uD544\uB4DC\uB97C \uC9C0\uC815\uD574\uC8FC\uC138\uC694 (-f \uB610\uB294 -j \uC635\uC158)
`);
      process.exit(1);
    }
    let outputFormat = opts.format;
    if (opts.output) {
      const ext = extname3(opts.output).toLowerCase();
      if (ext === ".hwpx") outputFormat = outputFormat === "markdown" ? "hwpx-preserve" : outputFormat;
      else if (ext === ".md") outputFormat = "markdown";
    }
    if (outputFormat === "hwpx-preserve") {
      const format = detectFormat(arrayBuffer);
      let isHwpx = format === "hwpx";
      if (isHwpx) {
        const zipFormat = await detectZipFormat(arrayBuffer);
        isHwpx = zipFormat === "hwpx";
      }
      if (!isHwpx) {
        if (!opts.silent) process.stderr.write(`[kordoc] HWPX\uAC00 \uC544\uB2C8\uBBC0\uB85C hwpx \uBAA8\uB4DC\uB85C \uC804\uD658\uD569\uB2C8\uB2E4
`);
        outputFormat = "hwpx";
      } else {
        const hwpxResult = await fillHwpx(arrayBuffer, values);
        if (!opts.silent) {
          process.stderr.write(`[kordoc] ${hwpxResult.filled.length}\uAC1C \uD544\uB4DC \uCC44\uC6C0 (\uC6D0\uBCF8 \uC2A4\uD0C0\uC77C \uBCF4\uC874)
`);
          if (hwpxResult.unmatched.length > 0) {
            process.stderr.write(`[kordoc] \u26A0\uFE0F \uB9E4\uCE6D \uC2E4\uD328: ${hwpxResult.unmatched.join(", ")}
`);
          }
        }
        if (opts.output) {
          mkdirSync3(dirname4(resolve4(opts.output)), { recursive: true });
          writeFileSync3(resolve4(opts.output), Buffer.from(hwpxResult.buffer));
          if (!opts.silent) process.stderr.write(`[kordoc] \u2192 ${resolve4(opts.output)}
`);
        } else {
          process.stdout.write(Buffer.from(hwpxResult.buffer));
        }
        return;
      }
    }
    const result = await parse(arrayBuffer);
    if (!result.success) {
      process.stderr.write(`[kordoc] \uD30C\uC2F1 \uC2E4\uD328: ${result.error}
`);
      process.exit(1);
    }
    const formInfo = extractFormFields(result.blocks);
    if (!opts.silent) {
      process.stderr.write(`[kordoc] \uC11C\uC2DD \uD544\uB4DC ${formInfo.fields.length}\uAC1C \uAC10\uC9C0 (\uD655\uC2E0\uB3C4 ${(formInfo.confidence * 100).toFixed(0)}%)
`);
    }
    const fillResult = fillFormFields(result.blocks, values);
    if (!opts.silent) {
      process.stderr.write(`[kordoc] ${fillResult.filled.length}\uAC1C \uD544\uB4DC \uCC44\uC6C0
`);
      if (fillResult.unmatched.length > 0) {
        process.stderr.write(`[kordoc] \u26A0\uFE0F \uB9E4\uCE6D \uC2E4\uD328: ${fillResult.unmatched.join(", ")}
`);
      }
    }
    const markdown = blocksToMarkdown(fillResult.blocks);
    if (outputFormat === "hwpx") {
      const hwpxBuffer = await markdownToHwpx(markdown);
      if (opts.output) {
        mkdirSync3(dirname4(resolve4(opts.output)), { recursive: true });
        writeFileSync3(resolve4(opts.output), Buffer.from(hwpxBuffer));
        if (!opts.silent) process.stderr.write(`[kordoc] \u2192 ${resolve4(opts.output)}
`);
      } else {
        process.stdout.write(Buffer.from(hwpxBuffer));
      }
    } else {
      if (opts.output) {
        mkdirSync3(dirname4(resolve4(opts.output)), { recursive: true });
        writeFileSync3(resolve4(opts.output), markdown, "utf-8");
        if (!opts.silent) process.stderr.write(`[kordoc] \u2192 ${resolve4(opts.output)}
`);
      } else {
        process.stdout.write(markdown + "\n");
      }
    }
  } catch (err) {
    process.stderr.write(`[kordoc] \uC624\uB958: ${sanitizeError(err)}
`);
    process.exit(1);
  }
});
program.command("mcp").description("MCP \uC11C\uBC84 \uC2E4\uD589 (Claude / Cursor / Windsurf \uC5F0\uB3D9)").action(async () => {
  await Promise.resolve().then(() => (init_mcp(), mcp_exports));
});
program.command("setup").description("\uB300\uD654\uD615 \uC124\uCE58 \uB9C8\uBC95\uC0AC \u2014 AI \uD074\uB77C\uC774\uC5B8\uD2B8 \uC790\uB3D9 \uB4F1\uB85D (Mac/Win/Linux)").action(async () => {
  const { runSetup: runSetup2 } = await Promise.resolve().then(() => (init_setup(), setup_exports));
  await runSetup2();
});
program.command("check-formula-models").description("PDF \uC218\uC2DD OCR \uBAA8\uB378(MFD + MFR + tokenizer, ~155MB) \uC0C1\uD0DC \uD655\uC778 \u2014 \uC5C6\uAC70\uB098 SHA \uBD88\uC77C\uCE58\uBA74 \uB2E4\uC6B4\uB85C\uB4DC").option("--status-only", "\uC0C1\uD0DC\uB9CC JSON \uC73C\uB85C \uCD9C\uB825 (\uB2E4\uC6B4\uB85C\uB4DC \uC548 \uD568)").action(async (opts) => {
  try {
    const { getFormulaModelStatus: getFormulaModelStatus2, ensureFormulaModels: ensureFormulaModels2, getFormulaModelsDir: getFormulaModelsDir2 } = await Promise.resolve().then(() => (init_formula(), formula_exports));
    const dir = getFormulaModelsDir2();
    if (opts.statusOnly) {
      const status = await getFormulaModelStatus2();
      process.stdout.write(
        JSON.stringify(
          {
            modelsDir: dir,
            allReady: status.every((s) => s.verified),
            models: status.map((s) => ({
              name: s.spec.name,
              filename: s.spec.filename,
              sizeMb: s.spec.sizeMb,
              exists: s.exists,
              verified: s.verified,
              invalidReason: s.invalidReason,
              path: s.localPath
            }))
          },
          null,
          2
        ) + "\n"
      );
      return;
    }
    process.stderr.write(`[kordoc-formula] \uCE90\uC2DC \uB514\uB809\uD1A0\uB9AC: ${dir}
`);
    await ensureFormulaModels2((p) => {
      if (p.phase === "download" && p.total) {
        const pct = Math.floor(p.downloaded / p.total * 100);
        process.stderr.write(
          `\r[kordoc-formula] ${p.spec.name} ${pct}% (${(p.downloaded / 1024 / 1024).toFixed(1)}/${(p.total / 1024 / 1024).toFixed(1)}MB)`
        );
        if (p.downloaded >= p.total) process.stderr.write("\n");
      } else if (p.phase === "verify") {
        process.stderr.write(`[kordoc-formula] ${p.spec.name} SHA-256 \uAC80\uC99D \uC911...
`);
      } else if (p.phase === "done") {
        process.stderr.write(`[kordoc-formula] ${p.spec.name} \uC900\uBE44 \uC644\uB8CC
`);
      } else if (p.phase === "skip") {
        process.stderr.write(`[kordoc-formula] ${p.spec.name} \uC774\uBBF8 \uC874\uC7AC (skip)
`);
      }
    });
    process.stdout.write("ok\n");
  } catch (err) {
    process.stderr.write(`[kordoc] \uC218\uC2DD \uBAA8\uB378 \uC900\uBE44 \uC2E4\uD328: ${sanitizeError(err)}
`);
    process.exit(1);
  }
});
program.parse();
