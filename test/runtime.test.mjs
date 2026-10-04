import test from 'node:test';
import assert from 'node:assert/strict';
import { load, parse } from 'animplus';
import { presets } from '../packages/editor/dist/presets.js';
import { dogIdleSource } from 'animplus/examples/dog';
const node = (name, children = []) => ({ name, children, opacity: 1, pos: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1 }, rot: 0, skew: { x: 0, y: 0 }, geometry: { x: 0, y: 0 } });
const run = (body, target, options) => load(`test\n${body}`).prepare('test', target, options);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('alternate repeats reverse seamlessly and retain the correct final pose', () => {
  const target = node('target');
  const animation = run('  find target\n  anim opacity from 0 to 1 time 1 repeat 3 direction alternate easy.sin-in-out', target);
  for (const [time, expected] of [[0, 0], [1, 1], [1.5, .5], [2, 0], [3, 1], [4, 0]]) { animation.seek(time); near(target.opacity, expected); }
  animation.seek(1 - .00001); const before = target.opacity;
  animation.seek(1 + .00001); near(target.opacity, before); animation.reset();
  assert.throws(() => parse('test\n  find target\n  anim opacity direction sideways'), /Invalid direction/);
});

test('dog head and tail have no jumps across infinite cycle boundaries', () => {
  const head = node('dog_head'), tail = node('dog_tail');
  const animation = load(dogIdleSource).prepare('dog.idle', node('root', [head, tail]));
  assert.equal(animation.duration, Infinity);
  for (const boundary of [.24, .48, 1.6, 3.2, 8]) {
    animation.seek(boundary - .00001); const before = [head.pos.y, tail.rot];
    animation.seek(boundary + .00001);
    assert.ok(Math.abs(head.pos.y - before[0]) < .01);
    assert.ok(Math.abs(tail.rot - before[1]) < .01);
  }
  animation.reset();
});

