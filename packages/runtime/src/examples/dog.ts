const idle = `  find dog_head
  anim pos.y from -2 to 2 time 1.6 repeat -1 direction alternate easy.sin-in-out
  find dog_tail
  anim rot from -18 to 18 time .24 repeat -1 direction alternate easy.sin-in-out
`;
const variables = `let head = $('[data-anim-name=dog_head]')
let lookX = max(-8,min(8,(mouse.x-head.x)/20))
let lookY = max(-9,min(9,(mouse.y-head.y+12)/22))
`;
export const dogIdleSource = `namespace dog

idle
${idle}`;
export const dogSource = `namespace dog
${variables}
idle
${idle}
look
  find dog_pupil_*
  anim pos.x to lookX time .16 easy.quad-out
  anim pos.y to lookY time .16 easy.quad-out
  find dog_head
  anim rot to lookX/4 time .22 easy.quad-out
`;
export const dogBindingSource = `namespace dog
${variables}
follow
${idle}  find dog_head
  anim rot from lookX/4 to lookX/4 time 1 repeat -1
  find dog_pupil_*
  anim pos.x from lookX to lookX time 1 repeat -1
  anim pos.y from lookY to lookY time 1 repeat -1
`;
