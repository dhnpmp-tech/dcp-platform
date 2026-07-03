'use client'

// HeroMeshCanvas — "v3 combo" hero: a GPU texture background (the
// Higgsfield mesh image, kept gently alive with parallax + grain + a teal
// sweep) overlaid by an interactive Canvas 2D node mesh that ignites under
// the cursor/finger and propagates the signal to its neighbours. An honest
// device badge names the GPU actually rendering the frame — and the API:
// when the browser grants a WebGPU adapter the background renders through
// webgpu.ts (a WGSL port of the same shader) and the badge gains a literal
// "· WebGPU" segment; otherwise the original WebGL path runs, unchanged.
//
// Ported faithfully from components/hero-mesh/_prototype/hero-v3.html with
// production hardening: prefers-reduced-motion → static frame, rAF paused
// when off-screen (IntersectionObserver) or tab hidden (visibilitychange),
// DPR capped at 2, node count scaled to viewport, reserved aspect-ratio box
// for zero CLS. Palette comes from dcp-kit tokens (--teal/--orange), not hex.

import { useEffect, useRef, useState } from 'react'
import { Bi } from '../../lib/i18n'
import { initHeroWebGPU, type HeroWebGPURenderer } from './webgpu'
import './hero-mesh.css'

interface HeroMeshCanvasProps {
  className?: string
  /** Show the honest "Rendered live on your <device>" badge. @default true */
  badge?: boolean
  /** WebGL background texture. When omitted, one of HERO_TEXTURES is picked
   *  at random per visit — every load renders a different scene. */
  textureSrc?: string
}

// The rotating scene library: abstract mesh, terrain constellation, chip-city.
// All share the midnight-navy + teal/amber palette so the node overlay reads
// identically on top of any of them.
const HERO_TEXTURES = ['/hero/hero-mesh-bg.webp', '/hero/hero-dunes.webp', '/hero/hero-chipcity.webp'] as const

const TEAL: [number, number, number] = [45, 212, 182]
const AMBER: [number, number, number] = [238, 122, 60]