test('comments: inline //, quoted literal, division and paths', () => {
  const target = node('root', [node('a//b')]);
  const animation = run("  // comment\n  path 0\n  anim opacity from 0 time 1/2 // reveal", target);
  animation.seek(.25); near(target.children[0].opacity, .5); animation.reset();
  assert.doesNotThrow(() => parse("test\n  find 'a//b'\n  anim opacity from 0"));
  assert.throws(() => parse('test\n  # old comment'), /Unknown instruction/);
});
test('two-space indentation rejects odd, tabs, skipped levels and orphan Pipe', () => {
  for (const body of ['   anim opacity', '\tanim opacity', '    anim opacity', '  anim opacity\n      anim rot', "  find 'x'\n    anim opacity"]) assert.throws(() => parse(`test\n${body}`));
});
test('variables resolve overrides before dependent bindings', () => {
  const target = node('target');
  const library = load('let duration = .5\nlet recovery = duration/2\ntest\n  find target\n  anim opacity from 0 time recovery');
  const animation = library.prepare('test', target, { variables: { duration: 2 } });
  assert.equal(animation.duration, 1); animation.seek(.5); near(target.opacity, .5); animation.reset();
  assert.throws(() => library.prepare('test', target, { variables: { typo: 1 } }), /Unknown variable/);
});
test('variables and arithmetic cannot execute arbitrary code', () => {
  assert.throws(() => parse('let duration = window.alert(1)\ntest'), /Invalid expression/);
  assert.throws(() => parse('let self = 1\ntest'), /Reserved/);
  assert.throws(() => parse('let duration = 1 + 2\ntest'), /file-level let/);
  assert.throws(() => load('let a = b\nlet b = 2\ntest').prepare('test', node('root')), /Unavailable/);
});
test('without selection and empty selection no property tracks are created', () => {
  for (const body of ['  anim opacity from 0', '  find missing\n  anim opacity from 0']) {
    const target = node('root'); const animation = run(body, target);
    assert.equal(animation.inspect().transitions.length, 0); animation.seek(0); assert.equal(target.opacity, 1);
  }
});
test('wildcards match complete names case-sensitively', () => {
  const root = node('root', [node('card_1'), node('card_2'), node('Card_3'), node('my_card_4')]);
  const animation = run("  find 'card_*'\n  anim opacity from 0", root);
  assert.equal(animation.inspect().transitions.length, 2);
});
test('depth, filter, ignore and composing section results', () => {
  const inner = node('content', [node('keep'), node('bg')]);
  const animation = run('  find content\n  depth 1\n  ignore bg\n  anim opacity from 0', node('root', [inner]));
  assert.deepEqual(animation.inspect().transitions.map(job => job.object.name), ['content', 'keep']);
});
test('Pipe waits for the maximum group end including cascade', () => {
  const cards = [node('card_0'), node('card_1'), node('card_2')];
  const animation = run("  find 'card_*'\n  anim opacity from 0 time 1 delay index*.1\n    anim rot to 30 time .2", node('root', cards));
  assert.equal(animation.duration, 1.4);
  assert.deepEqual(animation.inspect().transitions.filter(job => job.key === 'rot').map(job => job.activation), [1.2, 1.2, 1.2]);
  animation.seek(.5); assert.equal(cards[0].rot, 0); near(cards[0].opacity, .5);
  animation.seek(1.3); near(cards[0].rot, 15); animation.reset();
});
test('same-level Pipe children fork in parallel', () => {
  const target = node('target');
  const animation = run('  find target\n  anim opacity from 0 time .5\n    anim rot to 30 time .2\n    anim pos.y to +40 time .2', target);
  assert.equal(animation.duration, .7); animation.seek(.6); near(target.rot, 15); near(target.pos.y, 20); animation.reset();
});
test('new composing section resets to original root and preserves Pipe dependency', () => {
  const root = node('root', [node('a'), node('b')]);
  const animation = run('  find a\n  anim opacity from 0 time .5\n    find b\n    anim rot to 30 time .5', root);
  assert.equal(animation.duration, 1); animation.seek(.75); near(root.children[1].rot, 15); animation.reset();
});
test('named animations inherit collection and reject recursion', () => {
  const target = node('target');
  const animation = load('namespace ns\nfade\n  anim opacity from 0 time .5\ntest\n  find target\n  anim fade').prepare('ns.test', target);
  animation.seek(.25); near(target.opacity, .5); animation.reset();
  assert.throws(() => load('test\n  anim test').prepare('test', target), /Recursive/);
});
test('signed literal is relative; plain variable is absolute', () => {
  const target = node('target'); target.pos.y = 100;
  const animation = run('  find target\n  anim pos.y from -40 time 1', target);
  animation.seek(.5); near(target.pos.y, 80); animation.seek(.1); near(target.pos.y, 64); animation.reset(); assert.equal(target.pos.y, 100);
});
test('finite repeats extend duration and loops retain infinite lifetime', () => {
  const target = node('target');
  const animation = run('  find target\n  anim opacity from 0 time .5 repeat 2', target);
  assert.equal(animation.duration, 1.5); animation.seek(.75); near(target.opacity, .5); animation.reset();
  const loop = run('  find target\n  anim opacity from 0 time .5 repeat -1\n    anim rot to 30 time .2', target);
  assert.equal(loop.duration, Infinity); loop.seek(.6); near(target.rot, 15); loop.reset();
});
test('events are direct commands, once per action, silent on seek', () => {
  const fired = [], target = node('target');
  const animation = run("  find target\n  anim opacity from 0 time .5\n    event 'ready' time .2", target, { onEvent: (name, handle) => fired.push([name, handle.time, target.opacity]) });
  animation.seek(.6); assert.equal(fired.length, 0); animation.seek(0); animation.play().advance(1);
  assert.deepEqual(fired, [['ready', .5, 1]]); assert.equal(animation.status, 'Completed'); animation.reset();
  assert.throws(() => parse("test\n  anim event 'old'"), /without anim/);
});
test('unsupported services and negative times fail before writes', () => {
  assert.throws(() => parse("test\n  sound 'open'"), /not implemented/);
  const target = node('target'); assert.throws(() => run('  find target\n  anim opacity from 0 time -1', target), /Invalid time/); assert.equal(target.opacity, 1);
});
test('ownership conflicts, independent channels and cancel/reset', () => {
  const target = node('target');
  const first = run('  find target\n  anim opacity from 0 time 1', target).play();
  const second = run('  find target\n  anim opacity from 0 time 1', target);
  assert.throws(() => second.play(), /owned/);
  const third = run('  find target\n  anim rot to 30 time 1', target).play();
  first.reset(); third.advance(.5); near(target.rot, 15); assert.equal(target.opacity, 1); third.reset();
});
test('target destruction suppresses children and event handlers can cancel', () => {
  const target = node('target'), events = [];
  const animation = run("  find target\n  anim opacity from 0 time .1\n    event 'ready'", target, { onEvent: name => events.push(name) }).play();
  target.destroyed = true; animation.advance(.2); assert.equal(animation.status, 'TargetDestroyed'); assert.deepEqual(events, []); animation.cancel();
  const cancelled = run("  event 'first'\n    event 'second'", node('root'), { onEvent: (_, handle) => handle.cancel() }).play();
  assert.equal(cancelled.status, 'Cancelled');
});
test('later overlapping commands replace earlier channels including delays', () => {
  const target = node('target');
  const animation = run('  find target\n  anim opacity from 0 to .5 time 4\n  anim opacity from .8 to .2 delay .5 time 1', target);
  assert.equal(animation.duration, 1.5);
  assert.equal(animation.inspect().transitions.length, 1);
  animation.seek(.25); near(target.opacity, .8);
  animation.seek(1); near(target.opacity, .5);
  animation.seek(1.5); near(target.opacity, .2);
  animation.seek(.25); near(target.opacity, .8);
  animation.reset(); near(target.opacity, 1);
  const scale = run('  find target\n  anim scale from .2 time 4\n  anim scale.x from .5 time 1', target);
  scale.seek(0); near(target.scale.x, .5); near(target.scale.y, .2);
  assert.equal(scale.inspect().transitions.filter(job => job.key === 'scale.x').length, 1);
  scale.reset();
});
test('a later Pipe action cancels an earlier channel without resuming it', () => {
  const target = node('target');
  const animation = run('  find target\n  anim opacity from 0 to 1 time 4\n  anim rot to 10 time 1\n    anim opacity from .8 to .2 time .5 delay .5', target);
  assert.equal(animation.duration, 2);
  animation.seek(.5); near(target.opacity, .125);
  animation.seek(1.25); near(target.opacity, .8);
  animation.seek(2); near(target.opacity, .2);
  animation.seek(.5); near(target.opacity, .125);
  const retired = animation.inspect().transitions.find(job => job.key === 'opacity' && job.activation === 0);
  assert.equal(retired.end, 1);
  animation.reset();
});
test('an overridden infinite repeat no longer keeps the run alive', () => {
  const animation = run('  find target\n  anim opacity from 0 time .5 repeat -1\n  anim opacity from .8 time 1', node('target'));
  assert.equal(animation.duration, 1);
  assert.equal(animation.inspect().transitions.length, 1);
});
test('classic bounce is deterministic forwards/backwards with no baseline drift', () => {
  const ball = node('ball'), animation = load(presets.Bounce).prepare('demo.bounce', node('root', [ball]));
  assert.ok(animation.duration >= 2.4); assert.ok(animation.inspect().transitions.length > 25);
  animation.seek(.3); const first = JSON.stringify([ball.pos, ball.scale]);
  assert.ok(ball.pos.y < 0); animation.seek(1.8); animation.seek(.3);
  assert.equal(JSON.stringify([ball.pos, ball.scale]), first);
  animation.seek(animation.duration); near(ball.pos.x, 260); near(ball.pos.y, 0); near(ball.scale.x, 1); near(ball.scale.y, 1);
  animation.reset(); assert.deepEqual(ball.pos, { x: 0, y: 0, z: 0 }); assert.deepEqual(ball.scale, { x: 1, y: 1 });
});

