import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import path from 'path'
import fs from 'fs'

// uni-app does not copy assets referenced only by runtime-generated paths.
// Tab icons and the personal edition's built-in poster fallback must stay in-package.
function copyRuntimeStatic(): any {
  function doCopy() {
    const platform = process.env.UNI_PLATFORM || 'mp-weixin'
    const mode = process.env.NODE_ENV === 'production' ? 'build' : 'dev'
    const mpRoot = path.resolve(__dirname, 'dist', mode, platform)
    if (!fs.existsSync(mpRoot)) return
    for (const dir of ['tab', 'actions', 'mood', 'composer', 'posters']) {
      const srcDir = path.resolve(__dirname, `static/${dir}`)
      const destDir = path.resolve(mpRoot, `static/${dir}`)
      if (!fs.existsSync(srcDir)) continue
      fs.mkdirSync(destDir, { recursive: true })
      for (const file of fs.readdirSync(srcDir)) {
        const srcFile = path.join(srcDir, file)
        if (fs.statSync(srcFile).isFile()) {
          fs.copyFileSync(srcFile, path.join(destDir, file))
        }
      }
    }
    for (const file of ['map-pin.png']) {
      const srcFile = path.resolve(__dirname, `static/${file}`)
      if (!fs.existsSync(srcFile)) continue
      const destDir = path.resolve(mpRoot, 'static')
      fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(srcFile, path.join(destDir, file))
    }
  }
  return {
    name: 'copy-runtime-static',
    closeBundle: doCopy,
    buildStart: doCopy,
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname)

  return {
    plugins: [uni(), copyRuntimeStatic()],
    // 微信开发者工具上传时会再次压缩 JS，部分稳定版仍无法解析
    // 可选链和空值合并运算符。统一输出到 ES2017，避免上传时报“非法的文件”。
    build: {
      target: 'es2017',
    },
    // HBuilderX 真机调试上传的是 development 产物，不经过 build.target。
    // 同步设置 esbuild target，确保 dev 与 build 都不会残留 ?? / ?. 语法。
    esbuild: {
      target: 'es2017',
      /**
       * import.meta 是 ES2020 语法。只写 target: 'es2017' 时 esbuild 会把它
       * 降级成一个空对象（编译产物开头的 `const import_meta = {}`），于是
       * uni-app 注入的 HMR 代码 `import.meta.hot.on('file-changed', ...)`
       * 变成 `undefined.on(...)`，H5 开发服务器一进首页就抛异常、整页白屏。
       *
       * 这里单独声明 import.meta 可用：降级 ?. / ?? 的目的不受影响，
       * 而 import.meta 只出现在 dev 期的 HMR 代码和被 Vite 静态替换掉的
       * import.meta.env 里，小程序产物中不会残留。
       */
      supported: {
        'import-meta': true,
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ['legacy-js-api'],
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        vue: path.resolve(__dirname, 'node_modules/@dcloudio/uni-h5-vue/dist/vue.runtime.esm.js'),
      },
    },
    server: {
      // 默认只绑回环，需要用别的机器/手机访问时设 VITE_DEV_HOST=0.0.0.0。
      host: env.VITE_DEV_HOST || '127.0.0.1',
      port: Number(env.VITE_DEV_PORT) || 5180,
      proxy: {
        '^/api/(?!.*\\.[a-z]+$)': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3080',
          changeOrigin: true,
        },
      },
    },
  }
})
