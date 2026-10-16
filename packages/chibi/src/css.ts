// CSS của engine: nền, reduced-motion (pose tĩnh), chuyển động theo token. Class / keyframes / biến CSS đều có tiền tố chb- (nsCss).
// Chỉ animate transform + opacity (+ stroke-dashoffset cho nét chữ ký tay, + biến góc tay). Mọi animation nằm trong
// @media (prefers-reduced-motion: no-preference) ⇒ reduce = 0 animation bằng cấu trúc, không cần kiểm lại từng luật.
import { armKeyframes, expandArm, STOW } from './arm-anim.ts';
import { f } from './color.ts';
import { EMOTES } from './emotes.ts';
import { EYE_LAYERS, MOUTH_LAYERS } from './states.ts';
import { K_VALUES } from './strict.ts';

export const CSS_BASE = `
.chb{ display:block; overflow:visible }
.ink{ stroke-width:var(--sw,3.4) }
.chb[data-sz="s"] .dt{ display:none }
.chb[data-sz="s"] .fth{ stroke-width:calc(var(--sw) * .3) } .chb[data-sz="m"] .fth{ stroke-width:calc(var(--sw) * .6) }
.chb{ --raL:0deg; --raR:0deg; --hR:0deg; --kL:1; --kR:1 }
.arm-L{ rotate:var(--raL); scale:var(--kL) } .arm-R{ rotate:var(--raR); scale:var(--kR) }
.held{ rotate:calc(-1 * var(--raR)) } .held-h{ rotate:var(--hR) } .hx{ rotate:calc(-1 * var(--raR)) }
.chb[data-s="idle"][data-v="drunk"] .held,.chb[data-s="idle"][data-v="game"] .held{ display:none }
.brush{ display:none; rotate:calc(var(--raR) * -1) }
.chb[data-s="rest"] .brush{ display:inline } .chb[data-s="rest"] .held{ opacity:0 }
.bd{ transform-origin:100px 236px } .hd{ transform-origin:100px 108px } .capg{ transform-origin:100px 44px }
.fan,.sword,.fan-arm,.sword-arm,.beard-arm,.prop{ transform-origin:0 0 }
.cape{ transform-origin:100px 112px } .beard-sway,.beard-tangle{ transform-origin:100px 104px } .rib{ transform-origin:0 0 } .arm-L .ribw{ rotate:calc(-1 * var(--raL)) } .arm-R .ribw{ rotate:calc(-1 * var(--raR)) }
.tail{ transform-origin:50px 46px } .tailR{ transform-origin:150px 46px } .flag{ transform-origin:178px 14px }
.shadow{ transform-origin:100px 237px; fill:color-mix(in srgb, var(--rc,#000) 55%, #000) }
.hbg{ stroke:var(--rc,#2A1B22) } .baby{ transform-origin:100px 150px }
.ey,.mo,.fx{ opacity:0; transition:opacity .06s }
.rest-only{ display:none } .chb[data-s="rest"] .rest-only{ display:inline }
.chb[data-face~="white"] .fw,.chb[data-face~="white"] .gloom{ opacity:1 }
.chb[data-face~="crack"] .crack{ opacity:1 }
.chb[data-face~="red"] .fr{ opacity:.62 }
.chb[data-face~="blush"] .bl{ opacity:1 }
.chb[data-face~="puff"] .puff{ opacity:1 }
.chb[data-face~="tangle"] .beard-tangle{ opacity:1 } .chb[data-face~="tangle"] .beard-sway{ opacity:0 }
.brow .pose{ transform-box:fill-box; transform-origin:50% 50%; transition:transform .12s }
.chb[data-brow="up"] .brow .pose{ transform:translateY(-8px) }
.chb[data-brow="sad"] .brow .pose{ transform:rotate(-22deg) translateY(1px) }
.chb[data-brow="angry"] .brow .pose{ transform:rotate(20deg) translateY(2px) }
.chb[data-brow="knit"] .brow .pose{ transform:rotate(12deg) translateY(2px) }
.rolled{ opacity:0 } .chb[data-s="run"] .rolled,.chb[data-s="commit"] .rolled{ opacity:1 }
.e-n{ transform-origin:100px 72px; animation:k-blink var(--blink,4s) infinite; animation-delay:var(--bdelay,0s) }
@keyframes k-blink{ 0%,91%,100%{ transform:scaleY(1) } 94.5%{ transform:scaleY(.07) } }
.breath{ transform-origin:100px 238px; animation:k-breathe var(--breath,3.4s) ease-in-out infinite; animation-delay:var(--phase,0s) }
@keyframes k-breathe{ 0%,100%{ transform:scale(1.004,.98) } 50%{ transform:scale(.996,1.02) } }
.spin,.glint{ transform-box:fill-box; transform-origin:50% 50% }
.em{ display:none } .em .in,.em .bb{ transform-box:fill-box; transform-origin:50% 50% }
.snot,.crown{ display:none }
.chb[data-s="rank1"] .crown{ display:inline }
.tw,.zz,.pf,.cf,.fd,.pd,.ln,.dp,.sw{ transform-box:fill-box; transform-origin:50% 50% }
.clk{ pointer-events:none }
.hero{ pointer-events:none }
.chb[data-sz="b"] .hero{ display:none } .chb[data-lod] .hero{ display:inline } .chb[data-lod] .emo,.chb[data-lod] .emb{ display:none }
.chb[data-vis="0"] *{ animation-play-state:paused !important }
`;

/** pose tĩnh của từng trạng thái (dùng chung cho prefers-reduced-motion và ui.avatar_motion = off / subtle) */
const REDUCE_POSES = `
  .chb[data-s="reward"]{ --raL:var(--chestL); --raR:var(--chestR); --hR:${STOW} }
  .chb[data-s="reward"] .bd{ transform:translateY(-12px) scale(.96,1.08) }
  .chb[data-s="penalty"]{ --raL:calc(var(--outL) * 1.6); --raR:var(--limpR) }
  .chb[data-s="penalty"] .bd{ transform:translateY(7px) scale(1.12,.86) } .chb[data-s="penalty"] .hd{ transform:rotate(-10deg) scale(1.04,1.08) }
  .chb[data-s="rank1"]{ --raL:var(--coverL); --raR:calc(var(--outR) * .55) }
  .chb[data-s="rank1"] .bd{ transform:scale(1.03,1.02) } .chb[data-s="rank1"] .hd{ transform:rotate(-9deg) translate(-4px,-3px) }
  .chb[data-s="quota"] .bd{ transform:scale(1.22,.6) } .chb[data-s="quota"] .hd{ transform:scale(.93,1.36) rotate(6deg) }
  .chb[data-s="quota"]{ --raL:var(--limpL); --raR:calc(var(--outR) * 1.6) }
  .chb[data-s="error"]{ --raL:calc(var(--outL) * .8); --raR:calc(var(--outR) * .8) }
  .chb[data-s="error"] .bd{ transform:rotate(-3deg) scale(1.04,.97) } .chb[data-s="error"] .hd{ transform:rotate(4deg) scale(1.07,1.05) }
  .chb[data-s="rest"] .bd{ transform:scale(1.1,.8) } .chb[data-s="rest"] .hd{ transform:rotate(11deg) translateY(3px) }
  .chb[data-s="rest"]{ --raR:var(--writeR) }
  .chb[data-s="sleep"] .hd{ transform:rotate(12deg) translateY(3px) }
  .chb[data-s="sleep"]{ --raL:var(--limpL); --raR:var(--limpR) }
  .chb[data-s="wait"]{ --raL:var(--prayL); --raR:var(--prayR); --hR:${STOW} }
  .chb[data-s="wait"] .bd{ transform:translateY(11px) scale(1.09,.83) } .chb[data-s="wait"] .hd{ transform:rotate(-12deg) }
  .chb[data-s="run"] .bd{ transform:rotate(8deg) }
  .chb[data-s="failover"] .bd{ transform:translate(30px,-6px) rotate(9deg) scale(.97) } .chb[data-s="failover"]{ --raL:calc(var(--outL) * 1.4); --raR:calc(var(--outR) * 1.4) }
  .chb[data-m~="flipFall"] .bd{ transform-origin:100px 125px; transform:rotate(-176deg) translateY(-6px) }
  .chb[data-m~="swoon"] .bd{ transform:rotate(-12deg) } .chb[data-m~="swoon"]{ --raR:var(--foreheadR) }
  .chb[data-m~="helmDrop"] .capg{ transform:translateY(24px) rotate(2deg) }
  .chb[data-m~="cranePose"] .shoeR{ transform:translateY(-22px) } .chb[data-m~="cranePose"]{ --raL:calc(var(--outL) * 2); --raR:calc(var(--outR) * 2) }
  .chb[data-m~="takePulse"]{ --raL:var(--reachL) }
  .chb[data-s="commit"]{ --raR:var(--cheerR); --raL:var(--chestL) } .chb[data-s="commit"] .bd{ transform:translateY(-4px) scale(1,1.04) }
  .chb[data-s="think"]{ --hR:${STOW}; --raR:var(--chinR); --raL:calc(var(--limpL) + 14deg); --kL:.78 } .chb[data-s="think"] .hd{ transform:rotate(6deg) translateY(3px) } .chb[data-s="think"] .bd{ transform:rotate(2deg) scale(1.02,.97) }
  .chb[data-s="unsure"]{ --raR:var(--scratchR); --raL:calc(var(--chestL) * .8) } .chb[data-s="unsure"] .hd{ transform:rotate(-7deg) }
  .chb[data-s="discover"]{ --raL:var(--pointL); --raR:var(--aimR); --kL:1.2 } .chb[data-s="discover"] .bd{ transform:translateY(-8px) rotate(-9deg) scale(1.04,1.02) } .chb[data-s="discover"] .hd{ transform:rotate(-12deg) scale(1.03,1.06) }
  .chb[data-s="idle"][data-v="nap"] .hd{ transform:rotate(16deg) translateY(4px) } .chb[data-s="idle"][data-v="nap"] .bd{ transform:translateY(6px) scale(1.05,.93) } .chb[data-s="idle"][data-v="nap"]{ --raL:var(--limpL); --raR:var(--limpR) }
  .chb[data-s="idle"][data-v="drunk"] .bd{ transform:rotate(7deg) translateX(8px) } .chb[data-s="idle"][data-v="drunk"] .hd{ transform:rotate(-9deg) } .chb[data-s="idle"][data-v="drunk"]{ --raR:var(--eatR); --kR:var(--eatK) }
  .chb[data-s="idle"][data-v="game"]{ --raL:var(--gripL); --raR:var(--gripR); --kL:var(--gripKL); --kR:var(--gripKR) } .chb[data-s="idle"][data-v="game"] .hd{ transform:rotate(9deg) translateY(3px) } .chb[data-s="idle"][data-v="game"] .bd{ transform:translateY(4px) scale(1.05,.94) }
  .chb[data-m~="pointScold"]{ --raL:var(--pointL) } .chb[data-m~="helmSlip"] .capg{ transform:translate(18px,5px) rotate(11deg) } .chb[data-m~="helmSlip"]{ --raR:var(--foreheadR) }
`;

export const CSS_REDUCE = `
@media (prefers-reduced-motion: reduce){
  .chb *,.chb *::before{ animation:none !important; transition:none !important }
  .emo,.snot,.jet{ display:none !important }
  .chb[data-sz="b"] .hero{ display:inline }
${REDUCE_POSES}}
`;

