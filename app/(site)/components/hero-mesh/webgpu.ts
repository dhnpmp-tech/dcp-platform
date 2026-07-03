// webgpu.ts — WebGPU port of the HeroMeshCanvas background renderer.
//
// Draws the SAME scene as the WebGL fragment shader in HeroMeshCanvas.tsx:
// one fullscreen triangle, one sampled texture, and a fragment stage doing
// cover-fit UV mapping, slow zoom breathing, pointer parallax, luminance-as-
// depth parallax, the soft pointer light, the diagonal teal sweep, hash film
// grain and the radial vignette. Every constant is copied 1:1 from the GLSL
// source — if you tune a number there, tune it here too or the two backends
// drift apart visually.
//
// Dependency-free on purpose: @webgpu/types is NOT installed (tsconfig stays
// untouched), so the small slice of the WebGPU API this module touches is
// shimmed locally below and feature detection goes through `(navigator as
// any).gpu`. The shims are `any`-payload by design — runtime validation is
// the browser's job, ours is just to not lie about method names.

// ---------- minimal local type shims (replaces @webgpu/types) ----------

type GPUTextureShim = { createView(): any; destroy(): void }
type GPUBufferShim = { destroy(): void }
type GPUQueueShim = {
  writeBuffer(buffer: GPUBufferShim, offset: number, data: ArrayBufferView): void
  writeTexture(dest: any, data: ArrayBufferView, layout: any, size: any): void
  copyExternalImageToTexture(source: any, dest: any, size: any): void
  submit(commands: any[]): void
}
type GPUDeviceShim = {
  queue: GPUQueueShim
  lost?: Promise<unknown>
  createShaderModule(desc: any): any
  createBuffer(desc: any): GPUBufferShim
  createTexture(desc: any): GPUTextureShim
  createSampler(desc: any): any
  createRenderPipeline(desc: any): any
  createRenderPipelineAsync?(desc: any): Promise<any>
  createBindGroup(desc: any): any
  createCommandEncoder(): any
  destroy(): void
}
type GPUCanvasContextShim = {
  configure(desc: any): void
  getCurrentTexture(): GPUTextureShim
}

// Spec-fixed numeric usage flags, inlined so we depend on neither the
// GPUBufferUsage/GPUTextureUsage runtime globals nor the types package.
const BUFFER_USAGE_UNIFORM = 0x40
const BUFFER_USAGE_COPY_DST = 0x08
const TEXTURE_USAGE_COPY_DST = 0x02
const TEXTURE_USAGE_TEXTURE_BINDING = 0x04
// copyExternalImageToTexture requires RENDER_ATTACHMENT on the destination
// (implementations may blit through a render pass to do color conversion).
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10

