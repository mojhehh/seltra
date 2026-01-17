import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isMinify = process.argv.includes('--minify');

async function build() {
  console.log(`Building precompiled bundle${isMinify ? ' (minified)' : ''}...`);
  
  // Build the JSX to JS
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'src', 'app.jsx')],
    bundle: false,
    write: false,
    format: 'iife',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: ['es2020'],
    minify: isMinify,
    minifyWhitespace: true,
    keepNames: true,
  });
  
  let compiledCode = result.outputFiles[0].text;
  
  if (!isMinify) {
    // Simple whitespace reduction without breaking code
    compiledCode = compiledCode
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .replace(/\n\s+/g, '\n') // Remove leading whitespace on lines
      .trim();
  }
  
  // Read original HTML
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
  
  // Replace the babel script with precompiled version
  let newHtml = html
    // Remove Babel standalone (no longer needed)
    .replace(/<script src="https:\/\/unpkg\.com\/@babel\/standalone\/babel\.min\.js"><\/script>\s*/, '')
    // Replace babel script tag with regular script
    .replace(/<script type="text\/babel">[\s\S]*?<\/script>/, `<script>\n${compiledCode}\n</script>`);
  
  // Ensure dist directory exists
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }
  
  // Write to dist/index.html
  fs.writeFileSync(path.join(distDir, 'index.html'), newHtml);
  
  const originalSize = fs.statSync(path.join(__dirname, 'index.html')).size;
  const newSize = fs.statSync(path.join(distDir, 'index.html')).size;
  
  console.log('✓ Built dist/index.html (precompiled, no Babel required)');
  console.log(`  Original: ${(originalSize / 1024).toFixed(1)} KB`);
  console.log(`  Built: ${(newSize / 1024).toFixed(1)} KB`);
  console.log(`  Saved: ${((originalSize - newSize) / 1024).toFixed(1)} KB (${((1 - newSize/originalSize) * 100).toFixed(1)}%)`);
  console.log('\n  IMPORTANT: Babel no longer needed at runtime!');
  console.log('  Load time should be MUCH faster now.');
}

build().catch(e => {
  console.error('Build failed:', e);
  process.exit(1);
});
