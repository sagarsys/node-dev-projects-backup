#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// Configuration
const IGNORE_DIRS = [
  'node_modules',
  // Build outputs
  'dist',
  'build',
  'out',
  '.next',        // Next.js
  '.nuxt',        // Nuxt.js
  '.svelte-kit',  // SvelteKit
  '.output',      // Various build tools
  // Cache directories
  '.cache',
  '.turbo',       // Turborepo
  '.vite',        // Vite
  '.parcel-cache', // Parcel
  '.eslintcache', // ESLint
  '.angular',     // Angular
  '.sass-cache',  // Sass
  '.vercel',      // Vercel
  // Test coverage
  'coverage',
  '.nyc_output',
  // Temporary directories
  '.tmp',
  'tmp',
  'temp',
];

// Source directory (will be set dynamically)
let SOURCE_DIR = null;

// Statistics tracking
const stats = {
  filesCopied: 0,
  directoriesCreated: 0,
  bytesCopied: 0,
  errors: [],
  startTime: null,
  endTime: null,
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Prompt user for source directory (optional)
function promptForSourceDir(defaultDir) {
  return new Promise((resolve) => {
    rl.question(`Enter the source directory path (press Enter to use current directory: ${defaultDir}): `, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultDir);
    });
  });
}

// Prompt user for output directory
function promptForOutputDir() {
  return new Promise((resolve) => {
    rl.question('Enter the output directory path: ', (answer) => {
      resolve(answer.trim());
    });
  });
}

// Check if directory should be ignored
function shouldIgnore(dirName) {
  return IGNORE_DIRS.includes(dirName);
}

// Get relative path from source directory
function getRelativePath(fullPath) {
  return path.relative(SOURCE_DIR, fullPath);
}

// Copy a single file
async function copyFile(sourcePath, destPath) {
  try {
    const relativePath = getRelativePath(sourcePath);
    process.stdout.write(`\r📄 Copying: ${relativePath}${' '.repeat(50)}`);
    
    const fileStats = await fs.stat(sourcePath);
    const fileContent = await fs.readFile(sourcePath);
    await fs.writeFile(destPath, fileContent);
    
    stats.filesCopied++;
    stats.bytesCopied += fileStats.size;
    
    return { success: true };
  } catch (error) {
    const relativePath = getRelativePath(sourcePath);
    stats.errors.push({
      type: 'file',
      path: relativePath,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

// Create directory if it doesn't exist
async function ensureDirectory(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    const relativePath = getRelativePath(dirPath);
    stats.errors.push({
      type: 'directory',
      path: relativePath,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

// Recursively copy directory structure
async function copyDirectory(sourcePath, destPath, isRoot = false) {
  try {
    const relativePath = getRelativePath(sourcePath);
    process.stdout.write(`\r📁 Processing: ${relativePath}${' '.repeat(50)}`);
    
    // Ensure destination directory exists
    const dirResult = await ensureDirectory(destPath);
    if (!dirResult.success) {
      return dirResult;
    }
    
    // Count directory (except root)
    if (!isRoot) {
      stats.directoriesCreated++;
    }
    
    // Read directory contents
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourceEntryPath = path.join(sourcePath, entry.name);
      const destEntryPath = path.join(destPath, entry.name);
      
      // Skip ignored directories
      if (entry.isDirectory() && shouldIgnore(entry.name)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        // Recursively copy subdirectory
        await copyDirectory(sourceEntryPath, destEntryPath, false);
      } else if (entry.isFile()) {
        // Copy file
        await copyFile(sourceEntryPath, destEntryPath);
      }
      // Skip symlinks and other special files
    }
    
    return { success: true };
  } catch (error) {
    const relativePath = getRelativePath(sourcePath);
    stats.errors.push({
      type: 'directory',
      path: relativePath,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

// Format bytes to human-readable format
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Print summary
function printSummary() {
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 COPY OPERATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`✅ Files copied:        ${stats.filesCopied.toLocaleString()}`);
  console.log(`📁 Directories created: ${stats.directoriesCreated.toLocaleString()}`);
  console.log(`💾 Data copied:         ${formatBytes(stats.bytesCopied)}`);
  console.log(`⏱️  Duration:            ${formatDuration(stats.endTime - stats.startTime)}`);
  
  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors encountered:  ${stats.errors.length}`);
    console.log('\nFailed operations:');
    stats.errors.forEach((error, index) => {
      console.log(`\n  ${index + 1}. [${error.type.toUpperCase()}] ${error.path}`);
      console.log(`     Error: ${error.error}`);
    });
  } else {
    console.log('\n✨ No errors encountered!');
  }
  
  console.log('='.repeat(70) + '\n');
}

// Validate paths
async function validatePaths(sourceDir, destDir) {
  try {
    // Check if source directory exists
    const sourceStats = await fs.stat(sourceDir);
    if (!sourceStats.isDirectory()) {
      throw new Error(`Source path is not a directory: ${sourceDir}`);
    }
    
    // Check if destination directory exists or can be created
    try {
      const destStats = await fs.stat(destDir);
      if (!destStats.isDirectory()) {
        throw new Error(`Destination path exists but is not a directory: ${destDir}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Directory doesn't exist, try to create it
        await fs.mkdir(destDir, { recursive: true });
        console.log(`✅ Created destination directory: ${destDir}`);
      } else {
        throw error;
      }
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// Main function
async function main() {
  console.log('🚀 Project Copy Script');
  console.log('='.repeat(70));
  
  // Get default source directory (current working directory)
  const defaultSourceDir = process.cwd();
  
  // Prompt for source directory (optional)
  SOURCE_DIR = await promptForSourceDir(defaultSourceDir);
  
  // Resolve to absolute path
  SOURCE_DIR = path.resolve(SOURCE_DIR);
  
  console.log(`Source directory: ${SOURCE_DIR}`);
  console.log(`Ignoring directories: ${IGNORE_DIRS.join(', ')}`);
  console.log('='.repeat(70) + '\n');
  
  // Prompt for output directory
  const outputDir = await promptForOutputDir();
  rl.close();
  
  if (!outputDir) {
    console.error('❌ Error: Output directory is required');
    process.exit(1);
  }
  
  // Validate paths
  console.log('\n🔍 Validating paths...');
  const validation = await validatePaths(SOURCE_DIR, outputDir);
  if (!validation.valid) {
    console.error(`❌ Validation failed: ${validation.error}`);
    process.exit(1);
  }
  console.log('✅ Paths validated\n');
  
  // Start copying
  console.log('📦 Starting copy operation...\n');
  stats.startTime = Date.now();
  
  try {
    await copyDirectory(SOURCE_DIR, outputDir, true);
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    stats.errors.push({
      type: 'fatal',
      path: 'root',
      error: error.message,
    });
  }
  
  stats.endTime = Date.now();
  
  // Clear the status line and print summary
  process.stdout.write('\r' + ' '.repeat(70) + '\r');
  printSummary();
  
  // Exit with appropriate code
  process.exit(stats.errors.length > 0 ? 1 : 0);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Operation interrupted by user');
  stats.endTime = Date.now();
  printSummary();
  process.exit(1);
});

// Run the script
main().catch((error) => {
  console.error(`\n❌ Unexpected error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});

