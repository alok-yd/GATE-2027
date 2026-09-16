import { DeviceCapabilities, AIRuntimeProvider } from '../../types';

export class DeviceCapabilityDetector {
  private static cachedCapabilities: DeviceCapabilities | null = null;

  static async detect(): Promise<DeviceCapabilities> {
    if (this.cachedCapabilities) {
      return this.cachedCapabilities;
    }

    let hasWebGPU = false;
    let hasWasm = false;

    // Check WebAssembly support
    try {
      if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
        const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
        if (module instanceof WebAssembly.Module) {
          hasWasm = true;
        }
      }
    } catch {
      hasWasm = false;
    }

    // Check WebGPU support safely
    try {
      if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) {
          hasWebGPU = true;
        }
      }
    } catch {
      hasWebGPU = false;
    }

    let selectedProvider: AIRuntimeProvider = 'WASM';
    if (hasWebGPU) {
      selectedProvider = 'WebGPU';
    } else if (hasWasm) {
      selectedProvider = 'WASM';
    } else {
      selectedProvider = 'CPU';
    }

    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const hardwareConcurrency = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
    const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent);

    this.cachedCapabilities = {
      hasWebGPU,
      hasWasm,
      selectedProvider,
      screenWidth,
      screenHeight,
      hardwareConcurrency,
      isMobile
    };

    return this.cachedCapabilities;
  }

  static getCached(): DeviceCapabilities {
    if (this.cachedCapabilities) return this.cachedCapabilities;
    return {
      hasWebGPU: false,
      hasWasm: true,
      selectedProvider: 'WASM',
      screenWidth: 1920,
      screenHeight: 1080,
      hardwareConcurrency: 4,
      isMobile: false
    };
  }
}
