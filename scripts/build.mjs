import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'src');
const dist = path.join(root, 'dist');
await fs.rm(dist, { recursive: true, force: true });
await fs.cp(source, dist, { recursive: true });
const files = ['index.html','styles.css','app.js','core.js','storage.js','backup.js','seed.json','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
const hash = crypto.createHash('sha256');
for (const file of files) hash.update(await fs.readFile(path.join(source,file)));
const cache = `prepladder-${hash.digest('hex').slice(0,16)}`;
const swPath = path.join(dist, 'sw.js');
const sw = await fs.readFile(swPath, 'utf8');
await fs.writeFile(swPath, sw.replace('__CACHE_NAME__', cache));
console.log(`Built ${dist} with ${cache}`);
