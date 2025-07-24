function isCrxHMRPayload(x) {
  return x.type === "custom" && x.event.startsWith("crx:");
}
class HMRPort {
  port;
  callbacks = /* @__PURE__ */ new Map();
  constructor() {
    setInterval(() => {
      try {
        this.port?.postMessage({ data: "ping" });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Extension context invalidated.")) {
          location.reload();
        } else
          throw error;
      }
    }, 5000);
    setInterval(this.initPort, 5 * 60 * 1e3);
    this.initPort();
  }
  initPort = () => {
    this.port?.disconnect();
    this.port = chrome.runtime.connect({ name: "@crx/client" });
    this.port.onDisconnect.addListener(this.handleDisconnect.bind(this));
    this.port.onMessage.addListener(this.handleMessage.bind(this));
    this.port.postMessage({ type: "connected" });
  };
  handleDisconnect = () => {
    if (this.callbacks.has("close"))
      for (const cb of this.callbacks.get("close")) {
        cb({ wasClean: true });
      }
  };
  handleMessage = (message) => {
    const forward = (data) => {
      if (this.callbacks.has("message"))
        for (const cb of this.callbacks.get("message")) {
          cb({ data });
        }
    };
    const payload = JSON.parse(message.data);
    if (isCrxHMRPayload(payload)) {
      if (payload.event === "crx:runtime-reload") {
        console.log("[crx] runtime reload");
        setTimeout(() => location.reload(), 500);
      } else {
        forward(JSON.stringify(payload.data));
      }
    } else {
      forward(message.data);
    }
  };
  addEventListener = (event, callback) => {
    const cbs = this.callbacks.get(event) ?? /* @__PURE__ */ new Set();
    cbs.add(callback);
    this.callbacks.set(event, cbs);
  };
  send = (data) => {
    if (this.port)
      this.port.postMessage({ data });
    else
      throw new Error("HMRPort is not initialized");
  };
}

export { HMRPort };
