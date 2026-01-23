#!/usr/bin/env node

/**
 * Verify Loops setup
 * Run with: node verify-setup.js
 */

const fs = require('fs')
const path = require('path')

const checks = []

function check(name, fn) {
  checks.push({ name, fn })
}

// Check if node_modules exists
check('Dependencies installed', () => {
  return fs.existsSync(path.join(__dirname, 'node_modules'))
})

// Check if key files exist
check('Package.json exists', () => {
  return fs.existsSync(path.join(__dirname, 'package.json'))
})

check('TypeScript config exists', () => {
  return fs.existsSync(path.join(__dirname, 'tsconfig.json'))
})

check('Vite config exists', () => {
  return fs.existsSync(path.join(__dirname, 'vite.config.ts'))
})

check('Main process exists', () => {
  return fs.existsSync(path.join(__dirname, 'src', 'main', 'main.ts'))
})

check('Preload script exists', () => {
  return fs.existsSync(path.join(__dirname, 'src', 'main', 'preload.ts'))
})

check('React app exists', () => {
  return fs.existsSync(path.join(__dirname, 'src', 'renderer', 'App.tsx'))
})

check('Database schema exists', () => {
  return fs.existsSync(path.join(__dirname, 'src', 'main', 'db', 'schema.ts'))
})

check('Repository layer exists', () => {
  return fs.existsSync(path.join(__dirname, 'src', 'main', 'db', 'repository.ts'))
})

check('AI providers exist', () => {
  return fs.existsSync(path.join(__dirname, 'src', 'main', 'ai', 'providers.ts'))
})

check('Day planner exists', () => {
  return fs.existsSync(path.join(__dirname, 'src', 'main', 'planning', 'day-planner.ts'))
})

check('Tests exist', () => {
  return fs.existsSync(path.join(__dirname, 'src', 'main', 'planning', 'day-planner.test.ts'))
})

// Check Node version
check('Node.js version >= 18', () => {
  const version = process.version
  const major = parseInt(version.slice(1).split('.')[0])
  return major >= 18
})

// Check npm version
check('npm installed', () => {
  try {
    require('child_process').execSync('npm --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})

// Run all checks
console.log('\n🔍 Verifying Loops Setup...\n')

let passed = 0
let failed = 0

checks.forEach(({ name, fn }) => {
  try {
    const result = fn()
    if (result) {
      console.log(`✅ ${name}`)
      passed++
    } else {
      console.log(`❌ ${name}`)
      failed++
    }
  } catch (error) {
    console.log(`❌ ${name} (${error.message})`)
    failed++
  }
})

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`)

if (failed === 0) {
  console.log('🎉 Setup looks good! Run `npm run dev` to start the app.\n')
  process.exit(0)
} else {
  console.log('⚠️  Some checks failed. Please run `npm install` and try again.\n')
  process.exit(1)
}