/** ui.avatar_motion: off = tĩnh hoàn toàn; subtle = chỉ thở + chớp mắt (cả hai: pose tĩnh của trạng thái + một huy hiệu thay emote) */
export const CSS_STATIC = `${REDUCE_POSES.replace(/\.chb\[/g, '.chb[data-mo][')}
.chb[data-mo="o"] *,.chb[data-mo="o"] *::before{ animation:none !important; transition:none !important }
.chb[data-mo="s"] *:not(.breath):not(.e-n){ animation:none !important; transition:none !important }
.chb[data-mo] .emo,.chb[data-mo] .snot,.chb[data-mo] .jet{ display:none !important }
.chb[data-mo][data-sz="b"] .hero{ display:inline }
`;

export const CSS_MOTION = `
@media (prefers-reduced-motion: no-preference){
.clk{ animation:k-clk var(--T,5s) linear infinite }
@keyframes k-clk{ from{ opacity:0 } to{ opacity:.001 } }

/* --- emote: pop / vòng lặp --- */
@keyframes k-pop{ 0%{ transform:scale(0) rotate(-24deg) } 55%{ transform:scale(1.4) rotate(9deg) } 80%{ transform:scale(.92) rotate(-3deg) } 100%{ transform:scale(1) rotate(0) } }
@keyframes k-bob{ 0%,100%{ transform:translateY(0) rotate(-4deg) } 50%{ transform:translateY(-5px) rotate(5deg) } }
@keyframes k-rise{ 0%{ transform:translateY(8px) scale(.3) } 18%{ transform:translateY(-4px) scale(1.3) } 30%{ transform:translateY(-8px) scale(1) } 80%{ opacity:1 } 100%{ transform:translateY(-34px) scale(1); opacity:0 } }
@keyframes k-fall{ 0%{ transform:translateY(-84px) rotate(-12deg); opacity:1 } 38%{ transform:translateY(0) rotate(4deg) } 48%{ transform:translateY(-14px) rotate(-3deg) } 58%,100%{ transform:translateY(0) rotate(0) } }
@keyframes k-tw{ 0%,100%{ transform:scale(0) rotate(0) } 50%{ transform:scale(1) rotate(90deg) } }
@keyframes k-puff{ 0%{ transform:translate(0,4px) scale(.5); opacity:0 } 20%{ opacity:.95 } 100%{ transform:translate(var(--px,0px),-38px) scale(1.35); opacity:0 } }
@keyframes k-zrise{ 0%{ transform:translate(0,6px) scale(.4); opacity:0 } 18%{ opacity:1 } 100%{ transform:translate(30px,-36px) scale(1.15); opacity:0 } }
@keyframes k-streak{ 0%{ transform:translateX(26px); opacity:0 } 25%{ opacity:1 } 100%{ transform:translateX(-30px); opacity:0 } }
@keyframes k-cf{ 0%{ transform:translate(0,-26px) rotate(0) } 100%{ transform:translate(var(--sx),264px) rotate(var(--r)) } }
@keyframes k-flyd{ 0%{ transform:translate(0,0) scale(.6); opacity:0 } 15%{ opacity:1; transform:scale(1) } 100%{ transform:translate(var(--dx),calc(var(--dy) + 34px)); opacity:0 } }
@keyframes k-pour{ 0%{ transform:translateY(-6px) scale(.5); opacity:0 } 15%{ opacity:1; transform:translateY(0) scale(1) } 100%{ transform:translateY(46px) scale(1.1); opacity:0 } }
@keyframes k-vpulse{ 0%,100%{ transform:scale(1) } 50%{ transform:scale(1.25) } }
@keyframes k-snotb{ 0%{ transform:scale(.12) } 50%{ transform:scale(1.1) } 100%{ transform:scale(.12) } }
@keyframes k-dash{ to{ stroke-dashoffset:-32 } }
@keyframes k-drip{ 0%{ transform:translateY(-4px); opacity:0 } 20%{ opacity:1 } 100%{ transform:translateY(22px); opacity:0 } }
@keyframes k-spinz{ to{ transform:rotate(360deg) } }
@keyframes k-glint{ 0%,100%{ transform:scale(1) } 50%{ transform:scale(1.14) } }
@keyframes k-dust{ 0%{ transform:translate(0,0) scale(.4); opacity:0 } 25%{ opacity:.9 } 100%{ transform:translate(var(--px,-10px),-8px) scale(1.2); opacity:0 } }
@keyframes k-ox{ from{ transform:translateX(-62px) } to{ transform:translateX(62px) } }
@keyframes k-oy{ from{ transform:translateY(-14px) } to{ transform:translateY(14px) } }
@keyframes k-sc1{ 0%{ stroke-dashoffset:60 } 22%,92%{ stroke-dashoffset:0 } 100%{ stroke-dashoffset:60 } }
@keyframes k-sc2{ 0%,18%{ stroke-dashoffset:60 } 42%,92%{ stroke-dashoffset:0 } 100%{ stroke-dashoffset:60 } }
@keyframes k-sc3{ 0%,38%{ stroke-dashoffset:60 } 62%,92%{ stroke-dashoffset:0 } 100%{ stroke-dashoffset:60 } }
@keyframes k-cliA{ 0%{ transform:scale(0) } 25%{ transform:scale(1.7) rotate(-6deg) } 40%,70%{ transform:scale(1.5) rotate(0) } 100%{ transform:scale(.2); opacity:0 } }
@keyframes k-cliB{ 0%{ transform:translate(-44px,16px) scale(1.7) } 100%{ transform:translate(0,0) scale(1) } }
@keyframes k-flash{ 0%{ opacity:.95 } 100%{ opacity:0 } }
@keyframes k-shout{ 0%{ transform:scale(.6); opacity:0 } 30%{ opacity:1 } 100%{ transform:scale(1.25); opacity:0 } }
@keyframes k-heart{ 0%,100%{ transform:scale(1) } 18%{ transform:scale(1.28) } 36%{ transform:scale(.95) } 54%{ transform:scale(1.18) } }
@keyframes k-wob{ from{ transform:rotate(-2.5deg) } to{ transform:rotate(2.5deg) } }
@keyframes k-flagw{ from{ transform:skewY(-8deg) scaleX(.95) } to{ transform:skewY(8deg) scaleX(1.05) } }

.em-ques .in,.em-ques2 .in,.em-excl .in,.em-bulb .in,.em-hash1 .in,.em-vein .in,.em-cliA .in,.em-kha .in,.em-sweat .in,.em-thunder .in,.em-gall .in,.em-tiger .in,.em-crane .in,.em-shout .in,.em-pulse .in,.em-patient .in{ animation:k-pop .55s cubic-bezier(.3,1.7,.5,1) both }
.em-ques .bb,.em-ques2 .bb,.em-excl .bb,.em-kha .bb,.em-tiger .bb,.em-crane .bb,.em-patient .bb{ animation:k-bob 1.1s ease-in-out .55s infinite }
.em-vein .bb{ animation:k-vpulse .5s ease-in-out .5s infinite }
.em-bulb .bb,.em-gall .bb{ animation:k-glint .7s ease-in-out .5s infinite }
.em-pulse .bb{ animation:k-heart .62s ease-in-out .5s infinite }
.em-pulse .ecg{ stroke-dasharray:14 12; animation:k-dash .5s linear infinite }
.em-sweat .bb{ animation:k-drip 1.4s ease-in .6s infinite }
.em-plus .in{ animation:k-rise 1.8s ease-out both }
.em-minus .in{ animation:k-fall .9s cubic-bezier(.4,0,1,.7) both }
.em-flash .in{ animation:k-flash .5s ease-out both }
.em-cliB .in{ animation:k-cliB .45s cubic-bezier(.3,1.5,.5,1) both }
.em-cliA .bb{ animation:k-cliA 1.6s ease-in-out .1s both }
.em-sparkR .tw,.em-sparkB .tw,.em-sparkS .tw{ animation:k-tw 1s ease-in-out infinite; animation-delay:calc(var(--i) * -.27s) }
.em-fly .fd{ animation:k-flyd .8s ease-out infinite; animation-delay:var(--dl) }
.em-pour .pd{ animation:k-pour .95s ease-in infinite; animation-delay:var(--dl) }
.em-speed .ln{ animation:k-streak .5s linear infinite; animation-delay:calc(var(--i) * -.13s) }
.em-speed .dp{ animation:k-dust .6s ease-out infinite; animation-delay:calc(var(--i) * -.3s) }
.em-steam .pf,.em-steamEar .pf{ animation:k-puff 2s ease-out infinite; animation-delay:calc(var(--i) * -.66s) }
.em-steamEar .pf{ animation-duration:1.2s; animation-delay:calc(var(--i) * -.4s) }
.em-zzz .zz{ animation:k-zrise 2.4s ease-out infinite; animation-delay:calc(var(--i) * -.8s) }
.em-confetti .cf,.em-petals .cf{ animation:k-cf var(--du) linear infinite; animation-delay:var(--dl) }
.em-stars .ox{ animation:k-ox .8s ease-in-out infinite alternate; animation-delay:calc(var(--i) * -.53s) }
.em-stars .oy{ animation:k-oy .8s ease-in-out infinite alternate; animation-delay:calc(var(--i) * -.53s - .4s) }
.em-shout .sw{ animation:k-shout .5s ease-out infinite; animation-delay:calc(var(--i) * .1s) }
.em-scroll .s1{ stroke-dasharray:60; animation:k-sc1 5s linear infinite } .em-scroll .s2{ stroke-dasharray:60; animation:k-sc2 5s linear infinite }
.em-scroll .s3{ stroke-dasharray:60; animation:k-sc3 5s linear infinite }
/* --- 5 kiểu mặt: emote / miệng động --- */
.em-resolve .in,.em-bang3 .in,.em-dots .in,.em-scope .in,.em-hic .in,.em-sweatL .in,.em-qwob .in,.em-band .in{ animation:k-pop .55s cubic-bezier(.3,1.7,.5,1) both }
.em-resolve .bb{ animation:k-bob .5s ease-in-out .55s infinite } .em-bang3 .bb{ animation:k-wob .09s ease-in-out infinite alternate } .em-dots .bb{ animation:k-bob 2s ease-in-out .55s infinite }
.em-band .bt{ transform-box:fill-box; transform-origin:0 0; animation:k-flagw .3s ease-in-out infinite alternate }
.em-glasses .gls{ animation:k-slide 2.4s ease-in-out infinite alternate }
@keyframes k-slide{ from{ transform:translateY(-1px) rotate(-1deg) } to{ transform:translateY(3px) rotate(2deg) } }
.em-dots .dd{ animation:k-dd 1.8s linear infinite; animation-delay:calc(var(--i) * .35s) }
@keyframes k-dd{ 0%,18%{ opacity:0 } 30%,85%{ opacity:1 } 100%{ opacity:0 } }
.em-scope .bb{ animation:k-scope .8s ease-in-out .55s infinite alternate } .em-scope .tw{ animation:k-tw .9s ease-in-out infinite }
@keyframes k-scope{ from{ transform:translateY(0) rotate(-3deg) } to{ transform:translateY(-4px) rotate(3deg) } }
.hx .gd{ transform-box:fill-box; transform-origin:50% 90%; animation:k-gtilt var(--T) ease-in-out infinite }
@keyframes k-gtilt{ 0%,10%{ transform:rotate(0) } 28%,56%{ transform:rotate(-72deg) translate(-4px,-4px) } 74%,100%{ transform:rotate(0) } }
.em-hic .bb{ animation:k-hic .6s ease-in-out infinite } @keyframes k-hic{ 0%,100%{ transform:translateY(0) scale(1) } 50%{ transform:translateY(-6px) scale(1.15) } }
.gpad .padb{ transform-box:fill-box; transform-origin:50% 50%; animation:k-wob .14s ease-in-out infinite alternate }
.gpad .blp{ animation:k-blip .6s ease-out infinite; animation-delay:calc(var(--i) * -.2s) } @keyframes k-blip{ 0%{ transform:translateY(6px); opacity:0 } 30%{ opacity:1 } 100%{ transform:translateY(-12px); opacity:0 } }
.gpad .scr{ animation:k-scr .4s steps(2) infinite } @keyframes k-scr{ from{ transform:translateX(0) } to{ transform:translateX(6px) } }
.em-sweatL .bb{ animation:k-drip 1.6s ease-in .6s infinite } .em-qwob .bb{ animation:k-qwob .24s ease-in-out infinite alternate } @keyframes k-qwob{ from{ transform:rotate(-14deg) } to{ transform:rotate(14deg) } }
.em-blur .bl2{ animation:k-flick .12s steps(2) infinite; animation-delay:calc(var(--i) * -.04s) } @keyframes k-flick{ from{ opacity:1 } to{ opacity:.25 } }
.em-rays .in{ animation:k-raypop .4s ease-out both } .em-rays .rr{ transform-box:fill-box; transform-origin:50% 50%; animation:k-spinz 14s linear infinite }
@keyframes k-raypop{ from{ transform:scale(.2); opacity:0 } to{ transform:scale(1); opacity:1 } }
.e-spring .spg{ transform-box:fill-box; transform-origin:50% 100%; animation:k-spg .26s ease-in-out infinite alternate }
@keyframes k-spg{ from{ transform:translate(calc(var(--s) * -2px),2px) scale(1,.94) } to{ transform:translate(calc(var(--s) * 5px),-6px) scale(1.06,1.08) } }
.e-fire .flm{ transform-box:fill-box; transform-origin:50% 100%; animation:k-flame .18s ease-in-out infinite alternate; animation-delay:calc(var(--i) * -.07s) }
@keyframes k-flame{ from{ transform:scale(1,.82) } to{ transform:scale(1.12,1.18) rotate(3deg) } }
/* --- động mượt: phần phụ (tua, râu, tay áo, áo choàng, dải khăn) trễ pha 60-120 ms so với thân; nhịp + biên độ theo trạng thái --- */
.tail,.tsl,.cape,.beard-sway,.rib{ animation:k-lag var(--lagT,2.8s) ease-in-out infinite alternate; animation-delay:var(--lagD,.09s) }
@keyframes k-lag{ from{ transform:rotate(calc(var(--lagA,1.6deg) * -1)) } to{ transform:rotate(var(--lagA,1.6deg)) } }
.tsl{ transform-box:fill-box; transform-origin:50% 0% } .tail{ --lagD:.12s } .cape{ --lagD:.1s } .rib{ --lagD:.06s }
.chb[data-s="run"]{ --lagT:.4s; --lagA:14deg } .chb[data-s="wait"]{ --lagT:.34s; --lagA:8deg } .chb[data-s="reward"]{ --lagT:.72s; --lagA:10deg } .chb[data-s="penalty"]{ --lagT:.18s; --lagA:7deg }
.chb[data-s="rank1"]{ --lagT:.15s; --lagA:4deg } .chb[data-s="quota"]{ --lagT:1.2s; --lagA:5deg } .chb[data-s="failover"]{ --lagT:.9s; --lagA:13deg } .chb[data-s="error"]{ --lagT:.2s; --lagA:8deg }
.chb[data-s="rest"],.chb[data-s="sleep"]{ --lagT:3.4s; --lagA:1deg } .chb[data-s="commit"]{ --lagT:.6s; --lagA:7deg } .chb[data-s="think"]{ --lagT:3.2s; --lagA:2.5deg } .chb[data-s="unsure"]{ --lagT:1.8s; --lagA:3deg }
.chb[data-s="idle"]{ --lagT:2.2s; --lagA:4deg } .chb[data-s="discover"]{ --lagT:.5s; --lagA:11deg }
.em-gold .in,.em-plead .in,.em-hehe .in,.em-bowl .in,.em-bag .in{ animation:k-pop .55s cubic-bezier(.3,1.7,.5,1) both }
.em-gold .bb,.em-bag .bb{ animation:k-bob .46s ease-in-out .55s infinite } .em-bowl .bb,.em-plead .bb{ animation:k-bob 1s ease-in-out .55s infinite }
.em-hehe .bb{ animation:k-wob .1s ease-in-out infinite alternate }
.em-gold .gb{ transform-box:fill-box; transform-origin:50% 50%; animation:k-coinhop .5s ease-in-out infinite; animation-delay:calc(var(--i) * -.17s) }
@keyframes k-coinhop{ 0%,100%{ transform:translateY(0) scaleX(1) } 50%{ transform:translateY(-9px) scaleX(.18) } }
.em-coinRain .cf{ animation:k-cf var(--du) linear infinite; animation-delay:var(--dl) }
.em-plead .tw{ animation:k-tw .9s ease-in-out infinite; animation-delay:calc(var(--i) * -.23s) }
.sn,.bs,.wl,.drl{ transform-box:fill-box }
.em-snotCry .sn{ transform-origin:50% 0%; animation:k-snotd .7s ease-in-out infinite alternate } .em-snotCry .sn2{ transform-origin:50% 50%; animation:k-snotb .6s ease-in-out infinite }
@keyframes k-snotd{ from{ transform:scaleY(.55) } to{ transform:scaleY(1.2) } }
.em-smoke .pf{ animation:k-puff .9s ease-out infinite; animation-delay:calc(var(--i) * -.22s) }
.em-bristle .bs{ transform-origin:50% 50%; animation:k-bristle .2s ease-in-out infinite alternate }
@keyframes k-bristle{ from{ transform:scale(.93) } to{ transform:scale(1.07) } }
.m-wail .wl{ transform-origin:50% 50%; animation:k-wail .16s ease-in-out infinite alternate }
@keyframes k-wail{ from{ transform:scale(1,.9) } to{ transform:scale(1.07,1.08) } }
.m-drool .drl{ transform-origin:50% 0%; animation:k-drool .9s ease-in-out infinite alternate }
@keyframes k-drool{ from{ transform:scaleY(.6) } to{ transform:scaleY(1.28) } }
.snot{ transform-box:fill-box; transform-origin:50% 100% }
.chb[data-em~="snot"] .snot{ display:inline; animation:k-snotb var(--T) ease-in-out infinite }
.e-spiral .spin{ animation:k-spinz .9s linear infinite }
.e-coin .glint{ animation:k-glint .5s ease-in-out infinite }
.jet .hl{ stroke-dasharray:5 11; animation:k-dash .45s linear infinite }
.jet .dr{ animation:k-drip .8s ease-in infinite }
.flag{ animation:k-flagw .5s ease-in-out infinite alternate }
.hero{ animation:k-pop .5s cubic-bezier(.3,1.7,.5,1) both; transform-box:fill-box; transform-origin:50% 50% }
.hero .bw{ transform-box:fill-box; transform-origin:50% 50%; animation:k-bob 1.8s ease-in-out .5s infinite }

/* --- NORMAL: idle nhẹ cho đạo cụ; trò riêng từng tướng nằm ở token (cuối file) --- */
.chb[data-s="normal"] .sword-arm{ animation:k-sw-idle 3.4s ease-in-out infinite } .chb[data-s="normal"] .fan-arm{ animation:k-sw-idle 3s ease-in-out infinite }
@keyframes k-sw-idle{ 0%,100%{ transform:rotate(-2deg) } 50%{ transform:rotate(3deg) } }

/* --- RUN --- */
.chb[data-s="run"] .bd{ animation:k-bd-run .4s ease-in-out infinite }
@keyframes k-bd-run{ 0%,100%{ transform:rotate(calc(var(--amp) * 8deg)) scale(1.05,.95) } 50%{ transform:rotate(calc(var(--amp) * 11deg)) translateY(calc(var(--amp) * -9px)) scale(.97,1.05) } }
@arm .chb[data-s="run"] | k-ar-run | .4s ease-in-out infinite
.chb[data-s="run"] .shoeL{ animation:k-shoe-run .4s ease-in-out infinite } .chb[data-s="run"] .shoeR{ animation:k-shoe-run .4s ease-in-out -.2s infinite }
@keyframes k-shoe-run{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(calc(var(--amp) * -10px)) } }
.chb[data-s="run"] .hd{ animation:k-hd-run .4s ease-in-out infinite }
@keyframes k-hd-run{ 0%,100%{ transform:rotate(calc(var(--amp) * -3deg)) } 50%{ transform:rotate(calc(var(--amp) * 3deg)) } }

/* =============== 5 KIỂU MẶT KHOA TRƯƠNG (chỉ đạo owner 2026-10-16): mặc định cho cả 10 tướng, gắn qua token mặc định của từng trạng thái =============== */
/* --- WAIT: van xin năn nỉ (quỳ khúm núm, chắp tay vái lia lịa, gật đầu, rồi nghiêng đầu mắt cún) --- */
.chb[data-m~="kneelBob"] .bd{ animation:k-bd-wait .34s ease-in-out infinite alternate }
@keyframes k-bd-wait{ from{ transform:translateY(calc(var(--amp) * 9px)) scale(1.08,.85) } to{ transform:translateY(calc(var(--amp) * 15px)) scale(1.1,.8) rotate(calc(var(--amp) * 2.5deg)) } }
.chb[data-m~="nodBeg"] .hd{ animation:k-hd-wait 2s ease-in-out infinite }
@keyframes k-hd-wait{ 0%,12%,24%,36%,92%,100%{ transform:none } 6%{ transform:translateY(calc(var(--amp) * 9px)) rotate(calc(var(--amp) * -4deg)) } 18%{ transform:translateY(calc(var(--amp) * 9px)) rotate(calc(var(--amp) * 4deg)) }
  30%{ transform:translateY(calc(var(--amp) * 9px)) rotate(calc(var(--amp) * -4deg)) } 44%,78%{ transform:rotate(calc(var(--amp) * -15deg)) translateY(calc(var(--amp) * 5px)) scale(1.04) } }
@arm .chb[data-m~="palmsPump"] | k-ar-wait | .2s ease-in-out infinite alternate

/* --- REWARD (+₲): mặt tham tiền (mắt đồng xu xoay, chảy dãi, xoa tay hau háu, ôm túi tiền, nhún nhảy) --- */
.chb[data-m~="hopGreed"] .bd{ animation:k-bd-reward .72s ease-in-out infinite }
@keyframes k-bd-reward{ 0%,100%{ transform:scale(1.12,.86) } 38%{ transform:translateY(calc(var(--amp) * -24px)) scale(.9,1.14) } 62%{ transform:translateY(calc(var(--amp) * -6px)) scale(1.02,.99) } 78%{ transform:scale(1.1,.88) } }
.chb[data-m~="hopGreed"] .shadow{ animation:k-sh-hop .72s ease-in-out infinite }
@keyframes k-sh-hop{ 0%,100%{ transform:scale(1.08) } 38%{ transform:scale(.68); opacity:.15 } 62%{ transform:scale(.95) } }
@arm .chb[data-m~="rubHands"] | k-ar-reward | .24s ease-in-out infinite alternate

/* --- PENALTY (−₲): khóc thê thảm (hai dòng nước mắt phun ngang, nước mũi, miệng vuông gào, đập tay xuống đất, rung bần bật) --- */
.chb[data-m~="quakeWail"] .bd{ animation:k-bd-penalty .09s ease-in-out infinite alternate }
@keyframes k-bd-penalty{ from{ transform:translate(calc(var(--amp) * -2.4px),calc(var(--amp) * 6px)) rotate(calc(var(--amp) * -1.8deg)) scale(1.1,.9) } to{ transform:translate(calc(var(--amp) * 2.4px),calc(var(--amp) * 9px)) rotate(calc(var(--amp) * 1.8deg)) scale(1.12,.86) } }
.chb[data-m~="headWail"] .hd{ animation:k-hd-penalty .7s ease-in-out infinite alternate }
@keyframes k-hd-penalty{ from{ transform:rotate(calc(var(--amp) * -13deg)) translateY(calc(var(--amp) * -3px)) scale(1.04,1.1) } to{ transform:rotate(calc(var(--amp) * 13deg)) translateY(calc(var(--amp) * 3px)) scale(1.05,.96) } }
@arm .chb[data-m~="poundGround"] | k-ar-penalty | .3s ease-in-out infinite alternate

/* --- RANK #1: cười đê tiện (mắt híp nửa vầng trăng, che miệng hehehe, rung vai, liếc ngang, hất cằm) --- */
.chb[data-m~="shoulderShake"] .bd{ animation:k-bd-rank1 .15s ease-in-out infinite alternate }
@keyframes k-bd-rank1{ from{ transform:translateY(calc(var(--amp) * -1px)) rotate(calc(var(--amp) * -1.2deg)) scale(1.03,.98) } to{ transform:translateY(calc(var(--amp) * -5px)) rotate(calc(var(--amp) * 1.2deg)) scale(.99,1.03) } }
.chb[data-m~="glanceSmug"] .hd{ animation:k-hd-rank1 var(--T) ease-in-out infinite }
@keyframes k-hd-rank1{ 0%,8%,92%,100%{ transform:none } 16%,34%{ transform:rotate(calc(var(--amp) * -9deg)) translate(calc(var(--amp) * -4px),calc(var(--amp) * -3px)) } 42%,56%{ transform:rotate(calc(var(--amp) * 9deg)) translate(calc(var(--amp) * 4px),calc(var(--amp) * -4px)) }
  64%,80%{ transform:rotate(calc(var(--amp) * -9deg)) translate(calc(var(--amp) * -4px),calc(var(--amp) * -3px)) } }
@arm .chb[data-m~="armsSmug"] | k-ar-rank1 | var(--T) ease-in-out infinite
.chb[data-s="rank1"] .crown{ animation:k-crown-drop var(--T) cubic-bezier(.5,0,1,.6) infinite; transform-box:fill-box; transform-origin:50% 100% }
@keyframes k-crown-drop{ 0%,7%{ transform:translateY(-92px) rotate(-14deg); opacity:0 } 8%{ transform:translateY(-92px) rotate(-14deg); opacity:1 } 24%{ transform:translateY(0) rotate(0) }
  27%{ transform:translateY(-13px) rotate(3deg) } 30%{ transform:translateY(0) rotate(0) } 32%{ transform:translateY(-4px) } 34%,94%{ transform:translateY(0) rotate(0); opacity:1 } 100%{ transform:translateY(-10px); opacity:0 } }

/* --- QUOTA hết: bò lết xin thêm lương thảo (dẹt sát đất, một tay với ôm chân, tay kia bưng bát rỗng, mắt cún con, nước mắt) --- */
.chb[data-m~="crawlWorm"] .bd{ animation:k-bd-quota var(--T) ease-in-out infinite }
@keyframes k-bd-quota{ 0%,100%{ transform:translateX(calc(var(--amp) * -16px)) rotate(calc(var(--amp) * -3deg)) scale(1.2,.62) } 10%{ transform:translateX(calc(var(--amp) * -16px)) scale(1.34,.54) } 20%{ transform:translateX(calc(var(--amp) * -4px)) scale(1.14,.68) }
  30%{ transform:translateX(calc(var(--amp) * -4px)) scale(1.32,.55) } 40%{ transform:translateX(calc(var(--amp) * 10px)) scale(1.14,.68) } 50%{ transform:translateX(calc(var(--amp) * 16px)) scale(1.2,.62) }
  60%{ transform:translateX(calc(var(--amp) * 16px)) scale(1.34,.54) } 70%{ transform:translateX(calc(var(--amp) * 4px)) scale(1.14,.68) } 80%{ transform:translateX(calc(var(--amp) * -6px)) scale(1.3,.56) } 90%{ transform:translateX(calc(var(--amp) * -16px)) scale(1.14,.68) } }
.chb[data-m~="lookUpBeg"] .hd{ animation:k-hd-quota 1.4s ease-in-out infinite alternate }
@keyframes k-hd-quota{ from{ transform:scale(.93,1.36) rotate(calc(var(--amp) * 10deg)) } to{ transform:scale(.93,1.36) rotate(calc(var(--amp) * -2deg)) } }
@arm .chb[data-m~="reachGrab"] | k-ar-quota | 1.2s ease-in-out infinite

/* --- FAILOVER: hoảng loạn chạy vòng tròn, quơ tay, chân chạy --- */
.chb[data-m~="circleRun"] .bd{ animation:k-bd-failover .9s linear infinite }
.chb[data-m~="circleRun"] .shadow{ animation:k-sh-circle .9s linear infinite }
@keyframes k-bd-failover{ 0%{ transform:translate(calc(var(--amp) * 0px),calc(var(--amp) * -0px)) rotate(calc(var(--amp) * 11deg)) scale(1) } 4.17%{ transform:translate(calc(var(--amp) * 10.35px),calc(var(--amp) * -4.81px)) rotate(calc(var(--amp) * 10.63deg)) scale(1) } 8.33%{ transform:translate(calc(var(--amp) * 20px),calc(var(--amp) * -1.21px)) rotate(calc(var(--amp) * 9.53deg)) scale(0.99) } 12.5%{ transform:translate(calc(var(--amp) * 28.28px),calc(var(--amp) * -7.14px)) rotate(calc(var(--amp) * 7.78deg)) scale(0.98) } 16.67%{ transform:translate(calc(var(--amp) * 34.64px),calc(var(--amp) * -4.5px)) rotate(calc(var(--amp) * 5.5deg)) scale(0.97) } 20.83%{ transform:translate(calc(var(--amp) * 38.64px),calc(var(--amp) * -11.17px)) rotate(calc(var(--amp) * 2.85deg)) scale(0.95) } 25%{ transform:translate(calc(var(--amp) * 40px),calc(var(--amp) * -9px)) rotate(calc(var(--amp) * 0deg)) scale(0.94) } 29.17%{ transform:translate(calc(var(--amp) * 38.64px),calc(var(--amp) * -15.83px)) rotate(calc(var(--amp) * -2.85deg)) scale(0.92) } 33.33%{ transform:translate(calc(var(--amp) * 34.64px),calc(var(--amp) * -13.5px)) rotate(calc(var(--amp) * -5.5deg)) scale(0.9) } 37.5%{ transform:translate(calc(var(--amp) * 28.28px),calc(var(--amp) * -19.86px)) rotate(calc(var(--amp) * -7.78deg)) scale(0.89) } 41.67%{ transform:translate(calc(var(--amp) * 20px),calc(var(--amp) * -16.79px)) rotate(calc(var(--amp) * -9.53deg)) scale(0.88) } 45.83%{ transform:translate(calc(var(--amp) * 10.35px),calc(var(--amp) * -22.19px)) rotate(calc(var(--amp) * -10.63deg)) scale(0.87) } 50%{ transform:translate(calc(var(--amp) * 0px),calc(var(--amp) * -18px)) rotate(calc(var(--amp) * -11deg)) scale(0.87) } 54.17%{ transform:translate(calc(var(--amp) * -10.35px),calc(var(--amp) * -22.19px)) rotate(calc(var(--amp) * -10.63deg)) scale(0.87) } 58.33%{ transform:translate(calc(var(--amp) * -20px),calc(var(--amp) * -16.79px)) rotate(calc(var(--amp) * -9.53deg)) scale(0.88) } 62.5%{ transform:translate(calc(var(--amp) * -28.28px),calc(var(--amp) * -19.86px)) rotate(calc(var(--amp) * -7.78deg)) scale(0.89) } 66.67%{ transform:translate(calc(var(--amp) * -34.64px),calc(var(--amp) * -13.5px)) rotate(calc(var(--amp) * -5.5deg)) scale(0.9) } 70.83%{ transform:translate(calc(var(--amp) * -38.64px),calc(var(--amp) * -15.83px)) rotate(calc(var(--amp) * -2.85deg)) scale(0.92) } 75%{ transform:translate(calc(var(--amp) * -40px),calc(var(--amp) * -9px)) rotate(calc(var(--amp) * -0deg)) scale(0.93) } 79.17%{ transform:translate(calc(var(--amp) * -38.64px),calc(var(--amp) * -11.17px)) rotate(calc(var(--amp) * 2.85deg)) scale(0.95) } 83.33%{ transform:translate(calc(var(--amp) * -34.64px),calc(var(--amp) * -4.5px)) rotate(calc(var(--amp) * 5.5deg)) scale(0.97) } 87.5%{ transform:translate(calc(var(--amp) * -28.28px),calc(var(--amp) * -7.14px)) rotate(calc(var(--amp) * 7.78deg)) scale(0.98) } 91.67%{ transform:translate(calc(var(--amp) * -20px),calc(var(--amp) * -1.21px)) rotate(calc(var(--amp) * 9.53deg)) scale(0.99) } 95.83%{ transform:translate(calc(var(--amp) * -10.35px),calc(var(--amp) * -4.81px)) rotate(calc(var(--amp) * 10.63deg)) scale(1) } 100%{ transform:translate(calc(var(--amp) * -0px),calc(var(--amp) * -0px)) rotate(calc(var(--amp) * 11deg)) scale(1) } }
@keyframes k-sh-circle{ 0%{ transform:translateX(calc(var(--amp) * 0px)) scale(1.02,1); opacity:0.3 } 4.17%{ transform:translateX(calc(var(--amp) * 10.35px)) scale(1.02,1); opacity:0.3 } 8.33%{ transform:translateX(calc(var(--amp) * 20px)) scale(1.01,1); opacity:0.29 } 12.5%{ transform:translateX(calc(var(--amp) * 28.28px)) scale(1,1); opacity:0.29 } 16.67%{ transform:translateX(calc(var(--amp) * 34.64px)) scale(0.99,1); opacity:0.28 } 20.83%{ transform:translateX(calc(var(--amp) * 38.64px)) scale(0.97,1); opacity:0.26 } 25%{ transform:translateX(calc(var(--amp) * 40px)) scale(0.95,1); opacity:0.25 } 29.17%{ transform:translateX(calc(var(--amp) * 38.64px)) scale(0.94,1); opacity:0.24 } 33.33%{ transform:translateX(calc(var(--amp) * 34.64px)) scale(0.92,1); opacity:0.22 } 37.5%{ transform:translateX(calc(var(--amp) * 28.28px)) scale(0.91,1); opacity:0.21 } 41.67%{ transform:translateX(calc(var(--amp) * 20px)) scale(0.9,1); opacity:0.21 } 45.83%{ transform:translateX(calc(var(--amp) * 10.35px)) scale(0.89,1); opacity:0.2 } 50%{ transform:translateX(calc(var(--amp) * 0px)) scale(0.89,1); opacity:0.2 } 54.17%{ transform:translateX(calc(var(--amp) * -10.35px)) scale(0.89,1); opacity:0.2 } 58.33%{ transform:translateX(calc(var(--amp) * -20px)) scale(0.9,1); opacity:0.21 } 62.5%{ transform:translateX(calc(var(--amp) * -28.28px)) scale(0.91,1); opacity:0.21 } 66.67%{ transform:translateX(calc(var(--amp) * -34.64px)) scale(0.92,1); opacity:0.22 } 70.83%{ transform:translateX(calc(var(--amp) * -38.64px)) scale(0.94,1); opacity:0.24 } 75%{ transform:translateX(calc(var(--amp) * -40px)) scale(0.95,1); opacity:0.25 } 79.17%{ transform:translateX(calc(var(--amp) * -38.64px)) scale(0.97,1); opacity:0.26 } 83.33%{ transform:translateX(calc(var(--amp) * -34.64px)) scale(0.99,1); opacity:0.28 } 87.5%{ transform:translateX(calc(var(--amp) * -28.28px)) scale(1,1); opacity:0.29 } 91.67%{ transform:translateX(calc(var(--amp) * -20px)) scale(1.01,1); opacity:0.29 } 95.83%{ transform:translateX(calc(var(--amp) * -10.35px)) scale(1.02,1); opacity:0.3 } 100%{ transform:translateX(calc(var(--amp) * -0px)) scale(1.02,1); opacity:0.3 } }
@arm .chb[data-m~="panicArms"] | k-ar-failover | .22s ease-in-out infinite alternate
.chb[data-m~="headPanic"] .hd{ animation:k-hd-failover .3s ease-in-out infinite alternate }
@keyframes k-hd-failover{ from{ transform:rotate(calc(var(--amp) * -8deg)) } to{ transform:rotate(calc(var(--amp) * 8deg)) translateY(calc(var(--amp) * -2px)) } }
.chb[data-m~="shoesRun"] .shoeL{ animation:k-shoe-run .3s ease-in-out infinite } .chb[data-m~="shoesRun"] .shoeR{ animation:k-shoe-run .3s ease-in-out -.15s infinite }

/* --- ERROR: nghiêm / tức giận khoa trương (mặt đỏ bừng phồng má, khói phụt đầu, dấu giận manga, dậm chân, nắm đấm run, râu tóc dựng) --- */
.chb[data-m~="furyHead"] .hd{ animation:k-hd-error .11s ease-in-out infinite alternate }
@keyframes k-hd-error{ from{ transform:rotate(calc(var(--amp) * -5deg)) scale(1.06,1.03) } to{ transform:rotate(calc(var(--amp) * 5deg)) scale(1.08,1.06) } }
@arm .chb[data-m~="fistsShake"] | k-ar-error | .14s ease-in-out infinite alternate
.chb[data-s="error"] .beard-tangle{ animation:k-wob .12s ease-in-out infinite alternate }
@arm .chb[data-m~="coverMouthF"] | k-cover-lf | var(--T) ease-in-out infinite

/* --- REST: buồn kiểu hài --- */
@arm .chb[data-s="rest"] | k-ar-rest | .5s ease-in-out infinite alternate
.chb[data-s="rest"] .bd{ animation:k-bd-rest var(--T) ease-in-out infinite }
.chb[data-s="rest"] .hd{ animation:k-hd-rest var(--T) cubic-bezier(.3,1.4,.5,1) infinite }

/* --- SLEEP --- */
.chb[data-s="sleep"] .bd{ animation:k-bd-sleep var(--T) ease-in-out infinite }
@keyframes k-bd-sleep{ 0%,100%{ transform:scale(1.005,.975) } 50%{ transform:scale(.995,1.025) } }
.chb[data-s="sleep"] .hd{ animation:k-hd-sleep var(--T) ease-in-out infinite }
@keyframes k-hd-sleep{ 0%{ transform:none } 50%{ transform:rotate(calc(var(--amp) * 13deg)) translateY(calc(var(--amp) * 3px)) } 60%{ transform:rotate(calc(var(--amp) * 15deg)) translateY(calc(var(--amp) * 4px)) }
  70%{ transform:rotate(calc(var(--amp) * 17deg)) translateY(calc(var(--amp) * 5px)) } 75%{ transform:rotate(calc(var(--amp) * -4deg)) translateY(calc(var(--amp) * -3px)) }
  84%{ transform:rotate(calc(var(--amp) * 3deg)) } 100%{ transform:none } }
@arm .chb[data-s="sleep"] | k-ar-sleep | var(--T) ease-in-out infinite

/* =============== TOKEN CHUYỂN ĐỘNG (đặt sau cùng để thắng mặc định theo trạng thái) =============== */
/* coverFaceR: tay phải đưa quạt che nửa mặt (Gia Cát) */
@arm .chb[data-m~="coverFaceR"] | k-cover-r | var(--T) ease-in-out infinite
.chb[data-m~="coverFaceR"] .prop{ animation:k-fan-cover var(--T) ease-in-out infinite }
@keyframes k-fan-cover{ 0%{ transform:rotate(-3deg) } 15%{ transform:rotate(4deg) } 30%{ transform:rotate(-3deg) } 45%{ transform:rotate(4deg) } 58%{ transform:rotate(-2deg) }
  66%{ transform:rotate(-12deg) } 69%{ transform:rotate(12deg) } 72%{ transform:rotate(-12deg) } 75%{ transform:rotate(12deg) } 78%{ transform:rotate(-12deg) }
  81%{ transform:rotate(12deg) } 84%{ transform:rotate(-12deg) } 87%{ transform:rotate(5deg) } 94%,100%{ transform:rotate(-3deg) } }
/* coverMouthL: tay áo trái che miệng cười */
@arm .chb[data-m~="coverMouthL"] | k-cover-l | var(--T) ease-in-out infinite
.chb[data-m~="chestPuff"] .bd{ animation:k-chestpuff var(--T) ease-in-out infinite }
@keyframes k-chestpuff{ 0%,34%{ transform:none } 41%{ transform:scale(1.045,1.08) } 46%,84%{ transform:scale(1.025,1.045) } 92%,100%{ transform:none } }
.chb[data-m~="beardStroke"] .beard-arm{ animation:k-stroke var(--T) ease-in-out infinite }
@keyframes k-stroke{ 0%,40%{ transform:none } 44%,60%,76%{ transform:translate(0,-3px) rotate(3deg) } 52%,68%,84%{ transform:translate(1px,13px) rotate(-6deg) } 92%,100%{ transform:none } }
.chb[data-m~="beardStroke"] .beard-sway{ animation:k-sway var(--T) ease-in-out infinite }
@keyframes k-sway{ 0%,40%{ transform:none } 52%,68%,84%{ transform:rotate(1.6deg) skewX(-1deg) } 44%,60%,76%{ transform:rotate(-1deg) } 92%,100%{ transform:none } }
@armnone .chb[data-m~="beardStrokeLoop"] | R
.chb[data-m~="beardStrokeLoop"] .beard-arm{ animation:k-stroke-loop 1.3s ease-in-out infinite }
.chb[data-m~="beardStrokeLoop"] .beard-sway{ animation:k-sway-loop 1.3s ease-in-out infinite }
@keyframes k-stroke-loop{ 0%,100%{ transform:translate(0,-3px) rotate(3deg) } 50%{ transform:translate(1px,13px) rotate(-6deg) } }
@keyframes k-sway-loop{ 0%,100%{ transform:rotate(-1deg) } 50%{ transform:rotate(1.6deg) skewX(-1deg) } }
.chb[data-m~="beardSway"] .beard-sway{ animation:k-sway2 .5s ease-in-out infinite }
@keyframes k-sway2{ 0%,100%{ transform:rotate(-2deg) } 50%{ transform:rotate(2.5deg) } }
.chb[data-m~="capeSwish"] .cape{ animation:k-cape var(--T) ease-in-out infinite }
@keyframes k-cape{ 0%,80%{ transform:none } 84%{ transform:scale(1.28,1.03) skewX(-6deg) } 89%{ transform:scale(1.12,1) skewX(3deg) } 94%,100%{ transform:none } }
.chb[data-m~="bodyChuckle"] .bd{ animation:k-bd-chuckle var(--T) ease-in-out infinite }
.chb[data-m~="propFlutter"] .prop{ animation:k-flutter .22s ease-in-out infinite alternate }
@keyframes k-flutter{ from{ transform:rotate(-14deg) } to{ transform:rotate(14deg) } }
.chb[data-m~="dropA"] .prop{ animation:k-drop-a var(--T) ease-in infinite }
@keyframes k-drop-a{ 0%,6%{ transform:none; opacity:1 } 30%{ transform:translate(16px,92px) rotate(250deg); opacity:1 } 31%,88%{ transform:translate(16px,92px) rotate(236deg); opacity:1 }
  92%{ transform:translate(16px,92px) rotate(236deg); opacity:0 } 93%{ transform:none; opacity:0 } 98%,100%{ transform:none; opacity:1 } }
.chb[data-m~="dropB"] .prop{ animation:k-drop-b var(--T) ease-in infinite }
@keyframes k-drop-b{ 0%,40%{ transform:none; opacity:1 } 41%{ transform:none; opacity:1 } 46%{ transform:translate(14px,140px) rotate(190deg); opacity:1 } 49%{ transform:translate(14px,140px) rotate(180deg); opacity:0 }
  71%{ transform:none; opacity:0 } 74%,100%{ transform:none; opacity:1 } }
.chb[data-m~="headBack"] .hd{ animation:k-hd-back var(--T) ease-in-out infinite }
/* startle: ngủ giả, giật mình quơ kiếm (Tào Tháo) */
.chb[data-m~="startle"] .bd{ animation:k-bd-startle var(--T) ease-in-out infinite }
@keyframes k-bd-startle{ 0%,46%{ transform:scale(1.005,.975) } 49%{ transform:scale(.88,1.22) translateY(calc(var(--amp) * -16px)) } 52%{ transform:scale(1.12,.86) } 55%{ transform:rotate(calc(var(--amp) * 5deg)) }
  59%{ transform:rotate(calc(var(--amp) * -6deg)) translateY(calc(var(--amp) * -5px)) } 63%{ transform:rotate(calc(var(--amp) * 6deg)) } 67%{ transform:rotate(calc(var(--amp) * -5deg)) translateY(calc(var(--amp) * -4px)) }
  71%{ transform:rotate(calc(var(--amp) * 3deg)) } 75%,100%{ transform:scale(1.005,.975) } }
.chb[data-m~="startle"] .hd{ animation:k-hd-startle var(--T) ease-in-out infinite }
@keyframes k-hd-startle{ 0%{ transform:none } 30%{ transform:rotate(calc(var(--amp) * 14deg)) translateY(calc(var(--amp) * 4px)) } 36%{ transform:rotate(calc(var(--amp) * 16deg)) translateY(calc(var(--amp) * 5px)) }
  40%{ transform:rotate(calc(var(--amp) * -2deg)) } 48%,78%{ transform:none } 90%{ transform:rotate(calc(var(--amp) * 14deg)) translateY(calc(var(--amp) * 4px)) } 100%{ transform:none } }
@arm .chb[data-m~="startle"] | k-ar-startle | var(--T) ease-in-out infinite
.chb[data-m~="startle"] .gleam{ animation:k-gleam-swing var(--T) linear infinite }
@keyframes k-gleam-swing{ 0%,52%{ opacity:0 } 54%,62%{ opacity:.95 } 56%,60%{ opacity:.2 } 58%,66%{ opacity:.95 } 70%,100%{ opacity:0 } }
/* thunder: nghe sấm giật mình, cúi nhặt rồi chữa cháy (Lưu Bị) */
.chb[data-m~="thunder"] .bd{ animation:k-bd-thunder var(--T) ease-in-out infinite }
@keyframes k-bd-thunder{ 0%,37%{ transform:none } 40%{ transform:translateY(calc(var(--amp) * -20px)) scale(.88,1.2) } 43%{ transform:scale(1.1,.88) } 46%{ transform:none } 50%{ transform:scale(1.04,.96) }
  54%,66%{ transform:scale(1.14,.68) } 72%{ transform:scale(.94,1.08) } 77%,100%{ transform:none } }
.chb[data-m~="thunder"] .hd{ animation:k-hd-thunder var(--T) ease-in-out infinite }
@keyframes k-hd-thunder{ 0%,37%{ transform:none } 41%{ transform:rotate(calc(var(--amp) * -10deg)) } 47%,50%{ transform:none } 54%,66%{ transform:rotate(calc(var(--amp) * 16deg)) translateY(calc(var(--amp) * 6px)) } 74%,100%{ transform:none } }
@arm .chb[data-m~="thunder"] | k-ar-thunder | var(--T) ease-in-out infinite
@arm .chb[data-m~="wipeEyes"] | k-wipe | .5s ease-in-out infinite alternate
.chb[data-m~="hatShake"] .capg{ animation:k-cap-shake var(--T) ease-in-out infinite }
.chb[data-m~="hatShakeLoop"] .capg{ animation:k-cap-loop .18s ease-in-out infinite alternate }
@keyframes k-cap-loop{ from{ transform:translateY(calc(var(--amp) * -6px)) rotate(-8deg) } to{ transform:translateY(0) rotate(8deg) } }
.chb[data-m~="shoutRecoil"] .bd{ animation:k-bd-shout var(--T) ease-in-out infinite }
@keyframes k-bd-shout{ 0%,32%{ transform:none } 40%{ transform:scale(1.1,1.14) } 44%{ transform:scale(1.12,1.16) } 47%{ transform:scale(.92,.9) rotate(calc(var(--amp) * -6deg)) } 52%,66%{ transform:rotate(calc(var(--amp) * -5deg)) scale(.96,.98) }
  72%{ transform:scale(1.02,1.02) } 80%,100%{ transform:none } }
.chb[data-m~="shoutRecoil"] .hd{ animation:k-hd-shout var(--T) ease-in-out infinite }
@keyframes k-hd-shout{ 0%,34%{ transform:none } 44%{ transform:rotate(calc(var(--amp) * 6deg)) translateY(calc(var(--amp) * 3px)) } 47%,66%{ transform:rotate(calc(var(--amp) * -9deg)) translateY(calc(var(--amp) * -2px)) } 76%,100%{ transform:none } }
@arm .chb[data-m~="beatChest"] | k-beat | .36s ease-in-out infinite alternate
.chb[data-m~="babyBounce"] .baby{ animation:k-baby .7s ease-in-out infinite alternate }
@keyframes k-baby{ from{ transform:translateY(0) rotate(-1.5deg) } to{ transform:translateY(calc(var(--amp) * -4px)) rotate(1.5deg) scale(1.02) } }
.chb[data-m~="twirl"] .bd{ animation:k-bd-twirl var(--T) ease-in-out infinite }
@keyframes k-bd-twirl{ 0%,34%{ transform:none } 38%{ transform:scale(1.1,.88) } 41%{ transform:translateY(calc(var(--amp) * -10px)) scale(.06,1.04) } 44%{ transform:translateY(calc(var(--amp) * -14px)) scale(-1,1.05) } 47%{ transform:translateY(calc(var(--amp) * -14px)) scale(.06,1.05) }
  50%{ transform:translateY(calc(var(--amp) * -14px)) scale(1,1.05) } 53%{ transform:translateY(calc(var(--amp) * -14px)) scale(.06,1.05) } 56%{ transform:translateY(calc(var(--amp) * -12px)) scale(-1,1.04) } 59%{ transform:translateY(calc(var(--amp) * -8px)) scale(.06,1.03) }
  62%{ transform:translateY(calc(var(--amp) * -4px)) scale(1,1.02) } 66%{ transform:rotate(5deg) scale(1.08,.92) } 69%{ transform:rotate(-3deg) scale(.97,1.04) } 73%,100%{ transform:none } }
.chb[data-m~="ribbonWave"] .rib{ animation:k-rib 1s ease-in-out infinite alternate }
@keyframes k-rib{ from{ transform:rotate(-9deg) skewX(-6deg) } to{ transform:rotate(11deg) skewX(8deg) } }
.chb[data-m~="swoon"] .bd{ animation:k-bd-swoon var(--T) ease-in-out infinite }
@keyframes k-bd-swoon{ 0%,10%{ transform:none } 18%{ transform:rotate(calc(var(--amp) * -10deg)) translateX(calc(var(--amp) * -4px)) } 24%,50%{ transform:rotate(calc(var(--amp) * -16deg)) translateX(calc(var(--amp) * -6px)) scale(1.02,.98) } 60%{ transform:rotate(calc(var(--amp) * -6deg)) } 70%{ transform:rotate(calc(var(--amp) * 2deg)) } 78%,100%{ transform:none } }
.chb[data-m~="swoon"] .hd{ animation:k-hd-swoon var(--T) ease-in-out infinite }
@keyframes k-hd-swoon{ 0%,12%{ transform:none } 20%,52%{ transform:rotate(calc(var(--amp) * -20deg)) translateY(calc(var(--amp) * 2px)) } 62%{ transform:rotate(calc(var(--amp) * -8deg)) } 72%,100%{ transform:none } }
@arm .chb[data-m~="swoon"] | k-ar-swoon | var(--T) ease-in-out infinite
@arm .chb[data-m~="propSwing"] | k-ar-swing | var(--T) ease-in-out infinite
.chb[data-m~="stomp"] .bd{ animation:k-bd-stomp .5s ease-in-out infinite }
@keyframes k-bd-stomp{ 0%,100%{ transform:translateY(0) scale(1.04,.96) } 50%{ transform:translateY(calc(var(--amp) * -6px)) scale(.98,1.03) } }
.chb[data-m~="stomp"] .shoeL{ animation:k-stomp-l .5s ease-in-out infinite } .chb[data-m~="stomp"] .shoeR{ animation:k-stomp-l .5s ease-in-out -.25s infinite }
@keyframes k-stomp-l{ 0%,100%{ transform:translateY(0) } 25%{ transform:translateY(calc(var(--amp) * -13px)) } 50%{ transform:translateY(0) } }
@arm .chb[data-m~="takePulse"] | k-ar-pulse | var(--T) ease-in-out infinite
.chb[data-m~="takePulse"] .hd{ animation:k-hd-pulse var(--T) ease-in-out infinite }
@keyframes k-hd-pulse{ 0%,24%{ transform:none } 30%,74%{ transform:rotate(calc(var(--amp) * -7deg)) translateX(calc(var(--amp) * -2px)) } 82%,100%{ transform:none } }
.chb[data-m~="cranePose"] .bd{ animation:k-bd-crane var(--T) ease-in-out infinite }
@keyframes k-bd-crane{ 0%{ transform:none } 14%{ transform:rotate(calc(var(--amp) * -4deg)) } 22%{ transform:rotate(calc(var(--amp) * -8deg)) translateY(calc(var(--amp) * -3px)) } 26%,74%{ transform:rotate(calc(var(--amp) * -6deg)) translateY(calc(var(--amp) * -3px)) } 82%{ transform:rotate(calc(var(--amp) * 2deg)) } 90%,100%{ transform:none } }
.chb[data-m~="cranePose"] .shoeR{ animation:k-shoe-crane var(--T) ease-in-out infinite }
@keyframes k-shoe-crane{ 0%,14%{ transform:none } 22%,76%{ transform:translate(calc(var(--amp) * 6px),calc(var(--amp) * -26px)) rotate(-24deg) } 84%,100%{ transform:none } }
@arm .chb[data-m~="cranePose"] | k-ar-crane | var(--T) ease-in-out infinite
.chb[data-m~="shiver"] .bd{ animation:k-shiver .09s ease-in-out infinite alternate }
@keyframes k-shiver{ from{ transform:translateX(calc(var(--amp) * -1.6px)) rotate(calc(var(--amp) * -.8deg)) } to{ transform:translateX(calc(var(--amp) * 1.6px)) rotate(calc(var(--amp) * .8deg)) } }
@arm .chb[data-m~="saluteWrong"] | k-ar-salute | var(--T) ease-in-out infinite
.chb[data-m~="saluteWrong"] .capg{ animation:k-cap-salute var(--T) ease-in-out infinite }
@keyframes k-cap-salute{ 0%,48%{ transform:none } 52%{ transform:translateY(calc(var(--amp) * 10px)) rotate(7deg) } 56%{ transform:translateY(calc(var(--amp) * 15px)) rotate(10deg) } 60%,78%{ transform:translateY(calc(var(--amp) * 13px)) rotate(8deg) } 86%{ transform:translateY(calc(var(--amp) * 2px)) rotate(-3deg) } 92%,100%{ transform:none } }
.chb[data-m~="saluteWrong"] .hd{ animation:k-hd-salute var(--T) ease-in-out infinite }
@keyframes k-hd-salute{ 0%,48%{ transform:none } 52%,76%{ transform:rotate(calc(var(--amp) * -6deg)) } 86%,100%{ transform:none } }
/* ===== 5 TRẠNG THÁI BỔ SUNG + DISCOVER ===== */
/* commit: hứa quyết tâm */
.chb[data-m~="resolveBody"] .bd{ animation:k-bd-commit .6s ease-in-out infinite alternate }
@keyframes k-bd-commit{ from{ transform:translateY(0) scale(1.03,.98) } to{ transform:translateY(calc(var(--amp) * -6px)) scale(.99,1.05) } }
.chb[data-m~="resolveNod"] .hd{ animation:k-hd-commit .6s ease-in-out infinite alternate }
@keyframes k-hd-commit{ from{ transform:translateY(calc(var(--amp) * 3px)) rotate(calc(var(--amp) * 2deg)) } to{ transform:translateY(calc(var(--amp) * -1px)) rotate(calc(var(--amp) * -3deg)) } }
@arm .chb[data-m~="resolveFist"] | k-ar-commit | .6s ease-in-out infinite
/* think: suy tư ông cụ non */
.chb[data-m~="paceSlow"] .bd{ animation:k-bd-think 3.2s ease-in-out infinite alternate }
@keyframes k-bd-think{ from{ transform:translateX(calc(var(--amp) * -18px)) rotate(calc(var(--amp) * -2.5deg)) scale(1.02,.97) } to{ transform:translateX(calc(var(--amp) * 18px)) rotate(calc(var(--amp) * 2.5deg)) scale(1.02,.97) } }
.chb[data-m~="stepShoes"] .shoeL{ animation:k-shoe-step .8s ease-in-out infinite } .chb[data-m~="stepShoes"] .shoeR{ animation:k-shoe-step .8s ease-in-out -.4s infinite }
@keyframes k-shoe-step{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(calc(var(--amp) * -5px)) } }
.chb[data-m~="hunchThink"] .hd{ animation:k-hd-think 3.2s ease-in-out infinite alternate }
@keyframes k-hd-think{ from{ transform:rotate(calc(var(--amp) * 7deg)) translateY(calc(var(--amp) * 3px)) } to{ transform:rotate(calc(var(--amp) * -3deg)) translateY(calc(var(--amp) * 1px)) } }
@arm .chb[data-m~="chinStroke"] | k-ar-chin | 1.1s ease-in-out infinite alternate
.chb[data-m~="armBackL"]{ --raL:calc(var(--limpL) + 14deg); --kL:.78 }
/* unsure: nói không chắc */
.chb[data-m~="shyShift"] .bd{ animation:k-bd-shy 1.8s ease-in-out infinite alternate }
@keyframes k-bd-shy{ from{ transform:rotate(calc(var(--amp) * -2.5deg)) translateX(calc(var(--amp) * -3px)) } to{ transform:rotate(calc(var(--amp) * 2.5deg)) translateX(calc(var(--amp) * 3px)) scale(1.01,.99) } }
.chb[data-m~="unsureHead"] .hd{ animation:k-hd-shy 1.2s ease-in-out infinite alternate }
@keyframes k-hd-shy{ from{ transform:rotate(calc(var(--amp) * -8deg)) } to{ transform:rotate(calc(var(--amp) * 7deg)) translateX(calc(var(--amp) * 3px)) } }
@arm .chb[data-m~="unsureArms"] | k-ar-unsure | var(--T) ease-in-out infinite
/* idle: nap / drunk / game */
.chb[data-m~="napSlump"] .bd{ animation:k-bd-nap var(--T) ease-in-out infinite }
@keyframes k-bd-nap{ 0%,100%{ transform:translateY(calc(var(--amp) * 6px)) scale(1.05,.93) } 50%{ transform:translateY(calc(var(--amp) * 8px)) scale(1.03,.96) } 58%{ transform:translateY(calc(var(--amp) * -4px)) scale(.97,1.06) } 70%{ transform:translateY(calc(var(--amp) * 6px)) scale(1.05,.93) } }
.chb[data-m~="napNod"] .hd{ animation:k-hd-nap var(--T) ease-in-out infinite }
@keyframes k-hd-nap{ 0%,100%{ transform:rotate(calc(var(--amp) * 3deg)) } 30%{ transform:rotate(calc(var(--amp) * 14deg)) translateY(calc(var(--amp) * 4px)) } 50%{ transform:rotate(calc(var(--amp) * 20deg)) translateY(calc(var(--amp) * 6px)) } 56%{ transform:rotate(calc(var(--amp) * -8deg)) translateY(calc(var(--amp) * -4px)) } 62%{ transform:rotate(calc(var(--amp) * -2deg)) } 70%{ transform:rotate(calc(var(--amp) * 6deg)) } }
@arm .chb[data-m~="limpArms"] | k-ar-sleep | var(--T) ease-in-out infinite
.chb[data-m~="stumble"] .bd{ animation:k-bd-drunk 2.2s ease-in-out infinite }
@keyframes k-bd-drunk{ 0%,100%{ transform:rotate(calc(var(--amp) * -8deg)) translateX(calc(var(--amp) * -10px)) } 25%{ transform:rotate(calc(var(--amp) * 2deg)) scale(1.02,.98) } 50%{ transform:rotate(calc(var(--amp) * 8deg)) translateX(calc(var(--amp) * 10px)) } 75%{ transform:rotate(calc(var(--amp) * -1deg)) scale(1.02,.98) } }
.chb[data-m~="wobbleHead"] .hd{ animation:k-hd-drunk 1.1s ease-in-out infinite alternate }
@keyframes k-hd-drunk{ from{ transform:rotate(calc(var(--amp) * -12deg)) } to{ transform:rotate(calc(var(--amp) * 10deg)) translateY(calc(var(--amp) * 2px)) } }
@arm .chb[data-m~="gourdArm"] | k-ar-drink | var(--T) ease-in-out infinite
.chb[data-m~="gameHunch"] .bd{ animation:k-bd-game 1.3s ease-in-out infinite }
@keyframes k-bd-game{ 0%,100%{ transform:translateY(calc(var(--amp) * 4px)) rotate(calc(var(--amp) * 1deg)) scale(1.05,.94) } 20%{ transform:translateY(calc(var(--amp) * 5px)) rotate(calc(var(--amp) * -2deg)) scale(1.06,.93) } 45%{ transform:translateY(calc(var(--amp) * 3px)) rotate(calc(var(--amp) * 2deg)) scale(1.05,.95) } 70%{ transform:translateY(calc(var(--amp) * 5px)) rotate(calc(var(--amp) * -1deg)) scale(1.06,.93) } }
.chb[data-m~="gameHead"] .hd{ animation:k-hd-game .9s ease-in-out infinite }
@keyframes k-hd-game{ 0%,100%{ transform:rotate(calc(var(--amp) * 8deg)) translateY(calc(var(--amp) * 3px)) } 25%{ transform:rotate(calc(var(--amp) * 12deg)) translateY(calc(var(--amp) * 5px)) } 50%{ transform:rotate(calc(var(--amp) * 5deg)) translateY(calc(var(--amp) * 2px)) } 75%{ transform:rotate(calc(var(--amp) * 10deg)) translateY(calc(var(--amp) * 4px)) } }
@arm .chb[data-m~="thumbMash"] | k-ar-game | .16s ease-in-out infinite alternate
/* discover: kinh ngạc phát hiện tân đại lục (khựng, bật ngửa, lắng) */
.chb[data-m~="discoverBody"] .bd{ animation:k-bd-discover var(--T) ease-out infinite }
@keyframes k-bd-discover{ 0%,9%{ transform:none } 13%{ transform:scale(.96,1.03) } 17.5%{ transform:scale(1,1) } 19%{ transform:scale(1.05,.92) } 21%{ transform:translateY(calc(var(--amp) * -26px)) scale(.86,1.24) rotate(calc(var(--amp) * -6deg)) } 27%{ transform:translateY(calc(var(--amp) * -8px)) rotate(calc(var(--amp) * -10deg)) scale(1.1,.9) }
  32%,40%,48%,56%{ transform:rotate(calc(var(--amp) * -9deg)) scale(1.04,1.02) } 36%,44%,52%{ transform:rotate(calc(var(--amp) * -11.5deg)) scale(1.04,1.02) } 62%{ transform:rotate(calc(var(--amp) * -3deg)) } 68%{ transform:rotate(calc(var(--amp) * 1deg)) scale(1.03,.98) } 75%,100%{ transform:none } }
.chb[data-m~="discoverHead"] .hd{ animation:k-hd-discover var(--T) ease-out infinite }
@keyframes k-hd-discover{ 0%,17%{ transform:none } 21%{ transform:rotate(calc(var(--amp) * -16deg)) translateY(calc(var(--amp) * -4px)) scale(1.04,1.1) } 30%,58%{ transform:rotate(calc(var(--amp) * -10deg)) scale(1.03,1.06) } 68%{ transform:rotate(calc(var(--amp) * -3deg)) } 74%{ transform:rotate(calc(var(--amp) * 4deg)) } 82%,100%{ transform:none } }
@arm .chb[data-m~="discoverArms"] | k-ar-discover | var(--T) ease-in-out infinite
.chb[data-m~="capFly"] .capg{ animation:k-cap-fly var(--T) ease-out infinite }
@keyframes k-cap-fly{ 0%,17%{ transform:none } 20%{ transform:translateY(calc(var(--amp) * -30px)) rotate(40deg) } 25%{ transform:translateY(calc(var(--amp) * -92px)) rotate(180deg) } 32%,46%{ transform:translateY(calc(var(--amp) * -100px)) rotate(300deg) } 58%{ transform:translateY(calc(var(--amp) * -50px)) rotate(500deg) } 66%{ transform:translateY(calc(var(--amp) * 4px)) rotate(720deg) } 70%{ transform:translateY(calc(var(--amp) * -8px)) rotate(720deg) } 74%,100%{ transform:rotate(720deg) } }
@arm .chb[data-m~="pointScold"] | k-ar-point | var(--T) ease-in-out infinite
.chb[data-m~="chinUp"] .hd{ animation:k-hd-chin var(--T) ease-in-out infinite }
@keyframes k-hd-chin{ 0%,20%,82%,100%{ transform:none } 28%,70%{ transform:rotate(calc(var(--amp) * -5deg)) translateY(calc(var(--amp) * -3px)) scale(1,1.03) } }
.chb[data-m~="helmSlip"] .capg{ animation:k-cap-slip var(--T) ease-in-out infinite }
@keyframes k-cap-slip{ 0%,26%{ transform:none } 36%{ transform:translate(calc(var(--amp) * 10px),calc(var(--amp) * 2px)) rotate(4deg) } 44%,52%{ transform:translate(calc(var(--amp) * 20px),calc(var(--amp) * 6px)) rotate(12deg) } 60%{ transform:translate(calc(var(--amp) * 3px),0) rotate(-3deg) } 66%{ transform:rotate(2deg) } 72%,100%{ transform:none } }
@arm .chb[data-m~="helmSlip"] | k-ar-slip | var(--T) ease-in-out infinite
.chb[data-m~="capToss"] .capg{ animation:k-cap-toss var(--T) cubic-bezier(.3,.7,.5,1) infinite }
@keyframes k-cap-toss{ 0%,30%{ transform:none } 40%{ transform:translateY(calc(var(--amp) * -70px)) rotate(-24deg) } 48%{ transform:translateY(calc(var(--amp) * -92px)) rotate(10deg) } 58%{ transform:translateY(calc(var(--amp) * 2px)) rotate(0) } 62%{ transform:translateY(calc(var(--amp) * -9px)) } 66%,100%{ transform:none } }
.chb[data-m~="flipFall"] .bd{ transform-origin:100px 125px; animation:k-bd-flip var(--T) ease-in-out infinite }
@keyframes k-bd-flip{ 0%{ transform:none } 3%{ transform:translateY(calc(var(--amp) * -6px)) scale(.9,1.15) } 6%{ transform:scale(1.02,.98) } 9%{ transform:rotate(calc(var(--amp) * -10deg)) } 12%{ transform:rotate(calc(var(--amp) * -24deg)) translateY(calc(var(--amp) * -4px)) }
  16%{ transform:rotate(-110deg) translateY(calc(var(--amp) * -20px)) } 20%{ transform:rotate(-190deg) translateY(calc(var(--amp) * -4px)) } 24%{ transform:rotate(-176deg) translateY(calc(var(--amp) * 2px)) scale(1.1,.9) } 28%{ transform:rotate(-182deg) translateY(calc(var(--amp) * -4px)) scale(.97,1.04) }
  32%,52%{ transform:rotate(-180deg) translateY(calc(var(--amp) * -4px)) } 58%{ transform:rotate(-176deg) } 64%{ transform:rotate(-90deg) translateY(calc(var(--amp) * -10px)) } 70%{ transform:rotate(-12deg) } 74%{ transform:rotate(6deg) scale(1.08,.92) } 78%{ transform:rotate(-2deg) } 82%,100%{ transform:none } }
.chb[data-m~="flipFall"] .shoeL{ animation:k-shoe-flip-l var(--T) ease-in-out infinite } .chb[data-m~="flipFall"] .shoeR{ animation:k-shoe-flip-r var(--T) ease-in-out infinite }
@keyframes k-shoe-flip-l{ 0%,26%{ transform:none } 30%{ transform:translateY(calc(var(--amp) * 9px)) } 34%{ transform:none } 38%{ transform:translateY(calc(var(--amp) * 9px)) } 42%{ transform:none } 46%{ transform:translateY(calc(var(--amp) * 9px)) } 50%,100%{ transform:none } }
@keyframes k-shoe-flip-r{ 0%,28%{ transform:none } 32%{ transform:translateY(calc(var(--amp) * 9px)) } 36%{ transform:none } 40%{ transform:translateY(calc(var(--amp) * 9px)) } 44%{ transform:none } 48%{ transform:translateY(calc(var(--amp) * 9px)) } 52%,100%{ transform:none } }
.chb[data-m~="helmDrop"] .capg{ animation:k-cap-drop var(--T) ease-in-out infinite }
@keyframes k-cap-drop{ 0%,12%{ transform:none } 16%{ transform:translateY(calc(var(--amp) * 30px)) rotate(4deg) } 20%{ transform:translateY(calc(var(--amp) * 22px)) rotate(-3deg) } 24%,76%{ transform:translateY(calc(var(--amp) * 26px)) rotate(2deg) } 86%{ transform:translateY(calc(var(--amp) * 6px)) rotate(-4deg) } 92%,100%{ transform:none } }
.chb[data-m~="capBounce"] .capg{ animation:k-cap-bounce .4s ease-in-out infinite alternate }
@keyframes k-cap-bounce{ from{ transform:translateY(0) rotate(-2deg) } to{ transform:translateY(calc(var(--amp) * -9px)) rotate(4deg) } }
/* --- hiệu năng (đo: chi phí ~ số animation đang chạy, ~0,1 ms / animation / khung trên Chromium headless): cỡ 64 / 32 px và nhân vật vượt ngân sách chỉ giữ chuyển động thân + đầu + huy hiệu --- */
.chb:is([data-sz="m"],[data-sz="s"],[data-lod]) *:not(.bd):not(.hd):not(.hero):not(.hero *){ animation:none !important }
.chb:is([data-s="run"],[data-s="reward"],[data-s="penalty"],[data-s="rank1"],[data-s="quota"],[data-s="failover"],[data-s="error"],[data-s="commit"],[data-s="discover"]) .breath{ animation:none }
}
`;

