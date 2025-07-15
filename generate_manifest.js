#!/usr/bin/env node
// Node.js script to generate a manifest (md5 hashes) for all files in a directory
// Usage: node generate_manifest.js <game_folder>

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const CONCURRENCY = os.cpus().length * 2; // Number of parallel hash calculations

function getAllFiles(dir, baseDir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of list) {
    const filePath = path.join(dir, file.name);
    const relPath = path.relative(baseDir, filePath).replace(/\\/g, '/');
    if (file.isDirectory()) {
      results = results.concat(getAllFiles(filePath, baseDir));
    } else {
      // Exclude manifest files and hidden files
      if (!/manifest\.json$/i.test(file.name) && !file.name.startsWith('.')) {
        results.push({ abs: filePath, rel: relPath });
      }
    }
  }
  return results;
}

function hashFileMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function hashFiles(files) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < files.length) {
      const myIdx = idx++;
      const { abs, rel } = files[myIdx];
      try {
        const md5 = await hashFileMD5(abs);
        results[myIdx] = { path: rel, md5 };
        process.stdout.write(`\rHashed: ${myIdx + 1} / ${files.length}`);
      } catch (e) {
        console.error(`\nError hashing ${rel}:`, e);
      }
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker);
  await Promise.all(workers);
  process.stdout.write('\n');
  return results;
}

async function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: node generate_manifest.js <game_folder>');
    process.exit(1);
  }
  const absFolder = path.resolve(folder);
  if (!fs.existsSync(absFolder) || !fs.statSync(absFolder).isDirectory()) {
    console.error('Provided path is not a directory:', absFolder);
    process.exit(1);
  }
  const files = getAllFiles(absFolder, absFolder);
  console.log(`Found ${files.length} files. Calculating hashes...`);
  const fileHashes = await hashFiles(files);
  const manifest = { files: fileHashes };
  const manifestName = path.basename(absFolder) + '_manifest.json';
  const manifestPath = path.join(absFolder, '..', manifestName);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Manifest written to ${manifestPath}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
}); 