// ---------- the shader ----------
//
// Same coordinate conventions as the WebGL path: vUv.y = 1 at the top of the
// canvas (WebGL clip space and WebGPU NDC agree on +y up), the image is
// stored top-row-first in both APIs, and uMouse arrives already y-flipped
// (tg.y = 1 - pointerY/height) from the component. So the GLSL math ports
// line-for-line; only syntax changes.
//
// One deliberate rewrite: GLSL's smoothstep(0.38, 0.0, d) uses a reversed
// edge order that GLSL leaves undefined and newer WGSL validators reject —
// (1.0 - smoothstep(0.0, 0.38, d)) is the exact same curve, well-defined.
const WGSL = /* wgsl */ `
struct Uniforms {
  res   : vec2f,  // canvas size in device pixels
  mouse : vec2f,  // smoothed pointer, normalised, y-up
  img   : vec2f,  // texture natural size (for cover-fit aspect)
  time  : f32,    // seconds
  light : f32,    // pointer-light presence, eased 0..1
}
@group(0) @binding(0) var<uniform> u : Uniforms;
@group(0) @binding(1) var uSamp : sampler;
@group(0) @binding(2) var uTex : texture_2d<f32>;

struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
}

@vertex fn vs(@builtin(vertex_index) i : u32) -> VSOut {
  // the classic fullscreen triangle: (-1,-1) (3,-1) (-1,3)
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out : VSOut;
  out.pos = vec4f(p[i], 0.0, 1.0);
  out.uv = p[i] * 0.5 + 0.5;
  return out;
}

fn hash(p : vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

@fragment fn fs(in : VSOut) -> @location(0) vec4f {
  let vUv = in.uv;
  // cover-fit: scale UVs so the image fills the canvas regardless of aspect
  let sa = u.res.x / u.res.y;
  let ia = u.img.x / u.img.y;
  var uv = vUv;
  uv.y = 1.0 - uv.y;
  let sc = select(vec2f(sa / ia, 1.0), vec2f(1.0, ia / sa), sa > ia);
  uv = (uv - 0.5) * sc + 0.5;
  // slow zoom breathing + whole-image pointer parallax
  let m = u.mouse - 0.5;
  let zoom = 1.0 - 0.035 - 0.01 * sin(u.time * 0.4);
  uv = (uv - 0.5) * zoom + 0.5 - m * 0.02;
  // luminance-as-depth: bright pixels shift more with the pointer
  let lum = dot(textureSample(uTex, uSamp, uv).rgb, vec3f(0.299, 0.587, 0.114));
  let par = m * (lum - 0.35) * 0.028 * u.light;
  var col = textureSample(uTex, uSamp, uv + par).rgb;
  // soft pointer light — multiplicative lift + a whisper of teal
  let d = distance(vUv, u.mouse);
  let glow = (1.0 - smoothstep(0.0, 0.38, d)) * u.light;
  col += col * glow * (0.30 + lum * 0.35);
  col += vec3f(0.10, 0.83, 0.71) * glow * 0.03;
  // diagonal teal sweep
  let sweep = smoothstep(0.0, 0.5, sin((uv.x + uv.y) * 2.2 - u.time * 0.5) * 0.5 + 0.5);
  col += vec3f(0.10, 0.83, 0.71) * sweep * 0.04;
  // film grain + radial vignette
  col += (hash(vUv * u.res + vec2f(u.time)) - 0.5) * 0.03;
  col *= 1.0 - 0.26 * length(vUv - 0.5);
  return vec4f(col, 1.0);
}
`

// ---------- public surface ----------

export interface HeroWebGPURenderer {
  /** Swap the 1×1 navy placeholder for the decoded hero image. Tracks the
   *  image aspect internally (the uImg uniform), like imgWH on the GL path. */
  setTexture(img: HTMLImageElement): void
  /** Render one frame. Mirrors the WebGL uniform upload + draw call:
   *  time in seconds, smoothed pointer (y-up, 0..1), light presence 0..1.
   *  Resolution is read from the canvas each frame, so resize needs no call. */
  render(timeSec: number, mouseX: number, mouseY: number, light: number): void
  /** Release GPU resources. Safe to call once; render() becomes a no-op. */
  destroy(): void
}

/**
 * Try to bring up the WebGPU background on `canvas`. Returns null when
 * WebGPU is absent or any setup step fails — and, crucially, does not touch
 * the canvas until adapter, device AND pipeline have all validated, because
 * getContext('webgpu') claims the canvas permanently and would break the
 * WebGL fallback path.
 */
