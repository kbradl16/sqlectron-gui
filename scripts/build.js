import { platform } from 'os';
import { escapeRegExp } from 'lodash';
import { readdirSync } from 'fs';
import { exec } from 'child_process';
import { join } from 'path';
import denodeify from 'denodeify';
import webpack from 'webpack';
import packager from 'electron-packager';
import del from 'del';
import pkg from '../package.json';
import webpackConfig from '../webpack.prod.config';

/**
 * Script arguments:
 * ===============================================
 * -v             verbose (default=false)
 * --platform     build for all platforms (default=true)
 */
const argv = require('minimist')(process.argv.slice(2), { boolean: ['v'] });
const ROOT_PATH = join(__dirname, '..');
const BUILD_PATH = join(ROOT_PATH, 'build');
const RELEASE_PATH = join(ROOT_PATH, 'releases');
const INSTALLERS_PATH = join(ROOT_PATH, 'installers');
const TMP_PATH = join(ROOT_PATH, '.tmp');
const CACHE_PATH = join(TMP_PATH, 'cache');
const RESOURCES_PATH = join(ROOT_PATH, 'resources');


/**
 * Ignore anything that is not required in the release app
 */
function ignoreFilesInRelease() {
  const include = [
    'node_modules',
    'build',
    'package.json',
  ];

  const exclude = [
    'node_modules/.bin($|/)',
    'electron-prebuild($|/)',
  ];

  const autoExcluded = readdirSync(ROOT_PATH)
    .filter(filename => !~include.indexOf(filename))
    .map(filename => `^/${escapeRegExp(filename)}($|/)`);

  return exclude.concat(autoExcluded);
}


/**
 * Cross platform options for electron-packager
 */
const ELECTRON_PACKAGER_OPTS = {
  name: pkg.productName,
  'app-version': pkg.version,
  'app-bundle-id': pkg.appBundleId,
  'helper-bundle-id': pkg.helperBundleId,
  version: pkg.devDependencies['electron-prebuilt'].replace('^', ''),
  asar: true,
  prune: true,
  overwrite: true,
  dir: '.',
  out: RELEASE_PATH,
  cache: CACHE_PATH,
  ignore: ignoreFilesInRelease(),
};


/**
 * Supported platforms and platform specific options
 */
const TASKS = [
  { platform: 'darwin', arch: 'all', icon: 'app.icns' },
  { platform: 'linux', arch: 'all', icon: 'app.png' },
  { platform: 'win32', arch: 'all', icon: 'app.ico' },
].map(item => {
  return {
    ...item,
    ...ELECTRON_PACKAGER_OPTS,
    icon: join(RESOURCES_PATH, item.icon),
  };
}).filter(task => (
  argv.platform && (
    argv.platform === 'all' || argv.platform === task.platform
  ) || task.platform === platform())
);


/**
 * Build browser code with babel
 */
async function buildBrowserCode () {
  const browserBuildPath = join(BUILD_PATH, 'browser');
  return denodeify(exec).call(exec, `babel ./src/browser -d ${browserBuildPath}`, { cwd: ROOT_PATH });
}


/**
 * Copy resources
 */
async function copyResources() {
  return denodeify(exec).call(exec, `cp -R ./resources ${BUILD_PATH}`, { cwd: ROOT_PATH });
}


/**
 * Build assets through webpack
 */
async function buildRendererCode() {
  const stats = await denodeify(webpack).call(webpack, webpackConfig);
  if (argv.v) {
    console.log(stats.toString({ colors: true }));
  }
}


/**
 * Package electron app through electron-packager
 */
async function packElectronApp(opts) {
  return denodeify(packager).call(packager, opts);
}


/**
 * Executes the whole build process
 */
(async function startPack() {
  try {
    console.log('> cleaning old distribution files');
    await del([ BUILD_PATH, RELEASE_PATH, INSTALLERS_PATH ]);

    console.log('> building browser code with babel');
    await buildBrowserCode();

    console.log('> copying resources');
    await copyResources();

    console.log('> building renderer code with webpack');
    await buildRendererCode();

    console.log('> packaging electron app');
    for (const task of TASKS) {
      await packElectronApp(task);
    }

    console.log('>> success');
  } catch (err) {
    console.log('>> error', err.stack || err);
    process.exit(1);
  }
})();