/* ---- keyframes sinh bằng JS (rung nhiều khung) ---- */
function mk(name: string, frames: [number, string][]): string {
  return `@keyframes ${name}{${frames.map(([p, t]) => `${f(p)}%{transform:${t}}`).join('')}}`;
}
function burst(
  a: number,
  b: number,
  step: number,
  base: string,
  dx: number,
  dy: number,
  rot: number,
): [number, string][] {
  const r: [number, string][] = [];
  let sgn = 1;
  for (let p = a; p <= b + 0.001; p += step) {
    r.push([
      p,
      `${base}translate(calc(var(--amp) * ${f(dx * sgn)}px),calc(var(--amp) * ${f(dy * -sgn)}px)) rotate(${f(rot * sgn)}deg)`,
    ]);
    sgn *= -1;
  }
  return r;
}
function alt(a: number, b: number, step: number, A: string, B: string): [number, string][] {
  const r: [number, string][] = [];
  let k = 0;
  for (let p = a; p <= b + 0.001; p += step) {
    r.push([p, k++ % 2 ? B : A]);
  }
  return r;
}
function genKeyframes(): string {
  const css: string[] = [];
  css.push(
    mk('k-hd-penalty', [
      [0, 'none'],
      [7, 'none'],
      ...burst(8, 50, 1.4, '', 0.9, 0.5, 0.6),
      [52, 'none'],
      [100, 'none'],
    ]),
  );
  css.push(
    mk('k-bd-penalty', [
      [0, 'none'],
      [2, 'translateY(calc(var(--amp) * -8px)) scale(.88,1.2)'],
      [5, 'scale(1.06,.94)'],
      [8, 'none'],
      [52, 'none'],
      [56, 'scale(.94,1.07)'],
      [60, 'scale(1.03,.98)'],
      [64, 'none'],
      ...burst(66, 98, 2, '', 1.7, 0.8, 1.1),
      [100, 'none'],
    ]),
  );
  css.push(
    mk('k-bd-chuckle', [
      [0, 'none'],
      [52, 'none'],
      ...burst(54, 78, 2, '', 1.5, 0.8, 0.9),
      [80, 'none'],
      [84, 'rotate(calc(var(--amp) * -4deg)) scale(1.03,.98)'],
      [89, 'rotate(calc(var(--amp) * 3deg))'],
      [94, 'none'],
      [100, 'none'],
    ]),
  );
  css.push(
    mk('k-bd-rest', [
      [0, 'scale(1.1,.8)'],
      ...burst(2, 18, 2, 'scale(1.1,.8) ', 0, 1.8, 0),
      [20, 'scale(1.1,.8)'],
      [40, 'scale(1.1,.8)'],
      ...burst(42, 60, 2, 'scale(1.1,.8) ', 0, 1.8, 0),
      [62, 'scale(1.1,.8)'],
      [78, 'scale(1.1,.8)'],
      ...burst(80, 92, 2, 'scale(1.1,.8) ', 0, 1.8, 0),
      [94, 'scale(1.1,.8)'],
      [100, 'scale(1.1,.8)'],
    ]),
  );
  css.push(
    mk('k-hd-rest', [
      [0, 'none'],
      [8, 'none'],
      [11, 'rotate(calc(var(--amp) * 14deg)) translateY(calc(var(--amp) * 5px))'],
      [16, 'rotate(calc(var(--amp) * 3deg))'],
      [20, 'rotate(calc(var(--amp) * 14deg)) translateY(calc(var(--amp) * 5px))'],
      [25, 'rotate(calc(var(--amp) * 4deg))'],
      [34, 'rotate(calc(var(--amp) * 6deg)) translateY(calc(var(--amp) * 2px))'],
      [54, 'rotate(calc(var(--amp) * 6deg)) translateY(calc(var(--amp) * 2px))'],
      [58, 'rotate(calc(var(--amp) * 14deg)) translateY(calc(var(--amp) * 5px))'],
      [63, 'rotate(calc(var(--amp) * 3deg))'],
      [67, 'rotate(calc(var(--amp) * 14deg)) translateY(calc(var(--amp) * 5px))'],
      [72, 'rotate(calc(var(--amp) * 5deg))'],
      [100, 'rotate(calc(var(--amp) * 6deg)) translateY(calc(var(--amp) * 2px))'],
    ]),
  );
  css.push(
    mk('k-hd-back', [
      [0, 'none'],
      [22, 'none'],
      [24.5, 'scale(1.13,.76)'],
      [28, 'scale(.94,1.1)'],
      [31, 'scale(1.03,.97)'],
      [36, 'rotate(-14deg) translateY(2px)'],
      ...alt(39, 78, 3, 'rotate(-12deg) translateY(4px)', 'rotate(-15deg) translateY(1px)'),
      [94, 'none'],
      [100, 'none'],
    ]),
  );
  css.push(
    mk('k-cap-shake', [
      [0, 'none'],
      [44, 'none'],
      ...alt(
        46,
        72,
        2,
        'translateY(calc(var(--amp) * -13px)) rotate(10deg)',
        'translateY(calc(var(--amp) * -4px)) rotate(-10deg)',
      ),
      [75, 'none'],
      [100, 'none'],
    ]),
  );
  return css.join('');
}