test('PEG expression grammar preserves precedence, associativity and nested functions', () => {
  const target = node('target');
  const animation = run('  find target\n  anim opacity from 0 to max(.1,min(1,(2+4)/3-1)) time 8/2/2', target);
  assert.equal(animation.duration, 2);
  animation.seek(1); near(target.opacity, .5); animation.reset();
  for (const value of ['min()', '1+2 garbage', '1**2', 'window.alert(1)', '(1+2', '1e']) {
    assert.throws(() => run(`  find target\n  anim opacity to ${value}`, target));
  }
  assert.throws(() => run('  find target\n  anim opacity to 1/0', target), /Division by zero/);
});

test('PEG file grammar handles BOM, CRLF, quotes, escapes and source locations', () => {
  const program = parse('\uFEFFnamespace demo\r\n\r\nshow\r\n  find "a\\\\b\\\"c//d" // comment\r\n  anim opacity from 0');
  assert.deepEqual(program.definitions.get('demo.show').nodes[0].args, ['a\\b"c//d']);
  assert.equal(program.definitions.get('demo.show').nodes[1].line, 5);
  for (const source of ["test\n  find 'unclosed", "test\n  find 'bad\\n'", "test\n  find 'two\nlines'"]) {
    assert.throws(() => parse(source), error => /^Line 2:/.test(error.message) && error.cause.location.start.line === 2);
  }
});

