import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the source HTML
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');

// Extract the JSX code from between <script type="text/babel"> and </script>
const babelScriptMatch = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
if (!babelScriptMatch) {
  console.error('Could not find Babel script in index.html');
  process.exit(1);
}

const jsxCode = babelScriptMatch[1];

// Write the JSX to a temp file
fs.writeFileSync(path.join(__dirname, 'src', 'app.jsx'), jsxCode);

console.log('Extracted JSX code to src/app.jsx');
console.log('Now run: npm run build');
