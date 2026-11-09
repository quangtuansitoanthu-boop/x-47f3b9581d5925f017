import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tools = 'C:/Program Files/YT Helper/YT Downloader/Components';
const output = 'output/media-compression-research';
fs.mkdirSync(output, { recursive: true });
function run(binary, args) {
  const result = spawnSync(path.join(tools, `${binary}.exe`), args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error}`);
  return result.stdout;
}
function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : /\.(mp3|m4a|mp4|opus|ogg)$/i.test(file) ? [file] : [];
  });
}
export function probe(file) {
  const data = JSON.parse(run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]));
  return {
    file: file.replaceAll('\\', '/'), bytes: fs.statSync(file).size, duration: Number(data.format.duration),
    streams: data.streams.map(s => ({ type: s.codec_type, codec: s.codec_name, profile: s.profile, width: s.width,
      height: s.height, fps: s.avg_frame_rate, rate: s.sample_rate, channels: s.channels, bitrate: Number(s.bit_rate) || null })),
  };
}
export function ffmpeg(args) { return run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args]); }
if (process.argv[2] === 'video') {
  const inventory = JSON.parse(fs.readFileSync(path.join(output, 'inventory.json')));
  const names = ['fb-video-1590804654-1.mp4', 'fb-video-1592923020-5.mp4', 'fb-video-1668917410-9.mp4', 'fb-video-1703661284-13.mp4'];
  const variants = [
    { name: 'h264-slow-24', args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-threads', '2'] },
    { name: 'h264-slow-28', args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-threads', '2'] },
    { name: 'h264-slow-32', args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '32', '-threads', '2'] },
    { name: 'av1-24', args: ['-c:v', 'libsvtav1', '-preset', '6', '-crf', '24', '-svtav1-params', 'lp=2'] },
    { name: 'av1-30', args: ['-c:v', 'libsvtav1', '-preset', '6', '-crf', '30', '-svtav1-params', 'lp=2'] },
  ];
  const resultsFile = path.join(output, 'video-results.json');
  const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile)) : [];
  fs.mkdirSync(path.join(output, 'video'), { recursive: true });
  for (const name of names) {
    const item = inventory.current.find(x => x.file.endsWith(name));
    for (const fraction of [.1, .5, .85]) {
      const start = Math.floor((item.duration - 12) * fraction);
      const id = `${name.replace('.mp4', '')}-${start}`;
      const reference = path.join(output, 'video', `${id}-ref.mkv`);
      if (!fs.existsSync(reference)) ffmpeg(['-ss', String(start), '-i', item.file, '-t', '12', '-an', '-c:v', 'ffv1', reference]);
      const packets = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-read_intervals', `${start}%+20`, '-show_packets', '-show_entries', 'packet=size,pts_time', '-of', 'json', item.file]));
      const baselinePayloadBytes = packets.packets.filter(p => Number(p.pts_time) >= start && Number(p.pts_time) < start + 12).reduce((sum, p) => sum + Number(p.size), 0);
      for (const variant of variants) {
        if (results.some(x => x.id === id && x.variant === variant.name)) continue;
        const candidate = path.join(output, 'video', `${id}-${variant.name}.mp4`);
        const elapsed = Date.now();
        ffmpeg(['-i', reference, '-an', ...variant.args, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', candidate]);
        const log = path.join(output, 'video', `${id}-${variant.name}-vmaf.json`).replaceAll('\\', '/');
        // Fixed 720px-high viewing raster, rather than native 202px scoring which can hide artifacts.
        ffmpeg(['-i', candidate, '-i', reference, '-filter_complex', `[0:v]settb=1/15,setpts=N,scale=-2:720:flags=bicubic[d];[1:v]settb=1/15,setpts=N,scale=-2:720:flags=bicubic[r];[d][r]libvmaf=n_threads=2:log_fmt=json:log_path=${log}`, '-f', 'null', '-']);
        const score = JSON.parse(fs.readFileSync(log));
        const frames = score.frames.map(f => f.metrics.vmaf).sort((a, b) => a - b);
        const metadata = probe(candidate);
        const row = { id, source: item.file, start, seconds: metadata.duration, variant: variant.name, baselinePayloadBytes,
          bytes: metadata.bytes, videoBitrate: metadata.streams[0].bitrate, meanVmaf: score.pooled_metrics.vmaf.mean,
          p05Vmaf: frames[Math.floor(frames.length * .05)], minVmaf: frames[0], elapsedSeconds: (Date.now() - elapsed) / 1000 };
        results.push(row);
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
        console.log(JSON.stringify(row));
      }
    }
  }
}
if (process.argv[2] === 'rescore') {
  const resultsFile = path.join(output, 'video-results.json');
  const results = JSON.parse(fs.readFileSync(resultsFile));
  for (const row of results) {
    const reference = path.join(output, 'video', `${row.id}-ref.mkv`);
    const candidate = path.join(output, 'video', `${row.id}-${row.variant}.mp4`);
    const log = path.join(output, 'video', `${row.id}-${row.variant}-vmaf.json`).replaceAll('\\', '/');
    // MP4 and Matroska use different timestamp precision; compare frame N with frame N.
    ffmpeg(['-i', candidate, '-i', reference, '-filter_complex', `[0:v]settb=1/15,setpts=N,scale=-2:720:flags=bicubic[d];[1:v]settb=1/15,setpts=N,scale=-2:720:flags=bicubic[r];[d][r]libvmaf=n_threads=2:log_fmt=json:log_path=${log}`, '-f', 'null', '-']);
    const score = JSON.parse(fs.readFileSync(log));
    const frames = score.frames.map(f => f.metrics.vmaf).sort((a, b) => a - b);
    row.meanVmaf = score.pooled_metrics.vmaf.mean;
    row.p05Vmaf = frames[Math.floor(frames.length * .05)];
    row.minVmaf = frames[0];
    row.frameAligned = true;
    console.log(`${row.id} ${row.variant}: ${row.meanVmaf.toFixed(2)}`);
  }
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
}
if (process.argv[2] === 'remux') {
  const inventory = JSON.parse(fs.readFileSync(path.join(output, 'inventory.json')));
  fs.mkdirSync(path.join(output, 'remux'), { recursive: true });
  const results = [];
  for (const item of inventory.current.filter(x => x.file.endsWith('.mp4'))) {
    const candidate = path.join(output, 'remux', path.basename(item.file));
    ffmpeg(['-i', item.file, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-map_metadata', '-1', '-chunk_duration', '500000', '-movflags', '+faststart', candidate]);
    const row = { source: item.file, candidate, before: item.bytes, after: fs.statSync(candidate).size };
    // Compare every encoded packet, including order, per stream. No quality metric is needed for a stream copy.
    for (const type of ['v:0', 'a:0']) {
      const packetHashes = file => JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', type, '-show_packets', '-show_data_hash', 'sha256', '-show_entries', 'packet=data_hash', '-of', 'json', file])).packets.map(x => x.data_hash);
      const before = packetHashes(item.file), after = packetHashes(candidate);
      row[type] = { packets: before.length, identical: before.length === after.length && before.every((hash, index) => hash === after[index]) };
      if (!row[type].identical) throw new Error(`Packet content changed: ${item.file} ${type}`);
    }
    results.push(row);
    fs.writeFileSync(path.join(output, 'remux-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(row));
  }
}
if (process.argv[2] === 'remux-timing') {
  const resultsFile = path.join(output, 'remux-results.json');
  const results = JSON.parse(fs.readFileSync(resultsFile));
  for (const row of results) {
    const source = probe(row.source), candidate = probe(row.candidate);
    row.durationDelta = candidate.duration - source.duration;
    for (const type of ['v:0', 'a:0']) {
      const timestamps = file => JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', type, '-show_packets', '-show_entries', 'packet=pts_time,dts_time,duration_time', '-of', 'json', file])).packets;
      const before = timestamps(row.source), after = timestamps(row.candidate);
      let maxDelta = 0;
      if (before.length !== after.length) throw new Error('Packet count mismatch');
      for (let i = 0; i < before.length; i++) for (const key of ['pts_time', 'dts_time', 'duration_time']) {
        if (before[i][key] !== undefined && after[i][key] !== undefined) maxDelta = Math.max(maxDelta, Math.abs(Number(before[i][key]) - Number(after[i][key])));
      }
      row[type].maxTimestampDeltaSeconds = maxDelta;
      if (maxDelta > .00001) throw new Error(`Timing changed: ${row.source} ${type} ${maxDelta}`);
    }
    console.log(`${row.source}: payload and timing unchanged`);
  }
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
}
if (process.argv[2] === 'audio') {
  const inventory = JSON.parse(fs.readFileSync(path.join(output, 'inventory.json')));
  const results = [];
  fs.mkdirSync(path.join(output, 'audio'), { recursive: true });
  for (const item of inventory.current.filter(x => !x.file.endsWith('.mp4'))) {
    const name = path.basename(item.file, path.extname(item.file));
    const original = inventory.originals.find(x => path.basename(x.file, path.extname(x.file)) === name && !x.file.includes('ambient'));
    const source = original?.file || item.file;
    const start = Math.floor(Math.max(0, item.duration - 24) * .4);
    const seconds = Math.min(24, item.duration - .2);
    const ref = path.join(output, 'audio', `${name}-current.wav`);
    ffmpeg(['-ss', String(start), '-i', item.file, '-t', String(seconds), '-c:a', 'pcm_s16le', ref]);
    const mono = item.streams[0].channels === 1;
    const variants = mono ? [
      { name: 'opus-24', codec: 'libopus', bitrate: '24k', ext: 'opus' },
      { name: 'opus-32', codec: 'libopus', bitrate: '32k', ext: 'opus' },
      { name: 'aac-40', codec: 'aac', bitrate: '40k', ext: 'm4a' },
    ] : [
      { name: 'opus-64', codec: 'libopus', bitrate: '64k', ext: 'opus' },
      { name: 'opus-80', codec: 'libopus', bitrate: '80k', ext: 'opus' },
      { name: 'aac-64', codec: 'aac', bitrate: '64k', ext: 'm4a' },
    ];
    for (const variant of variants) {
      const file = path.join(output, 'audio', `${name}-${variant.name}.${variant.ext}`);
      ffmpeg(['-ss', String(start), '-i', source, '-t', String(seconds), '-vn', '-map_metadata', '-1', '-c:a', variant.codec,
        '-b:a', variant.bitrate, '-ac', String(item.streams[0].channels), ...(variant.codec === 'libopus' ? ['-vbr', 'on', '-compression_level', '10'] : ['-movflags', '+faststart']), file]);
      // Decode to PCM for uniform playback in the local comparison page, including older Safari.
      ffmpeg(['-i', file, '-c:a', 'pcm_s16le', file + '.wav']);
      results.push({ source: item.file, encodeSource: source, start, seconds, candidate: file, variant: variant.name, ...probe(file) });
    }
    console.log(`Audio samples ready: ${name}`);
  }
  fs.writeFileSync(path.join(output, 'audio-results.json'), JSON.stringify(results, null, 2));
}
if (process.argv[2] === 'audio-full') {
  const inventory = JSON.parse(fs.readFileSync(path.join(output, 'inventory.json')));
  const resultsFile = path.join(output, 'audio-full-results.json');
  const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile)) : [];
  for (const item of inventory.current.filter(x => !x.file.endsWith('.mp4'))) {
    const name = path.basename(item.file, path.extname(item.file));
    const original = inventory.originals.find(x => path.basename(x.file, path.extname(x.file)) === name && !x.file.includes('ambient'));
    for (const policy of ['conservative', 'smaller']) {
      if (results.some(x => x.source === item.file && x.policy === policy)) continue;
      const bitrate = item.streams[0].channels === 1 ? (policy === 'smaller' ? '32k' : '40k') : (policy === 'smaller' ? '64k' : '80k');
      const directory = path.join(output, 'audio-full', policy);
      fs.mkdirSync(directory, { recursive: true });
      const candidate = path.join(directory, `${name}.opus`);
      ffmpeg(['-i', original?.file || item.file, '-vn', '-map_metadata', '-1', '-c:a', 'libopus', '-b:a', bitrate,
        '-ac', String(item.streams[0].channels), '-vbr', 'on', '-compression_level', '10', candidate]);
      ffmpeg(['-i', candidate, '-f', 'null', '-']);
      const metadata = probe(candidate);
      const row = { source: item.file, encodeSource: original?.file || item.file, before: item.bytes, policy, bitrate, ...metadata };
      if (Math.abs(metadata.duration - item.duration) > .2) throw new Error(`Duration mismatch: ${candidate}`);
      results.push(row);
      fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
      console.log(JSON.stringify(row));
    }
  }
}
if (process.argv[2] === 'audit') {
  const current = [...walk('assets/audio'), ...walk('static/videos')].map(probe);
  const originals = [...walk('../tutam-main/assets/audio'), ...walk('../tutam-main/scratch/processed_videos')].map(probe);
  fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify({ current, originals }, null, 2));
  for (const row of current) console.log(JSON.stringify(row));
}
