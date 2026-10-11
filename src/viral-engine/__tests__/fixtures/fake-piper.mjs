// Faux Piper : lit le texte sur l'entrée, écrit 1 s de WAV là où dit « -f ».
import { writeFileSync } from "node:fs";
const out = process.argv[process.argv.indexOf("-f") + 1];
const rate = 22050;
const b = Buffer.alloc(44 + rate * 2);
b.write("RIFF", 0); b.writeUInt32LE(36 + rate * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(rate * 2, 40);
process.stdin.resume();
process.stdin.on("end", () => writeFileSync(out, b));
