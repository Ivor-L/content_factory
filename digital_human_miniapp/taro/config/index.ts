import { defineConfig } from '@tarojs/cli';

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL || 'https://atomx.top';
const DEV_API_KEY = process.env.TARO_APP_API_KEY || '';
const BYPASS_LOGIN = process.env.TARO_APP_BYPASS_LOGIN === 'true';

export default defineConfig({
  projectName: 'digital-human-miniapp',
  date: '2026-04-03',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    375: 2,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {
    __API_BASE_URL__: JSON.stringify(API_BASE_URL),
    __MINIAPP_BYPASS_LOGIN__: JSON.stringify(BYPASS_LOGIN),
    __MINIAPP_DEV_API_KEY__: JSON.stringify(DEV_API_KEY),
  },
  copy: { patterns: [], options: {} },
  framework: 'react',
  compiler: 'webpack5',
  cache: { enable: false },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      cssModules: { enable: false },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    postcss: {
      autoprefixer: { enable: true },
      cssModules: { enable: false },
    },
  },
});
