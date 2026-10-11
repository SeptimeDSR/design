// PCM 16 bits mono, le format le plus simple que Remotion, ffmpeg et WhatsApp lisent tous.
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Parcourt les chunks : les WAV de Piper ou Kokoro n'ont pas forcément "data" à l'octet 36.
export function wavDurationMs(buf: Buffer): number {
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.subarray(offset, offset + 4).toString();
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(offset + 16);
    if (id === "data" && byteRate) return Math.round((size / byteRate) * 1000);
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV invalide : chunk data introuvable");
}

// Lit un WAV PCM 16 bits ou flottant 32 bits (Piper, Kokoro, Chatterbox) ; le stéréo est ramené en mono.
export function decodeWav(buf: Buffer): { samples: Float32Array; sampleRate: number } {
  if (buf.length < 12 || buf.subarray(0, 4).toString() !== "RIFF" || buf.subarray(8, 12).toString() !== "WAVE") throw new Error("pas un WAV");
  let offset = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | undefined;
  while (offset + 8 <= buf.length) {
    const id = buf.subarray(offset, offset + 4).toString();
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") fmt = { format: buf.readUInt16LE(offset + 8), channels: buf.readUInt16LE(offset + 10), rate: buf.readUInt32LE(offset + 12), bits: buf.readUInt16LE(offset + 22) };
    if (id === "data" && fmt) {
      const bytes = fmt.bits / 8;
      const frames = Math.floor(Math.min(size, buf.length - offset - 8) / (bytes * fmt.channels));
      const out = new Float32Array(frames);
      const read = fmt.format === 3 && fmt.bits === 32 ? (p: number) => buf.readFloatLE(p) : fmt.format === 1 && fmt.bits === 16 ? (p: number) => buf.readInt16LE(p) / 32768 : undefined;
      if (!read) throw new Error(`WAV non géré (format ${fmt.format}, ${fmt.bits} bits)`);
      for (let i = 0; i < frames; i++) {
        let v = 0;
        for (let c = 0; c < fmt.channels; c++) v += read(offset + 8 + (i * fmt.channels + c) * bytes);
        out[i] = v / fmt.channels;
      }
      return { samples: out, sampleRate: fmt.rate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV invalide : chunk data introuvable");
}

// Voix au niveau des réseaux sociaux : ~ -16 dBFS RMS, crête plafonnée à -1 dBFS. Un WAV illisible ressort tel quel.
export function normalizeSpeech(buf: Buffer, targetRms = 0.158, peakLimit = 0.89): Buffer {
  let wav: { samples: Float32Array; sampleRate: number };
  try {
    wav = decodeWav(buf);
  } catch {
    return buf;
  }
  let peak = 0;
  let sum = 0;
  for (const v of wav.samples) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const rms = Math.sqrt(sum / Math.max(1, wav.samples.length));
  if (rms < 1e-4) return buf;
  const gain = Math.min(targetRms / rms, peakLimit / peak);
  return encodeWav(wav.samples.map((v) => v * gain), wav.sampleRate);
}
