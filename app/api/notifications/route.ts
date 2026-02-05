import { NextRequest, NextResponse } from 'next/server';

// Neynar API endpoint for frame notifications
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster/frame/notifications';

// Notification types
export type NotificationType = 'welcome' | 'position_profit' | 'position_loss';

interface NotificationPayload {
  type: NotificationType;
  fid: number;
  data?: {
    market?: string;
    pnlPercent?: number;
    isLong?: boolean;
  };
}

// Notification templates
const NOTIFICATION_TEMPLATES: Record<NotificationType, (data?: NotificationPayload['data']) => { title: string; body: string }> = {
  welcome: () => ({
    title: 'Welcome to Fixr Perps!',
    body: 'Trade ETH, BTC, ARB & LINK perpetuals with up to 50x leverage on Arbitrum.',
  }),
  position_profit: (data) => ({
    title: `${data?.market || 'Position'} +${data?.pnlPercent?.toFixed(0) || 25}%`,
    body: `Your ${data?.isLong ? 'LONG' : 'SHORT'} is up! Consider taking profits.`,
  }),
  position_loss: (data) => ({
    title: `${data?.market || 'Position'} ${data?.pnlPercent?.toFixed(0) || -25}%`,
    body: `Your ${data?.isLong ? 'LONG' : 'SHORT'} is down. Check your position.`,
  }),
};

export async function POST(request: NextRequest) {
  try {
    const payload: NotificationPayload = await request.json();
    const { type, fid, data } = payload;

    // Get notification content from template
    const template = NOTIFICATION_TEMPLATES[type];
    if (!template) {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
    }

    const { title, body } = template(data);

    // Get Neynar API key from environment
    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      console.error('[Notifications] NEYNAR_API_KEY not configured');
      return NextResponse.json({ error: 'Notifications not configured' }, { status: 500 });
    }

    // Send notification via Neynar
    console.log('[Notifications] Sending to Neynar:', { fid, title, body });

    const response = await fetch(NEYNAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        target_fids: [fid],
        notification: {
          title,
          body,
          target_url: 'https://perps.fixr.nexus',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Notifications] Neynar API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to send notification' }, { status: response.status });
    }

    const result = await response.json();
    console.log('[Notifications] Sent:', { type, fid, title });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('[Notifications] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
