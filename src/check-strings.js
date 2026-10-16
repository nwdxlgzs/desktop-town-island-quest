import { openTextTable } from './string-cipher.js';

// Only the development branch contains literals. Vite/esbuild removes it in a
// release; seal-build then replaces the marker with a freshly encrypted table.
export const developmentTexts=[
  'securitypolicyviolation',
  'island-integrity-failed',
  'integrityFailed',
  'data-integrity-failed',
  'gameStopped',
  'integrity-stop',
  'role',
  'alert',
  '#app',
  'meta[http-equiv="Content-Security-Policy" i]',
  '#game-bootstrap',
  '#game-program',
  'game-program',
  'game-entry',
  '#game-entry',
  'style,link[rel="stylesheet"]',
  'charset',
  "'sha256-",
  '__PROGRAM__',
  '游戏未能启动：教具完整性检查未通过，文件变更或预览环境不兼容都可能触发。请重新加载原始教具文件。',
  '<h1>游戏已关闭</h1><p>教具完整性检查未通过。文件变更或预览环境不兼容都可能触发此提示。</p><p>请重新加载原始教具文件。</p>',
  '#game-credit-source',
  'game-credit-source',
  'sponsor-credit',
  'data-sponsor-credit',
  '[data-sponsor-credit]',
  'SPAN',
  'META',
  'PoweredBy@nwdxlgzs赞助提供此游戏化教具',
  'modal-in',
  'animationend',
];

export const [policyEvent,failedEvent,failureFlag,failureAttribute,stoppedFlag,stopClass,roleAttribute,alertRole,appSelector,policySelector,bootstrapSelector,programSelector,programId,entryId,entrySelector,styleSelector,charsetAttribute,hashPrefix,programMarker,loaderMessage,stoppedMarkup,creditSourceSelector,creditSourceId,creditClass,creditAttribute,creditSelector,creditTag,metaTag,creditText,entranceAnimation,animationEnd]=import.meta.env?.PROD?openTextTable('__ISLAND_CHECK_STRINGS__'):developmentTexts;
