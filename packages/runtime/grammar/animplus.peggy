{
  function binary(head, tail) {
    return tail.reduce((left, part) => ({ kind: 'binary', operator: part[0], left, right: part[1] }), head);
  }
}

// Indentation is retained for the semantic compiler's Pipe dependency stack.
Document = lines:(Line Newline)* last:Line !. { return [...lines.map(row => row[0]), last]; }
Line = indent:$[ \t]* tokens:Statement? [ \t]* Comment? {
  return { indent, tokens: tokens || [], line: location().start.line, offset: location().start.offset };
}
Statement = Namespace / Variable / Animation / Selection / Custom / Definition / InvalidStatement
Namespace = name:KeywordNamespace args:Arguments { return [name, ...args]; }
Variable = name:KeywordLet args:Arguments { return [name, ...args]; }
Animation = name:KeywordAnim args:Arguments { return [name, ...args]; }
Selection = name:SelectionKeyword args:Arguments { return [name, ...args]; }
Custom = name:CustomKeyword args:Arguments { return [name, ...args]; }
Definition = name:Identifier &([ \t]* (Comment / Newline / !.)) { return [name]; }
// Preserve invalid commands for actionable semantic diagnostics rather than recovery.
InvalidStatement = head:Token args:Arguments { return [head, ...args]; }
KeywordNamespace = value:$"namespace" Boundary { return value; }
KeywordLet = value:$"let" Boundary { return value; }
KeywordAnim = value:$"anim" Boundary { return value; }
SelectionKeyword = value:$("depth-only" / "of-type" / "find" / "depth" / "filter" / "ignore" / "index" / "path" / "parent" / "reverse" / "grid") Boundary { return value; }
CustomKeyword = value:$("event" / "sound" / "spine") Boundary { return value; }
Boundary = &([ \t\r\n] / "//" / !.)
Arguments = rest:([ \t]+ value:Token { return value; })* { return rest; }
Token = parts:(Quoted / Bare)+ { return parts.join(''); }
Bare = value:$((!"//" [^ \t\r\n'" ])+) { return value; }
Quoted = "'" value:SingleCharacter* "'" { return value.join(''); }
       / '"' value:DoubleCharacter* '"' { return value.join(''); }
SingleCharacter = "\\" value:[\\'] { return value; } / [^'\\\r\n]
DoubleCharacter = "\\" value:[\\"] { return value; } / [^"\\\r\n]
Comment = "//" [^\r\n]*
Newline = "\r\n" / "\n"
Identifier = $([A-Za-z_] [A-Za-z_0-9]* ("." [A-Za-z_] [A-Za-z_0-9]*)*)

// Expressions are a separate public start rule: no whitespace or JavaScript calls.
Expression = result:Sum !. { return result; }
Sum = head:Product tail:(op:$[+-] right:Product { return [op, right]; })* { return binary(head, tail); }
Product = head:Unary tail:(op:$[*/] right:Unary { return [op, right]; })* { return binary(head, tail); }
Unary = op:$[+-] value:Unary { return { kind: 'unary', operator: op, value }; } / Atom
Atom = "(" value:Sum ")" { return value; }
     / name:$("min" / "max") "(" head:Sum tail:("," value:Sum { return value; })* ")" { return { kind: 'call', name, args: [head, ...tail] }; }
     / value:Number { return { kind: 'number', value: Number(value) }; }
     / name:$([A-Za-z_] [A-Za-z_0-9]* ("." [xy])?) { return { kind: 'variable', name }; }
Number = $(([0-9]+ ("." [0-9]*)? / "." [0-9]+) ([eE] [+-]? [0-9]+)?)
