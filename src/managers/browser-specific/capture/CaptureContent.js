class CaptureContent {
  constructor() {
    console.log("CaptureContent initialized");
  }

  async captureScreen() {
    console.warn("Screen capture not fully supported in content scripts for all browsers. Implement content script specific capture logic here.");
    // Placeholder for content script based screen capture logic
    return null;
  }
}

export { CaptureContent };