test('unquoted names are literals equivalent to quoted names; whitespace and comments can be quoted', () => {
  const root = node('root', [node('card_1'), node('card_2'), node('hero card'), node('a//b')]);
  for (const selector of ['card_*', "'card_*'", '"card_*"']) {
    const events = [];
    const animation = run(`  find ${selector}\n  anim opacity from 0 time .1\n    event ready`, root, { onEvent: name => events.push(name) });
    assert.deepEqual(animation.inspect().transitions.map(job => job.object.name), ['card_1', 'card_2']);
    animation.play().advance(.2); assert.deepEqual(events, ['ready']); animation.reset();
  }
  for (const selector of ["'hero card'", '"a//b"']) {
    assert.equal(run(`  find ${selector}\n  anim opacity from 0`, root).inspect().transitions.length, 1);
  }
  const target = node('target'), names = [];
  const animation = load('let target = .5\nshow\n  find target\n  anim opacity from 0 time target\n    event "cards ready"').prepare('show', target, { onEvent: name => names.push(name) });
  assert.equal(animation.duration, .5); animation.play().advance(.6); assert.deepEqual(names, ['cards ready']); animation.reset();
});

test('depth includes the selected root, while depth-only selects exactly one level', () => {
  const root = node('content', [node('child', [node('grandchild')])]);
  const names = command => run(`  find content\n  ${command}\n  anim opacity from 0`, root).inspect().transitions.map(job => job.object.name);
  assert.deepEqual(names('depth 0'), ['content']);
  assert.deepEqual(names('depth 1'), ['content', 'child']);
  assert.deepEqual(names('depth 2'), ['content', 'child', 'grandchild']);
  assert.deepEqual(names('depth-only 0'), ['content']);
  assert.deepEqual(names('depth-only 1'), ['child']);
  assert.deepEqual(names('depth-only 2'), ['grandchild']);
});

test('inspection retains the evaluated selection index and depth, including manual depth', () => {
  const root = node('root', [node('card_1', [node('title')]), node('card_2')]);
  const transitions = run('  find card_*\n  depth 1\n  anim opacity from 0 delay index*.1', root).inspect().transitions;
  assert.deepEqual(transitions.map(job => [job.object.name, job.index, job.depth]), [['card_1', 0, 0], ['title', 1, 1], ['card_2', 2, 0]]);
  assert.equal(run('  find card_2 5\n  anim opacity from 0', root).inspect().transitions[0].depth, 5);
});

