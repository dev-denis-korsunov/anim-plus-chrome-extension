import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'animplus';
import { exportCssAnimation } from '../packages/editor/dist/css-export.js';
const target = () => ({ name: 'ball', children: [], opacity: 1, pos: { x: 0, y: 4, z: 0 }, scale: { x: 1, y: 1 }, rot: 0, skew: { x: 0, y: 0 } });
const baseline = { opacity: 1, 'pos.x': 0, 'pos.y': 4, 'pos.z': 0, 'scale.x': 1, 'scale.y': 1, rot: 0, 'skew.x': 0, 'skew.y': 0 };
function generate(body, name = 'demo') {
  const object = target(), run = load(`demo\n  find ball\n${body}`).prepare('demo', object);
  return exportCssAnimation(run.inspect().transitions, run.duration, [{ object, selector: '#ball', name: 'ball', baseline, transform: 'matrix(1, 0, 0, 1, 10, 0)' }], name, run.inspect().events.length > 0);
}
test('CSS exports each channel with native timing and typed variables for simultaneous axes', () => {
  const css = generate('  anim pos.x to 100 time 1\n  anim scale.x to 2 delay .2 time .4 easy.bezier(.25,.1,.25,1)\n  event done');
  assert.equal((css.match(/@keyframes /g) ?? []).length, 2);
  assert.match(css, /anim-demo-1-pos-x-1 1s linear 0s 1 normal forwards/);
  assert.match(css, /anim-demo-1-scale-x-2 0.4s cubic-bezier\(.25,.1,.25,1\) 0.2s 1 normal both/);
  assert.match(css, /translate: var\(--anim-demo-1-pos-x\) 4px 0px;/);
  assert.match(css, /syntax: "<length>"/);
  assert.match(css, /Events require JavaScript/);
  assert.match(generate('  anim opacity from 0 to 1 time .5 repeat 1'), /0.5s linear 0s 2 normal forwards/);
  assert.match(generate('  anim pos.x from 0 to 10 time .5 repeat -1 direction alternate'), /0.5s linear 0s infinite alternate forwards/);
});
test('CSS keeps delayed Pipe activation separate from movement and preserves existing transforms', () => {
  const css = generate('  anim opacity from 0 time .5\n    anim pos.x from 30 to 60 delay .2 time .4\n  anim skew.x to 10 time 1');
  assert.match(css, /-hold 0.2s linear 0.5s 1 normal forwards/);
  assert.match(css, /pos-x-3 0.4s linear 0.7s 1 normal forwards/);
  assert.match(css, /transform: matrix\(1, 0, 0, 1, 10, 0\) skew\(var\(/);
  assert.match(generate('  anim pos.x to 100 time 1 easy.bounce-out'), /1s linear\(0,/);
});
test('CSS supports infinite loops, zero-duration tracks and later channel replacement', () => {
  assert.match(generate('  anim opacity from 0 time 1 repeat -1'), /1s linear 0s infinite normal forwards/);
  assert.match(generate('  anim opacity to .3 time 0', 'a.b'), /anim-a-b-1-opacity-1 0s linear/);
  assert.match(generate('  anim opacity to .3 time 0'), /to \{ --anim-demo-1-opacity: 0.3;/);
  const css = generate('  anim opacity from 0 time 3\n  anim rot to 20 time .2\n    anim opacity from .5 to 0 delay .3 time .4');
  assert.match(css, /opacity-1 0.2s linear 0s 1 normal forwards/);
  assert.match(css, /opacity-3-hold 0.3s linear 0.2s 1 normal forwards/);
});
