import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import type { CDPSession, Page } from "playwright";

const SCREENCAST_FPS = 25;
const DEFAULT_JPEG_QUALITY = 95;

type RecorderSize = { width: number; height: number };

type RecorderOptions = {
  page: Page;
  outputPath: string;
  size: RecorderSize;
  jpegQuality?: number;
};

type ScreencastFramePayload = {
  data: string;
  sessionId: number;
  metadata?: {
    timestamp?: number;
  };
};

type QueuedFrame = {
  buffer: Buffer;
  frameNumber: number;
  timestampS: number;
};

function formatFfmpegError(outputPath: string, chunks: string[], code: number | null, signal: NodeJS.Signals | null) {
  const details = chunks.join("").trim();
  const suffix = details ? ` ${details}` : "";
  return new Error(
    `[capture] screencast ffmpeg failed for ${path.basename(outputPath)} ` +
      `(exit=${code ?? "null"} signal=${signal ?? "null"}).${suffix}`,
  );
}

/**
 * Landing-only high-quality screencast recorder.
 *
 * This intentionally mirrors Playwright's timestamp -> repeated-frame logic so
 * capture timing stays stable, but it swaps out the low-quality built-in VP8
 * stage for a much higher fidelity intermediate encode.
 */
export class ScreencastRecorder {
  readonly startedAtWallMs: number;

  private readonly client: CDPSession;
  private readonly outputPath: string;
  private readonly ffmpeg: ChildProcess;
  private readonly ffmpegClosed: Promise<void>;
  private readonly onFrame: (payload: ScreencastFramePayload) => void;

  private firstFrameTimestampS = 0;
  private lastFrame: QueuedFrame | null = null;
  private lastWriteNodeMs = 0;
  private frameQueue: Buffer[] = [];
  private lastWritePromise: Promise<void> = Promise.resolve();
  private stopped = false;

  private constructor(
    client: CDPSession,
    outputPath: string,
    ffmpeg: ChildProcess,
    ffmpegClosed: Promise<void>,
    startedAtWallMs: number,
  ) {
    this.client = client;
    this.outputPath = outputPath;
    this.ffmpeg = ffmpeg;
    this.ffmpegClosed = ffmpegClosed;
    this.startedAtWallMs = startedAtWallMs;
    this.onFrame = (payload) => {
      this.handleFrame(payload);
    };
  }

  static async start(options: RecorderOptions): Promise<ScreencastRecorder> {
    await mkdir(path.dirname(options.outputPath), { recursive: true });

    const ffmpegArgs = [
      "-loglevel", "error",
      "-f", "image2pipe",
      "-avioflags", "direct",
      "-fpsprobesize", "0",
      "-probesize", "32",
      "-analyzeduration", "0",
      "-c:v", "mjpeg",
      "-i", "pipe:0",
      "-y",
      "-an",
      "-r", String(SCREENCAST_FPS),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "6",
      "-pix_fmt", "yuv420p",
      "-vf", `pad=${options.size.width}:${options.size.height}:0:0:gray,crop=${options.size.width}:${options.size.height}:0:0`,
      options.outputPath,
    ];
    const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
      stdio: ["pipe", "ignore", "pipe"],
    });
    if (!ffmpeg.stdin) {
      throw new Error("[capture] screencast ffmpeg stdin unavailable");
    }

    const ffmpegStderr: string[] = [];
    const ffmpegClosed = new Promise<void>((resolve, reject) => {
      ffmpeg.once("error", reject);
      ffmpeg.once("close", (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(formatFfmpegError(options.outputPath, ffmpegStderr, code, signal));
      });
    });

    // We need the instance before wiring the close handler's error formatter.
    const client = await options.page.context().newCDPSession(options.page);
    const startedAtWallMs = performance.now();
    const recorder = new ScreencastRecorder(
      client,
      options.outputPath,
      ffmpeg,
      ffmpegClosed,
      startedAtWallMs,
    );
    ffmpeg.stderr?.on("data", (chunk: Buffer | string) => {
      ffmpegStderr.push(
        typeof chunk === "string" ? chunk : chunk.toString("utf-8"),
      );
    });
    ffmpeg.stdin?.on("error", () => {
      /* surfaced by the ffmpegClosed promise */
    });

    client.on("Page.screencastFrame", recorder.onFrame);
    await client.send("Page.enable");
    await client.send("Page.startScreencast", {
      format: "jpeg",
      quality: options.jpegQuality ?? DEFAULT_JPEG_QUALITY,
      maxWidth: options.size.width,
      maxHeight: options.size.height,
      everyNthFrame: 1,
    });
    return recorder;
  }

  async stop(): Promise<string> {
    if (this.stopped) return this.outputPath;
    this.stopped = true;

    this.client.off("Page.screencastFrame", this.onFrame);
    await this.client.send("Page.stopScreencast").catch(() => {
      /* page/context may already be closing */
    });

    if (!this.lastFrame) {
      throw new Error("[capture] screencast stopped before any frames were received");
    }

    const tailSeconds = Math.max((performance.now() - this.lastWriteNodeMs) / 1000, 1);
    this.writeFrame(Buffer.alloc(0), this.lastFrame.timestampS + tailSeconds);
    await this.lastWritePromise;

    await new Promise<void>((resolve, reject) => {
      this.ffmpeg.stdin?.end((error?: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
    await this.ffmpegClosed;
    return this.outputPath;
  }

  private handleFrame(payload: ScreencastFramePayload) {
    const timestampS =
      typeof payload.metadata?.timestamp === "number"
        ? payload.metadata.timestamp
        : Date.now() / 1000;

    this.writeFrame(Buffer.from(payload.data, "base64"), timestampS);
    void this.client.send("Page.screencastFrameAck", {
      sessionId: payload.sessionId,
    }).catch(() => {
      /* page/context may already be closing */
    });
  }

  private writeFrame(buffer: Buffer, timestampS: number) {
    if (!this.firstFrameTimestampS) {
      this.firstFrameTimestampS = timestampS;
    }
    const frameNumber = Math.floor((timestampS - this.firstFrameTimestampS) * SCREENCAST_FPS);
    if (this.lastFrame) {
      const repeatCount = frameNumber - this.lastFrame.frameNumber;
      for (let i = 0; i < repeatCount; i += 1) {
        this.frameQueue.push(this.lastFrame.buffer);
      }
      this.lastWritePromise = this.lastWritePromise.then(() => this.flushQueuedFrames());
    }
    this.lastFrame = { buffer, frameNumber, timestampS };
    this.lastWriteNodeMs = performance.now();
  }

  private async flushQueuedFrames() {
    while (this.frameQueue.length > 0) {
      const frame = this.frameQueue.shift();
      if (!frame) continue;
      await this.sendFrame(frame);
    }
  }

  private async sendFrame(frame: Buffer) {
    const stdin = this.ffmpeg.stdin;
    if (!stdin) {
      throw new Error("[capture] screencast ffmpeg stdin unavailable");
    }
    await new Promise<void>((resolve, reject) => {
      stdin.write(frame, (error?: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
