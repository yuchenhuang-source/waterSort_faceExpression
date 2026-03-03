import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist', 'index.html');

if (fs.existsSync(distPath)) {
    console.log('Removing crossorigin from script tag (keeping type="module" for import.meta support)');
    let html = fs.readFileSync(distPath, 'utf8');
    html = html.replace("<script></script>", '<script/>');
    
    // Only remove crossorigin; keep type="module" because bundled code uses import.meta
    html = html.replace(/(<script[^>]*?)(\s+crossorigin[^>\s]*)([^>]*>)/gi, '$1$3');
    
    fs.writeFileSync(distPath, html);
}
