#!/usr/bin/env node
/* eslint-disable newline-per-chained-call */
/**
 * This is installed as a global package. Do not edit. Getting user's to update
 * their global package is a pain.
 *
 * All this does is create a directory named after the user's wishes (passed as argument),
 * add a pretty empty package.json and run yarn/npm add `our package name`.
 *
 * Simple as that. It then delegates the rest of the sequence to `our package name`
 * init.js script, which should copy over all boilerplate code and set the correct
 * command and all that fla fla.
 */
const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const tmp = require('tmp')
const validateNpmPackageName = require('validate-npm-package-name')

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
}

const dirname = ((n) => {
  const validation = validateNpmPackageName(n)
  if (validation.errors) {
    console.log(`${colors.red}The provided application name is invalid: ${validation.errors.join(', ')}`)
    process.exit(1)
  }

  return n
})(process.argv[2])

const dirpath = path.resolve(dirname)
const tmpdirObj = tmp.dirSync()
const tmpdir = tmpdirObj.name

// Return the package name to use, allow overwrite by using
// `create-shopify-pipeline MyShopifyTheme --interal-testing-repo=git+ssh://git@github.com:DynamoMTL/create-shopify-pipeline`
const pkg = (() => {
  if (process.argv[3] && process.argv[3].startsWith('--internal-testing-repo')) {
    return process.argv[3].replace('--internal-testing-repo=', '')
  }

  return 'shopify-pipeline'
})()

// Return the package name, even if the package is a git+ssh URL
const pkgName = ((p) => {
  if (p.startsWith('git+ssh')) {
    return p.split('#').shift() // version or branch name is passed after a hash
      .split('/').pop() // package name, with .git extension
      .split('.').shift() // just the package name
  }

  return p
})(pkg)

const yarnAvailable = (() => {
  try {
    // Use `yarnpkg` so we're sure we don't spin up Hadoop' own yarn by mistake...
    // https://github.com/yarnpkg/yarn/issues/673
    execSync('yarnpkg --version', { stdio: 'ignore' })
    return true
  } catch (e) {
    return false
  }
})()

/**
 * Validation the given path does not yet exists and that the current user
 * has the correct permissions at the given path.
 *
 * @param   String  root  The path to test
 * @return  {Promise.<void, Error>}
 */
function validateDirectory(root) {
  return new Promise((resolve, reject) => {
    fs.access(root, (err) => {
      if (!err) {
        reject('The given directory already exists.')
      } else if (err.code && err.code !== 'ENOENT') {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

/**
 * Write a simple package.json file to disk.
 *
 * @param   root          String  Path to where we should write the file
 * @param   packageName   String  The name of the package name
 * @return  void
 */
function writePackageJson(root, packageName) {
  const packageJson = {
    name: packageName,
    version: '0.1.0',
    private: true
  }

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  )
}

/**
 * Install package with yarn/npm
 *
 * @param   String  root  The path in which to run the install
 * @return  {Promise.<void, Error>}
 */
function install(dep, root) {
  return new Promise((resolve, reject) => {
    console.log(`Installing ${colors.cyan}${dep}${colors.reset}. This could take a while.`)

    // assume yarn
    let command = 'yarnpkg'
    let args = ['add', '--dev', dep]

    if (!yarnAvailable) {
      command = 'npm'
      args = ['install', '--save-dev', dep]
    }

    const process = spawn(command, args, { cwd: root, stdio: 'inherit' })

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Could not install in "${root}" with command "${command} ${args.join(' ')}"`))
      } else {
        resolve()
      }
    })
  })
}

/**
 * Delegate the rest of this to our package init.js script.
 *
 * @param   root          String  Path to root directory
 * @param   packageName   String  The name of the package name
 * @return  void
 */
function runPackageInit(root, packageName) {
  console.log('\nBootstraping...')
  const initScript = path.resolve(
    root,
    'node_modules',
    packageName,
    'scripts',
    'init.js'
  )

  // eslint-disable-next-line
  require(initScript)(root)
}

/**
 * Move a directory
 *
 * @param   String  oldPath   Path of the directory to move
 * @param   String  newPath   Path of the new/destination directory
 * @return  {Promise.<String, Error>}
 */
function move(oldPath, newPath) {
  return new Promise((resolve, reject) => {
    fs.rename(oldPath, newPath, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve(newPath)
      }
    })
  })
}

function printSuccessMessage() {
  const command = yarnAvailable ? 'yarn' : 'npm run'

  console.log(`${colors.green}
Success!${colors.reset} You're now ready to write yourself an amazing Shopify theme.

Don't forget to fill out \`config/shopify.yml\`.

Some commands you'll most likely use:
  ${colors.cyan}${command} serve ${colors.reset}\tStart the development server, upload files as they change
  ${colors.cyan}${command} build ${colors.reset}\tBuild the theme in the \`dist\` folder
  ${colors.cyan}${command} deploy${colors.reset}\tBuild and deploy your theme
  ${colors.cyan}${command} test  ${colors.reset}\tRun your tests
  `)
}

function printErrorMessage(err) {
  console.log(`${colors.red}
An error occurred:
${err}
  `)
}

validateDirectory(dirpath)
  .then(console.log(`Creating a new Shopify Pipeline theme in ${colors.green}${dirpath}${colors.reset}`))
  .then(() => writePackageJson(tmpdir, dirname))
  .then(() => install(pkg, tmpdir))
  .then(() => runPackageInit(tmpdir, pkgName))
  .then(() => move(tmpdir, dirpath))
  .then(printSuccessMessage)
  .catch((err) => {
    printErrorMessage(err)
    process.exit(1)
  })
