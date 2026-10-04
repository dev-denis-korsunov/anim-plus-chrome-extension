export interface SourceLine { indent: string; tokens: string[]; line: number; offset: number }
export type ExpressionNode =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'unary'; operator: '+' | '-'; value: ExpressionNode }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/'; left: ExpressionNode; right: ExpressionNode }
  | { kind: 'call'; name: 'min' | 'max'; args: ExpressionNode[] };