export async function initHeroWebGPU(canvas: HTMLCanvasElement): Promise<HeroWebGPURenderer | null> {
  try {
    const gpu = (navigator as any).gpu
    if (!gpu) return null
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) return null
    const device: GPUDeviceShim = await adapter.requestDevice()
    if (!device) return null

    const format: string = gpu.getPreferredCanvasFormat ? gpu.getPreferredCanvasFormat() : 'bgra8unorm'
    const shaderModule = device.createShaderModule({ code: WGSL })

    // Validate the pipeline BEFORE claiming the canvas: createRenderPipelineAsync
    // rejects on shader/pipeline errors, which lets us still fall back to WebGL.
    const pipelineDesc = {
      layout: 'auto',
      vertex: { module: shaderModule, entryPoint: 'vs' },
      fragment: { module: shaderModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    }
    const pipeline = device.createRenderPipelineAsync
      ? await device.createRenderPipelineAsync(pipelineDesc)
      : device.createRenderPipeline(pipelineDesc)

    // Everything validated — now it is safe to take the canvas.
    const context = canvas.getContext('webgpu') as unknown as GPUCanvasContextShim | null
    if (!context) {
      device.destroy()
      return null
    }
    context.configure({ device, format, alphaMode: 'opaque' })

    // uniforms: res(vec2) mouse(vec2) img(vec2) time(f32) light(f32) = 32 bytes
    const uniformData = new Float32Array(8)
    const uniformBuf = device.createBuffer({
      size: uniformData.byteLength,
      usage: BUFFER_USAGE_UNIFORM | BUFFER_USAGE_COPY_DST,
    })

    const sampler = device.createSampler({
      // matches the WebGL texture params: LINEAR min/mag, CLAMP_TO_EDGE wrap
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    // 1×1 near-black navy placeholder, same bytes as the WebGL bootstrap
    // texture, so the first frames look identical while the image decodes.
    const texUsage = TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_RENDER_ATTACHMENT
    let texture = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: texUsage })
    device.queue.writeTexture({ texture }, new Uint8Array([5, 10, 20, 255]), { bytesPerRow: 4 }, [1, 1])

    const makeBindGroup = () =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuf } },
          { binding: 1, resource: sampler },
          { binding: 2, resource: texture.createView() },
        ],
      })
    let bindGroup = makeBindGroup()

    let imgWH: [number, number] = [16, 9] // same pre-load default as the GL path
    let destroyed = false
    // a lost device can't render; flip the switch so render() goes quiet
    // instead of submitting into the void every frame
    device.lost?.then(() => {
      destroyed = true
    })

    return {
      setTexture(img: HTMLImageElement) {
        // decode via ImageBitmap — the most widely supported source kind for
        // copyExternalImageToTexture (plain HTMLImageElement is newer spec)
        createImageBitmap(img)
          .then((bmp) => {
            if (destroyed) {
              bmp.close()
              return
            }
            const next = device.createTexture({
              size: [bmp.width, bmp.height],
              format: 'rgba8unorm',
              usage: texUsage,
            })
            device.queue.copyExternalImageToTexture({ source: bmp }, { texture: next }, [bmp.width, bmp.height])
            texture.destroy()
            texture = next
            imgWH = [bmp.width, bmp.height]
            bindGroup = makeBindGroup()
            bmp.close()
          })
          .catch(() => {
            /* keep the navy placeholder — same failure look as the GL path */
          })
      },

      render(timeSec: number, mouseX: number, mouseY: number, light: number) {
        if (destroyed || canvas.width === 0 || canvas.height === 0) return
        uniformData[0] = canvas.width
        uniformData[1] = canvas.height
        uniformData[2] = mouseX
        uniformData[3] = mouseY
        uniformData[4] = imgWH[0]
        uniformData[5] = imgWH[1]
        uniformData[6] = timeSec
        uniformData[7] = light
        device.queue.writeBuffer(uniformBuf, 0, uniformData)

        const encoder = device.createCommandEncoder()
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        })
        pass.setPipeline(pipeline)
        pass.setBindGroup(0, bindGroup)
        pass.draw(3)
        pass.end()
        device.queue.submit([encoder.finish()])
      },

      destroy() {
        if (destroyed) return
        destroyed = true
        try {
          texture.destroy()
          uniformBuf.destroy()
          device.destroy()
        } catch {
          /* ignore — device may already be lost */
        }
      },
    }
  } catch {
    // any throw anywhere above (no adapter, validation error, misbehaving
    // driver) means "not today" — the caller falls back to WebGL
    return null
  }
}
