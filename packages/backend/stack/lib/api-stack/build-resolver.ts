import { Code } from 'aws-cdk-lib/aws-appsync';
import { buildSync } from 'esbuild';

export const buildResolver = (path: string) => {
  const buildResult = buildSync({
    target: 'esnext',
    sourcemap: 'inline',
    sourcesContent: false,
    treeShaking: true,
    platform: 'node',
    format: 'esm',
    entryPoints: [path],
    bundle: true,
    write: false,
    external: ['@aws-appsync/utils'],
  });

  if (buildResult.errors.length > 0) {
    throw new Error(buildResult.errors[0].text);
  }

  if (buildResult.outputFiles.length === 0) {
    throw new Error('No output files');
  }

  return Code.fromInline(buildResult.outputFiles[0].text);
};
