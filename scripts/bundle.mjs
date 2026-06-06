import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(rootDir, 'dist');
const chromeDistDir = join(distDir, 'chrome');
const firefoxDistDir = join(distDir, 'firefox');

const chromeZipPath = join(rootDir, 'wordsnap-chrome.zip');
const firefoxXpiPath = join(rootDir, 'wordsnap-firefox.xpi');
const chromeCrxPath = join(rootDir, 'wordsnap.crx');

function run(command, args, options = {}) {
  const spawnArgs = process.platform === 'win32' && (command === 'npm' || command === 'npx')
    ? ['cmd.exe', ['/d', '/s', '/c', command, ...args]]
    : [command, args];

  const result = spawnSync(spawnArgs[0], spawnArgs[1], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function removeIfExists(path) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function escapeForPowerShell(value) {
  return value.replace(/'/g, "''");
}

function zipDirectory(sourceDir, archivePath) {
  removeIfExists(archivePath);

  if (process.platform === 'win32') {
    const command = [
      "$ErrorActionPreference = 'Stop'",
      `$sourceDir = '${escapeForPowerShell(sourceDir)}'`,
      `$zipPath = '${escapeForPowerShell(archivePath)}'`,
      "",
      "[Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null",
      "[Reflection.Assembly]::LoadWithPartialName('System.IO.Compression') | Out-Null",
      "$archive = [System.IO.Compression.ZipFile]::Open($zipPath, 1)",  # 1 = Create
      "try {",
      "  $sourceRoot = (Resolve-Path $sourceDir).Path",
      "  Get-ChildItem -Path $sourceDir -Recurse -File | ForEach-Object {",
      "    $relativePath = $_.FullName.Substring($sourceRoot.Length + 1).Replace('\\', '/')",
      "    $entry = $archive.CreateEntry($relativePath, 0)",  # 0 = Optimal
      "    $fileStream = [System.IO.File]::OpenRead($_.FullName)",
      "    try {",
      "      $entryStream = $entry.Open()",
      "      try { $fileStream.CopyTo($entryStream) } finally { $entryStream.Dispose() }",
      "    } finally { $fileStream.Dispose() }",
      "  }",
      "} finally { $archive.Dispose() }",
    ].join('; ');

    run('powershell', ['-NoProfile', '-Command', command]);

    return;
  }

  run('zip', ['-qr', archivePath, '.'], { cwd: sourceDir });
}

function packChromeCrx() {
  const extKey = process.env.EXTENSION_KEY?.trim();
  const extKeyFile = process.env.EXTENSION_KEY_FILE?.trim();

  if (!extKey && !extKeyFile) {
    console.log('Skipping CRX packaging: set EXTENSION_KEY or EXTENSION_KEY_FILE to enable it.');
    return;
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'wordsnap-key-'));
  const keyPath = extKeyFile || join(tempDir, 'key.pem');

  try {
    if (extKey) {
      writeFileSync(keyPath, `${extKey}\n`, 'utf8');
    }

    removeIfExists(chromeCrxPath);
    run('npx', ['crx', 'pack', chromeDistDir, '-o', chromeCrxPath, '-p', keyPath]);
  } finally {
    if (!extKeyFile) {
      removeIfExists(tempDir);
    }
  }
}

function main() {
  console.log('Building Chrome and Firefox bundles...');
  run('npm', ['run', 'build']);

  if (!existsSync(chromeDistDir) || !existsSync(firefoxDistDir)) {
    throw new Error('Expected dist/chrome and dist/firefox to exist after build.');
  }

  console.log('Packing Chromium ZIP...');
  zipDirectory(chromeDistDir, chromeZipPath);

  console.log('Packing Firefox XPI...');
  zipDirectory(firefoxDistDir, firefoxXpiPath);

  console.log('Packing optional Chromium CRX...');
  packChromeCrx();

  console.log('Artifacts ready:');
  console.log(`- ${chromeZipPath}`);
  console.log(`- ${firefoxXpiPath}`);
  if (existsSync(chromeCrxPath)) {
    console.log(`- ${chromeCrxPath}`);
  }
}

main();

