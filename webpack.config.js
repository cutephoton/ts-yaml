const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

const DIST_PATH             = path.resolve(__dirname, 'dist/lib-webpack');
const TSCONFIG_PATH         = path.resolve(__dirname, 'tsconfig.webpack.json');
const DIST_BUNDLE           = 'ts-yaml.bundle.js';
const SRC_ENTRY_POINT       = './src/ts-yaml/index.ts';

console.info(`dist:         ${DIST_PATH}`);
console.info(`ts-config:    ${TSCONFIG_PATH}`);

const config = {
    entry:              SRC_ENTRY_POINT,
    mode:               'development',

    module: {
        rules: [{
            test:       /\.tsx?$/,
            loader:     'ts-loader',
            exclude:    /node_modules/,
            options: {
                configFile: TSCONFIG_PATH
            }
        }],
    },

    resolve: {
        extensions:     [ '.tsx', '.ts', '.js' ],
        plugins:        [new TsconfigPathsPlugin({ configFile:  TSCONFIG_PATH})]
    },

    output: {
        filename:       DIST_BUNDLE,
        path:           DIST_PATH,
    }
};

const production = {
    ...config,
    devtool:            'source-map',
    mode:               'production',
};

const development = {
    ...config,
    devtool:            'inline-source-map',
    mode:               'development',
};

module.exports = (env, argv) => {
    if (argv.mode === 'development') {
        return development;
    } else if (argv.mode === 'production') {
        return production;
    } else {
        throw Error(`Unknown webpack '${argv.mode}' mode.`);
    }

    return config;
};
