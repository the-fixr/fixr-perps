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
  
  export interface FrameSDK {
    context: Promise<FrameContext>;
    actions: {
      ready: () => void;
      openUrl: (url: string) => void;
      close: () => void;
    };
  }
  
  declare global {
    interface Window {
      frame: {
        sdk: FrameSDK;
      };
    }
  }