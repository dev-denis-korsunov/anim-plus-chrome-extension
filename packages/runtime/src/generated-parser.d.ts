import type { SourceLine, ExpressionNode } from './grammar-types.js';
export function parse(source: string, options?: { startRule?: 'Document' }): SourceLine[];
export function parse(source: string, options: { startRule: 'Expression' }): ExpressionNode;
