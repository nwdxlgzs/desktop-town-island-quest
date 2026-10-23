import { defineConfig } from 'vite';
import { sealBuild } from './scripts/seal-build.js';
import {teacherPreviewPlugin} from './scripts/teacher-preview-plugin.mjs';

// Inline the generated entry and stylesheet without introducing extra build dependencies.
function singleFile() {
  return {
    name: 'desktop-quest-single-file',
    enforce: 'post',
    async generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') throw new Error('Missing HTML entry');
      let text = String(html.source);
      for (const [name, output] of Object.entries(bundle)) {
        if (output.type === 'chunk') {
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          text = text.replace(new RegExp(`<script[^>]*src="/?${escaped}"[^>]*></script>`), () => `<script type="module">${output.code.replace(/<\/script/gi, '<\\/script')}</script>`);
          delete bundle[name];
        } else if (name.endsWith('.css')) {
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          text = text.replace(new RegExp(`<link[^>]*href="/?${escaped}"[^>]*>`), () => `<style>${output.source}</style>`);
          delete bundle[name];
        }
      }
      text = text.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, '');
      html.source = await sealBuild(text);
      this.emitFile({type:'asset',fileName:'电脑小镇·岛屿探索.html',source:html.source});
    },
  };
}

export default defineConfig({
  plugins: [teacherPreviewPlugin(),singleFile()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 1200,
  },
});
