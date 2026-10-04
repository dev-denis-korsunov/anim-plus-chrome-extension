export const languageHelp: Record<string, { description: string; example: string }> = {
  namespace: { description: 'Animation namespace for this file. Declare it first, without indentation.', example: 'namespace demo' },
  let: { description: 'A numeric expression or element binding. Declare it before animations. Mouse-dependent expressions update during playback; element bindings are captured when preparing.', example: "let target = $('.card') · let x = mouse.x-target.x" },
  'mouse.x': { description: 'Mouse X coordinate in the inspected document, in viewport pixels. Updates animation endpoints during playback.', example: 'let x = mouse.x' },
  'mouse.y': { description: 'Mouse Y coordinate in the inspected document, in viewport pixels. Updates animation endpoints during playback.', example: 'let y = mouse.y' },
  anim: { description: 'Animates a property of selected elements or calls another animation. An indented action waits for its parent to finish.', example: 'anim opacity from 0 time .4' },
  event: { description: 'Emits an event after its delay. Events are suppressed while seeking.', example: "event ready" },
  find: { description: 'Selects elements by name or an element-binding variable. An asterisk matches any part of a name.', example: "find card_* · find target" },
  depth: { description: 'Selects the current roots and descendants up to the given depth. Zero selects the current roots.', example: 'depth 2' },
  'depth-only': { description: 'Selects elements at exactly the given depth. Zero selects the current roots.', example: 'depth-only 1' },
  filter: { description: 'Keeps selected elements with a matching name or type.', example: 'filter type:label' },
  ignore: { description: 'Removes selected elements with a matching name or type.', example: "ignore bg*" },
  'of-type': { description: 'Selects elements of the given category.', example: 'of-type clickable' },
  index: { description: 'In expressions: the zero-based index in the selection. The index command selects direct children by index.', example: 'delay index*.04 · index 0,2' },
  path: { description: 'Selects an element by child indices relative to the root.', example: 'path 0/3/1' },
  parent: { description: 'Replaces selected elements with their direct parents within the root.', example: 'parent' },
  reverse: { description: 'Reverses the selection order.', example: 'reverse' },
  grid: { description: 'Calculates index from cell distances without changing the selection or its order.', example: 'grid center' },
  from: { description: 'Starting value. Defaults to self. A single signed number is an offset from the initial value.', example: 'from +40' },
  to: { description: 'Ending value. Defaults to self, the value before the animation starts.', example: 'to self+100' },
  time: { description: 'Duration of one cycle in seconds. Defaults to .25; must be nonnegative.', example: 'time .4' },
  delay: { description: 'Delay before the first cycle in seconds. Defaults to 0. The starting value is applied before the delay.', example: 'delay index*.04' },
  repeat: { description: 'Number of additional cycles. Zero plays once; -1 repeats until cancelled.', example: 'repeat 2' },
  direction: { description: 'Normal repeats from start to end. Alternate reverses each successive cycle for seamless back-and-forth motion.', example: 'repeat -1 direction alternate easy.sin-in-out' },
  self: { description: 'Initial property value captured before any changes.', example: 'from self-40' },
  sibling: { description: 'Zero-based index among the children of the same parent.', example: 'delay sibling*.04' },
  count: { description: 'Number of elements in the prepared selection.', example: 'time max(.1,1/count)' },
  min: { description: 'Returns the smallest numeric value.', example: 'time min(.5,duration)' },
  max: { description: 'Returns the largest numeric value.', example: 'time max(.1,duration)' },
  opacity: { description: 'Element opacity: 0 is invisible, 1 is fully visible.', example: 'anim opacity from 0 time .4' },
  scale: { description: 'Scale on both axes. A value of 1 preserves the original size.', example: 'anim scale from .8' },
  rot: { description: 'Rotation in degrees.', example: 'anim rot to +30' },
};
for (const axis of ['x', 'y', 'z']) languageHelp[`pos.${axis}`] = {
  description: `Offset along the ${axis.toUpperCase()} axis. DOM values are in pixels; positive Y points down.`, example: `anim pos.${axis} from +40`
};
for (const axis of ['x', 'y']) {
  languageHelp[`scale.${axis}`] = { description: `Scale along the ${axis.toUpperCase()} axis. A value of 1 preserves the original size.`, example: `anim scale.${axis} from .8` };
  languageHelp[`skew.${axis}`] = { description: `Skew along the ${axis.toUpperCase()} axis in degrees.`, example: `anim skew.${axis} to 10` };
}
export function helpFor(word: string) {
  if (word === 'depth') return { description: 'The depth command includes the current roots and descendants up to the given depth. In expressions, depth counts selected ancestors and is recalculated after each selection change. Collection roots have depth zero.', example: 'depth 2 · delay depth*.1' };
  if (word.startsWith('easy.')) return {
    description: word === 'easy.bezier' ? 'Cubic Bezier curve. X must be between 0 and 1; Y may exceed that range.' : 'Easing curve. -in accelerates, -out decelerates, and -in-out combines both.',
    example: word === 'easy.bezier' ? 'easy.bezier(.25,.1,.25,1)' : `anim opacity from 0 ${word}`
  };
  return languageHelp[word];
}