/* ---- animation "on twos": phần trang trí (emote, hạt, lửa, tua, dải khăn…) chạy theo bậc ~15 bước/s thay vì mượt 60 khung/s.
 * Đo: Blink chỉ tính lại style khi giá trị animation thật sự đổi, nên bậc rẻ hơn ~2x với cùng số phần tử. Thân, đầu, tay giữ mượt. ---- */
const STEPPED = [
  '.em-',
  '.e-spiral',
  '.e-coin',
  '.jet',
  '.flag',
  '.e-fire',
  '.e-spring',
  '.m-wail',
  '.m-drool',
  '.hero .bw',
  '.tail,.tsl',
  '.snot',
];
export function stepify(css: string): string {
  return css
    .split('\n')
    .map((line) => {
      if (!STEPPED.some((m) => line.indexOf(m) >= 0) || line.indexOf('@keyframes') === 0) return line;
      return line.replace(
        /animation:(k-[\w-]+) (var\(--[\w-]+\)|[\d.]+s) (ease-in-out|ease-out|ease-in|ease|linear|cubic-bezier\([^)]*\))( [\d.-]+s)?( infinite)/g,
        (_m, name: string, dur: string, _tf: string, delay: string | undefined, inf: string) => {
          const d = parseFloat(dur),
            n = Number.isNaN(d) ? 48 : Math.max(2, Math.round(d * 15));
          return `animation:${name} ${dur} steps(${n})${delay || ''}${inf}`;
        },
      );
    })
    .join('\n');
}

