import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleCommonLazy');

export async function handleRefreshContextMenusLazy(message, sender, sendResponse) {
    try {
        logger.debug('Loading RefreshContextMenus handler');
        const { handleRefreshContextMenus } = await import('../common/handleRefreshContextMenus.js');
        logger.debug('RefreshContextMenus handler loaded successfully');
        return handleRefreshContextMenus(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load RefreshContextMenus handler:', error);
        return { success: false, error: 'Failed to load refresh context menus functionality' };
    }
}

export async function handleOpenOptionsPageLazy(message, sender, sendResponse) {
    try {
        logger.debug('Loading OpenOptionsPage handler');
        const { handleOpenOptionsPage } = await import('../common/handleOpenOptionsPage.js');
        logger.debug('OpenOptionsPage handler loaded successfully');
        return handleOpenOptionsPage(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load OpenOptionsPage handler:', error);
        return { success: false, error: 'Failed to load options page functionality' };
    }
}

export async function handleOpenURLLazy(message, sender, sendResponse) {
    try {
        logger.debug('Loading OpenURL handler');
        const { handleOpenURL } = await import('../common/handleOpenURL.js');
        logger.debug('OpenURL handler loaded successfully');
        return handleOpenURL(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load OpenURL handler:', error);
        return { success: false, error: 'Failed to load URL opening functionality' };
    }
}

export async function handlePingLazy(message, sender, sendResponse) {
    try {
        // Ping is called frequently, only log on error
        const { handlePing } = await import('../common/handlePing.js');
        return handlePing(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load Ping handler:', error);
        return { success: false, error: 'Failed to load ping functionality' };
    }
}
