const VERTEX = `attribute vec2 position; varying vec2 uv;
void main(){ uv=position*.5+.5; gl_Position=vec4(position,0.,1.); }`;
const FRAGMENT = `precision mediump float;
varying vec2 uv;
uniform sampler2D scene;
uniform vec2 size;
uniform vec4 waves[8];
void main(){
  vec2 p=vec2(uv.x,1.-uv.y)*size;
  vec2 displacement=vec2(0.);
  float light=0.; float coverage=0.;
  for(int i=0;i<8;i++){
    vec4 w=waves[i];
    if(w.w>0.){
      vec2 d=p-w.xy; float distance=length(d);
      float band=distance-w.z;
      if(abs(band)<55.){
        float envelope=max(0.,1.-abs(band)/55.);
        envelope=envelope*envelope*w.w;
        float slope=cos(band*.32)*envelope;
        displacement+=d/max(distance,1.)*slope*5.;
        light+=slope*.28;
        coverage=max(coverage,envelope);
      }
    }
  }
  if(coverage<.003) discard;
  vec2 sampleUv=clamp((p+displacement)/size,vec2(0.),vec2(1.));
  vec3 color=texture2D(scene,sampleUv).rgb;
  color=mix(color,vec3(1.),max(light,0.));
  color*=1.+min(light,0.);
  gl_FragColor=vec4(color,clamp(coverage*3.,0.,1.));
}`;

interface Wave { x: number; y: number; started: number; strength: number }

