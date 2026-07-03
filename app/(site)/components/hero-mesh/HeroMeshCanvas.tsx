'use client'

// HeroMeshCanvas — "v3 combo" hero: a WebGL texture background (the
// Higgsfield mesh image, kept gently alive with parallax + grain + a teal
// sweep) overlaid by an interactive Canvas 2D node mesh that ignites under
// the cursor/finger and propagates the signal to its neighbours. An honest
// device badge names the GPU actually rendering the frame.
//
// Ported faithfully from components/hero-mesh/_prototype/hero-v3.html with
// production hardening: prefers-reduced-motion → static frame, rAF paused
// when off-screen (IntersectionObserver) or tab hidden (visibilitychange),
// DPR capped at 2, node count scaled to viewport, reserved aspect-ratio box
// for zero CLS. Palette comes from dcp-kit tokens (--teal/--orange), not hex.

import { useEffect, useRef, useState } from 'react'
import { Bi } from '../../lib/i18n'
import './hero-mesh.css'

interface HeroMeshCanvasProps {
  className?: string
  /** Show the honest "Rendered live on your <device>" badge. @default true */
  badge?: boolean
  /** WebGL background texture. @default '/hero/hero-mesh-bg.webp' */
  textureSrc?: string
}

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

export function HeroMeshCanvas({ className, badge = true, textureSrc = '/hero/hero-mesh-bg.webp' }: HeroMeshCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const glRef = useRef<HTMLCanvasElement>(null)
  const meshRef = useRef<HTMLCanvasElement>(null)
  const [device, setDevice] = useState<string>('device')

  useEffect(() => {
    const host = hostRef.current
    const glCv = glRef.current
    const meshCv = meshRef.current
    if (!host || !glCv || !meshCv) return

    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // ---------- WebGL background ----------
    const gl = glCv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
    setDevice(detectDevice(gl))

    type Gl = {
      prog: WebGLProgram
      u: { t: WebGLUniformLocation | null; r: WebGLUniformLocation | null; m: WebGLUniformLocation | null; img: WebGLUniformLocation | null; tex: WebGLUniformLocation | null }
      tex: WebGLTexture
    }
    let glState: Gl | null = null
    let imgWH: [number, number] = [16, 9]

    if (gl) {
      const VERT = `attribute vec2 p;varying vec2 vUv;void main(){vUv=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}`
      const FRAG = `precision highp float;uniform sampler2D uTex;uniform float uTime;uniform vec2 uRes;uniform vec2 uMouse;uniform vec2 uImg;varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){float sa=uRes.x/uRes.y,ia=uImg.x/uImg.y;vec2 uv=vUv;uv.y=1.-uv.y;
vec2 sc=sa>ia?vec2(1.,ia/sa):vec2(sa/ia,1.);uv=(uv-0.5)*sc+0.5;
vec2 m=uMouse-0.5;float zoom=1.0-0.035-0.01*sin(uTime*0.4);uv=(uv-0.5)*zoom+0.5-m*0.02;
vec3 col=texture2D(uTex,uv).rgb;
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

      const im = new Image()
      im.crossOrigin = 'anonymous'
      im.onload = () => {
        imgWH = [im.width, im.height]
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im)
      }
      im.src = textureSrc

      glState = {
        prog,
        u: {
          t: gl.getUniformLocation(prog, 'uTime'),
          r: gl.getUniformLocation(prog, 'uRes'),
          m: gl.getUniformLocation(prog, 'uMouse'),
          img: gl.getUniformLocation(prog, 'uImg'),
          tex: gl.getUniformLocation(prog, 'uTex'),
        },
        tex,
      }
    }

    // ---------- Canvas 2D mesh ----------
    const ctx = meshCv.getContext('2d')
    type Node = { x: number; y: number; a: number; base: number; nb: number[] }
    let nodes: Node[] = []
    let edges: [number, number][] = []
    let W = 0
    let H = 0

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
      if (gl && glState) gl.viewport(0, 0, glCv.width, glCv.height)

      const target = Math.min(220, Math.max(70, (W * H) / 11000))
      const cols = Math.max(4, Math.round(Math.sqrt((target * W) / H)))
      const rows = Math.max(3, Math.round(target / cols))
      const cw = W / cols
      const ch = H / rows
      nodes = []
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          nodes.push({
            x: (x + 0.5) * cw + (Math.random() - 0.5) * cw * 0.75,
            y: (y + 0.5) * ch + (Math.random() - 0.5) * ch * 0.75,
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

    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      ms.x = e.clientX - rect.left
      ms.y = e.clientY - rect.top
      tg.x = (e.clientX - rect.left) / rect.width
      tg.y = 1 - (e.clientY - rect.top) / rect.height
    }
    const onLeave = () => {
      ms.x = -9999
      ms.y = -9999
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

    function frame(now: number) {
      if (!running) return
      const t = now * 0.001

      // WebGL background
      if (gl && glState && glCv) {
        mo.x += (tg.x - mo.x) * 0.05
        mo.y += (tg.y - mo.y) * 0.05
        gl.useProgram(glState.prog)
        gl.uniform1f(glState.u.t, t)
        gl.uniform2f(glState.u.r, glCv.width, glCv.height)
        gl.uniform2f(glState.u.m, mo.x, mo.y)
        gl.uniform2f(glState.u.img, imgWH[0], imgWH[1])
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, glState.tex)
        gl.uniform1i(glState.u.tex, 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }

      // Canvas 2D mesh — the cursor leaves a QUIET trace, not a floodlight:
      // small ignite radius, soft partial activation, short propagation, and
      // no additive glow blobs. The mesh should read as circuitry waking up,
      // never as a bright wash over the artwork.
      if (ctx) {
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
        ctx.clearRect(0, 0, W, H)
        ctx.lineWidth = 1
        for (const [i, j] of edges) {
          const a = Math.max(nodes[i].a, nodes[j].a)
          const tt = (nodes[i].base + nodes[j].base) * 0.5
          const c = mix(mix(TEAL, AMBER, tt), mix(AMBER, TEAL, tt), a)
          ctx.strokeStyle = rgba(c, 0.045 + a * 0.18)
          ctx.beginPath()
          ctx.moveTo(nodes[i].x, nodes[i].y)
          ctx.lineTo(nodes[j].x, nodes[j].y)
          ctx.stroke()
        }
        for (const n of nodes) {
          const c = mix(mix(TEAL, AMBER, n.base), mix(AMBER, TEAL, n.base), n.a)
          ctx.globalAlpha = 0.3 + n.a * 0.4
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

    if (reduced) {
      // one static frame, no rAF
      frame(performance.now())
      cancelAnimationFrame(raf) // frame() schedules another; cancel it
      running = false
    } else {
      raf = requestAnimationFrame(frame)
    }

    return () => {
      running = false
      cancelAnimationFrame(raf)
      pointerTarget.removeEventListener('pointermove', onMove)
      pointerTarget.removeEventListener('pointerdown', onMove)
      pointerTarget.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
      ro?.disconnect()
      io?.disconnect()
      if (gl && glState) {
        try {
          gl.deleteProgram(glState.prog)
          gl.deleteTexture(glState.tex)
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
        </p>
      ) : null}
    </div>
  )
}