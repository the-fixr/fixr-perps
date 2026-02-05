// types/frame.ts
export interface FrameContext {
    user: {
      fid: number;
      username: string;
      displayName: string;
      pfpUrl: string;
      custodyAddress?: string;
      verifiedAddresses?: {
        ethAddresses?: string[];
        solAddresses?: string[];
      };
      location?: {
        placeId: string;
        description: string;
      };
    };
    client: {
      clientFid: number;
      added: boolean;
    };
  }
  
  // EIP-1193 Provider interface
  export interface EIP1193Provider {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  }

  export interface AddMiniAppResult {
    added: boolean;
    notificationDetails?: {
      url: string;
      token: string;
    };
  }

  export interface FrameSDK {
    context: Promise<FrameContext>;
    actions: {
      ready: () => void;
      openUrl: (url: string) => void;
      close: () => void;
      addMiniApp: () => Promise<AddMiniAppResult>;
    };
    wallet: {
      ethProvider: EIP1193Provider;
    };
  }
  
  declare global {
    interface Window {
      frame: {
        sdk: FrameSDK;
      };
    }
  }