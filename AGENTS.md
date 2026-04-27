<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deployment Rule

**After every deployment (git push to master / Vercel), you MUST update the Notion page before finishing.**

- Notion page ID: `33e44e03-a878-81de-990d-d119d0127fdb`
- Update the "현재 상태" section with today's date and new items
- Add any new troubleshooting entries to the table if bugs were fixed
- Update relevant pipeline sections (1~6단계) if their behavior changed
- Do NOT skip this step even if the changes were small

# Known Pitfalls & Pre-flight Checks

Before writing or committing code, verify the following. These have all caused real build/runtime failures in this project.

## 1. Non-ASCII characters in source files (Turbopack fatal)
**Rule:** All TypeScript/JavaScript source files must be pure ASCII (codepoints <= 127).
- DO NOT paste raw Unicode chars into regex classes. Use `\uXXXX` escapes.
  - BAD: `.replace(/[<raw U+0300>-<raw U+036F>]/g, "")` — raw diacritic chars in source
  - GOOD: `.replace(/[̀-ͯ]/g, "")`
- DO NOT use curly/smart quotes as string delimiters (U+2018, U+2019, U+201C, U+201D).
  Always use straight ASCII quotes (U+0027, U+0022). These can silently appear when the
  Write tool copies from rich-text environments.
- Pre-flight check after writing any .ts/.tsx file:
  ```bash
  node -e "const c=require('fs').readFileSync('FILE','utf8');let ok=true;for(let i=0;i<c.length;i++){if(c.charCodeAt(i)>127){console.error('non-ASCII',i,'U+'+c.charCodeAt(i).toString(16));ok=false;}}if(ok)console.log('ASCII OK');"
  ```

## 2. FFmpeg: always use ffmpeg-static, never @ffmpeg-installer
**Rule:** Deployed FFmpeg is `ffmpeg-static` v5.x. `@ffmpeg-installer/ffmpeg` 1.1.0 is a 2018
build that lacks `xfade` and other modern filters.
- Vercel path fix required — ffmpeg-static resolves __dirname as /ROOT/ but files are at /var/task/:
  ```typescript
  const ffmpegRaw = (await import("ffmpeg-static")).default ?? "";
  const FFMPEG = `"${ffmpegRaw.replace(/^\/ROOT\//, "/var/task/")}"`;
  ```

## 3. FFmpeg Ken Burns (zoompan) — always use fill mode, not letterbox
**Rule:** For `zoompan` on images, use `force_original_aspect_ratio=increase,crop=W:H`.
Letterbox mode (`decrease,pad`) fills with black; zoompan then zooms into black = all-black video.
- GOOD: `scale=W:H:force_original_aspect_ratio=increase,crop=W:H,fps=25,zoompan=...`
- BAD:  `scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:...` + zoompan -> black screen

## 4. Bash backticks in `node -e "..."` — always use a script file instead
**Rule:** Never put backtick characters inside `node -e "..."`. Bash interprets backticks as
command substitution inside double-quoted strings, silently corrupting the script.
- GOOD: write to a `.mjs` file, then `node script.mjs`, then delete the file
- BAD:  `node -e "... .replace(/\`/g, ...) ..."` — backtick gets swallowed by bash

## 6. FFmpeg binary: use ONLY @ffmpeg-installer — do NOT add ffmpeg-static
**Rule:** `ffmpeg-static` (~85MB) + `@ffmpeg-installer` (~55MB) together exceed Vercel's 250MB limit.
Use ONLY `@ffmpeg-installer/ffmpeg`. It has drawtext + zoompan. It lacks `xfade` — use
fade-in/out per clip + concat as the crossfade substitute (0.25s, barely visible).
- NEVER install `ffmpeg-static` — it breaks the Vercel deployment size limit.
- Crossfade without xfade: use `blend` filter with `c0_mode=addition:c1_mode=addition:c2_mode=addition` (NOT `all_mode=add` — unsupported in this build).
- `all_mode=add` causes "Undefined constant" error; correct syntax: `c0_mode=addition:c1_mode=addition:c2_mode=addition`.
- Blend mode name is `addition` not `add` in FFmpeg 4.0 era builds.

## 5. Notion API with Korean text — always use Python/Node, never curl on Windows
**Rule:** `curl` with inline Korean on Windows terminal (cp949) corrupts UTF-8 content in the
Notion API payload. Always use a Python script with `json.dumps(..., ensure_ascii=False).encode('utf-8')`
or a Node.js script writing the body as a Buffer.
