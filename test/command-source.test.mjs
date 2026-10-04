import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceCommands, compactAnimationDefaults } from '../packages/editor/dist/extension/command-source.js';

test('source commands preserve quoted selectors and inline comments', () => {
  const source = "test\n  find 'a//b' // selection\n  anim opacity from 0 delay index*.1 // fade";
  const blocks = sourceCommands(source);
  assert.deepEqual(blocks[1].tokens, ['find', "'a//b'"]);
  assert.equal(blocks[1].comment, '// selection');
});
test('source commands preserve disabled branch prefixes and indentation', () => {
  const source = 'test\r\n  // anim opacity from 0\r\n    // // anim scale from .8\r\n';
  const blocks = sourceCommands(source);
  assert.equal(blocks[2].indent, '    ');
  assert.equal(blocks[2].disabledPrefix, '// // ');
});
test('source commands distinguish definitions, variables, selections, events and animation calls', () => {
  const source = "namespace demo\nlet duration = .4\nreveal\n  find 'card_*'\n  anim child\n    event 'ready' delay duration";
  assert.deepEqual(sourceCommands(source).map(block => block.kind), ['declaration', 'declaration', 'definition', 'selection', 'animation', 'event']);
});
test('source commands ignore prose comments and retain escaped quotes and expressions', () => {
  const blocks = sourceCommands("// ordinary comment\ntest\n  find 'card\\'s'\n  anim pos.x to max(10,self+30) easy.bezier(.25,.1,.25,1)");
  assert.equal(blocks.length, 3);
  assert.equal(blocks[1].tokens[1], "'card\\'s'");
  assert.deepEqual(blocks[2].tokens, ['anim', 'pos.x', 'to', 'max(10,self+30)', 'easy.bezier(.25,.1,.25,1)']);
});

test('explicit animation defaults disappear while expressions, comments and disabled commands survive', () => {
  const source = 'let speed = .25\r\nshow\r\n  anim opacity from self to self time 0.25 delay 0 repeat 0 easy.linear // note\r\n  // anim pos.x to +0 time speed delay index*0 repeat 0\r\n  event ready time 0';
  assert.equal(compactAnimationDefaults(source), 'let speed = .25\r\nshow\r\n  anim opacity // note\r\n  // anim pos.x to +0 time speed delay index*0\r\n  event ready time 0');
});

test('default compaction retains malformed and duplicate parameters for parser diagnostics', () => {
  for (const line of ['anim opacity time .25 time .25', 'anim child time .25', 'anim opacity repeat 0.0', 'anim opacity easy.linear easy.linear']) {
    const source = `show\n  ${line}`;
    assert.equal(compactAnimationDefaults(source), source);
  }
});
