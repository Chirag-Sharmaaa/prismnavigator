import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Find the main JS bundle and CSS file from dist/client/assets
const assetsDir = 'dist/client/assets';
let mainJs = '';
let mainCss = '';

try {
  const files = readdirSync(assetsDir);
  // Find the largest JS file (main bundle) - it's the index bundle
  const jsFiles = files.filter(f => f.startsWith('index-') && f.endsWith('.js'));
  const cssFiles = files.filter(f => f.endsWith('.css'));
  
  if (jsFiles.length > 0) mainJs = `/assets/${jsFiles[0]}`;
  if (cssFiles.length > 0) mainCss = `/assets/${cssFiles[0]}`;
  
  console.log('Found JS bundle:', mainJs);
  console.log('Found CSS:', mainCss);
} catch (e) {
  console.error('Could not read assets dir:', e.message);
  process.exit(1);
}

// Generate index.html
const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PRISM — Project Records & Integrated Status Manager</title>
    <script>
      // Apply theme before render to prevent flash
      const theme = localStorage.getItem('prism-theme') || 'light';
      document.documentElement.setAttribute('data-theme', theme);
      if (theme === 'dark') document.documentElement.classList.add('dark');
    </script>
    ${mainCss ? `<link rel="stylesheet" href="${mainCss}" />` : ''}
  </head>
  <body>
    <div id="root"></div>
    ${mainJs ? `<script type="module" src="${mainJs}"></script>` : ''}
  </body>
</html>`;

writeFileSync('dist/client/index.html', html);
console.log('✓ Created dist/client/index.html');

// Create _redirects for Cloudflare Pages SPA routing
writeFileSync('dist/client/_redirects', '/* /index.html 200\n');
console.log('✓ Created dist/client/_redirects');

// Also create a 404.html that redirects to index for SPA routing
writeFileSync('dist/client/404.html', html);
console.log('✓ Created dist/client/404.html');

console.log('\nBuild complete! Deploy dist/client to Cloudflare Pages.');
