// Notification helper for Fixr Perps

export type NotificationType = 'welcome' | 'position_profit' | 'position_loss';

interface NotificationData {
  market?: string;
  pnlPercent?: number;
  isLong?: boolean;
}

/**
 * Send a notification to a user via our API (which uses Neynar)
 */
export async function sendNotification(
  type: NotificationType,
  fid: number,
  data?: NotificationData
): Promise<boolean> {
  console.log('[Notifications] sendNotification called:', { type, fid, data });

  try {
    const response = await fetch('/api/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, fid, data }),
    });

    const responseText = await response.text();
    console.log('[Notifications] API response:', response.status, responseText);

    if (!response.ok) {
      console.error('[Notifications] Failed to send:', response.status, responseText);
      return false;
    }

    try {
      const result = JSON.parse(responseText);
      return result.success === true;
    } catch {
      return false;
    }
  } catch (error) {
    console.error('[Notifications] Error sending notification:', error);
    return false;
  }
}

/**
 * Send welcome notification after user adds the app
 */
export async function sendWelcomeNotification(fid: number): Promise<boolean> {
  return sendNotification('welcome', fid);
}

/**
 * Send position alert notification
 */
export async function sendPositionAlert(
  fid: number,
  market: string,
  pnlPercent: number,
  isLong: boolean
): Promise<boolean> {
  const type: NotificationType = pnlPercent >= 0 ? 'position_profit' : 'position_loss';
  return sendNotification(type, fid, { market, pnlPercent, isLong });
}

// Position tracking for alerts
interface TrackedPosition {
  market: string;
  isLong: boolean;
  entryPnlPercent: number;
  lastAlertPnlPercent: number | null;
}

// Track positions that have been alerted (to avoid spam)
const alertedPositions = new Map<string, TrackedPosition>();

/**
 * Check if a position should trigger an alert (crossed +/- 25% threshold)
 * Returns true if an alert should be sent
 */
export function shouldAlertPosition(
  positionKey: string,
  market: string,
  isLong: boolean,
  currentPnlPercent: number
): { shouldAlert: boolean; type: 'profit' | 'loss' | null } {
  const existing = alertedPositions.get(positionKey);

  // Thresholds for alerts
  const ALERT_THRESHOLD = 25; // 25%

  if (!existing) {
    // First time seeing this position, start tracking
    alertedPositions.set(positionKey, {
      market,
      isLong,
      entryPnlPercent: currentPnlPercent,
      lastAlertPnlPercent: null,
    });

    // Check if already at threshold on first load
    if (currentPnlPercent >= ALERT_THRESHOLD) {
      alertedPositions.get(positionKey)!.lastAlertPnlPercent = currentPnlPercent;
      return { shouldAlert: true, type: 'profit' };
    }
    if (currentPnlPercent <= -ALERT_THRESHOLD) {
      alertedPositions.get(positionKey)!.lastAlertPnlPercent = currentPnlPercent;
      return { shouldAlert: true, type: 'loss' };
    }

    return { shouldAlert: false, type: null };
  }

  const lastAlert = existing.lastAlertPnlPercent;

  // Check if we've crossed a new threshold
  // Profit: crossed above 25%, 50%, 75%, etc.
  if (currentPnlPercent >= ALERT_THRESHOLD) {
    const currentThreshold = Math.floor(currentPnlPercent / ALERT_THRESHOLD) * ALERT_THRESHOLD;
    const lastThreshold = lastAlert !== null ? Math.floor(lastAlert / ALERT_THRESHOLD) * ALERT_THRESHOLD : 0;

    if (currentThreshold > lastThreshold) {
      alertedPositions.get(positionKey)!.lastAlertPnlPercent = currentPnlPercent;
      return { shouldAlert: true, type: 'profit' };
    }
  }

  // Loss: crossed below -25%, -50%, -75%, etc.
  if (currentPnlPercent <= -ALERT_THRESHOLD) {
    const currentThreshold = Math.ceil(currentPnlPercent / ALERT_THRESHOLD) * ALERT_THRESHOLD;
    const lastThreshold = lastAlert !== null ? Math.ceil(lastAlert / ALERT_THRESHOLD) * ALERT_THRESHOLD : 0;

    if (currentThreshold < lastThreshold) {
      alertedPositions.get(positionKey)!.lastAlertPnlPercent = currentPnlPercent;
      return { shouldAlert: true, type: 'loss' };
    }
  }

  return { shouldAlert: false, type: null };
}

/**
 * Clear tracking for a closed position
 */
export function clearPositionTracking(positionKey: string): void {
  alertedPositions.delete(positionKey);
}