test('depth is rebuilt as a forest of selected elements after filtering and new selections', () => {
  const root = node('root', [node('branch', [node('middle', [node('leaf')])]), node('other', [node('leaf_2')])]);
  const depths = body => run(`${body}\n  anim opacity from 0 delay depth*.1`, root).inspect().transitions.map(job => [job.object.name, job.depth, job.start]);
  assert.deepEqual(depths('  find branch\n  depth 3\n  ignore middle'), [['branch', 0, 0], ['leaf', 1, .1]]);
  assert.deepEqual(depths('  find root\n  depth 3\n  filter leaf*'), [['leaf', 0, 0], ['leaf_2', 0, 0]]);
  assert.deepEqual(depths('  find branch\n  depth-only 2'), [['leaf', 0, 0]]);
  assert.deepEqual(depths('  find branch\n  depth 2\n  reverse'), [['leaf', 2, .2], ['middle', 1, .1], ['branch', 0, 0]]);
});

test('mouse bindings are captured at preparation and work in dependent arithmetic', () => {
  const target = node('target'), mouse = { x: 80, y: 120 };
  const library = load('let x = mouse.x\nlet offset = mouse.y/2\ntest\n  find target\n  anim pos.x to x time 1\n  anim pos.y to offset time 1');
  const animation = library.prepare('test', target, { bindings: { mouse } });
  mouse.x = 400;
  animation.seek(.5); near(target.pos.x, 40); near(target.pos.y, 30); animation.reset();
  assert.throws(() => library.prepare('test', target), /Line 1: Unavailable variable: mouse.x/);
});

test('console element bindings compose, filter, reject outside-root references and never execute JS', () => {
  const a = node('a'), b = node('b'), root = node('root', [a, b]);
  const library = load("let selected = $0\nlet cards = $$('.card')\ntest\n  find cards\n  ignore selected\n  anim opacity from 0");
  let query;
  const animation = library.prepare('test', root, { bindings: { selected: a, query: (selector, all) => { query = [selector, all]; return [a, b]; } } });
  assert.deepEqual(query, ['.card', true]);
  assert.deepEqual(animation.inspect().transitions.map(job => job.object), [b]);
  assert.throws(() => library.prepare('test', root, { bindings: { selected: node('outside') } }), /inside the animation root/);
  assert.throws(() => library.prepare('test', root), /did not resolve an element/);
  for (const expression of ["$('#a')", "document.querySelector('#a')", "document.querySelectorAll('#a')"]) {
    const program = load(`let target = ${expression}\ntest\n  find target\n  anim opacity from 0`);
    assert.equal(program.prepare('test', root, { bindings: { query: () => a } }).inspect().transitions[0].object, a);
  }
  assert.throws(() => parse('let target = document.querySelector.call(document,body)\ntest'), /Invalid expression/);
});

test('live mouse-dependent endpoints update without rebuilding timing or reselecting targets', () => {
  const head = node('head'), pupil = node('pupil'), root = node('root', [head, pupil]);
  const mouse = { x: 300, y: 200 }, center = { x: 300, y: 200 };
  let queries = 0;
  const library = load("let head = $('#head')\nlet x = max(-8,min(8,(mouse.x-head.x)/20))\nlet duration = .5\ntest\n  find pupil\n  anim pos.x from x to x time duration repeat -1");
  const animation = library.prepare('test', root, { bindings: { mouse, live: true, geometry: () => center, query: () => { queries++; return head; } } }).play();
  near(pupil.pos.x, 0);
  mouse.x = 380; animation.advance(.1); near(pupil.pos.x, 4);
  center.x = 340; animation.advance(.1); near(pupil.pos.x, 2);
  mouse.x = 1000; animation.advance(1); near(pupil.pos.x, 8);
  assert.equal(queries, 1); assert.equal(animation.duration, Infinity);
  assert.equal(animation.inspect().transitions[0].duration, .5);
  animation.pause(); mouse.x = 0; animation.advance(.1); near(pupil.pos.x, 8);
  animation.play(); near(pupil.pos.x, -8); animation.reset(); near(pupil.pos.x, 0);
});
