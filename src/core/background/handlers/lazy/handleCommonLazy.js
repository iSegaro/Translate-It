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

export async function handleLaunchExtensionAppLazy(message, sender, sendResponse) {
    try {
        logger.debug('Loading LaunchExtensionApp handler');
        const { handleLaunchExtensionApp } = await import('../common/handleLaunchExtensionApp.js');
        logger.debug('LaunchExtensionApp handler loaded successfully');
        return handleLaunchExtensionApp(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load LaunchExtensionApp handler:', error);
        return { success: false, error: 'Failed to load extension app launcher functionality' };
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

export async function handleSettingsUpdatedLazy(message, sender, sendResponse) {
    try {
        logger.debug('Loading SettingsUpdated handler');
        const { handleSettingsUpdated } = await import('@/shared/messaging/handlers/SettingsUpdateHandler.js');
        logger.debug('SettingsUpdated handler loaded successfully');
        return handleSettingsUpdated(message, sender, sendResponse);
    } catch (error) {
        logger.error('Failed to load SettingsUpdated handler:', error);
        return { success: false, error: 'Failed to load settings update functionality' };
    }
}

export async function handleLiveDubbingStartLazy(message, sender) {
    try {
        const { handleLiveDubbingStart } = await import('@/features/live-dubbing/background/handlers.js');
        return handleLiveDubbingStart(message, sender);
    } catch (error) {
        logger.error('Failed to load Live Dubbing start handler:', error);
        return { success: false, error: 'LIVE_DUBBING_HANDLER_UNAVAILABLE' };
    }
}

export async function handleLiveDubbingStopLazy(message, sender) {
    try {
        const { handleLiveDubbingStop } = await import('@/features/live-dubbing/background/handlers.js');
        return handleLiveDubbingStop(message, sender);
    } catch (error) {
        logger.error('Failed to load Live Dubbing stop handler:', error);
        return { success: false, error: 'LIVE_DUBBING_HANDLER_UNAVAILABLE' };
    }
}

export async function handleLiveDubbingGetStatusLazy(message, sender) {
    try {
        const { handleLiveDubbingGetStatus } = await import('@/features/live-dubbing/background/handlers.js');
        return handleLiveDubbingGetStatus(message, sender);
    } catch (error) {
        logger.error('Failed to load Live Dubbing status handler:', error);
        return { success: false, error: 'LIVE_DUBBING_HANDLER_UNAVAILABLE' };
    }
}

export async function handleLiveDubbingBootstrapRequestLazy(message, sender) {
    try {
        const { handleLiveDubbingBootstrapRequest } = await import('@/features/live-dubbing/background/handlers.js');
        return handleLiveDubbingBootstrapRequest(message, sender);
    } catch (error) {
        logger.error('Failed to load Live Dubbing bootstrap handler:', error);
        return { success: false, error: 'LIVE_DUBBING_HANDLER_UNAVAILABLE' };
    }
}
