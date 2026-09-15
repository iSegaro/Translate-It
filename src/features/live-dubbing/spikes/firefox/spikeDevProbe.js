/**
 * DEV-only Phase 2 Firefox spike coordinator.
 *
 * This is a local composition of the existing YouTube capture probe and the
 * two capability probes. It is exposed only through the bridge's existing
 * start/status/restart/stop methods.
 */

import { YouTubeCaptureStreamProbe } from './YouTubeCaptureStreamProbe.js';
import { FirefoxWebExtensionTransportProbe } from './spikeDevTransport.js';
import { FirefoxRuntimeCapabilitiesProbe } from './spikeDevRuntimeCapabilities.js';
import { FirefoxExtensionIframeTransferProbe } from './spikeDevIframeTransfer.js';

export class FirefoxDevSpikeProbe {
  constructor({
    captureProbe,
    transportProbe,
    iframeTransferProbe,
    runtimeCapabilitiesProbe,
    documentRef = globalThis.document,
    windowRef = globalThis,
    runtime,
  } = {}) {
    this.captureProbe = captureProbe || new YouTubeCaptureStreamProbe({ documentRef, windowRef });
    this.transportProbe = transportProbe || new FirefoxWebExtensionTransportProbe({ runtime });
    this.iframeTransferProbe = iframeTransferProbe || new FirefoxExtensionIframeTransferProbe({
      documentRef,
      windowRef,
      runtime,
    });
    this.runtimeCapabilitiesProbe = runtimeCapabilitiesProbe
      || new FirefoxRuntimeCapabilitiesProbe({ windowRef, captureProbe: this.captureProbe });
    this.active = false;
    this.startPromise = null;
    this.runId = 0;
  }

  async start() {
    if (this.startPromise) return this.status();
    if (this.active) return this.status();
    const runId = ++this.runId;
    const promise = this._start(runId);
    this.startPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.startPromise === promise) this.startPromise = null;
    }
  }

  async _start(runId) {
    const captureStatus = await this.captureProbe.start();
    if (runId !== this.runId) return this.status();
    const transportStatus = await this.transportProbe.start({ captureProbe: this.captureProbe });
    await this.iframeTransferProbe.start({
      captureProbe: this.captureProbe,
      transportStatus,
    });
    this.runtimeCapabilitiesProbe.start({ captureProbe: this.captureProbe });
    this.active = true;
    return this.status({ captureStatus });
  }

  async restart() {
    await this.stop();
    this.active = false;
    return this.start();
  }

  async stop() {
    ++this.runId;
    this.active = false;
    await this.iframeTransferProbe.stop();
    await this.transportProbe.stop();
    await this.captureProbe.stop();
    this.runtimeCapabilitiesProbe.stop();
    return this.status();
  }

  status({ captureStatus } = {}) {
    const capture = captureStatus || this.captureProbe.status();
    return {
      ...capture,
      transport: this.transportProbe.status(),
      iframeTransfer: this.iframeTransferProbe.status(),
      runtimeCapabilities: this.runtimeCapabilitiesProbe.status(),
    };
  }
}
