import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist', 'index.html');

if (fs.existsSync(distPath)) {
    console.log('Removing script tag, type="module" and crossorigin from index.html');
    let html = fs.readFileSync(distPath, 'utf8');
    html = html.replace("<script><\\/script>", '<script/>');
    
    html = html.replace(/(<script[^>]*?)(\s+type="module")?(\s+crossorigin[^>\s]*)?([^>]*>)([\s\S]*?)(<\/script>)/gi,
        (match, openTag, typeModule, crossorigin, attrs, content, closeTag) => {
            if (content.trim()) {
                const wrappedContent = `document.addEventListener('DOMContentLoaded', function() {${content}});`;
                return `${openTag}${attrs}${wrappedContent}${closeTag}`;
            }
            return `${openTag}${attrs}${content}${closeTag}`;
        }
    );
    
    fs.writeFileSync(distPath, html);
}
