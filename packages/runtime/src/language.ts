/** Draft 0.1 vocabulary shared by runtime validation and editor tooling. */
export const compositionCommands = new Set(['find', 'depth', 'depth-only', 'filter', 'ignore', 'of-type', 'index', 'path', 'parent', 'reverse', 'grid']);
export const properties = new Set(['pos.x', 'pos.y', 'pos.z', 'opacity', 'scale', 'scale.x', 'scale.y', 'rot', 'skew.x', 'skew.y']);
export const parameters = ['from', 'to', 'time', 'delay', 'repeat', 'direction'] as const;
export const metrics = ['index', 'depth', 'sibling', 'count', 'self'] as const;
export const categories = ['sprite', 'label', 'clickable', 'layout', 'container'] as const;
export const easingNames = ['easy.linear', ...['sin', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'elastic', 'back', 'bounce'].flatMap(family => ['in', 'out', 'in-out'].map(direction => `easy.${family}-${direction}`))];