/* ================= tiền tố chb- cho class / keyframes / biến CSS ================= */
export const NSP = 'chb-';
export const nsMarkup = (s: string): string =>
  s
    .replace(
      /class="([^"]*)"/g,
      (_m, c: string) =>
        'class="' +
        c
          .split(/\s+/)
          .filter(Boolean)
          .map((x: string) => (x === 'chb' ? x : NSP + x))
          .join(' ') +
        '"',
    )
    .replace(/--(?!chb-)([a-zA-Z][\w-]*)/g, '--chb-$1');
const nsCss = (s: string): string =>
  s
    .replace(/\[data-(s|m|v|eyes|mouth|brow|face|em|vis|sz|lod|mo)([=~\]])/g, '[data-chb-$1$2')
    .replace(/\.([a-zA-Z][\w-]*)/g, (m, c: string) => (c === 'chb' ? m : `.${NSP}${c}`))
    .replace(/(^|[^\w-])k-([a-z][\w-]*)/g, '$1chb-k-$2')
    .replace(/--(?!chb-)([a-zA-Z][\w-]*)/g, '--chb-$1');
export const V = (n: string): string => `--chb-${n}`;

/** luật bật lớp mặt / emote theo thuộc tính data-* (mắt, miệng, emote) */
function faceRules(): string {
  const eyes = EYE_LAYERS.map((k) => `.chb[data-eyes="${k}"] .e-${k}`).join(',');
  const mouths = MOUTH_LAYERS.map((k) => `.chb[data-mouth="${k}"] .m-${k}`).join(',');
  const ems = EMOTES.map((k) => `.chb[data-em~="${k}"] .em-${k}`).join(',');
  return `${eyes}{opacity:1}${mouths}{opacity:1}${ems}{display:inline}`;
}

/** toàn bộ stylesheet đã gắn tiền tố, không chú thích (dựng một lần thành constructable stylesheet, xem runtime.ts) */
export function buildCss(): string {
  const css = nsCss(
    `${CSS_BASE}${faceRules()}${CSS_REDUCE}${CSS_STATIC}@media (prefers-reduced-motion: no-preference){${genKeyframes()}\n${armKeyframes()}}${stepify(expandArm(CSS_MOTION))}`,
  );
  // độ dày nét theo hệ số k: đường CSP chặt thay style="stroke-width:calc(var(--sw) * k)" bằng data-chb-k (strict.ts)
  const kRules = K_VALUES.map((k) => `[data-chb-k="${k}"]{ stroke-width:calc(var(--chb-sw,3.4) * ${k}) }`).join('\n');
  return `${css}\n${kRules}`.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{2,}/g, '\n');
}
