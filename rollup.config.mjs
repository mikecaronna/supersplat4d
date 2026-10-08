import path from 'path';

import alias from '@rollup/plugin-alias';
import image from '@rollup/plugin-image';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import strip from '@rollup/plugin-strip';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import scss from 'rollup-plugin-scss';
import sass from 'sass';

import copyAndWatch from './copy-and-watch.mjs';
import publicAssetsAndModelManifest from './public-assets-and-model-manifest.mjs';

// prod is release build
if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}
// debug, profiler, release - default profiler for MiniStats sort/render time
const BUILD_TYPE = process.env.BUILD_TYPE || 'profiler';
const BUILD_ID = new Date().toISOString();
const engineSuffix = BUILD_TYPE === 'debug' ? '.dbg' : BUILD_TYPE === 'profiler' ? '.prf' : '';
const ENGINE_DIR = path.resolve(`node_modules/playcanvas/build/playcanvas${engineSuffix}/src/index.js`);
const PCUI_DIR = path.resolve('node_modules/@playcanvas/pcui');
const HREF = process.env.BASE_HREF || '';

// Web analytics are opt-in at build time. Without CF_BEACON_TOKEN the tag is
// absent, so a fork or a local build reports nothing into anyone's account.
const CF_BEACON = process.env.CF_BEACON_TOKEN ?
    `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${process.env.CF_BEACON_TOKEN}"}'></script>` :
    '';

const buildIdReplace = () => ({
    name: 'build-id-replace',
    transform(code, id) {
        if (id.endsWith(`${path.sep}src${path.sep}sw.ts`)) {
            return {
                code: code.replace('__BUILD_ID__', BUILD_ID),
                map: null
            };
        }

        return null;
    }
});

const outputHeader = () => {
    const BLUE_OUT = '\x1b[34m';
    const BOLD_OUT = '\x1b[1m';
    const REGULAR_OUT = '\x1b[22m';
    const RESET_OUT = '\x1b[0m';

    const title = [
        'Building SuperSplat',
        `type ${BOLD_OUT}${BUILD_TYPE}${REGULAR_OUT}`
    ].map(l => `${BLUE_OUT}${l}`).join('\n');
    console.log(`${BLUE_OUT}${title}${RESET_OUT}\n`);
};

outputHeader();

const BANNER = `/*!
 * 4D Viewer - a fork of supersplat4d (github.com/forgrabbit/supersplat4d),
 * itself derived from PlayCanvas SuperSplat. Modifications by Mike Caronna.
 * Source: github.com/mikecaronna/supersplat4d/tree/starling-viewer
 *
 * Bundles third-party software:
 *   SuperSplat, the PlayCanvas engine and PCUI (c) PlayCanvas Ltd, MIT
 *   mediabunny (c) 2025-present Vanilagy and contributors, MPL-2.0
 *   meshoptimizer (c) 2016-2022 Arseny Kapoulkine, MIT
 *   JSZip, MIT or GPL-3.0-or-later; i18next, MIT; tslib, 0BSD; lodepng
 *
 * Full license texts and source pointers: THIRD-PARTY-NOTICES.md
 */`;

const application = {
    input: 'src/index.ts',
    output: {
        banner: BANNER,
        dir: 'dist',
        format: 'esm',
        sourcemap: BUILD_TYPE !== 'release',
        globals: {
            'jszip': 'JSZip'
        }
    },
    external: ['jszip'],
    plugins: [
        buildIdReplace(),
        publicAssetsAndModelManifest(),
        copyAndWatch({
            targets: [
                {
                    src: 'src/index.html',
                    transform: (contents, filename) => {
                        return contents.toString()
                        .replace('__BASE_HREF__', HREF)
                        .replace('__CF_BEACON__', CF_BEACON);
                    }
                },
                { src: 'src/manifest.json' },
                { src: 'node_modules/jszip/dist/jszip.js' },
                { src: 'static/images', dest: 'static' },
                { src: 'static/icons', dest: 'static' },
                { src: 'static/lib', dest: 'static' },
                { src: 'static/locales', dest: 'static' },
                { src: 'static/env/VertebraeHDRI_v1_512.png', dest: 'static/env' }
            ]
        }),
        alias({
            entries: {
                'playcanvas': ENGINE_DIR,
                '@playcanvas/pcui': PCUI_DIR
            }
        }),
        typescript({
            tsconfig: './tsconfig.json'
        }),
        resolve(),
        image({ dom: false }),
        json(),
        scss({
            sourceMap: true,
            runtime: sass,
            processor: (css) => {
                return postcss([autoprefixer])
                .process(css, { from: undefined })
                .then(result => result.css);
            },
            fileName: 'index.css',
            includePaths: [`${PCUI_DIR}/dist`],
            watch: 'src/ui/scss'
        }),
        BUILD_TYPE === 'release' &&
        strip({
            include: ['**/*.ts'],
            functions: ['Debug.exec']
        }),
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};

const serviceWorker = {
    input: 'src/sw.ts',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: BUILD_TYPE !== 'release'
    },
    plugins: [
        buildIdReplace(),
        resolve(),
        json(),
        typescript()
        // BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};

export default [
    application,
    serviceWorker
];
