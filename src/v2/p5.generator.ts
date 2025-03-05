import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

interface RemovalRange {
  start: number;
  end: number;
}

export function process(code: string): string {
  const ast = acorn.parse(code, { ecmaVersion: 2020 }) as acorn.Node;

  const removalRanges: RemovalRange[] = [];

  walk.simple(ast, {
    VariableDeclaration(node: any) {
      if (node.declarations.some((dec: any) => dec.init && dec.init.type === 'CallExpression' && dec.init.callee.name === 'FormaCollection')) {
        removalRanges.push({ start: node.start, end: node.end });
      }
    },
  });

  removalRanges.sort((a, b) => b.start - a.start);

  let modifiedCode = code;
  removalRanges.forEach((range) => {
    modifiedCode = modifiedCode.slice(0, range.start) + modifiedCode.slice(range.end);
  });

  return modifiedCode;
}