function mix(a: number[], b: number[], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
function rgba(c: number[], al: number): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`
}

// Honest device label from a throwaway WebGL renderer probe — mirrors the
// prototype's IIFE. Returns the device family, not a marketing string.
function detectDevice(gl: WebGLRenderingContext | null): string {
  if (typeof navigator === 'undefined') return 'device'
  const ua = navigator.userAgent
  const touch = navigator.maxTouchPoints || 0
  let r = ''
  try {
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      r = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || ''
    }
  } catch {
    r = ''
  }
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return 'iPad'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet'
  if (/Apple/i.test(r) || /Mac/i.test(navigator.platform || '')) {
    const m = r.match(/Apple\s+(M\d\w*)/i)
    return m ? `MacBook · ${m[1].toUpperCase()}` : 'Mac'
  }
  const g = r.replace(/ANGLE|Direct3D11|OpenGL|\(.*?\)|vs_5_0|ps_5_0/gi, '').replace(/\s+/g, ' ').trim()
  return g ? g.slice(0, 40) : 'GPU'
}

export function HeroMeshCanvas({ className, badge = true, textureSrc }: HeroMeshCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const glRef = useRef<HTMLCanvasElement>(null)
  const meshRef = useRef<HTMLCanvasElement>(null)
  const [device, setDevice] = useState<string>('device')
  // Live frame rate, measured from the actual rAF loop — the visible proof
  // that the scene is being rendered on the visitor's device right now.
  // Stays null under prefers-reduced-motion (single static frame, no loop).
  const [fps, setFps] = useState<number | null>(null)
  // True only once the WebGPU backend has actually taken the canvas — the
  // badge's "· WebGPU" segment must never claim an API that isn't rendering.
  const [isWebGPU, setIsWebGPU] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    const glCv = glRef.current
    const meshCv = meshRef.current
    if (!host || !glCv || !meshCv) return

    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // ---------- GPU background: WebGPU first, WebGL fallback ----------
    // The same scene now has two backends. A canvas can hold only ONE context
    // kind, so the choice happens before anything touches glCv: when the
    // browser exposes navigator.gpu AND actually grants an adapter + device
    // (the async part), webgpu.ts renders the WGSL port; otherwise the
    // original WebGL path below runs, logic untouched. The mesh loop starts
    // immediately either way — on the WebGPU path the background joins a few
    // frames later, the same visual beat as WebGL's 1×1 placeholder texture.

    type Gl = {
      prog: WebGLProgram
      u: { t: WebGLUniformLocation | null; r: WebGLUniformLocation | null; m: WebGLUniformLocation | null; img: WebGLUniformLocation | null; tex: WebGLUniformLocation | null; light: WebGLUniformLocation | null }
      tex: WebGLTexture
    }
    let glCtx: WebGLRenderingContext | null = null
    let glState: Gl | null = null
    let webgpu: HeroWebGPURenderer | null = null
    let disposed = false
    let imgWH: [number, number] = [16, 9]
    let heroImg: HTMLImageElement | null = null // decoded, waiting for a backend

    // The honest device NAME still comes from a WebGL renderer probe — it is
    // far better populated than WebGPU adapter info — but on a throwaway
    // canvas, so the background canvas stays free for whichever API wins it.
    const probeGl = document.createElement('canvas').getContext('webgl', { powerPreference: 'high-performance' })
    setDevice(detectDevice(probeGl))
    try {
      probeGl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      /* best-effort probe context release */
    }

    // Texture chosen once (random per visit when no prop) and shared by both
    // backends; whichever one is live when the image decodes gets the upload.
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => {
      if (disposed) return
      imgWH = [im.width, im.height]
      heroImg = im
      if (glCtx && glState) {
        glCtx.bindTexture(glCtx.TEXTURE_2D, glState.tex)
        glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, glCtx.RGBA, glCtx.UNSIGNED_BYTE, im)
      }
      if (webgpu) webgpu.setTexture(im)
    }
    im.src = textureSrc ?? HERO_TEXTURES[Math.floor(Math.random() * HERO_TEXTURES.length)]

    // The original WebGL path — wrapped in a function so it can run either
    // immediately (no navigator.gpu) or as the fallback after a failed
    // WebGPU negotiation. The setup body is unchanged from the pre-WebGPU
    // version; only the image load (shared, above) moved out of it.
    function initWebGL() {
      if (!glCv) return
      const gl = glCv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
      glCtx = gl
      if (!gl) return
      const VERT = `attribute vec2 p;varying vec2 vUv;void main(){vUv=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}`
      // Image-specific pointer response, all in the fragment shader:
      //  1) luminance-as-depth parallax — bright pixels (ridges, light veins)
      //     shift more with the pointer than dark ones, so the flat texture
      //     reads as a volume the moment you move the mouse;
      //  2) a soft pointer light — lifts exposure MULTIPLICATIVELY around the
      //     cursor, so it reveals only detail the image actually contains
      //     (uLight fades it in/out when the pointer enters/leaves).
      const FRAG = `precision highp float;uniform sampler2D uTex;uniform float uTime;uniform vec2 uRes;uniform vec2 uMouse;uniform vec2 uImg;uniform float uLight;varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){float sa=uRes.x/uRes.y,ia=uImg.x/uImg.y;vec2 uv=vUv;uv.y=1.-uv.y;
vec2 sc=sa>ia?vec2(1.,ia/sa):vec2(sa/ia,1.);uv=(uv-0.5)*sc+0.5;
vec2 m=uMouse-0.5;float zoom=1.0-0.035-0.01*sin(uTime*0.4);uv=(uv-0.5)*zoom+0.5-m*0.02;
float lum=dot(texture2D(uTex,uv).rgb,vec3(0.299,0.587,0.114));
vec2 par=m*(lum-0.35)*0.028*uLight;
vec3 col=texture2D(uTex,uv+par).rgb;
float d=distance(vUv,uMouse);
float glow=smoothstep(0.38,0.0,d)*uLight;
col+=col*glow*(0.30+lum*0.35);
col+=vec3(0.10,0.83,0.71)*glow*0.03;
float sweep=smoothstep(0.0,0.5,sin((uv.x+uv.y)*2.2-uTime*0.5)*0.5+0.5);col+=vec3(0.10,0.83,0.71)*sweep*0.04;
col+=(hash(vUv*uRes.xy+uTime)-0.5)*0.03;col*=1.0-0.26*length(vUv-0.5);gl_FragColor=vec4(col,1.0);}`

      const mk = (t: number, s: string) => {
        const o = gl.createShader(t)!
        gl.shaderSource(o, s)
        gl.compileShader(o)
        return o
      }
      const prog = gl.createProgram()!
      gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT))
      gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG))
      gl.linkProgram(prog)
      gl.useProgram(prog)

      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(prog, 'p')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([5, 10, 20, 255]))
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

      // the image may already be decoded (the async-fallback case, where the
      // WebGPU negotiation failed after im.onload fired) — upload it now
      if (heroImg) {
        imgWH = [heroImg.width, heroImg.height]
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, heroImg)
      }

      glState = {
        prog,
        u: {
          t: gl.getUniformLocation(prog, 'uTime'),
          r: gl.getUniformLocation(prog, 'uRes'),
          m: gl.getUniformLocation(prog, 'uMouse'),
          img: gl.getUniformLocation(prog, 'uImg'),
          tex: gl.getUniformLocation(prog, 'uTex'),
          light: gl.getUniformLocation(prog, 'uLight'),
        },
        tex,
      }

      // build() may already have sized the canvas before this ran (again the
      // async-fallback case) — align the viewport; build() keeps it in sync.
      gl.viewport(0, 0, glCv.width, glCv.height)
    }

    // Backend selection. navigator.gpu existing is NOT enough — an adapter
    // must actually be granted (disabled flags, blocklisted drivers and
    // software-only setups all resolve null) — so the WebGL fallback waits on
    // the full async negotiation, not just the property sniff. `any`-safe
    // detection: @webgpu/types is deliberately absent (see webgpu.ts).
    if (typeof navigator !== 'undefined' && (navigator as { gpu?: unknown }).gpu) {
      initHeroWebGPU(glCv).then((renderer) => {
        if (disposed) {
          renderer?.destroy()
          return
        }
        if (renderer) {
          webgpu = renderer
          setIsWebGPU(true) // badge honesty: claim WebGPU only once it renders
          if (heroImg) renderer.setTexture(heroImg)
        } else {
          initWebGL()
        }
        // reduced-motion paints exactly one frame — which already happened
        // synchronously before this negotiation settled, so paint one more
        // now that the background is actually able to draw.
        if (reduced) renderStaticFrame()
      })
    } else {
      initWebGL()
    }

    // ---------- Canvas 2D mesh ----------
    const ctx = meshCv.getContext('2d')
    type Node = { x: number; y: number; ox: number; oy: number; ph: number; a: number; base: number; nb: number[] }
    let nodes: Node[] = []
    let edges: [number, number][] = []
    let W = 0
    let H = 0
    let nextPulse = 0 // ambient signal scheduler (seconds)

    const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)

    function build() {
      if (!meshCv || !ctx || !host || !glCv) return
      const rect = host.getBoundingClientRect()
      W = Math.max(1, rect.width)
      H = Math.max(1, rect.height)
      meshCv.width = W * DPR
      meshCv.height = H * DPR
      meshCv.style.width = `${W}px`
      meshCv.style.height = `${H}px`
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)

      glCv.width = W * DPR
      glCv.height = H * DPR
      glCv.style.width = `${W}px`
      glCv.style.height = `${H}px`
      if (glCtx && glState) glCtx.viewport(0, 0, glCv.width, glCv.height)

      const target = Math.min(220, Math.max(70, (W * H) / 11000))
      const cols = Math.max(4, Math.round(Math.sqrt((target * W) / H)))
      const rows = Math.max(3, Math.round(target / cols))
      const cw = W / cols
      const ch = H / rows
      nodes = []
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = (x + 0.5) * cw + (Math.random() - 0.5) * cw * 0.75
          const ny = (y + 0.5) * ch + (Math.random() - 0.5) * ch * 0.75
          nodes.push({
            x: nx,
            y: ny,
            ox: nx,
            oy: ny,
            ph: Math.random() * 6.2832,
            a: 0,
            base: 0,
            nb: [],
          })
        }
      }
      nodes.forEach((n) => {
        n.base = n.x / W
      })
      const R = Math.max(cw, ch) * 1.5
      edges = []
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          if (dx * dx + dy * dy < R * R) {
            edges.push([i, j])
            nodes[i].nb.push(j)
            nodes[j].nb.push(i)
          }
        }
      }
    }
    build()

    // pointer state (normalised to the host rect)
    const ms = { x: -9999, y: -9999 }
    const tg = { x: 0.5, y: 0.5 } // WebGL parallax target
    const mo = { x: 0.5, y: 0.5 } // WebGL parallax smoothed
    const lt = { tg: 0, sm: 0 } // pointer-light presence, eased in/out

    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      ms.x = e.clientX - rect.left
      ms.y = e.clientY - rect.top
      tg.x = (e.clientX - rect.left) / rect.width
      tg.y = 1 - (e.clientY - rect.top) / rect.height
      lt.tg = 1
    }
    const onLeave = () => {
      ms.x = -9999
      ms.y = -9999
      lt.tg = 0
    }
    // Listen on the positioned parent, not the host: in the full-bleed hero
    // the copy column sits above the canvases and would otherwise swallow
    // pointermove. Coordinates stay host-relative either way.
    const pointerTarget: HTMLElement = host.parentElement ?? host
    pointerTarget.addEventListener('pointermove', onMove, { passive: true })
    pointerTarget.addEventListener('pointerdown', onMove, { passive: true })
    pointerTarget.addEventListener('pointerleave', onLeave)

    let raf = 0
    let running = true
    let frameCount = 0
    let fpsWindowStart = 0

    function frame(now: number) {
      if (!running) return
      const t = now * 0.001

      // fps meter: one measurement window per second
      frameCount++
      if (fpsWindowStart === 0) {
        fpsWindowStart = now
        frameCount = 0
      } else if (now - fpsWindowStart >= 1000) {
        setFps(Math.min(120, Math.round((frameCount * 1000) / (now - fpsWindowStart))))
        fpsWindowStart = now
        frameCount = 0
      }

      // GPU background — one scene, whichever backend won the canvas at
      // mount. Pointer smoothing stays with the draw (as it always did) so
      // both paths ease identically.
      if (webgpu || (glCtx && glState)) {
        mo.x += (tg.x - mo.x) * 0.05
        mo.y += (tg.y - mo.y) * 0.05
        lt.sm += (lt.tg - lt.sm) * 0.06
      }
      if (webgpu) {
        // the WGSL port reads uRes off the canvas and tracks uImg internally
        webgpu.render(t, mo.x, mo.y, lt.sm)
      } else if (glCtx && glState && glCv) {
        const gl = glCtx
        gl.useProgram(glState.prog)
        gl.uniform1f(glState.u.t, t)
        gl.uniform2f(glState.u.r, glCv.width, glCv.height)
        gl.uniform2f(glState.u.m, mo.x, mo.y)
        gl.uniform2f(glState.u.img, imgWH[0], imgWH[1])
        gl.uniform1f(glState.u.light, lt.sm)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, glState.tex)
        gl.uniform1i(glState.u.tex, 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }

      // Canvas 2D mesh — alive on its own, quiet under the cursor.
      // Ambient life: (1) the web breathes — every node drifts a few px on a
      // slow sine around its origin, (2) node colors slide teal↔amber over
      // time, (3) every couple of seconds a random node fires and the signal
      // travels outward along the edges — compute moving through the mesh.
      // The cursor adds only a soft partial trace (no floodlight, no blobs).
      if (ctx) {
        // breathing positions
        for (const n of nodes) {
          n.x = n.ox + Math.sin(t * 0.22 + n.ph) * 5
          n.y = n.oy + Math.cos(t * 0.19 + n.ph * 1.31) * 5
        }
        // autonomous traveling signals
        if (t >= nextPulse && nodes.length > 0) {
          const origin = nodes[(Math.random() * nodes.length) | 0]
          origin.a = Math.max(origin.a, 0.7)
          nextPulse = t + 1.4 + Math.random() * 2.2
        }
        // cursor trace
        const IR = 60
        const IR2 = IR * IR
        for (const n of nodes) {
          const dx = n.x - ms.x
          const dy = n.y - ms.y
          const d2 = dx * dx + dy * dy
          if (d2 < IR2) {
            const strength = 0.5 * (1 - d2 / IR2)
            if (strength > n.a) n.a = strength
          }
        }
        // propagation
        const prev = nodes.map((n) => n.a)
        for (let i = 0; i < nodes.length; i++) {
          let m = prev[i] * 0.9
          const nb = nodes[i].nb
          for (let k = 0; k < nb.length; k++) {
            const v = prev[nb[k]] * 0.62
            if (v > m) m = v
          }
          nodes[i].a = m < 0.002 ? 0 : m
        }
        // time-drifted palette position: teal↔amber slides around the node's
        // spatial gradient anchor, each node on its own phase
        const shade = (n: Node): number => {
          const s = n.base + 0.25 * Math.sin(t * 0.16 + n.ph)
          return s < 0 ? 0 : s > 1 ? 1 : s
        }
        ctx.clearRect(0, 0, W, H)
        ctx.lineWidth = 1
        for (const [i, j] of edges) {
          const a = Math.max(nodes[i].a, nodes[j].a)
          const tt = (shade(nodes[i]) + shade(nodes[j])) * 0.5
          const c = mix(mix(TEAL, AMBER, tt), mix(AMBER, TEAL, tt), a)
          ctx.strokeStyle = rgba(c, 0.045 + a * 0.18)
          ctx.beginPath()
          ctx.moveTo(nodes[i].x, nodes[i].y)
          ctx.lineTo(nodes[j].x, nodes[j].y)
          ctx.stroke()
        }
        for (const n of nodes) {
          const b = shade(n)
          const c = mix(mix(TEAL, AMBER, b), mix(AMBER, TEAL, b), n.a)
          // gentle twinkle on top of the activation glow
          ctx.globalAlpha = 0.26 + n.a * 0.4 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.7 + n.ph * 2))
          ctx.fillStyle = rgba(c, 1)
          ctx.beginPath()
          ctx.arc(n.x, n.y, 1.5 + n.a * 1.1, 0, 6.2832)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }

      raf = requestAnimationFrame(frame)
    }

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => build())
      ro.observe(host)
    }

    const onResize = () => build()
    window.addEventListener('resize', onResize)

    const onVis = () => {
      const visible = document.visibilityState === 'visible'
      running = visible
      if (running && !reduced) {
        raf = requestAnimationFrame(frame)
      } else {
        cancelAnimationFrame(raf)
      }
    }
    document.addEventListener('visibilitychange', onVis)

    let io: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries.some((e) => e.isIntersecting) && document.visibilityState === 'visible'
          running = visible
          if (running && !reduced) {
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(frame)
          } else {
            cancelAnimationFrame(raf)
          }
        },
        { threshold: 0.01 },
      )
      io.observe(host)
    }

    // one static frame, no rAF — also re-invoked when an async backend lands
    // after the synchronous first paint (see the WebGPU negotiation above).
    // The fps window resets so the badge stays fps-less under reduced motion.
    function renderStaticFrame() {
      running = true
      frame(performance.now())
      cancelAnimationFrame(raf) // frame() schedules another; cancel it
      running = false
      fpsWindowStart = 0
      frameCount = 0
    }

    if (reduced) {
      renderStaticFrame()
    } else {
      raf = requestAnimationFrame(frame)
    }

    return () => {
      disposed = true
      running = false
      cancelAnimationFrame(raf)
      pointerTarget.removeEventListener('pointermove', onMove)
      pointerTarget.removeEventListener('pointerdown', onMove)
      pointerTarget.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
      ro?.disconnect()
      io?.disconnect()
      webgpu?.destroy()
      if (glCtx && glState) {
        try {
          glCtx.deleteProgram(glState.prog)
          glCtx.deleteTexture(glState.tex)
        } catch {
          /* ignore */
        }
      }
    }
  }, [textureSrc])

  return (
    <div ref={hostRef} className={`hero-mesh${className ? ` ${className}` : ''}`} aria-hidden="true">
      <canvas ref={glRef} className="hero-mesh__gl" />
      <canvas ref={meshRef} className="hero-mesh__mesh" />
      <div className="hero-mesh__scrim" />
      {badge ? (
        <p className="hero-mesh__badge">
          <span className="hero-mesh__dot" />
          <Bi en="Rendered live on your" ar="يُعرض مباشرة على" /> <b>{device}</b>
          {isWebGPU ? (
            <span className="hero-mesh__fps" dir="ltr">
              · WebGPU
            </span>
          ) : null}
          {fps !== null ? (
            <span className="hero-mesh__fps" dir="ltr">
              · {fps} fps
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}