import { readFileSync } from "fs"
import { defineConfig } from "tsup"

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string }

/**
 * kordoc 빌드 설정.
 *
 * package.json이 선언하는 산출물과 1:1로 대응한다.
 *   exports  → dist/index.js (ESM) · dist/index.cjs (CJS) · dist/index.d.ts
 *   bin      → dist/cli.js · dist/mcp.js (ESM만)
 *
 * 무거운 선택 의존성(pdfjs-dist·pdfium·onnxruntime·sharp·transformers)은
 * 런타임 dynamic import로만 쓰이므로 번들에 넣지 않고 external로 둔다.
 *
 * dist/는 저장소에 동봉한다(README 참조). 사회복지 현장 설치 환경에
 * 빌드 툴체인을 요구하지 않기 위해서다. 소스를 고쳤다면 `npm run build`로
 * 다시 만들어 함께 커밋할 것. sourcemap은 산출물 크기 때문에 끈다.
 */
const EXTERNAL = [
  "pdfjs-dist",
  "@hyzyla/pdfium",
  "onnxruntime-node",
  "sharp",
  "@huggingface/transformers",
]

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    target: "node18",
    platform: "node",
    sourcemap: false,
    clean: true,
    splitting: false,
    external: EXTERNAL,
    define: { __KORDOC_VERSION__: JSON.stringify(version) },
  },
  {
    entry: ["src/cli.ts", "src/mcp.ts"],
    format: ["esm"],
    target: "node18",
    platform: "node",
    sourcemap: false,
    clean: false,
    splitting: false,
    external: EXTERNAL,
    define: { __KORDOC_VERSION__: JSON.stringify(version) },
  },
])
