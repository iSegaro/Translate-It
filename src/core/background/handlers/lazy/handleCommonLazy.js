export async function handleRefreshContextMenusLazy(message, sender, sendResponse) {
    const { handleRefreshContextMenus } = await import('../common/handleRefreshContextMenus.js');
    return handleRefreshContextMenus(message, sender, sendResponse);
}

export async function handleOpenOptionsPageLazy(message, sender, sendResponse) {
    const { handleOpenOptionsPage } = await import('../common/handleOpenOptionsPage.js');
    return handleOpenOptionsPage(message, sender, sendResponse);
}

export async function handleOpenURLLazy(message, sender, sendResponse) {
    const { handleOpenURL } = await import('../common/handleOpenURL.js');
    return handleOpenURL(message, sender, sendResponse);
}

export async function handlePingLazy(message, sender, sendResponse) {
    const { handlePing } = await import('../common/handlePing.js');
    return handlePing(message, sender, sendResponse);
}
