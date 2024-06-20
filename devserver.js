/* eslint-disable */
// Based on the works of Zart Software (licensed under the MIT license)
// https://github.com/zartsoft/parcel-browser-sync

const { Parcel, createWorkerFarm } = require('@parcel/core');
const BrowserSync = require('browser-sync');
const watch = require('glob-watcher');
const stylelint = require('stylelint');

/**
 * We want to enable HMR only on request or if React is used in the project
 * Simply because most of the JS code is inside the DOMContentLoaded event,
 * and thy can't be hot reloaded as the event is only called once.
 */
const packageJson = require('./package.json');
const HMR_ENABLED =
  !process.argv.includes('--disable-hmr') && (
    process.argv.includes('--hmr')
    || Object.keys(packageJson.dependencies).includes('react')
    || Object.keys(packageJson.dependencies).includes('react-dom')
  );

const parcelConfig = {
  config: './.parcelrc',
  logLevel: 'debug',
  mode: 'development',
  detailedReport: true,
  sourceMaps: true,
  minify: false,
  autoinstall: true,
};

const workerFarm = createWorkerFarm();
const sassBundler = new Parcel({
  entries: ['sass/global.scss'],
  defaultTargetOptions: {
    distDir: './dist/sass',
  },
  workerFarm,
  ...parcelConfig,
});

const jsBundler = new Parcel({
  entries: ['js/front-end.js'],
  defaultTargetOptions: {
    distDir: './dist/js',
  },
  workerFarm,
  ...parcelConfig,
  ...(HMR_ENABLED ? {
    hmrOptions: {
      port: 3005,
    },
    serveOptions: {
      https: {
        key: '/var/www/certs/localhost-key.pem',
        cert: '/var/www/certs/localhost.pem',
      },
      port: 3005,
    },
  } : {})
});
const browserSync = BrowserSync.create();

const themeDir = './';
const proxyUrl = 'https://airdev.test';

// Basic helper function to not run stylelint on every file little change
// + modification, wait for browsersync to be active
function debounce(func, timeout = 1000) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    const callback = () => {
      if (!browserSync.active) {
        setTimeout(callback, timeout);
      } else {
        func.apply(this, args);
      }
    };
    timer = setTimeout(callback, timeout);
  };
}

const runStylelint = debounce(async () => {
  console.log('🎨 Running stylelint');
  try {
    const result = await stylelint.lint({
      files: themeDir + 'sass/**/*.scss',
      fix: false,
      formatter: 'string',
    });
    console.log(
      result.output.length === 0
        ? '✅ No stylelint issues'
        : `\n❗ Stylelint found issues:\n\n${result.output.trim()}\n`
    );
  } catch (e) {
    console.error('❗ Stylelint failed', e);
  }
});

function startBrowserSync() {
  console.log('🔄 Starting BrowserSync...');

  return new Promise((resolve, reject) => {
    browserSync.init(
      {
        watch: false, // Parcel handles this, and we handle the PHP part
        open: false,
        online: false,
        injectChanges: true,
        browser: 'google chrome',
        socket: {
          socketIoOptions: {
            log: false,
            cookie: false,
          },
        },
        notify: true,
        proxy: {
          target: proxyUrl,
          ws: true,
        },
        https: {
          key: '/var/www/certs/localhost-key.pem',
          cert: '/var/www/certs/localhost.pem',
        },
      },
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
          console.log(''); // Print a new line after browsersync links
        }
      }
    );
  });
}

async function start() {
  console.log('🚀 Starting air-light Development Server');
  if (HMR_ENABLED) console.log('🔥 Hot Module Replacement enabled');

  const buildHandler = (name, cb = () => null) => {
    return (err, event) => {
      if (err) {
        // fatal error
        throw err;
      }

      if (event.type === 'buildSuccess') {
        let bundles = event.bundleGraph.getBundles();
        console.log(
          `🎉 Built ${bundles.length} ${name} bundle${
            bundles.length > 1 ? 's' : ''
          } in ${event.buildTime}ms!`
        );

        cb();
      } else if (event.type === 'buildFailure') {
        console.error('❗ Build failed');
        console.log(event.diagnostics);
      }
    };
  };

  console.log('📦 Bundling assets and watching...');

  // Parcel watches for changes and rebuilds the assets :)
  let builtFirst = null;
  let sassSubscription = await sassBundler.watch(
    buildHandler('Sass', () => {
      if (browserSync.active) {
        browserSync.reload('dist/sass/global.css');
      } else if (builtFirst === null) {
        builtFirst = 'sass';
      } else if (builtFirst === 'js') {
        startBrowserSync();
      }

      // Run stylelint after styles have been built debounced
      runStylelint();
    })
  );
  let jsSubscription = await jsBundler.watch(
    buildHandler('JavaScript', () => {
      if (browserSync.active) {
        // browserSync.reload('dist/js/front-end.js');
      } else if (builtFirst === null) {
        builtFirst = 'js';
      } else if (builtFirst === 'sass') {
        startBrowserSync();
      }
    })
  );

  // We also want to reload on PHP changes
  const watcher = watch(themeDir + '**/*.php');
  watcher.on('change', (path) => {
    console.log(`🐘 Detected change in ${path}. Reloading!`);
    browserSync.reload();
  });

  process.on('SIGINT', async function () {
    await sassSubscription.unsubscribe();
    await jsSubscription.unsubscribe();
    await workerFarm.end();
    browserSync.exit();

    console.log();
    console.log('🚪 Exiting. Bye!');

    process.exit(0);
  });
}

start();
