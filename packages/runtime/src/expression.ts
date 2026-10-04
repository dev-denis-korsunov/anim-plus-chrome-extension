import { parse as parseGrammar } from './generated-parser.js';
import type { ExpressionNode } from './grammar-types.js';
import type { Context, Value } from './types.js';

function evaluate(node: ExpressionNode, context: Context): number {
  switch (node.kind) {
    case 'number': return node.value;
    case 'variable':
      if (!Object.hasOwn(context, node.name)) throw new Error(`Unavailable variable: ${node.name}`);
      return context[node.name];
    case 'unary': return (node.operator === '-' ? -1 : 1) * evaluate(node.value, context);
    case 'call': return Math[node.name](...node.args.map(arg => evaluate(arg, context)));
    case 'binary': {
      const left = evaluate(node.left, context), right = evaluate(node.right, context);
      if (node.operator === '/' && right === 0) throw new Error('Division by zero');
      switch (node.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
      }
    }
  }
}

export function expression(source: string): Value {
  let node: ExpressionNode;
  try { node = parseGrammar(source, { startRule: 'Expression' }); }
  catch (cause) { throw new Error(`Invalid expression: ${source}`, { cause }); }
  return context => {
    const result = evaluate(node, context);
    if (!Number.isFinite(result)) throw new Error(`Non-finite expression: ${source}`);
    return result;
  };
}

export function endpoint(source: string): Value {
  const relativeLiteral = /^[+-](?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(source);
  const evaluate = expression(source);
  return context => evaluate(context) + (relativeLiteral ? context.self : 0);
}
