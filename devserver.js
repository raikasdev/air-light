/* eslint-disable */
// Based on the works of Zart Software (licensed under the MIT license)
// https://github.com/zartsoft/parcel-browser-sync

const { Parcel, createWorkerFarm } = require('@parcel/core');
const BrowserSync = require('browser-sync');
const watch = require('glob-watcher');
const stylelint = require('stylelint');

const parcelConfig = {
  config: './.parcelrc',
  logLevel: "debug",
  mode: "development",
  detailedReport: true,
  sourceMaps: true,
  minify: false,
  autoinstall: true,
}

const workerFarm = createWorkerFarm();
const sassBundler = new Parcel({
  entries: [
    "sass/global.scss",
  ],
  targets: {
    "default": {
      "distDir": './dist/sass'
    }
  },
  workerFarm,
  ...parcelConfig
});
const jsBundler = new Parcel({
  entries: [
    "js/front-end.js"
  ],
  targets: {
    "default": {
      "distDir": './dist/js'
    }
  },
  workerFarm,
  ...parcelConfig,
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
      formatter: 'string'
    });
    console.log(
      result.output.length === 0
      ? '✅ No stylelint issues'
      : `\n❗ Stylelint found issues:\n\n${result.output.trim()}\n`
    );
  } catch (e) {
    console.error('❗ Stylelint failed', e)
  }
});

function startBrowserSync() {
  console.log('🔄 Starting BrowserSync...');

  return new Promise((resolve, reject) => {
    browserSync.init({
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
      proxy: proxyUrl,
      https: {
        key: "/var/www/certs/localhost-key.pem",
        cert: "/var/www/certs/localhost.pem",
      },
    }, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve();
        console.log(''); // Print a new line after browsersync links
      }
    });
  });
}

async function start() {
  console.log('🚀 Starting air-light Development Server');

  const buildHandler = (name, cb = () => null) => {
    return (err, event) => {
      if (err) {
        // fatal error
        throw err;
      }
    
      if (event.type === 'buildSuccess') {
        let bundles = event.bundleGraph.getBundles();
        console.log(`🎉 Built ${bundles.length} ${name} bundle${bundles.length > 1 ? 's' : ''} in ${event.buildTime}ms!`);
        
        cb();
      } else if (event.type === 'buildFailure') {
        console.error('❗ Build failed')
        console.log(event.diagnostics);
      }
    }
  }

  console.log('📦 Bundling assets and watching...')

  // Parcel watches for changes and rebuilds the assets :)
  let builtFirst = null;
  await sassBundler.watch(buildHandler('Sass', () => {
    if (browserSync.active) {
      browserSync.reload('dist/sass/global.css');
    } else if (builtFirst === null) {
      builtFirst = 'sass'
    } else if (builtFirst === 'js') {
      startBrowserSync();
    }

    // Run stylelint after styles have been built debounced
    runStylelint();
  }));
  await jsBundler.watch(buildHandler('JavaScript', () => {
    if (browserSync.active) {
      browserSync.reload('dist/js/front-end.js');
    } else if (builtFirst === null) {
      builtFirst = 'js'
    } else if (builtFirst === 'sass') {
      startBrowserSync();
    }
  }));

  // We also want to reload on PHP changes
  const watcher = watch(themeDir + '**/*.php');
  watcher.on('change', (path) => {
    console.log(`🐘 Detected change in ${path}. Reloading!`);
    browserSync.reload();
  });

  process.on('SIGINT', function() {
    console.log();
    console.log("🚪 Exiting. Bye!");
  
    workerFarm.end();
    watcher.close();
    browserSync.exit();
    
    process.exit();
  });
}

start();