/** Lớp nước chỉ đọc hình hạt hiện có; không sở hữu số niệm hay dữ liệu phiên. */
export function createRosaryWater(area: HTMLElement, canvas: HTMLCanvasElement, options?: {
  canStartPointer?: (event: PointerEvent) => boolean;
  paintBackground?: (context: CanvasRenderingContext2D, bounds: DOMRect) => void;
  maxFrameRate?: number;
}) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, preserveDrawingBuffer: false });
  const source = document.createElement('canvas');
  const context = source.getContext('2d');
  let enabled = false;
  let disposed = false;
  let frame = 0;
  let lastDraw = 0;
  const minFrameInterval = options?.maxFrameRate ? 1000 / options.maxFrameRate : 0;
  let activePointer: number | null = null;
  let pending: { x: number; y: number } | null = null;
  let lastPoint: { x: number; y: number; time: number } | null = null;
  let waves: Wave[] = [];
  let sceneDirty = true;
  const shaders: WebGLShader[] = [];
  const program = gl?.createProgram();
  const buffer = gl?.createBuffer();
  const texture = gl?.createTexture();
  let ready = Boolean(gl && context && program && buffer && texture);
  if (gl && program && buffer && texture) {
    for (const [type, code] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type);
      if (!shader) { ready = false; break; }
      shaders.push(shader);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { ready = false; break; }
      gl.attachShader(program, shader);
    }
    if (ready) {
      gl.linkProgram(program);
      ready = Boolean(gl.getProgramParameter(program, gl.LINK_STATUS));
    }
    if (ready) {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
  }
  canvas.dataset.waterReady = String(ready);
  canvas.dataset.waterActive = 'false';
  const sizeLocation = gl && program ? gl.getUniformLocation(program, 'size') : null;
  const wavesLocation = gl && program ? gl.getUniformLocation(program, 'waves[0]') : null;
  if (ready && gl) {
    // Hoàn tất pipeline ở kích thước 1px trước thao tác đầu, tránh JIT làm chậm lần niệm đầu.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.uniform2f(sizeLocation, 1, 1);
    gl.viewport(0, 0, 1, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.finish();
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function clear() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastDraw = 0;
    waves = [];
    pending = lastPoint = null;
    activePointer = null;
    gl?.clear(gl.COLOR_BUFFER_BIT);
    canvas.dataset.waterActive = 'false';
  }

  function add(x: number, y: number, strength = 1) {
    if (!ready || !enabled || disposed || document.hidden) return;
    if (!waves.length) sceneDirty = true;
    waves.push({ x, y, started: performance.now(), strength });
    if (waves.length > 8) waves.shift();
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function draw(now: number) {
    frame = 0;
    if (!enabled || disposed || document.hidden || !gl || !context || !ready) { clear(); return; }
    if (lastDraw && now - lastDraw < minFrameInterval - 1) {
      frame = requestAnimationFrame(draw);
      return;
    }
    lastDraw = now;
    if (pending) {
      const point = pending;
      pending = null;
      if (!lastPoint || (now-lastPoint.time >= 55 && Math.hypot(point.x-lastPoint.x, point.y-lastPoint.y) >= 14)) {
        add(point.x, point.y, .65);
        lastPoint = { ...point, time: now };
      }
    }
    waves = waves.filter(wave => now-wave.started < 1350);
    if (!waves.length) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      canvas.dataset.waterActive = 'false';
      return;
    }
    const bounds = area.getBoundingClientRect();
    // Giới hạn độ phân giải, số sóng và chỉ render trong lúc nước còn chuyển động.
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 900 / Math.max(bounds.width, bounds.height, 1));
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = source.width = width;
      canvas.height = source.height = height;
      sceneDirty = true;
    }
    if (sceneDirty || area.classList.contains('animating')) {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const host = area.closest('.tt-rosary') ?? area;
      const hostStyle = getComputedStyle(host);
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.fillStyle = hostStyle.getPropertyValue('--bg');
      context.fillRect(0, 0, bounds.width, bounds.height);
      // Đọc hai stop từ gradient thật của màn, không chép bảng màu vào renderer.
      const background = hostStyle.backgroundImage;
      if (background.startsWith('linear-gradient(')) {
        const parts: string[] = [];
        let depth = 0; let start = 16;
        for (let i = start; i < background.length - 1; i++) {
          if (background[i] === '(') depth++;
          if (background[i] === ')') depth--;
          if (background[i] === ',' && depth === 0) { parts.push(background.slice(start, i).trim()); start = i + 1; }
        }
        parts.push(background.slice(start, -1).trim());
        const last = parts[1]?.match(/^(.*)\s+([\d.]+)%$/);
        if (parts.length === 2 && last) {
          const hostBounds = host.getBoundingClientRect();
          const top = hostBounds.top - bounds.top;
          const gradient = context.createLinearGradient(0, top, 0, top + hostBounds.height * Number(last[2]) / 100);
          gradient.addColorStop(0, parts[0]);
          gradient.addColorStop(1, last[1]);
          context.fillStyle = gradient;
          context.fillRect(0, 0, bounds.width, bounds.height);
        }
      }
      options?.paintBackground?.(context, bounds);
      const beads = Array.from(area.querySelectorAll<HTMLElement>('.tt-rosary__bead'));
      beads.sort((a,b) => Number(getComputedStyle(a).zIndex)-Number(getComputedStyle(b).zIndex));
      for (const bead of beads) {
        const image = bead.querySelector('img');
        if (!image?.complete || !image.naturalWidth) continue;
        const style = getComputedStyle(bead);
        const matrix = new DOMMatrix(style.transform);
        const beadWidth = bead.offsetWidth;
        const beadHeight = bead.offsetHeight;
        context.save();
        context.globalAlpha = Number(style.opacity);
        context.translate(bounds.width / 2, area.clientHeight / 2);
        context.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
        // Cùng ảnh, tỉ lệ contain và bóng đang dùng trên hạt DOM.
        context.filter = style.filter;
        const scale = Math.min(beadWidth / image.naturalWidth, beadHeight / image.naturalHeight);
        const w = image.naturalWidth * scale; const h = image.naturalHeight * scale;
        context.drawImage(image, -w/2, -h/2, w, h);
        context.restore();
      }
      gl.bindTexture(gl.TEXTURE_2D, texture ?? null);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      sceneDirty = false;
    }
    gl.viewport(0, 0, width, height);
    gl.uniform2f(sizeLocation, bounds.width, bounds.height);
    const uniforms = new Float32Array(32);
    waves.forEach((wave, index) => {
      const age = (now-wave.started)/1000;
      uniforms.set([wave.x, wave.y, 12+age*155, Math.pow(Math.max(0,1-age/1.35),1.3)*wave.strength], index*4);
    });
    gl.uniform4fv(wavesLocation, uniforms);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    canvas.dataset.waterActive = 'true';
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function point(event: PointerEvent) {
    const bounds = area.getBoundingClientRect();
    return { x: event.clientX-bounds.left, y: event.clientY-bounds.top };
  }
  function pointerDown(event: PointerEvent) {
    if (!enabled || event.isPrimary === false || event.button !== 0 || activePointer !== null) return;
    // Dải hạt có feedback riêng sau khi owner chấp nhận lần niệm.
    const target = point(event);
    if (options?.canStartPointer ? !options.canStartPointer(event) : Math.abs(target.x-area.clientWidth/2) <= 70) return;
    activePointer = event.pointerId;
    lastPoint = { ...target, time: performance.now() };
    add(target.x, target.y, .65);
  }
  function pointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointer) return;
    pending = point(event);
    if (enabled && !frame) frame = requestAnimationFrame(draw);
  }
  function pointerEnd(event: PointerEvent) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    pending = lastPoint = null;
  }
  function visibilityChanged() { if (document.hidden) clear(); }
  function contextLost(event: Event) { event.preventDefault(); ready = false; canvas.dataset.waterReady = 'false'; clear(); }
  area.addEventListener('pointerdown', pointerDown);
  area.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  document.addEventListener('visibilitychange', visibilityChanged);
  canvas.addEventListener('webglcontextlost', contextLost);
  const themeObserver = new MutationObserver(() => { sceneDirty = true; });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return {
    setEnabled(value: boolean) { enabled = value; if (!value) clear(); },
    invalidate() { sceneDirty = true; },
    pulse() { add(area.clientWidth/2, area.clientHeight/2); },
    destroy() {
      disposed = true;
      clear();
      area.removeEventListener('pointerdown', pointerDown);
      area.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerEnd);
      window.removeEventListener('pointercancel', pointerEnd);
      document.removeEventListener('visibilitychange', visibilityChanged);
      canvas.removeEventListener('webglcontextlost', contextLost);
      themeObserver.disconnect();
      shaders.forEach(shader => gl?.deleteShader(shader));
      if (buffer) gl?.deleteBuffer(buffer);
      if (texture) gl?.deleteTexture(texture);
      if (program) gl?.deleteProgram(program);
    },
  };
}
