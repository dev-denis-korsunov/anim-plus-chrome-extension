import { dogBindingSource } from 'animplus/examples/dog';
export const presets: Record<string, string> = {
  Dog: dogBindingSource,
  Reveal: `namespace demo
let duration = .4
let stagger = .04

reveal
  find card_*
  grid center
  anim pos.y from +32 time duration delay index*stagger easy.back-out
  anim scale from .85 time duration delay index*stagger easy.back-out
  anim opacity from 0 time duration delay index*stagger
    event cards_visible
`,
  Bounce: `namespace demo

bounce
  find ball
  anim pos.x to +260 time 2.4 easy.linear
  anim scale.y to .8 time .08 easy.quad-out
  anim scale.x to 1.15 time .08 easy.quad-out
    anim scale.y from .8 to 1.1 time .1 easy.quad-out
    anim scale.x from 1.15 to .95 time .1 easy.quad-out
      anim scale.y from 1.1 to 1 time .15
      anim scale.x from .95 to 1 time .15
    anim pos.y to -160 time .4 easy.quad-out
      anim pos.y from -160 time .4 easy.quad-in
        anim scale.y to .7 time .07 easy.quad-out
        anim scale.x to 1.3 time .07 easy.quad-out
          anim scale.y from .7 to 1 time .09
          anim scale.x from 1.3 to 1 time .09
          anim pos.y to -80 time .3 easy.quad-out
            anim pos.y from -80 time .3 easy.quad-in
              anim scale.y to .8 time .06 easy.quad-out
              anim scale.x to 1.2 time .06 easy.quad-out
                anim scale.y from .8 to 1 time .08
                anim scale.x from 1.2 to 1 time .08
                anim pos.y to -36 time .22 easy.quad-out
                  anim pos.y from -36 time .22 easy.quad-in
                    anim scale.y to .9 time .05 easy.quad-out
                    anim scale.x to 1.1 time .05 easy.quad-out
                      anim scale.y from .9 to 1 time .06
                      anim scale.x from 1.1 to 1 time .06
                      anim pos.y to -14 time .15 easy.quad-out
                        anim pos.y from -14 time .15 easy.quad-in
                          event bounce_finished
`,
  Sequence: `namespace demo
let duration = .45
let stagger = .045

sequence
  find title_letter_*
  anim pos.y from +80 time duration delay index*stagger easy.quad-out
    event title_arrived
`,
  Pipe: `namespace demo
let duration = .45
let stagger = .045

sequence
  find title_letter_*
  anim pos.y from +80 time duration delay index*stagger easy.quad-out
    event title_arrived

  find card_*
  anim opacity from 0 time .3 delay index*.05
`
};
