const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '..', 'node_modules', 'next-themes', 'dist');
const jsPath = path.join(basePath, 'index.js');
const mjsPath = path.join(basePath, 'index.mjs');

function patchFile(filePath, target, replacement) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[next-themes-patch] File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(replacement)) {
    console.log(`[next-themes-patch] Already patched: ${path.basename(filePath)}`);
    return;
  }

  if (!content.includes(target)) {
    console.error(`[next-themes-patch] Target string not found in ${path.basename(filePath)}`);
    return;
  }

  const updated = content.replace(target, replacement);
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`[next-themes-patch] Successfully patched: ${path.basename(filePath)}`);
}

// 1. Patch CommonJS bundle (index.js)
const targetJS = 'return t.createElement("script",{...w,suppressHydrationWarning:!0,nonce:typeof window=="undefined"?m:"",dangerouslySetInnerHTML:{__html:`(${I.toString()})(${p})`}})';
const replacementJS = 'return typeof window === "undefined" ? t.createElement("script",{...w,suppressHydrationWarning:!0,nonce:m,dangerouslySetInnerHTML:{__html:`(${I.toString()})(${p})`}}) : null';
patchFile(jsPath, targetJS, replacementJS);

// 2. Patch ESM bundle (index.mjs)
const targetMJS = 'return t.createElement("script",{...w,suppressHydrationWarning:!0,nonce:typeof window=="undefined"?d:"",dangerouslySetInnerHTML:{__html:`(${M.toString()})(${p})`}})';
const replacementMJS = 'return typeof window === "undefined" ? t.createElement("script",{...w,suppressHydrationWarning:!0,nonce:d,dangerouslySetInnerHTML:{__html:`(${M.toString()})(${p})`}}) : null';
patchFile(mjsPath, targetMJS, replacementMJS);
