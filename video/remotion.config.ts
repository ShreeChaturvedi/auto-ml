import { Config } from "@remotion/cli/config";

// High-quality h264 render defaults for the final capstone deliverable.
// CRF 18 ≈ visually lossless; yuv420p ensures broad player compatibility.
// Concurrency null → Remotion auto-picks cores.
Config.setCodec("h264");
Config.setCrf(18);
Config.setPixelFormat("yuv420p");
Config.setConcurrency(null);
Config.setOverwriteOutput(true);
Config.setVideoImageFormat("jpeg");
Config.setAskAIEnabled(false);
