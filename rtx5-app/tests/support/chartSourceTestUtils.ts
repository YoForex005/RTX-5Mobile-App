import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const readChartScreenSource = (): string => {
  const candidates = [
    resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'),
    resolve(process.cwd(), 'rtx5-app/src/features/chart/ChartScreen.native.tsx'),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(filePath, 'ChartScreen.native.tsx was not found from the test working directory');
  return readFileSync(filePath, 'utf8');
};

export const extractFunctionBody = (source: string, functionName: string): string => {
  const functionStart = source.indexOf(`function ${functionName}`);
  assert.notEqual(functionStart, -1, `function ${functionName} was not found`);

  const openBrace = source.indexOf('{', functionStart);
  assert.notEqual(openBrace, -1, `function ${functionName} has no opening brace`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace + 1, index);
      }
    }
  }

  assert.fail(`function ${functionName} body was not closed`);
};

export const assertSourceContains = (
  source: string,
  pattern: RegExp,
  label: string,
): void => {
  assert.match(source, pattern, label);
};

export const assertSourceOmits = (
  source: string,
  pattern: RegExp,
  label: string,
): void => {
  assert.doesNotMatch(source, pattern, label);
};
